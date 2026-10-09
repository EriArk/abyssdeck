import { request } from "node:http";

export const ENGINE_PROTOCOL = 1;
export function engineWorkerMaintenance(
  socketPath: string,
  body: { machineId: string; operationId: string; action: "acquire" | "release" | "status" },
): Promise<{ state: string; operationId: string }> {
  return new Promise((resolve, reject) => {
    const bytes = Buffer.from(JSON.stringify(body));
    const req = request(
      {
        socketPath,
        path: "/internal/companion/maintenance",
        method: "POST",
        headers: { "content-type": "application/json", "content-length": bytes.length },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
          if (text.length > 4096) req.destroy(new Error("ENGINE_RESPONSE_LIMIT"));
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            const value = JSON.parse(text);
            if (
              res.statusCode !== 200 ||
              !["idle", "waitingIdle", "unknown", "draining", "drained", "released"].includes(
                value.state,
              ) ||
              value.operationId !== body.operationId
            )
              throw new Error("COMPANION_ADMISSION_UNKNOWN");
            resolve(value);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(45000, () => req.destroy(new Error("ENGINE_TIMEOUT")));
    req.on("error", reject);
    req.end(bytes);
  });
}
export interface EngineInfo {
  protocol: number;
  schema: number;
  revision: string;
  instance: string;
}
// Startup/admission callers (gateway, publisher and owner migration) must allow
// cold history hydration after health succeeds. One bounded read, no polling.
export function engineInfo(socketPath: string): Promise<EngineInfo> {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath, path: "/internal/runtime", method: "GET" }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        text += chunk;
        if (text.length > 4096) req.destroy(new Error("ENGINE_RESPONSE_LIMIT"));
      });
      res.on("error", reject);
      res.on("end", () => {
        try {
          const value = JSON.parse(text);
          if (
            res.statusCode !== 200 ||
            !Number.isInteger(value.protocol) ||
            !Number.isInteger(value.schema) ||
            typeof value.instance !== "string"
          )
            throw new Error("ENGINE_INCOMPATIBLE");
          resolve(value);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.setTimeout(30000, () => req.destroy(new Error("ENGINE_TIMEOUT")));
    req.on("error", reject);
    req.end();
  });
}

export function engineTerminalWork(
  socketPath: string,
  reserve = false,
): Promise<{ busy: number; unknown: number; reserved: boolean; work?: number }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { socketPath, path: "/internal/terminals/maintenance", method: reserve ? "POST" : "GET" },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
          if (text.length > 2048) req.destroy(new Error("ENGINE_RESPONSE_LIMIT"));
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            const value = JSON.parse(text);
            if (
              res.statusCode !== 200 ||
              !Number.isSafeInteger(value.busy) ||
              !Number.isSafeInteger(value.unknown) ||
              value.busy < 0 ||
              value.unknown < 0 ||
              typeof value.reserved !== "boolean" ||
              (value.work !== undefined && (!Number.isSafeInteger(value.work) || value.work < 0))
            )
              throw new Error("TERMINAL_STATUS_UNAVAILABLE");
            resolve(value);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(15000, () => req.destroy(new Error("ENGINE_TIMEOUT")));
    req.on("error", reject);
    req.end();
  });
}

/** Only the private engine socket can attest exact, live Companion-owned turns. */
export function enginePersistentThreads(socketPath: string): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    const req = request(
      { socketPath, path: "/internal/codex/persistent", method: "GET" },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
          if (body.length > 32768) req.destroy(new Error("ENGINE_RESPONSE_LIMIT"));
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            const value = JSON.parse(body);
            if (
              res.statusCode !== 200 ||
              !Array.isArray(value.threads) ||
              value.threads.length > 256 ||
              value.threads.some((id: unknown) => typeof id !== "string" || id.length > 200)
            )
              throw new Error("RUNTIME_PROOF_UNAVAILABLE");
            resolve(new Set(value.threads));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(10000, () => req.destroy(new Error("ENGINE_TIMEOUT")));
    req.on("error", reject);
    req.end();
  });
}
