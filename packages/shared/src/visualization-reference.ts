/** Public assistant output protocol. The path is a reference, never browser read authority. */
export function visualizationReferences(text: string) {
  const references: { start: number; end: number; path: string; wide: boolean }[] = [];
  let offset = 0;
  let fence: { character: string; length: number } | undefined;
  for (const line of text.split(/(?<=\n)/)) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (delimiter) {
      const token = delimiter[1]!;
      if (!fence) fence = { character: token[0]!, length: token.length };
      else if (token[0] === fence.character && token.length >= fence.length) fence = undefined;
    } else if (!fence) {
      const match = /^[ \t]*\uE200visualize\uE202([^\r\n]+)\uE201[ \t]*\r?\n?$/.exec(line);
      if (match && match[1]!.length <= 8192) {
        try {
          const value = JSON.parse(match[1]!);
          if (
            typeof value?.path === "string" &&
            value.path.length <= 2048 &&
            !/[<>]/.test(value.path) &&
            !Array.from(value.path as string).some((character) => character.charCodeAt(0) < 32) &&
            /\.html?$/i.test(value.path) &&
            /^(?:\/(?!\/)|[a-z]:[\\/])/i.test(value.path) &&
            (value.mode === undefined || value.mode === "wide")
          ) {
            references.push({
              start: offset,
              end: offset + line.trimEnd().length,
              path: value.path,
              wide: value.mode === "wide",
            });
          }
        } catch {
          /* Incomplete or ordinary quoted text stays text. */
        }
      }
    }
    offset += line.length;
  }
  return references;
}
