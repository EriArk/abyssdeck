// Installed-module acceptance. Uses only a disposable loopback page and its own tab.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { createInterface } from "node:readline";

const launcher = join(process.env.LOCALAPPDATA, "CodexWeb/browser/Start-Browser.ps1");
const child = spawn(
  "powershell.exe",
  ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", launcher],
  { windowsHide: true, stdio: ["pipe", "pipe", "inherit"] },
);
let serial = 0;
const pending = new Map();
createInterface({ input: child.stdout }).on("line", (line) => {
  const reply = JSON.parse(line),
    job = pending.get(reply.id);
  if (job) {
    pending.delete(reply.id);
    clearTimeout(job.timer);
    job.resolve(reply.result);
  }
});
function rpc(method, params = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error("MCP timeout"));
    }, 65000);
    pending.set(id, { resolve, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}
const tool = (name, args = {}) => rpc("tools/call", { name, arguments: args });
const value = (result) => {
  assert.equal(result.isError, undefined, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
};
const server = createServer((_req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(
    `<!doctype html><title>Companion browser acceptance</title><style>body{background:#1e242c;color:#eee;font:24px system-ui;padding:32px}input,button{font:inherit;margin:12px;padding:10px}</style><h1>Independent browser fixture</h1><form><label>User <input id=user></label><label>Password <input id=password type=password></label><button>Sign in</button></form><output id=result>Not submitted</output><script>document.querySelector('form').onsubmit=e=>{e.preventDefault();document.querySelector('output').textContent=document.querySelector('#user').value==='fixture-user'&&document.querySelector('#password').value==='public-fixture-password'?'Signed in once':'Wrong fixture values';window.count=(window.count||0)+1;document.querySelector('output').textContent+=' '+window.count}</script>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let tab;
try {
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "fixture", version: "1" },
  });
  assert.equal(init.serverInfo.name, "codexweb_browser");
  const catalog = await rpc("tools/list");
  assert.equal(catalog.tools.length, 4);
  tab = value(await tool("open", { url: `http://127.0.0.1:${server.address().port}/` })).tab;
  async function observe() {
    for (let i = 0; i < 20; i++) {
      const result = await tool("observe", { tab });
      const state = value(result);
      if (state.page?.text?.includes("Independent browser fixture")) return { result, state };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error("Fixture navigation did not complete");
  }
  for (const [name, text] of [
    ["User", "fixture-user"],
    ["Password", "public-fixture-password"],
  ]) {
    const { state } = await observe();
    const element = state.page.elements.find((e) => e.name.trim() === name);
    assert.ok(element, name);
    value(
      await tool("act", {
        observation: state.observation,
        kind: "fill",
        element: String(element.id),
        text,
      }),
    );
    const repeated = await tool("act", {
      observation: state.observation,
      kind: "fill",
      element: String(element.id),
      text,
    });
    assert.equal(repeated.isError, true);
  }
  const { state } = await observe();
  assert.equal(state.page.elements.find((e) => e.type === "password").value, undefined);
  assert.ok(!JSON.stringify(state.page).includes("public-fixture-password"));
  const button = state.page.elements.find((e) => e.tag === "BUTTON");
  value(
    await tool("act", {
      observation: state.observation,
      kind: "click",
      element: String(button.id),
    }),
  );
  const final = await observe();
  assert.ok(final.state.page.text.includes("Signed in once 1"));
  if (process.env.BROWSER_ACCEPTANCE_IMAGE)
    await writeFile(
      process.env.BROWSER_ACCEPTANCE_IMAGE,
      Buffer.from(final.result.content.find((c) => c.type === "image").data, "base64"),
    );
  console.log(
    "Installed browser: real WebView2 navigation, screenshot, masked field, input and one submission passed; reused observation rejected.",
  );
} finally {
  if (tab) {
    const result = await tool("observe", { tab });
    if (!result.isError)
      await tool("act", { observation: value(result).observation, kind: "close" });
  }
  child.stdin.end();
  server.close();
}
