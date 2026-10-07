import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");
// Reuse actual material definitions and icons; this does not build or modify the app.
const themes = await Promise.all(
  ["themes.css", "materials.css", "polymer.css", "theme-variants.css"].map((name) =>
    read(`apps/web/src/${name}`),
  ),
);
const iconSource = await read("apps/web/src/icons.tsx");
const object = iconSource.slice(iconSource.indexOf("= {") + 2, iconSource.indexOf("\n};") + 2);
const paths = vm.runInNewContext(`(${object})`, Object.create(null), { timeout: 1000 });
let html = await read("demo/index.template.html");
for (const [marker, content] of [
  ["THEME_CSS", themes.join("\n")],
  ["DEMO_CSS", await read("demo/demo.css")],
  ["ICON_DATA", `const ICONS = ${JSON.stringify(paths)};`],
  ["CATALOG_JS", await read("demo/catalog.js")],
  ["DEMO_JS", await read("demo/demo.js")],
])
  html = html.replace(`/* ${marker} */`, () => content);
await writeFile(resolve(root, "demo/abyssdeck-demo.html"), html);
console.log(
  `Built demo/abyssdeck-demo.html (${Math.round(Buffer.byteLength(html) / 1024)} KiB), no external assets.`,
);
