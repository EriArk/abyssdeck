/** Convert only application-owned absolute typography at build time. Relative
 * sizes inherit once; canvas, terminal and third-party CSS retain their units. */
export function scaleStyles() {
  return {
    postcssPlugin: "workspace-personal-typography",
    Declaration(decl: { prop: string; value: string; source?: { input: { file?: string } } }) {
      const file = decl.source?.input.file?.replaceAll("\\", "/") ?? "";
      if (!file.includes("/apps/web/src/") || !["font-size", "font"].includes(decl.prop)) return;
      if (decl.value.includes("--user-text-scale")) return;
      decl.value = decl.value.replace(
        /(?<![\w.-])(\d+(?:\.\d+)?)px\b/g,
        (_, size) => `calc(${size}px * var(--user-text-scale, 1))`,
      );
    },
  };
}
