import { useEffect, useState } from "react";
import { admitWorkspace, workspaceUrl } from "./accountStorage";
import { ApiError, api, configureApi, messageOf } from "./api";
import { DownloadLink, isDownloadUrl } from "./DownloadLink";
import { Login } from "./Login";
import type { Session } from "./types";

/** Compatibility for previously shared /download links. New saves never open this page. */
export function BrowserDownloadPage() {
  const [request] = useState(() => {
    const query = new URLSearchParams(location.search);
    let source: URL;
    try {
      source = new URL(query.get("source") || "/", location.origin);
    } catch {
      source = new URL("/", location.origin);
    }
    const scope = source.searchParams.getAll("workspace");
    source.searchParams.delete("workspace");
    const valid =
      source.origin === location.origin &&
      !source.hash &&
      !source.username &&
      !source.password &&
      scope.length <= 1 &&
      (!scope.length || /^[a-f0-9-]{36}$/.test(scope[0]!)) &&
      isDownloadUrl(source.pathname + source.search);
    if (scope.length) source.searchParams.set("workspace", scope[0]!);
    return {
      valid,
      source: source.pathname + source.search,
      unscopedSource:
        source.pathname +
        (() => {
          const params = new URLSearchParams(source.search);
          params.delete("workspace");
          return params.size ? "?" + params : "";
        })(),
      workspace: scope[0],
      name: query.get("name") || "Файл",
      location: location.pathname + location.search,
    };
  });
  const [session, setSession] = useState<Session | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [team, setTeam] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry and completed login explicitly recheck this source.
  useEffect(() => {
    if (!request.valid) return;
    const controller = new AbortController();
    setError("");
    setReady(false);
    void (async () => {
      const status = await api<{ team?: boolean }>("/auth/status", { signal: controller.signal });
      setTeam(!!status.team);
      let current: Session;
      try {
        current = await api<Session>("/auth/session", { signal: controller.signal });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setLoginRequired(true);
          return;
        }
        throw e;
      }
      if (!admitWorkspace(current)) return;
      // A copied link cannot silently switch the acting account/workspace.
      if (
        request.workspace &&
        new URL(workspaceUrl(request.unscopedSource), location.origin).searchParams.get(
          "workspace",
        ) !== request.workspace
      )
        throw Error("Открой файл из его исходного рабочего пространства.");
      setSession(current);
      setLoginRequired(false);
      configureApi(current.csrf, () => setLoginRequired(true));
      // Read headers only. Never buffer the file, even when it is several gigabytes.
      const response = await fetch(request.source, {
        method: "HEAD",
        credentials: "same-origin",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 401) {
        setLoginRequired(true);
        return;
      }
      if (!response.ok)
        throw Error(
          response.status === 403 || response.status === 404
            ? "Файл недоступен этому аккаунту или удалён."
            : "Не удалось подготовить скачивание. Повтори попытку.",
        );
      setReady(true);
    })().catch((e) => {
      if (!controller.signal.aborted) setError(messageOf(e));
    });
    return () => controller.abort();
  }, [request, revision]);
  if (loginRequired)
    return (
      <Login
        requiresSetup={false}
        team={team}
        onLogin={(value) => {
          // Login normally removes URL parameters. Retain this exact source through authentication.
          history.replaceState(null, "", request.location);
          if (!admitWorkspace(value)) return;
          setSession(value);
          setLoginRequired(false);
          setRevision((v) => v + 1);
        }}
      />
    );
  return (
    <main className="login-page">
      <section className="login-card browser-download-page">
        <a className="secondary" href="/">
          Вернуться в AbyssDeck
        </a>
        <h1>Скачать файл</h1>
        <p className="browser-download-name">{request.name}</p>
        {!request.valid ? (
          <p role="alert">Ссылка на файл недоступна.</p>
        ) : error ? (
          <>
            <p role="alert">{error}</p>
            <button type="button" onClick={() => setRevision((v) => v + 1)}>
              Повторить
            </button>
          </>
        ) : !ready || !session ? (
          <p role="status">Проверяю доступ к файлу…</p>
        ) : (
          <DownloadLink
            href={request.unscopedSource}
            name={request.name}
            directDownload
            initiallyOpen
          >
            Сохранить файл
          </DownloadLink>
        )}
      </section>
    </main>
  );
}
