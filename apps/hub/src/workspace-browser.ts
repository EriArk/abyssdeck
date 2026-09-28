import { gzipSync } from "node:zlib";

export function workspaceBrowserScript(port: number, width: number, height: number) {
  const source = `(${workspaceBrowser.toString()})(${port},${width},${height})`;
  const packed = gzipSync(source).toString("base64");
  return `eval(require('node:zlib').gunzipSync(Buffer.from('${packed}','base64')).toString())`;
}
/** Executed inside the actor's rootless workspace. No Hub cookies or CDP socket leave it. */
export async function workspaceBrowser(port: number, width: number, height: number) {
  const { spawn } = await import("node:child_process");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const profile = await mkdtemp("/tmp/cw-preview-");
  const browser = spawn(
    "chromium",
    [
      "--headless",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--no-first-run",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "about:blank",
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        HOME: profile,
        XDG_CONFIG_HOME: profile + "/config",
        XDG_CACHE_HOME: profile + "/cache",
      },
    },
  );
  let socket: WebSocket | undefined,
    ending = false;
  const end = async () => {
    if (ending) return;
    ending = true;
    socket?.close();
    browser.kill("SIGTERM");
    const killer = setTimeout(() => browser.kill("SIGKILL"), 3000);
    await new Promise<void>((resolve) =>
      browser.exitCode !== null ? resolve() : browser.once("exit", () => resolve()),
    );
    clearTimeout(killer);
    await rm(profile, { recursive: true, force: true });
    process.exit(0);
  };
  process.stdin.on("end", () => void end());
  process.on("SIGTERM", () => void end());
  const output = async (value: unknown) => {
    if (!process.stdout.write(JSON.stringify(value) + "\n")) {
      const timer = setTimeout(() => void end(), 15000);
      await new Promise<void>((resolve) => process.stdout.once("drain", resolve));
      clearTimeout(timer);
    }
  };
  try {
    const endpoint = await new Promise<string>((resolve, reject) => {
      let log = "";
      const timer = setTimeout(() => reject(Error("BROWSER_START_TIMEOUT")), 15000);
      browser.once("error", reject);
      browser.once("exit", () => reject(Error("BROWSER_EXIT")));
      browser.stderr.on("data", (chunk) => {
        log = (log + chunk).slice(-8192);
        const match = log.match(
          /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-f0-9-]+)/,
        );
        if (match) {
          clearTimeout(timer);
          resolve(match[1]!);
        }
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      socket!.onopen = () => resolve();
      socket!.onerror = () => reject(Error("BROWSER_CONNECTION"));
    });
    let serial = 0,
      session: string | undefined;
    let loaded: (() => void) | undefined;
    const waiting = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
    const command = (method: string, params: object = {}, scoped = true): Promise<any> =>
      new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = setTimeout(() => {
          waiting.delete(id);
          reject(Error("BROWSER_TIMEOUT"));
        }, 10000);
        waiting.set(id, {
          resolve: (v) => {
            clearTimeout(timer);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        socket!.send(
          JSON.stringify({
            id,
            method,
            params,
            ...(scoped && session ? { sessionId: session } : {}),
          }),
        );
      });
    socket.onmessage = (event) => {
      const value = JSON.parse(String(event.data));
      if (value.method === "Page.loadEventFired") loaded?.();
      if (value.id) {
        const pending = waiting.get(value.id);
        waiting.delete(value.id);
        if (value.error) pending?.reject(Error("BROWSER_COMMAND"));
        else pending?.resolve(value.result);
      }
    };
    socket.onclose = () => void end();
    const target = await command("Target.createTarget", { url: "about:blank" }, false);
    session = (
      await command("Target.attachToTarget", { targetId: target.targetId, flatten: true }, false)
    ).sessionId;
    await command("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await command("Browser.setDownloadBehavior", { behavior: "deny" }, false);
    await command("Page.enable");
    // The fixed initial target is inside this container. The browser's ordinary
    // public networking has the same egress boundary as the user's own program.
    const url = `http://127.0.0.1:${port}/`;
    const navigate = async () => {
      const pageLoaded = new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 10000);
        loaded = () => {
          clearTimeout(timeout);
          resolve();
        };
      });
      await command("Page.navigate", { url });
      await pageLoaded;
      loaded = undefined;
      await command("Page.bringToFront");
    };
    await navigate();
    await output({ ready: true });
    let buffer = "",
      queue = Promise.resolve(),
      pending = 0;
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (data: string) => {
      buffer += data;
      if (buffer.length > 32768) {
        void end();
        return;
      }
      for (;;) {
        const index = buffer.indexOf("\n");
        if (index < 0) break;
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (++pending > 16) {
          void end();
          return;
        }
        queue = queue
          .then(async () => {
            const input = JSON.parse(line);
            if (input.op === "frame") {
              let frame;
              for (let attempt = 0; attempt < 3; attempt++) {
                try {
                  frame = await command("Page.captureScreenshot", {
                    format: "jpeg",
                    quality: 75,
                    captureBeyondViewport: false,
                  });
                  break;
                } catch (error) {
                  if (attempt === 2) throw error;
                  // A page navigation can briefly detach the frame. Retry only
                  // this read; clicks/text/navigation are never replayed.
                  await new Promise((resolve) => setTimeout(resolve, 150));
                }
              }
              if (frame.data.length > 3 * 1024 ** 2) throw Error("FRAME_LIMIT");
              await output({ id: input.id, image: frame.data });
            } else {
              if (input.op === "click") {
                await command("Input.dispatchMouseEvent", {
                  type: "mousePressed",
                  x: input.x,
                  y: input.y,
                  button: "left",
                  clickCount: 1,
                });
                await command("Input.dispatchMouseEvent", {
                  type: "mouseReleased",
                  x: input.x,
                  y: input.y,
                  button: "left",
                  clickCount: 1,
                });
              } else if (input.op === "scroll") {
                await command("Input.dispatchMouseEvent", {
                  type: "mouseWheel",
                  x: width / 2,
                  y: height / 2,
                  deltaX: 0,
                  deltaY: input.delta,
                });
              } else if (input.op === "text")
                await command("Input.insertText", { text: input.text });
              else if (input.op === "key") {
                await command("Input.dispatchKeyEvent", {
                  type: "keyDown",
                  key: input.key,
                  windowsVirtualKeyCode: input.code,
                });
                await command("Input.dispatchKeyEvent", {
                  type: "keyUp",
                  key: input.key,
                  windowsVirtualKeyCode: input.code,
                });
              } else if (input.op === "reload") await navigate();
              else throw Error("INPUT_INVALID");
              await output({ id: input.id, ok: true });
            }
          })
          .catch(async () => {
            await output({ error: "PREVIEW_FAILED" });
            void end();
          })
          .finally(() => {
            pending--;
          });
      }
    });
  } catch {
    await output({ error: "PREVIEW_UNAVAILABLE" });
    await end();
  }
}
