/** Strict supported GitHub source URLs; never resolve by number outside the exact repo. */
export function parseGitHubReference(raw: string) {
  if (raw.length > 1000) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search
  )
    return null;
  const match =
    /^\/([\w.-]+)\/([\w.-]+)\/(issues|pull|commit)\/([1-9]\d{0,9}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})\/?$/.exec(
      url.pathname,
    );
  if (!match || [match[1], match[2]].some((v) => v === "." || v === "..")) return null;
  const kind = match[3] === "commit" ? "commit" : match[3] === "pull" ? "pr" : "issue";
  const id = match[4]!.toLowerCase();
  if (kind === "commit" ? !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(id) : !/^[1-9]\d{0,9}$/.test(id))
    return null;
  const repository = match[1] + "/" + match[2];
  return {
    repository,
    kind,
    key: kind + ":" + id,
    url: `https://github.com/${repository}/${match[3]}/${id}`,
    number: kind === "commit" ? undefined : Number(id),
  } as const;
}
