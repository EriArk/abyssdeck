import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

/** Retain notices for packages actually included by Rollup, plus embedded fonts. */
export function demoNotices(root) {
  return {
    name: "demo-third-party-notices",
    async generateBundle(_options, bundle) {
      const packages = new Map();
      for (const item of Object.values(bundle))
        if (item.type === "chunk")
          for (const id of Object.keys(item.modules)) {
            const path = id.replaceAll("\\", "/").split("?")[0],
              mark = path.lastIndexOf("/node_modules/");
            if (mark < 0) continue;
            const name = path
              .slice(mark + 14)
              .split("/")
              .slice(0, path[mark + 14] === "@" ? 2 : 1)
              .join("/");
            const directory = path.slice(0, mark + 14) + name;
            packages.set(directory, name);
          }
      const entries = [];
      for (const [directory] of packages) {
        const info = JSON.parse(
          await readFile(resolve(directory, "package.json"), "utf8"),
        );
        const notices = (await readdir(directory)).filter((n) =>
          /^(licen[cs]e|notice|copying|copyright)([.-]|$)/i.test(n),
        );
        let text = `${info.name} ${info.version}\nLicense: ${typeof info.license === "string" ? info.license : JSON.stringify(info.license)}\n`;
        const repository =
          typeof info.repository === "string"
            ? info.repository
            : info.repository?.url;
        if (repository) text += `Source: ${repository}\n`;
        for (const notice of notices) {
          try {
            text += `\n${notice}\n${await readFile(resolve(directory, notice), "utf8")}\n`;
          } catch {}
        }
        if (!notices.length && info.name === "@nodable/entities") {
          text += await readFile(
            resolve(root, "demo/app/nodable-entities-LICENSE.txt"),
            "utf8",
          );
        } else if (!notices.length)
          text +=
            "\nThis package did not include a top-level license text. See its exact-version source and package metadata.\n";
        entries.push(text);
      }
      for (const path of [
        "apps/web/public/fonts/OFL.txt",
        "apps/web/public/fonts/IBM-Plex-Mono-OFL.txt",
        "apps/web/public/fonts/DejaVuSans-LICENSE.txt",
        "docs/licenses/DXF-Viewer-MIT.txt",
        "docs/licenses/occt-import-js-LICENSE.md",
      ]) {
        entries.push(`${path}\n${await readFile(resolve(root, path), "utf8")}`);
      }
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_NOTICES.txt",
        source:
          "AbyssDeck website demo\nApplication source: https://github.com/EriArk/abyssdeck\nAbyssDeck: AGPL-3.0-only (see LICENSE.txt). Third-party code retains its own licenses.\n\n" +
          entries
            .sort()
            .join(
              "\n\n============================================================\n\n",
            ),
      });
    },
  };
}
