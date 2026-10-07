import seed from "./seed.json";
import { pictures } from "./pictures";
const values: any = structuredClone(seed.values);
for (const p of values["/projects"].projects) p.remoteAvailable = true;
for (const p of values["/navigation"].projects) p.remoteAvailable = true;
for (const m of values["/machines"].machines || []) {
  m.remoteAvailable = true;
  m.type = "ssh-windows";
}
const threadId = seed.threadId;
const threads = values["/projects/project/threads"].threads;
for (const thread of values["/navigation"].threads) {
  if (!threads.some((item: any) => item.id === thread.id)) {
    threads.push({ ...threads[0], ...thread });
  }
}
for (const name of [
  "toLocaleDateString",
  "toLocaleTimeString",
  "toLocaleString",
] as const) {
  const original = Date.prototype[name];
  Date.prototype[name] = function (locale: any, options: any) {
    return original.call(this, "en-US", options);
  };
}
const OriginalDateFormat = Intl.DateTimeFormat;
Intl.DateTimeFormat = new Proxy(OriginalDateFormat, {
  construct(Target, args) {
    return Reflect.construct(Target, ["en-US", args[1]]);
  },
  apply(Target, _this, args) {
    return new Target("en-US", args[1]);
  },
});
const nativeFetch = window.fetch.bind(window);
const media = new Map<string, { blob: Blob; url: string }>();
for (let i = 0; i < pictures.length; i++) {
  const data = pictures[i].data.split(",")[1],
    blob = new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], {
      type: "image/png",
    });
  media.set(`/api/artifacts/demo-image-${i}`, {
    blob,
    url: URL.createObjectURL(blob),
  });
}
const base = new URL("./", document.baseURI);
const memory = () => {
  const entries: Record<string, string> = {};
  return new Proxy(
    {
      getItem: (k: string) => entries[k] ?? null,
      setItem: (k: string, v: any) => {
        entries[k] = String(v);
      },
      removeItem: (k: string) => {
        delete entries[k];
      },
      clear: () => {
        for (const k of Object.keys(entries)) delete entries[k];
      },
      key: (i: number) => Object.keys(entries)[i] ?? null,
      get length() {
        return Object.keys(entries).length;
      },
    },
    {
      ownKeys: () => Object.keys(entries),
      getOwnPropertyDescriptor: () => ({
        enumerable: true,
        configurable: true,
      }),
    },
  );
};
Object.defineProperty(window, "localStorage", { value: memory() });
Object.defineProperty(window, "sessionStorage", { value: memory() });
localStorage.setItem("codex-theme", "crt-green");
localStorage.setItem("codex-crtCaseColor", "red");
const apiLog: any[] = [];
(window as any).__demo = { apiLog, values };
(window as any).__demo.mediaUrl = (url: string) => media.get(url)?.url || url;
document.addEventListener(
  "click",
  async (event) => {
    const a = (event.target as Element).closest?.(
      'a[href^="/api/"]',
    ) as HTMLAnchorElement | null;
    if (!a) return;
    event.preventDefault();
    const response = await window.fetch(a.href);
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob()),
      download = document.createElement("a");
    download.href = url;
    download.download = a.download || "AbyssDeck-demo-file";
    download.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  },
  true,
);
const json = (value: any, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const histories: any = { [threadId]: values[`/threads/${threadId}/history`] };
for (const thread of values["/projects/project/threads"].threads) {
  histories[thread.id] ??= { ...structuredClone(histories[threadId]), thread };
}
let seq = histories[threadId].lastSeq || 3;
const files: Record<string, string> = {
  "README.md": seed.doc,
  "docs/release.md": "# Release 1.2\n\nThe gallery is ready for review.\n",
  "src/App.tsx": "export function App() { return <main>Northstar</main>; }\n",
  "src/gallery.css": ".gallery { display: grid; gap: 24px; }\n",
  "package.json": '{"name":"northstar","version":"1.2.0"}',
  "changelog.csv": "Feature,Status\nGallery,Ready\nRelease notes,Draft\n",
};
const now = () => new Date().toISOString();
const scope = { client: "codex", projectId: "project", name: "Northstar" };
const notebooks: Record<string, any[]> = {};
for (const kind of ["notes", "tasks", "plans"])
  notebooks[kind] = (values[`/workspace/${kind}?scope=all`]?.items || []).map(
    (n: any) => ({ ...n, body: n.excerpt, links: [] }),
  );
notebooks.plans.push({
  id: "demo-launch-plan",
  scope,
  title: "Launch Northstar 1.2",
  description: "A small, reviewable release.",
  status: "draft",
  revision: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  links: [],
  sections: [
    {
      id: "launch-checks",
      title: "Release checklist",
      items: [
        {
          id: "layout",
          text: "Review phone and tablet layouts",
          checked: true,
        },
        { id: "notes", text: "Write release notes", checked: false },
        { id: "ship", text: "Publish the release page", checked: false },
      ],
    },
  ],
});
const terminals: any[] = [
  {
    id: "demo-terminal",
    deviceId: "server",
    title: "Sample terminal",
    state: "open",
    createdAt: now(),
    exitCode: null,
  },
];
const folders = new Set(["docs", "src", "public"]);
const revisions: Record<string, number> = {};
const deliveries = new Map<string, any>();
const deliveryState = () => ({
  repository: true,
  branch: "main",
  head: "a".repeat(40),
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  changed: 2,
  staged: 0,
  untracked: 1,
  hidden: 0,
  paths: values["/projects/project/git"].changes.map((c: any) => ({
    ...c,
    size: 584,
    hash: "demo",
  })),
  truncated: false,
  github: {
    state: "ok",
    repository: "demo/northstar",
    defaultBranch: "main",
    remoteHead: "a".repeat(40),
    checks: [],
    checksKnown: true,
  },
  checkedAt: Date.now(),
  fingerprint: "demo",
});
const fileSnapshot = (path: string) => ({
  checkout: "demo",
  path,
  fingerprint: `demo-${revisions[path] || 1}`,
  kind: folders.has(path) ? "directory" : "file",
  size: files[path]?.length || 0,
  text: files[path],
  bom: false,
});
values["/projects/project/git/repository"].name = "Northstar";
values["/machines/pc/limits"] = {
  available: true,
  groups: [
    {
      id: "demo",
      name: "Codex · sample usage",
      windows: [
        {
          minutes: 300,
          remainingPercent: 78,
          resetsAt: Date.now() / 1000 + 7200,
        },
        {
          minutes: 10080,
          remainingPercent: 64,
          resetsAt: Date.now() / 1000 + 345600,
        },
      ],
      credits: { hasCredits: true, unlimited: false, balance: "120" },
    },
  ],
  resetCredits: { availableCount: 0, credits: [] },
  checkedAt: now(),
};
const gptMessages: any[] = [
  {
    id: "gu",
    role: "user",
    text: "Help me write a story about an observatory by the sea.",
    files: [],
  },
  {
    id: "ga",
    role: "assistant",
    phase: "final",
    complete: true,
    text: "### A light beyond the shore\n\nEvery evening, Mira climbed the steps to the old telescope. Below her, the sea turned ink-dark. Tonight, an unfamiliar light waited above the horizon.",
    files: [],
  },
];
const gptJobs: any[] = [];
const sockets = new Set<DemoSocket>();
class DemoSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  url: string;
  onopen: any;
  onmessage: any;
  onclose: any;
  onerror: any;
  binaryType = "blob";
  constructor(input: string | URL) {
    super();
    this.url = String(input);
    sockets.add(this);
    setTimeout(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.onopen?.(new Event("open"));
      if (this.url.includes("navigation/events"))
        this.emit(values["/navigation"]);
      else if (this.url.includes("/api/events"))
        this.emit({
          type: "connection.ready",
          thread:
            histories[
              new URL(this.url).searchParams.get("threadId") || threadId
            ]?.thread,
          approvals: [],
        });
    }, 20);
  }
  emit(value: any) {
    const e = new MessageEvent("message", { data: JSON.stringify(value) });
    this.onmessage?.(e);
    this.dispatchEvent(e);
  }
  line = "";
  send(data: any) {
    if (!this.url.includes("device-terminals")) return;
    let value: any;
    try {
      value = JSON.parse(data);
    } catch {
      return;
    }
    if (value.ticket) {
      this.emit({ type: "ready", state: "open" });
      this.emit({
        type: "output",
        data: "\r\nAbyssDeck demo terminal — simulated, no host connected.\r\nTry ls, pwd, whoami or help.\r\nvisitor@northstar:~$ ",
      });
    } else if (value.type === "input") {
      for (const ch of value.data) {
        if (ch === "\r" || ch === "\n") {
          const responses: Record<string, string> = {
            ls: "README.md  docs/  public/  src/",
            pwd: "/demo/northstar",
            whoami: "visitor",
            help: "Sample commands: ls, pwd, whoami, date, clear. No shell commands are executed.",
            date: new Date().toUTCString(),
          };
          this.emit({
            type: "output",
            data:
              this.line.trim() === "clear"
                ? "\x1b[2J\x1b[Hvisitor@northstar:~$ "
                : "\r\n" +
                  (responses[this.line.trim()] ||
                    "Simulated command. A real terminal connects to your own machine.") +
                  "\r\nvisitor@northstar:~$ ",
          });
          this.line = "";
        } else if (ch === "\x7f") {
          this.line = this.line.slice(0, -1);
          this.emit({ type: "output", data: "\b \b" });
        } else {
          this.line += ch;
          this.emit({ type: "output", data: ch });
        }
      }
    }
  }
  close() {
    this.readyState = 3;
    sockets.delete(this);
    this.onclose?.(new CloseEvent("close"));
  }
}
(window as any).WebSocket = DemoSocket;
const broadcast = (id: string, event: any) => {
  for (const ws of sockets)
    if (
      ws.url.includes("/api/events?") &&
      new URL(ws.url).searchParams.get("threadId") === id
    )
      ws.emit(event);
};
const emit = (id: string, type: string, payload: any, turnId: string) => {
  const event = { type, payload, turnId, seq: ++seq, createdAt: now() };
  histories[id].lastSeq = seq;
  broadcast(id, event);
  return event;
};
function results(category?: string | null) {
  const common = { threadId, turnId: "release", createdAt: now() };
  const items = [
    {
      ...common,
      id: "demo-readme",
      type: "file",
      title: "Release notes.md",
      payload: {
        url: "/api/artifacts/demo-readme",
        mime: "text/markdown",
        bytes: files["docs/release.md"].length,
      },
    },
    ...pictures.map((p, i) => ({
      ...common,
      id: `image-${i}`,
      type: "image",
      title: p.title + ".png",
      payload: {
        url: `/api/artifacts/demo-image-${i}`,
        mime: "image/png",
        bytes: media.get(`/api/artifacts/demo-image-${i}`)!.blob.size,
        width: 1000,
        height: 680,
      },
    })),
    {
      ...common,
      id: "demo-reasoning",
      type: "reasoning-request",
      title: "Prepare the gallery for launch",
      payload: {
        text: "Prepare the gallery for launch. Check phone and tablet layouts.",
        codexTurn: true,
        revision: 1,
      },
    },
  ];
  const categories: Record<string, string> = {
    file: "files",
    image: "images",
    "reasoning-request": "reasoning",
  };
  return {
    items: items.filter(
      (r) => !category || category === "all" || categories[r.type] === category,
    ),
    counts: {
      all: 4,
      files: 1,
      images: 2,
      links: 0,
      demos: 0,
      work: 0,
      reasoning: 1,
    },
    nextBefore: null,
  };
}
async function request(
  path: string,
  method: string,
  body: any,
  url: URL,
): Promise<Response> {
  if (path.includes("/delivery")) {
    const parts = path.split("/delivery")[1].split("/").filter(Boolean);
    if (!parts.length)
      return json({
        id: "demo-observation",
        projectId: "project",
        projectName: "Northstar",
        state: deliveryState(),
        createdAt: Date.now(),
      });
    if (parts[0] === "operations")
      return json({ items: [...deliveries.values()] });
    const id = parts[0];
    if (method === "PUT")
      deliveries.set(id, {
        id,
        kind: body.kind,
        input: body,
        snapshot: deliveryState(),
        state: "prepared",
        fingerprint: "demo",
        projectId: "project",
        projectName: "Northstar",
        machineId: "pc",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    if (parts[1] === "execute" && deliveries.has(id)) {
      const op = deliveries.get(id);
      op.state = "completed";
      op.commit = "demo123";
      op.updatedAt = Date.now();
      if (op.kind === "commit") {
        values["/projects/project/git"].commits.unshift({
          id: "demo123",
          subject: op.input.message,
          date: now(),
          author: "Demo visitor",
        });
        values["/projects/project/git"].changes = [];
        values["/projects/project/git"].dirty = false;
      }
    }
    return json(deliveries.get(id) || null);
  }
  if (path.includes("/schedules/") && method === "GET")
    return json({
      target: {
        key: "demo",
        name: "Gallery, ready for every screen",
        role: "work",
        revision: 1,
      },
      items: [],
    });
  if (media.has("/api" + path))
    return new Response(media.get("/api" + path)!.blob);
  if (path === "/artifacts/demo-readme")
    return new Response(files["docs/release.md"], {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": "attachment; filename=Release-notes.md",
      },
    });
  if (path.endsWith("/reasoning/work"))
    return json({ items: [], nextBefore: null });
  if (path.endsWith("/reasoning"))
    return json({
      items: [
        {
          id: "summary",
          kind: "summary",
          label: "Approach",
          text: "Keep the gallery responsive and preserve the selected image when switching views. This is a public example summary.",
        },
        {
          id: "check",
          kind: "work",
          label: "Build check",
          result: {
            id: "check",
            type: "check",
            title: "Build check",
            turnId: "release",
            createdAt: now(),
            payload: {
              command: "pnpm build",
              text: "Sample output: build completed successfully.",
              exitCode: 0,
            },
          },
        },
      ],
      nextAfter: null,
    });
  if (path === "/workspace/relays")
    return json({
      items: [],
      links: [],
      projects: values["/projects"].projects,
      nextOffset: null,
    });
  const collection = path.match(
    /^\/workspace\/(notes|tasks|plans)(?:\/([^/]+))?$/,
  );
  if (collection) {
    const [, kind, id] = collection;
    const items = notebooks[kind];
    if (!id) {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      return json({
        items: items
          .filter((n) => !q || JSON.stringify(n).toLowerCase().includes(q))
          .map((n) => ({
            ...n,
            excerpt: n.body || n.description,
            checked: n.sections
              ?.flatMap((s: any) => s.items)
              .filter((i: any) => i.checked).length,
            total: n.sections?.flatMap((s: any) => s.items).length,
          })),
        nextOffset: null,
      });
    }
    let note = items.find((n) => n.id === id);
    if (method === "DELETE") {
      notebooks[kind] = items.filter((n) => n.id !== id);
      return json({ ok: true });
    }
    if (method !== "GET") {
      if (!note) {
        note = { id, createdAt: Date.now(), scope, links: [] };
        items.unshift(note);
      }
      Object.assign(note, body, {
        revision: (note.revision || 0) + 1,
        updatedAt: Date.now(),
      });
      note.excerpt = note.body || note.description;
    }
    return note
      ? json(note)
      : json({ error: { message: "This sample was removed." } }, 404);
  }
  if (path === "/workspace/overview")
    return json({
      scope,
      generatedAt: Date.now(),
      threads: values["/projects/project/threads"].threads.map((t: any) => ({
        ...t,
        active: false,
        unread: false,
      })),
      notes: notebooks.notes,
      tasks: notebooks.tasks,
      plans: notebooks.plans.map((p: any) => ({
        ...p,
        total: p.sections.flatMap((s: any) => s.items).length,
        checked: p.sections
          .flatMap((s: any) => s.items)
          .filter((item: any) => item.checked).length,
      })),
      pins: [],
      results: results().items,
      machine: {
        id: "pc",
        name: "Studio PC",
        stale: false,
        online: true,
        codex: true,
        remoteAvailable: false,
      },
      git: {
        repository: true,
        branch: "main",
        dirty: true,
        changed: 2,
        stale: false,
        checkedAt: Date.now(),
      },
    });
  if (path === "/workspace/actions") return json({ items: [] });
  if (path === "/workspace/resolve")
    return json({ ...body, availability: "available" });
  if (path === "/workspace/navigation" && method !== "GET") {
    Object.assign(values[path], body);
    return json(values[path]);
  }
  if (path.match(/^\/devices\/[^/]+\/terminals$/)) {
    if (method === "POST") {
      const terminal = {
        id: crypto.randomUUID(),
        deviceId: path.split("/")[2],
        title: "Demo terminal",
        state: "open",
        createdAt: now(),
        exitCode: null,
      };
      terminals.push(terminal);
      return json(terminal);
    }
    return json({
      terminals: terminals.filter((t) => t.deviceId === path.split("/")[2]),
    });
  }
  if (path.startsWith("/device-terminals/")) {
    if (path.endsWith("/ticket")) return json({ ticket: "demo-ticket" });
    return json({ ok: true });
  }
  if (path.endsWith("/file-tools")) {
    const op = body.op || url.searchParams.get("op"),
      p = body.path || url.searchParams.get("path") || "README.md";
    if (op === "read" || op === "stat") return json(fileSnapshot(p));
    if (op === "save" || op === "create") {
      files[p] = body.text || "";
      revisions[p] = (revisions[p] || 1) + 1;
      return json(fileSnapshot(p));
    }
    if (op === "mkdir") {
      folders.add(p);
      return json(fileSnapshot(p));
    }
    if (op === "delete") {
      delete files[p];
      folders.delete(p);
      return json({ ...fileSnapshot(p), retained: false });
    }
    if (op === "move" || op === "copy") {
      files[body.target] = files[p] || "";
      if (op === "move") delete files[p];
      return json(fileSnapshot(body.target));
    }
  }
  if (path.endsWith("/git/diff"))
    return json({
      path: url.searchParams.get("path"),
      staged: false,
      text: "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1,2 +1,5 @@\n # Northstar\n+\n+## Ready to ship\n+\n+The gallery is ready for every screen.\n",
      truncated: false,
    });
  if (path.endsWith("/settings") && path.startsWith("/threads/")) {
    const id = path.split("/")[2];
    if (histories[id]) Object.assign(histories[id].thread, body);
    return json(histories[id]?.thread || {});
  }
  if (path === "/gpt/send") {
    const job = {
      id: crypto.randomUUID(),
      nativeId: body.nativeId || "demo-gpt",
      text: body.text,
      files: [],
      answer:
        "This is a scripted demo reply. You can explore the actual chat controls, notes and project tools without connecting an account.",
      assets: [],
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    gptJobs.unshift(job);
    gptMessages.push(
      { id: crypto.randomUUID(), role: "user", text: body.text, files: [] },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        phase: "final",
        complete: true,
        text: job.answer,
        files: [],
      },
    );
    return json({ job });
  }
  if (path === "/gpt/jobs") return json({ items: gptJobs, nextOffset: null });
  if (path === "/auth/session")
    return json({ ...values[path], expires: Date.now() + 86400000 });
  if (path === "/preferences") {
    if (method !== "GET") Object.assign(values[path], body);
    return json(values[path]);
  }
  if (path.endsWith("/results"))
    return json(results(url.searchParams.get("category")));
  if (path.endsWith("/capabilities"))
    return json(values["/projects/project/capabilities"]);
  if (path.endsWith("/context")) return json({});
  if (path.endsWith("/queue"))
    return json({ available: true, items: [], canSteer: false });
  if (path.endsWith("/attachments")) return json({ attachments: [] });
  if (path.endsWith("/seen") || path.includes("/notifications/presence"))
    return json({ ok: true });
  if (path.match(/^\/threads\/[^/]+\/history$/)) {
    const id = path.split("/")[2];
    return json(
      histories[id] || {
        ...histories[threadId],
        thread: { ...histories[threadId].thread, id },
      },
    );
  }
  if (path.match(/^\/threads\/[^/]+\/turns$/) && method === "POST") {
    const id = path.split("/")[2],
      turn = crypto.randomUUID();
    histories[id] ??= structuredClone(histories[threadId]);
    const user = {
      id: crypto.randomUUID(),
      text: body.text || body.input || "Demo request",
      role: "user",
      phase: "",
      turnId: turn,
      createdAt: now(),
      attachments: [],
    };
    histories[id].messages.push(user);
    setTimeout(() => {
      emit(id, "user.message", user, turn);
      emit(id, "turn.started", { id: turn }, turn);
      const assistant = {
        id: crypto.randomUUID(),
        text: "This is a scripted demonstration. The example release is ready to inspect: open Files to edit the local sample, or Git to review its changes. No AI request was sent.",
        role: "assistant",
        phase: "final_answer",
        turnId: turn,
        createdAt: now(),
        attachments: [],
      };
      histories[id].messages.push(assistant);
      emit(id, "assistant.completed", assistant, turn);
      emit(id, "turn.completed", { id: turn, status: "completed" }, turn);
    }, 100);
    return json({ turnId: turn });
  }
  if (path.match(/^\/projects\/[^/]+\/threads$/)) {
    const project = path.split("/")[2];
    if (method === "POST") {
      const t = {
        ...histories[threadId].thread,
        id: crypto.randomUUID(),
        projectId: project,
        title: body.title || "New demo chat",
        status: "idle",
      };
      histories[t.id] = {
        ...histories[threadId],
        thread: t,
        messages: [],
        lastSeq: seq,
      };
      values["/projects/project/threads"].threads.unshift(t);
      return json(t);
    }
    return json({
      threads: values["/projects/project/threads"].threads.filter(
        (t: any) => t.projectId === project,
      ),
    });
  }
  if (path.endsWith("/files/content") || path === "/demo/files")
    return new Response(
      files[url.searchParams.get("path") || "README.md"] || "",
      { headers: { "Content-Type": "text/plain;charset=utf-8" } },
    );
  if (path.endsWith("/files/saved")) return json(null);
  if (path.endsWith("/files")) {
    const folder = url.searchParams.get("path") || "",
      prefix = folder ? folder + "/" : "";
    const entries = new Map();
    for (const [p, text] of [
      ...Object.entries(files),
      ...Array.from(folders).map((p) => [p + "/", ""]),
    ]) {
      if (!p.startsWith(prefix) || p === prefix) continue;
      const leaf = p.slice(prefix.length).split("/")[0];
      entries.set(leaf, {
        name: leaf,
        path: prefix + leaf,
        kind: p.slice(prefix.length).includes("/") ? "directory" : "file",
        size: text.length,
        modifiedAt: now(),
      });
    }
    const search = (url.searchParams.get("search") || "").toLowerCase();
    return json({
      path: folder,
      offset: 0,
      total: entries.size,
      entries: [...entries.values()]
        .filter((e) => !search || e.name.toLowerCase().includes(search))
        .sort((a, b) =>
          a.kind === b.kind
            ? a.name.localeCompare(b.name)
            : a.kind === "directory"
              ? -1
              : 1,
        ),
      truncated: false,
      nextOffset: null,
    });
  }
  if (path.endsWith("/file-tools/access"))
    return json({ capability: "demo-only", checkout: "demo" });
  if (
    path.endsWith("/git") ||
    path.endsWith("/git/repository") ||
    path.endsWith("/status")
  ) {
    const key = path.replace(/\/projects\/[^/]+/, "/projects/project");
    if (method === "GET" && values[key]) return json(values[key]);
  }
  if (path === "/gpt/status")
    return json({
      configured: true,
      canSend: true,
      canRead: true,
      state: "healthy",
    });
  if (path === "/gpt/models")
    return json({
      models: [{ id: "Latest", label: "Latest" }],
      efforts: [{ id: "3", label: "High" }],
      currentModel: "Latest",
      currentEffort: "3",
    });
  if (path === "/gpt/conversations")
    return json({
      items: [
        {
          id: "demo-gpt",
          title: "A story by the sea",
          updatedAt: Date.now() / 1000,
        },
      ],
      nextOffset: null,
    });
  if (path.endsWith("/messages") && path.startsWith("/gpt/"))
    return json({
      items: gptMessages,
      nextBefore: null,
      revision: String(gptMessages.length).padStart(64, "a"),
      notModified: false,
    });
  if (path.startsWith("/gpt/") && method === "GET")
    return json({
      items: [],
      projects: [],
      conversations: [],
      jobs: [],
      stamp: 1,
      nextOffset: null,
      blocked: false,
    });
  if (method === "GET" && values[path + "?scope=all"])
    return json(values[path + "?scope=all"]);
  if (method === "GET" && values[path]) return json(values[path]);
  apiLog.push({ unhandled: true, path, method });
  if (method !== "GET")
    return json(
      {
        error: {
          code: "DEMO_ONLY",
          message:
            "This action needs a connected service in AbyssDeck. Nothing was sent or changed outside this demo.",
        },
      },
      422,
    );
  return json(
    {
      error: {
        code: "DEMO_SERVICE",
        message:
          "This screen requires a connected service in the installed app. The website demo does not connect to accounts or computers.",
      },
    },
    422,
  );
}
window.fetch = async (input: any, options: any = {}) => {
  const u = new URL(
    typeof input === "string" ? input : input.url || String(input),
    base,
  );
  if (u.pathname.startsWith("/api/")) {
    let body = {};
    try {
      body = JSON.parse(options.body || "{}");
    } catch {}
    const path = u.pathname.slice(4);
    apiLog.push({ path, method: options.method || "GET" });
    return request(path, options.method || "GET", body, u);
  }
  if (
    u.protocol === "blob:" ||
    u.protocol === "data:" ||
    u.href === new URL("fonts/DejaVuSans.ttf", base).href
  )
    return nativeFetch(input, options);
  throw new Error("External requests are disabled in this demo.");
};
