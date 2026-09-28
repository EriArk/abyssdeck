import { randomUUID } from "node:crypto";
import { spawnWorkspace, workspaceCommand } from "@codex-web/machines";
import { HubError } from "@codex-web/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Sessions } from "./sessions.js";
import { workspaceBrowserScript } from "./workspace-browser.js";

const missing = () =>
  new HubError(
    410,
    "WORKSPACE_PREVIEW_CLOSED",
    "Просмотр закрыт. Открой его заново; приложение продолжает работать.",
  );
const input = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("click"),
      x: z.number().int().min(0).max(1600),
      y: z.number().int().min(0).max(1200),
    })
    .strict(),
  z.object({ op: z.literal("scroll"), delta: z.number().int().min(-1200).max(1200) }).strict(),
  z.object({ op: z.literal("text"), text: z.string().min(1).max(8000) }).strict(),
  z
    .object({
      op: z.literal("key"),
      key: z.enum([
        "Enter",
        "Tab",
        "Backspace",
        "Escape",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ]),
    })
    .strict(),
  z.object({ op: z.literal("reload") }).strict(),
]);
export function registerWorkspacePreviews(
  app: FastifyInstance,
  sessions: Sessions,
  launch = spawnWorkspace,
) {
  const context = (id: string) => {
    const project = sessions.project(id),
      machine = sessions.catalog.machine(project.machineId);
    if (project.unassigned || machine.type !== "server-workspace") throw missing();
    workspaceCommand(machine, ["true"], "/workspace");
    return { machine, root: project.workingDirectory };
  };
  type View = ReturnType<typeof create>;
  const views = new Map<string, View>();
  function create(project: string, width: number, height: number, port: number) {
    const binding = context(project),
      id = randomUUID();
    const child = launch(binding.machine, [
      "node",
      "-e",
      workspaceBrowserScript(port, width, height),
    ]);
    let closed = false,
      buffer = "",
      last = Date.now(),
      queued = 0;
    const waiting = new Map<
      string,
      {
        resolve: (v: Record<string, unknown>) => void;
        reject: (e: Error) => void;
        timer: NodeJS.Timeout;
      }
    >();
    const close = () => {
      if (closed) return;
      closed = true;
      views.delete(id);
      clearInterval(timer);
      child.stdin.end();
      const kill = setTimeout(() => {
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {}
      }, 5000);
      kill.unref();
      child.once("close", () => clearTimeout(kill));
      for (const pending of waiting.values()) {
        clearTimeout(pending.timer);
        pending.reject(missing());
      }
      waiting.clear();
    };
    const check = () => {
      if (closed || Date.now() - last > 120000) {
        close();
        throw missing();
      }
      const now = context(project);
      if (now.machine !== binding.machine || now.root !== binding.root) {
        close();
        throw missing();
      }
    };
    const timer = setInterval(() => {
      try {
        check();
      } catch {
        close();
      }
    }, 2000);
    timer.unref();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data: string) => {
      buffer += data;
      if (buffer.length > 4 * 1024 ** 2) {
        close();
        return;
      }
      for (;;) {
        const at = buffer.indexOf("\n");
        if (at < 0) break;
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 1);
        try {
          const value = JSON.parse(line);
          if (value.error) {
            close();
            return;
          }
          const pending = waiting.get(value.id);
          if (pending) {
            waiting.delete(value.id);
            clearTimeout(pending.timer);
            pending.resolve(value);
          }
        } catch {
          close();
          return;
        }
      }
    });
    child.stderr.on("data", () => {});
    child.on("error", close);
    child.on("close", close);
    child.stdin.on("error", close);
    const request = async (value: object) => {
      check();
      last = Date.now();
      if (queued >= 8)
        throw new HubError(429, "PREVIEW_BUSY", "Дождись выполнения предыдущего действия.");
      queued++;
      try {
        const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const key = randomUUID();
          const timeout = setTimeout(close, 25000);
          waiting.set(key, { resolve, reject, timer: timeout });
          child.stdin.write(JSON.stringify({ ...value, id: key }) + "\n");
        });
        check();
        return response;
      } finally {
        queued--;
      }
    };
    return { id, project, width, height, close, request, check };
  }
  const params = (value: unknown) =>
    z.object({ id: z.string().min(1).max(100), view: z.string().uuid().optional() }).parse(value);
  const selected = (value: unknown) => {
    const { id, view } = params(value),
      found = views.get(view ?? "");
    if (!found || found.project !== id) throw missing();
    found.check();
    return found;
  };
  const base = "/api/projects/:id/workspace-preview";
  app.post(base, async (req) => {
    const { id } = params(req.params);
    const settings = z
      .object({
        port: z.number().int().min(1024).max(65535),
        width: z.number().int().min(320).max(1600),
        height: z.number().int().min(320).max(1200),
      })
      .strict()
      .parse(req.body);
    context(id);
    if (views.size >= 2)
      throw new HubError(429, "PREVIEW_LIMIT", "Сначала закрой один из открытых просмотров.");
    const view = create(id, settings.width, settings.height, settings.port);
    views.set(view.id, view);
    try {
      await view.request({ op: "frame" });
    } catch (error) {
      view.close();
      throw error;
    }
    return { id: view.id, width: view.width, height: view.height };
  });
  app.get(base + "/:view/frame", async (req, reply) => {
    const result = await selected(req.params).request({ op: "frame" });
    if (typeof result.image !== "string" || result.image.length > 3 * 1024 ** 2) throw missing();
    return reply
      .header("Cache-Control", "no-store")
      .type("image/jpeg")
      .send(Buffer.from(result.image, "base64"));
  });
  app.post(base + "/:view/input", async (req) => {
    const view = selected(req.params),
      value = input.parse(req.body);
    if (value.op === "click" && (value.x >= view.width || value.y >= view.height))
      throw new HubError(400, "PREVIEW_POSITION", "Нажми внутри изображения.");
    const codes = {
      Enter: 13,
      Tab: 9,
      Backspace: 8,
      Escape: 27,
      ArrowUp: 38,
      ArrowDown: 40,
      ArrowLeft: 37,
      ArrowRight: 39,
    };
    await view.request(value.op === "key" ? { ...value, code: codes[value.key] } : value);
    return { ok: true };
  });
  app.delete(base + "/:view", async (req) => {
    selected(req.params).close();
    return { ok: true };
  });
  app.addHook("onClose", async () => {
    for (const view of views.values()) view.close();
  });
}
