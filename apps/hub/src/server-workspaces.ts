import { spawn } from "node:child_process";
import {
  bindServerWorkspace,
  collectWorkspace,
  workspaceHomeScript,
  workspaceHostCommand,
} from "@codex-web/machines";
import { type DeviceConfig, type HubConfig, HubError, type MachineConfig } from "@codex-web/shared";
import type { TeamStore } from "./team-store.js";

export function workspaceTable(registry: TeamStore) {
  registry.db.exec(
    "CREATE TABLE IF NOT EXISTS team_server_workspaces(owner TEXT PRIMARY KEY REFERENCES team_users(id),state TEXT NOT NULL,created INTEGER NOT NULL)",
  );
}
export function workspaceRuntime(config: HubConfig, registry: TeamStore, owner: string) {
  workspaceTable(registry);
  const machines: MachineConfig[] = [],
    devices: DeviceConfig[] = [];
  if (
    !config.serverWorkspaces ||
    registry.db.prepare("SELECT state FROM team_server_workspaces WHERE owner=?").get(owner)
      ?.state !== "ready"
  )
    return { machines, devices };
  const epoch = registry.active(owner).executionEpoch;
  const machine: MachineConfig = {
    id: "server-workspace",
    name: "Моё серверное окружение",
    type: "server-workspace",
    allowedProjectRoots: ["/workspace/projects"],
    codex: { command: "codex", shell: "powershell", activityNode: "node" },
  };
  bindServerWorkspace(machine, {
    ...config.serverWorkspaces,
    owner,
    authorize: () => {
      if (
        registry.active(owner).executionEpoch !== epoch ||
        registry.db.prepare("SELECT state FROM team_server_workspaces WHERE owner=?").get(owner)
          ?.state !== "ready"
      )
        throw new HubError(403, "EXECUTION_REVOKED", "Доступ к серверному окружению изменился.");
    },
  });
  machines.push(machine);
  devices.push({
    id: "server-workspace",
    name: machine.name,
    platform: "linux",
    workspaceMachineId: machine.id,
    ssh: config.serverWorkspaces.ssh,
    shell: "powershell",
    power: false,
    mounts: false,
  });
  return { machines, devices };
}
export class ServerWorkspaces {
  canRun = () => true;
  get busy() {
    return this.pending.size + this.revoking.size;
  }
  private pending = new Map<string, Promise<unknown>>();
  private revoking = new Map<string, Promise<void>>();
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    readonly config: HubConfig,
    readonly registry: TeamStore,
  ) {
    workspaceTable(registry);
    if (config.serverWorkspaces) {
      this.timer = setInterval(() => this.reconcileRevocations(), 30000);
      this.timer.unref();
      this.reconcileRevocations();
    }
  }
  private reconcileRevocations() {
    if (!this.canRun()) return;
    for (const row of this.registry.db
      .prepare(
        "SELECT w.owner FROM team_server_workspaces w JOIN team_users u ON u.id=w.owner WHERE w.state='revoking' OR (u.state='disabled' AND w.state!='revoked')",
      )
      .all())
      void this.revokeDisabled(String(row.owner)).catch(() => {});
  }
  async close() {
    clearInterval(this.timer);
    await Promise.allSettled([...this.pending.values(), ...this.revoking.values()]);
  }
  view(owner: string) {
    this.registry.active(owner);
    return {
      available: !!this.config.serverWorkspaces,
      state: String(
        this.registry.db
          .prepare("SELECT state FROM team_server_workspaces WHERE owner=?")
          .get(owner)?.state ?? "absent",
      ),
    };
  }
  async command(owner: string, op: "status" | "create" | "start" | "revoke") {
    const host = this.config.serverWorkspaces;
    if (!host)
      throw new HubError(409, "WORKSPACE_UNAVAILABLE", "Серверное окружение пока не настроено.");
    const child = spawn("ssh", workspaceHostCommand(host, owner, op), {
      stdio: "pipe",
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    let code = "";
    child.stderr.on("data", (data) => {
      code = (code + data.toString()).slice(-256);
    });
    try {
      const value = JSON.parse(
        (await collectWorkspace(child, "", 120000, 65536)).toString("utf8"),
      ) as { state: string; running?: boolean };
      if ((op === "create" || op === "status") && value.state === "ready" && value.running) {
        this.registry.active(owner);
        await collectWorkspace(
          spawn(
            "ssh",
            workspaceHostCommand(host, owner, "exec", ["node", "-e", workspaceHomeScript]),
            { stdio: "pipe", detached: process.platform !== "win32", windowsHide: true },
          ),
          "",
          30000,
          1024,
        );
      }
      return value;
    } catch (error) {
      if (code.trim() === "WORKSPACE_MISSING")
        throw new HubError(
          409,
          "WORKSPACE_MISSING",
          "Окружение не было создано. Можно начать создание заново.",
        );
      throw error;
    }
  }
  create(owner: string) {
    this.registry.active(owner);
    if (!this.canRun())
      throw new HubError(
        503,
        "ENGINE_MAINTENANCE",
        "Обновление сервиса. Попробуй после завершения.",
      );
    if (!this.config.serverWorkspaces)
      throw new HubError(409, "WORKSPACE_UNAVAILABLE", "Серверное окружение пока не настроено.");
    if (
      this.registry.db.prepare("SELECT value FROM team_meta WHERE key='nativeAdmission'").get()
        ?.value === "blocked"
    )
      throw new HubError(
        503,
        "RESTORE_ADMISSION_REQUIRED",
        "После восстановления подключения проверяет администратор сервера.",
      );
    const pending = this.pending.get(owner);
    if (pending) return pending;
    const state = this.view(owner).state;
    if (state === "ready") return Promise.resolve(this.view(owner));
    if (state === "revoked" || state === "revoking")
      throw new HubError(
        409,
        "WORKSPACE_REVOKED",
        "Доступ к окружению отозван; его данные сохранены.",
      );
    const work = (async () => {
      // Persist before dispatch. After a lost reply, only read the exact owner's status.
      if (state === "absent")
        this.registry.db
          .prepare("INSERT INTO team_server_workspaces VALUES(?,'creating',?)")
          .run(owner, Date.now());
      const result = await this.command(owner, state === "absent" ? "create" : "status").catch(
        (error) => {
          // An explicit, serialized status read can prove that the earlier request never created a slot.
          if (state === "creating" && error?.code === "WORKSPACE_MISSING")
            this.registry.db
              .prepare("DELETE FROM team_server_workspaces WHERE owner=? AND state='creating'")
              .run(owner);
          throw error;
        },
      );
      this.registry.active(owner);
      if (result.state !== "ready" || !result.running)
        throw new HubError(
          409,
          "WORKSPACE_NOT_READY",
          "Окружение пока не подтвердило готовность. Создание повторно не запускалось.",
        );
      this.registry.db
        .prepare(
          "UPDATE team_server_workspaces SET state='ready' WHERE owner=? AND state='creating'",
        )
        .run(owner);
      return this.view(owner);
    })().finally(() => this.pending.delete(owner));
    this.pending.set(owner, work);
    return work;
  }
  start(owner: string) {
    this.registry.active(owner);
    if (!this.canRun())
      throw new HubError(
        503,
        "ENGINE_MAINTENANCE",
        "Обновление сервиса. Попробуй после завершения.",
      );
    if (
      this.registry.db.prepare("SELECT value FROM team_meta WHERE key='nativeAdmission'").get()
        ?.value === "blocked"
    )
      throw new HubError(
        503,
        "RESTORE_ADMISSION_REQUIRED",
        "После восстановления подключения проверяет администратор сервера.",
      );
    if (this.view(owner).state !== "ready")
      throw new HubError(409, "WORKSPACE_NOT_READY", "Сначала заверши создание окружения.");
    const existing = this.pending.get(owner);
    if (existing) return existing;
    const work = (async () => {
      // A fresh explicit request first reconciles the fixed container, never recreates it.
      const state = await this.command(owner, "status");
      if (!state.running) {
        this.registry.active(owner);
        const started = await this.command(owner, "start");
        if (!started.running)
          throw new HubError(409, "WORKSPACE_NOT_READY", "Окружение не подтвердило запуск.");
      }
      return this.view(owner);
    })().finally(() => this.pending.delete(owner));
    this.pending.set(owner, work);
    return work;
  }
  async revokeDisabled(owner: string) {
    if (!this.config.serverWorkspaces) return;
    const row = this.registry.db
      .prepare("SELECT state FROM team_server_workspaces WHERE owner=?")
      .get(owner);
    if (!row || row.state === "revoked") return;
    if (row.state !== "revoking" && this.registry.user(owner).state !== "disabled") return;
    const current = this.revoking.get(owner);
    if (current) return current;
    this.registry.db
      .prepare("UPDATE team_server_workspaces SET state='revoking' WHERE owner=?")
      .run(owner);
    if (!this.canRun()) return;
    const work = (async () => {
      await this.pending.get(owner)?.catch(() => {});
      const result = await this.command(owner, "revoke").catch((error) => {
        if (error?.code === "WORKSPACE_MISSING") return { state: "revoked" };
        throw error;
      });
      if (result.state !== "revoked") throw Error("WORKSPACE_REVOCATION_PENDING");
      this.registry.db
        .prepare(
          "UPDATE team_server_workspaces SET state='revoked' WHERE owner=? AND state='revoking'",
        )
        .run(owner);
    })().finally(() => this.revoking.delete(owner));
    this.revoking.set(owner, work);
    return work;
  }
}
