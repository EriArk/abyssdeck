import { createHash } from "node:crypto";
import { HubError, type ResultShareSource } from "@codex-web/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { zipSync } from "fflate";
import { z } from "zod";
import type { Communication } from "./communication.js";

/** Packages contain immutable, authorized copies. A receipt never resolves source paths again. */
export function registerResultPackages(
  app: FastifyInstance,
  communication: Communication,
  actor: (req: FastifyRequest) => string,
  capture: (req: FastifyRequest, source: ResultShareSource, key: string) => Promise<{ id: string }>,
  sourceSchema: z.ZodType<ResultShareSource>,
) {
  const running = new Map<string, { spec: string; promise: Promise<unknown> }>();
  const uuid = z.string().uuid();
  app.post(
    "/api/team/result-packages",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const user = actor(req),
        key = uuid.parse(req.headers["idempotency-key"]);
      const input = z
        .object({ sources: z.array(sourceSchema).min(1).max(100) })
        .strict()
        .parse(req.body);
      const spec = JSON.stringify(input),
        scope = user + ":" + key;
      if (new Set(input.sources.map((s) => JSON.stringify(s))).size !== input.sources.length)
        throw new HubError(400, "DUPLICATE_RESULT", "Один результат выбран несколько раз.");
      const prior = communication.db
        .prepare("SELECT 1 FROM team_receipts WHERE userId=? AND scope='result.package' AND key=?")
        .get(user, key);
      if (prior) {
        const saved = communication.team.once<{ id: string }>(
          user,
          "result.package",
          key,
          input,
          () => {
            throw Error("unreachable");
          },
        );
        communication.ownerSnapshot(user, saved.id);
        return reply.header("Cache-Control", "no-store").send(saved);
      }
      const pending = running.get(scope);
      if (pending && pending.spec !== spec)
        throw new HubError(
          409,
          "PACKAGE_CHANGED",
          "Состав пакета изменился. Подготовь новый пакет.",
        );
      if (!pending && running.size >= 2)
        throw new HubError(429, "PACKAGE_BUSY", "Подготовка файлов занята. Повтори немного позже.");
      const build = async () => {
        const files: Record<string, [Uint8Array, { level: 0; mtime: Date }]> = Object.create(null);
        const manifest: {
          name: string;
          source: ResultShareSource;
          sha256: string;
          bytes: number;
        }[] = [];
        const names = new Set(["sources.json"]);
        let bytes = 0;
        for (const [index, source] of input.sources.entries()) {
          actor(req);
          // Each child has an exact durable capture key, including across process restarts.
          const hash = createHash("sha256")
            .update(scope + ":" + index + ":" + JSON.stringify(source))
            .digest("hex");
          const childKey = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
          const captured = await capture(req, source, childKey);
          const file = communication.ownerSnapshot(actor(req), captured.id);
          bytes += file.data.length;
          if (bytes > 31 * 1024 ** 2)
            throw new HubError(
              413,
              "PACKAGE_TOO_LARGE",
              "Для подготовки одного пакета доступно 31 МБ. Раздели выбранные файлы на несколько пакетов; отдельные файлы остаются доступны.",
            );
          const base =
            // biome-ignore lint/suspicious/noControlCharactersInRegex: Archive names must not contain controls or path separators.
            file.title.replace(/[\x00-\x1f\x7f/\\]/g, "_").replace(/^\.+$/, "file") || "file";
          let name = base,
            suffix = 2;
          while (names.has(name.toLocaleLowerCase("en-US"))) {
            const dot = base.lastIndexOf(".");
            name =
              dot > 0
                ? `${base.slice(0, dot)} (${suffix++})${base.slice(dot)}`
                : `${base} (${suffix++})`;
          }
          names.add(name.toLocaleLowerCase("en-US"));
          files[name] = [file.data, { level: 0, mtime: new Date("2000-01-01T00:00:00Z") }];
          manifest.push({ name, source, sha256: file.sha256, bytes: file.bytes });
        }
        files["sources.json"] = [
          Buffer.from(JSON.stringify(manifest, null, 2)),
          { level: 0, mtime: new Date("2000-01-01T00:00:00Z") },
        ];
        actor(req);
        const data = Buffer.from(zipSync(files));
        const snapshot = communication.capture(
          user,
          { client: "package", threadId: key, resultId: key },
          { name: "Results.zip", mime: "application/zip", data },
        );
        return communication.team.once(user, "result.package", key, input, () => snapshot);
      };
      const promise = pending?.promise ?? build();
      if (!pending) running.set(scope, { spec, promise });
      try {
        const saved = await promise;
        actor(req);
        return reply.header("Cache-Control", "no-store").send(saved);
      } finally {
        if (running.get(scope)?.promise === promise) running.delete(scope);
      }
    },
  );
  app.get("/api/team/result-snapshots/:id/content", (req, reply) => {
    const file = communication.ownerSnapshot(
      actor(req),
      z.object({ id: uuid }).parse(req.params).id,
    );
    return reply
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(file.title)}`,
      )
      .type(file.mime)
      .send(file.data);
  });
}
