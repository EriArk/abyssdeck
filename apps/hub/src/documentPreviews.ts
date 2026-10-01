import { request } from "node:http";
import { HubError } from "@codex-web/shared";
import type { FastifyInstance } from "fastify";
import type { Auth } from "./auth.js";

export const documentPreviewLimit = 32 * 1024 * 1024;
const failed = () =>
  new HubError(
    422,
    "DOCUMENT_PREVIEW_FAILED",
    "Не удалось подготовить страницы DOCX. Оригинальный файл доступен для скачивания.",
  );
export function documentWorker(
  socketPath: string,
  bytes: Buffer,
  signal: AbortSignal,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath,
        path: "/convert/docx",
        method: "POST",
        signal,
        headers: { "Content-Type": "application/octet-stream", "Content-Length": bytes.length },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            res.statusCode === 429
              ? new HubError(
                  429,
                  "DOCUMENT_PREVIEW_BUSY",
                  "Другой документ ещё обрабатывается. Открой файл немного позже.",
                )
              : failed(),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > documentPreviewLimit) {
            res.destroy();
            reject(failed());
          } else chunks.push(chunk);
        });
        res.on("error", () => reject(failed()));
        res.on("end", () => {
          const pdf = Buffer.concat(chunks);
          if (pdf.subarray(0, 5).toString() !== "%PDF-") reject(failed());
          else resolve(pdf);
        });
      },
    );
    req.setTimeout(75000, () => req.destroy());
    req.on("error", () =>
      reject(
        new HubError(
          503,
          "DOCUMENT_WORKER_UNAVAILABLE",
          "Просмотр документов временно недоступен. Оригинальный файл можно скачать.",
        ),
      ),
    );
    req.end(bytes);
  });
}

export function registerDocumentPreviews(
  app: FastifyInstance,
  auth: Pick<Auth, "session">,
  render = (bytes: Buffer, signal: AbortSignal) =>
    documentWorker(
      process.env.HUB_DOCUMENT_SOCKET || "/run/codex-documents/documents.sock",
      bytes,
      signal,
    ),
) {
  const active = new Map<string, AbortController>();
  // Input is an already opened immutable File; no server paths, external URLs or native writes.
  app.post("/api/previews/docx", { bodyLimit: documentPreviewLimit }, async (req, reply) => {
    const owner = auth.session(req).tokenHash;
    if (!Buffer.isBuffer(req.body) || !req.body.length)
      throw new HubError(400, "INVALID_DOCUMENT", "Нужен файл DOCX.");
    if (active.has(owner) || active.size >= 2)
      throw new HubError(429, "DOCUMENT_PREVIEW_BUSY", "Документ ещё обрабатывается.");
    const controller = new AbortController();
    active.set(owner, controller);
    const abort = () => controller.abort();
    req.raw.on("aborted", abort);
    reply.raw.on("close", abort);
    const timeout = setTimeout(abort, 80000);
    try {
      const pdf = await render(req.body, controller.signal);
      if (controller.signal.aborted) throw failed();
      auth.session(req); // Do not deliver private contents after logout or account revocation.
      return reply
        .header("Cache-Control", "private, no-store")
        .send({ pdf: pdf.toString("base64") });
    } finally {
      clearTimeout(timeout);
      req.raw.off("aborted", abort);
      reply.raw.off("close", abort);
      active.delete(owner);
    }
  });
  app.addHook("onClose", async () => {
    for (const controller of active.values()) controller.abort();
  });
}
