import { constants, createHash, verify } from "node:crypto";
import { createReadStream, lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HubConfig } from "@codex-web/shared";
import { HubError } from "@codex-web/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { CompanionDevices } from "./companion-devices.js";

export const companionUpdatePublicKey = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA1e2vwHf+rNtvy9vdN81v
/Ga4ALY8OeH5c/uY20HhyXLQJH36+PCIeAbBHk1xDV8oUc385O7vr6f7H8q9csIj
JnI/rSxCEOWEyjCAehKFtrIkbKcLQEghT9nL1rq3/iQuDP/5/X2FvIpDoph+aKrj
IdSJz2rNGseh3D5SCWlhPPXEMqAg8mTvyLqxZ8l1gs7q7Ebqn3gYu4ln9aVizy1n
9pf2mDy7U0UKrl46BkwqJI1qgchToIfV0qIyGITqPZA0ewNP8jaiXYYm3d7EgGrq
luUlJ6xnH1hdogeziBq7tI2X9k1HZAJZTrPWz1f/Jvyylja4+uu/RlgV6m7fQiQ5
Ecl+ljNnn1tCdqbulnzQ6VQf3dftQ+oxaI/OazDHTzL6q61zpbExz6MkcuSC4v2M
BqbJg0dNjE4splmtu6a7W0YMel1O7LczJ7CW9q7i9pePHZ/P58TcFmz2R0u1JmCM
COusw6USTpHf8WuPB9mKWjmind28yvxZZVwlwv0M4w9xAgMBAAE=
-----END PUBLIC KEY-----`;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const updateSchema = z
  .object({
    format: z.literal(1),
    product: z.literal("codexweb-companion-ui"),
    platform: z.literal("win-x64"),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    sequence: z.number().int().positive().safe(),
    minWindowsBuild: z.number().int().min(19045).max(99999),
    protocol: z.literal(1),
    manifestSha256: digest,
    packageSha256: digest,
    packageBytes: z
      .number()
      .int()
      .min(1)
      .max(128 * 1024 * 1024),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
    publishedAt: z.string().datetime(),
  })
  .strict();
export function verifyCompanionUpdate(input: unknown) {
  const envelope = z
    .object({
      format: z.literal(1),
      payload: z.string().max(16384),
      signature: z.string().max(1024),
    })
    .strict()
    .parse(input);
  const bytes = Buffer.from(envelope.payload, "base64"),
    signature = Buffer.from(envelope.signature, "base64");
  if (
    !verify(
      "sha256",
      bytes,
      { key: companionUpdatePublicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      signature,
    )
  )
    throw new HubError(409, "COMPANION_RELEASE_INVALID", "Подпись обновления не подтверждена.");
  return { envelope, release: updateSchema.parse(JSON.parse(bytes.toString("utf8"))) };
}
function regular(path: string, max: number) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > max)
    throw new Error("INVALID_RELEASE_FILE");
  return info;
}
export function registerCompanionUpdates(
  app: FastifyInstance,
  config: HubConfig,
  devices: CompanionDevices,
) {
  const root = join(dirname(config.hub.databasePath), "companion-releases");
  const latest = () => {
    try {
      regular(join(root, "latest.json"), 32768);
      return verifyCompanionUpdate(JSON.parse(readFileSync(join(root, "latest.json"), "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new HubError(
        503,
        "COMPANION_RELEASE_INVALID",
        "Обновление пока не прошло проверку сервера.",
      );
    }
  };
  app.get("/api/companion/update", (req) => {
    devices.read(req);
    const current = latest();
    return { available: !!current, signed: current?.envelope };
  });
  app.get("/api/companion/update/:digest/bundle", async (req, reply) => {
    devices.read(req);
    const { digest: requested } = z.object({ digest }).parse(req.params);
    const release = latest()?.release;
    if (!release || release.packageSha256 !== requested)
      throw new HubError(404, "COMPANION_RELEASE_CHANGED", "Проверь доступное обновление заново.");
    const path = join(root, requested + ".zip");
    if (regular(path, 128 * 1024 * 1024).size !== release.packageBytes)
      throw new HubError(503, "COMPANION_RELEASE_INVALID", "Пакет обновления не подтверждён.");
    // Recheck after a bounded integrity read. Windows verifies the same signed hash.
    const hash = createHash("sha256");
    for await (const bytes of createReadStream(path)) hash.update(bytes);
    if (hash.digest("hex") !== requested)
      throw new HubError(503, "COMPANION_RELEASE_INVALID", "Пакет обновления изменился.");
    devices.read(req);
    reply
      .header("Cache-Control", "private, no-store")
      .header("Content-Length", release.packageBytes)
      .type("application/zip");
    return reply.send(createReadStream(path));
  });
}
