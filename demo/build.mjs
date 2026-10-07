import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { demoNotices } from "./licenses.mjs";
const root = resolve(import.meta.dirname, "..");
function replaceBoundary(code, before, after, id) {
  if (!code.includes(before))
    throw new Error(
      `Demo isolation boundary changed: ${id}. Review before building.`,
    );
  return code.replace(before, after);
}
const require = createRequire(resolve(root, "apps/web/package.json"));
const { build, createServer } = await import(
  pathToFileURL(require.resolve("vite"))
);
const { default: react } = await import(
  pathToFileURL(require.resolve("@vitejs/plugin-react"))
);
const { scaleStyles } = await import(
  pathToFileURL(resolve(root, "apps/web/scaleStyles.ts"))
);
const config = {
  configFile: false,
  root: resolve(root, "demo"),
  base: "./",
  publicDir: false,
  plugins: [
    react(),
    demoNotices(root),
    {
      name: "public-demo-isolation",
      enforce: "pre",
      resolveId(source, importer) {
        if (
          source === "./helpContent" &&
          importer?.replaceAll("\\", "/").includes("/apps/web/src/")
        )
          return resolve(root, "demo/app/help.ts");
      },
      async transform(code, id) {
        if (
          id
            .replaceAll("\\", "/")
            .endsWith("/apps/web/src/githubDraftStorage.ts")
        )
          return await readFile(resolve(root, "demo/app/drafts.ts"), "utf8");
        if (
          id.replaceAll("\\", "/").endsWith("/apps/web/src/accountStorage.ts")
        )
          return replaceBoundary(
            code,
            "return input ? workspaceUrl(input) : input;",
            "return input ? (window as any).__demo.mediaUrl(workspaceUrl(input)) : input;",
            id,
          );
        if (id.replaceAll("\\", "/").endsWith("/apps/web/src/main.tsx")) {
          const marker = code.indexOf('if ("serviceWorker" in navigator)');
          if (marker < 0)
            throw new Error(
              "Review the demo service-worker boundary before building.",
            );
          return code.slice(0, marker);
        }
        if (
          id.replaceAll("\\", "/").endsWith("/apps/web/src/DxfFilePreview.tsx")
        )
          return replaceBoundary(
            code,
            'new URL("/fonts/DejaVuSans.ttf", location.href).href',
            'new URL("./fonts/DejaVuSans.ttf", document.baseURI).href',
            id,
          );
        if (
          id
            .replaceAll("\\", "/")
            .endsWith("/apps/web/src/technicalDxf.worker.ts")
        )
          return replaceBoundary(
            code,
            'new URL("/fonts/DejaVuSans.ttf", self.location.href).href',
            'new URL("../fonts/DejaVuSans.ttf", self.location.href).href',
            id,
          );
        if (id.endsWith("fonts.css")) {
          for (const match of [...code.matchAll(/url\((\/fonts\/[^)]+)\)/g)]) {
            const bytes = await readFile(
              resolve(root, "apps/web/public" + match[1]),
            );
            code = code.replace(
              match[0],
              `url(data:font/woff2;base64,${bytes.toString("base64")})`,
            );
          }
          return code;
        }
      },
    },
  ],
  css: { postcss: { plugins: [scaleStyles()] } },
  build: {
    outDir: "site",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
  },
};
if (process.argv.includes("--serve")) {
  const server = await createServer({
    ...config,
    server: { host: "127.0.0.1", port: 19998 },
  });
  await server.listen();
  console.log("Demo source server: http://127.0.0.1:19998");
} else {
  await build(config);
  await cp(
    resolve(root, "apps/web/public/icon.svg"),
    resolve(root, "demo/site/icon.svg"),
  );
  await cp(resolve(root, "LICENSE"), resolve(root, "demo/site/LICENSE.txt"));
  await mkdir(resolve(root, "demo/site/fonts"), { recursive: true });
  await cp(
    resolve(root, "apps/web/public/fonts/DejaVuSans.ttf"),
    resolve(root, "demo/site/fonts/DejaVuSans.ttf"),
  );
  console.log("Built the real AbyssDeck UI with browser-only demo data.");
}
