import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type HubConfig, HubError } from "@codex-web/shared";
import { quotePowerShell } from "@codex-web/machines";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { tokenHash } from "./auth.js";
import type { TeamAuth } from "./team-auth.js";
import { publicUser, type TeamStore } from "./team-store.js";
import type { MachineEnrollmentStore } from "./machine-enrollment-store.js";
import { companionRepairFiles, enrollmentBundle, enrollmentKeys } from "./machine-enrollment.js";

const execute = promisify(execFile);
const identity = z.object({ sid: z.string().regex(/^S-1-5-21-(?:\d+-){3}\d+$/),
  machineGuid: z.string().uuid(), computer: z.string().min(1).max(80),
  deviceId: z.string().max(100).default("") }).strict();
type Identity = z.infer<typeof identity>;
type Grant = { tokenHash: string; ownerId: string; sessionHash: string; identity: string; expires: number };

// A scoped native credential, not a browser cookie or a new machine execution key.
// Session revocation, account state and role changes are checked on every request.
export class CompanionDevices {
  constructor(readonly registry: TeamStore) {
    registry.db.exec(`CREATE TABLE IF NOT EXISTS team_companion_devices(
      tokenHash TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES team_users(id), sessionHash TEXT NOT NULL,
      identity TEXT NOT NULL, expires INTEGER NOT NULL)`);
  }
  issue(sessionHash: string, input: Identity) {
    input = identity.parse(input);
    const session = this.registry.session(sessionHash);
    const token = randomBytes(32).toString("base64url");
    this.registry.db.prepare("DELETE FROM team_companion_devices WHERE expires<=?").run(Date.now());
    const count = Number(this.registry.db.prepare("SELECT COUNT(*) n FROM team_companion_devices WHERE ownerId=?")
      .get(session.user.id)?.n);
    if (count >= 30) throw new HubError(409, "COMPANION_DEVICE_LIMIT", "Отзови прежние сеансы в настройках аккаунта.");
    this.registry.db.prepare("INSERT INTO team_companion_devices VALUES(?,?,?,?,?)")
      .run(tokenHash(token), session.user.id, sessionHash, JSON.stringify(input), session.expires);
    this.registry.audit(session.user.id, "companion.connected", input.computer);
    return { token, expires: session.expires };
  }
  read(req: Pick<FastifyRequest, "headers">) {
    const value = String(req.headers.authorization ?? "");
    if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(value)) throw new HubError(401, "COMPANION_LOGIN_REQUIRED", "Войди в Hub.");
    const row = this.registry.db.prepare("SELECT * FROM team_companion_devices WHERE tokenHash=?")
      .get(tokenHash(value.slice(7))) as Grant | undefined;
    if (!row || row.expires <= Date.now()) throw new HubError(401, "COMPANION_LOGIN_REQUIRED", "Войди в Hub.");
    const session = this.registry.session(row.sessionHash);
    if (session.user.id !== row.ownerId) throw new HubError(401, "COMPANION_LOGIN_REQUIRED", "Войди в Hub.");
    return { row, user: session.user, local: identity.parse(JSON.parse(row.identity)) };
  }
}

export async function verifyCompanionOwner(config: HubConfig, input: Identity) {
  input = identity.parse(input);
  const machine = config.machines.find(m => m.id === input.deviceId && m.type === "ssh-windows");
  if (!machine?.ssh) throw new HubError(409, "COMPANION_DEVICE_UNKNOWN", "Выбери существующий компьютер Hub.");
  const script = `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);` +
    `if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne ${quotePowerShell(input.sid)}){exit 1};` +
    `if((Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid -ne ${quotePowerShell(input.machineGuid)}){exit 1};[Console]::Write('COMPANION_IDENTITY_OK')`;
  try {
    const result = await execute("ssh", [...(machine.ssh.configFile ? ["-F", machine.ssh.configFile] : []),
      "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=8",
      machine.ssh.target, "powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64")], { timeout: 12000, maxBuffer: 1024, windowsHide: true });
    if (result.stdout !== "COMPANION_IDENTITY_OK") throw new Error();
  } catch { throw new HubError(409, "COMPANION_IDENTITY_PENDING", "Hub пока не подтвердил этот ПК по существующему SSH-подключению. Повтори вход после восстановления связи."); }
}

export function registerCompanion(app: FastifyInstance, config: HubConfig, auth: TeamAuth,
  registry: TeamStore, enrollments: MachineEnrollmentStore) {
  const devices = new CompanionDevices(registry);
  app.post("/api/team/companion", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async req => {
    const session = auth.session(req), input = identity.parse(req.body);
    if (input.deviceId) {
      if (session.user.id === registry.ownerId) await verifyCompanionOwner(config, input);
      else {
        const row = enrollments.list(session.user.id).find(e => e.machineId === input.deviceId && e.state === "approved");
        const report = row && JSON.parse(enrollments.owned(session.user.id, row.id).report!);
        if (!report || report.sid !== input.sid || report.machineGuid.toLowerCase() !== input.machineGuid.toLowerCase())
          throw new HubError(409, "COMPANION_IDENTITY_PENDING", "Этот ПК ещё не привязан к твоему аккаунту.");
      }
    }
    auth.session(req);
    return devices.issue(session.tokenHash, input);
  });
  app.get("/api/companion/status", req => {
    const { user, local, row } = devices.read(req);
    const items = enrollments.list(user.id).filter(e => {
      if (!e.readiness) return false;
      const report = JSON.parse(enrollments.owned(user.id, e.id).report!);
      return report.sid === local.sid && report.machineGuid.toLowerCase() === local.machineGuid.toLowerCase();
    });
    const matched = items.find(e => e.state === "approved");
    const deviceId = user.id === registry.ownerId && config.machines.some(m => m.id === local.deviceId)
      ? local.deviceId : matched?.machineId || "";
    return { user: publicUser(registry.active(user.id)), originalOwner: user.id === registry.ownerId,
      deviceId, route: deviceId && user.id === registry.ownerId && config.machines.some(m => m.id === deviceId)
        ? "LAN SSH" : "Tailnet SSH", expires: row.expires, enrollments: items,
      enrollmentEnabled: !!config.team?.hubTailnetAddress };
  });
  app.post("/api/companion/enrollment", async req => {
    const before = devices.read(req), body = z.object({ id: z.string().uuid(), token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().parse(req.body);
    if (!config.team?.hubTailnetAddress) throw new HubError(503, "TAILNET_SETUP_REQUIRED", "Администратор должен подключить Hub к приватной сети.");
    const existing = registry.db.prepare("SELECT ownerId FROM team_machine_enrollments WHERE id=?").get(body.id);
    // The request identity is durable on the client; an uncertain create is reconciled.
    const keys = existing ? {} as Awaited<ReturnType<typeof enrollmentKeys>> : await enrollmentKeys();
    devices.read(req);
    return enrollments.create(before.user.id, before.local.computer, keys, body);
  });
  app.post("/api/companion/enrollment/:id/bundle", req => {
    const { user } = devices.read(req), { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().parse(req.body);
    return enrollmentBundle(config, enrollments, user.id, id, token);
  });
  app.get("/api/companion/repair-kit", req => {
    devices.read(req);
    return { files: companionRepairFiles() }; // Reviewed public helpers only, no pairing/native credentials.
  });
  app.post("/api/companion/logout", req => {
    const { row } = devices.read(req);
    registry.db.prepare("DELETE FROM team_companion_devices WHERE tokenHash=?").run(row.tokenHash);
    return { ok: true };
  });
  return devices;
}
