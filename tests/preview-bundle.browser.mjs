import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium, expect, webkit } from "@playwright/test";
import { bundlePreview } from "../apps/hub/dist/preview-bundle.js";
import { previewCsp, previewMarkup } from "../apps/hub/dist/previews.js";

const files = {
  "demo/site.css": '@import "./colors.css";#picture{background-image:url("./tiny.svg")}',
  "demo/colors.css": "#styled{color:rgb(0,128,0)}",
  "demo/tiny.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="green"/></svg>',
  "demo/classic.js":
    'document.querySelector("#classic").onclick=()=>document.querySelector("#classic").textContent="Works";',
  "demo/main.js":
    'import {value} from "./dependency.js";document.querySelector("#module").textContent=value;document.querySelector("#dynamic").onclick=async()=>{const m=await import("./dynamic.js");document.querySelector("#dynamic").textContent=m.value;};',
  "demo/dependency.js": 'import {read} from "./cycle.js";export const value=read();',
  "demo/cycle.js":
    'import {value} from "./dependency.js";export function read(){return "Module works"};export function later(){return value}',
  "demo/dynamic.js": 'export const value="Dynamic works";',
  "demo/first.js": "globalThis.moduleRuns=(globalThis.moduleRuns||0)+1;",
  "demo/second.js": "globalThis.moduleRuns=(globalThis.moduleRuns||0)+1;",
  "demo/query.js": "globalThis.variantRuns=(globalThis.variantRuns||0)+1;",
  "demo/identity.js":
    'import "./first.js";import "./second.js";import "./first.js";import "./query.js?v=1";import "./query.js?v=2";import "./query.js?v=1";import "./query.js?v=1#variant";document.querySelector("#identity").textContent=`${globalThis.moduleRuns}:${globalThis.variantRuns}`;',
};
const html = await bundlePreview(
  '<!doctype html><title>Bundle</title><link rel="stylesheet" href="site.css"><div id="styled">Styled</div><img id="picture" src="tiny.svg"><button id="classic">Classic</button><div id="module"></div><button id="dynamic">Dynamic</button><div id="identity"></div><script src="classic.js"></script><script type="module" src="main.js"></script><script type="module" src="first.js"></script><script type="module" src="identity.js"></script>',
  "demo/index.html",
  async (path) => {
    assert(path in files, path);
    return Buffer.from(files[path]);
  },
);
const unexpected = [];
const server = createServer((req, res) => {
  if (req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    return res.end('<iframe id="demo" sandbox="allow-scripts" src="/demo"></iframe>');
  }
  if (req.url === "/demo") {
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Security-Policy", previewCsp);
    return res.end(previewMarkup(html));
  }
  unexpected.push(req.url);
  res.writeHead(404);
  res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  for (const [name, browserType] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await browserType.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const frame = page.frameLocator("#demo");
      await expect(frame.locator("#styled")).toHaveCSS("color", "rgb(0, 128, 0)");
      await expect(frame.locator("#module")).toHaveText("Module works");
      await expect(frame.locator("#identity")).toHaveText("2:3");
      assert.equal(await frame.locator("#picture").evaluate((img) => img.naturalWidth), 12);
      await frame.locator("#classic").click();
      await expect(frame.locator("#classic")).toHaveText("Works");
      await frame.locator("#dynamic").click();
      await expect(frame.locator("#dynamic")).toHaveText("Dynamic works");
      assert.deepEqual(
        unexpected.filter((url) => url !== "/favicon.ico"),
        [],
      );
      console.log(
        name +
          ": CSS/images, classic JS, module cycles, distinct equal-byte/query/fragment identities and dynamic imports work with no asset requests",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
