import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { FileActionKey } from "./FileActionKey";
import type { UploadProps } from "./ProjectFileUpload";

const Session = lazy(() =>
  import("./ProjectFileUpload").then((m) => ({ default: m.ProjectFileUploadSession })),
);
type Request = { key: string; copyKey: string; props: UploadProps };
const copies = new WeakMap<File, string>();
const counts = new Map<string, number>();
function identity(props: UploadProps) {
  let copy = props.initialBatchKey ?? "files";
  if (props.initialFile) {
    if (!copies.has(props.initialFile)) copies.set(props.initialFile, crypto.randomUUID());
    copy = copies.get(props.initialFile) ?? "";
  }
  return JSON.stringify([copy, props.folder]);
}

/** Launchers belong to windows; the transfer lifetime belongs to the authenticated page. */
export function ProjectFileUpload(props: UploadProps) {
  const key = JSON.stringify([props.projectId, props.checkout]);
  const copyKey = identity(props);
  const [count, setCount] = useState(counts.get(key) ?? 0);
  useEffect(() => {
    const sync = () => setCount(counts.get(key) ?? 0);
    sync();
    window.addEventListener("project-upload-count", sync);
    return () => window.removeEventListener("project-upload-count", sync);
  }, [key]);
  const current = useRef(props);
  current.current = props;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const sameSource = () =>
    mounted.current &&
    JSON.stringify([current.current.projectId, current.current.checkout]) === key &&
    identity(current.current) === copyKey;
  const open = () =>
    window.dispatchEvent(
      new CustomEvent<Request>("open-project-upload", {
        detail: {
          key,
          copyKey,
          props: {
            ...current.current,
            onDone: (path) => {
              if (sameSource()) current.current.onDone(path);
              if (props.initialFile)
                window.dispatchEvent(
                  new CustomEvent("close-project-upload", { detail: { key, copyKey } }),
                );
            },
            onBatchDone: () => {
              if (sameSource()) current.current.onBatchDone?.();
              window.dispatchEvent(
                new CustomEvent("close-project-upload", { detail: { key, copyKey } }),
              );
            },
            onDismiss: () => {
              if (sameSource()) current.current.onDismiss?.();
            },
          },
        },
      }),
    );
  // biome-ignore lint/correctness/useExhaustiveDependencies: A frozen copy is an explicit one-time request.
  useEffect(() => {
    if (props.initialFile || props.initialCopies?.length) open();
  }, [key, copyKey]);
  return (
    <FileActionKey
      compact={props.compact ?? false}
      icon="upload"
      label="Загрузить файлы"
      count={count}
      onClick={open}
    />
  );
}

export function ProjectFileUploadHost() {
  const [entries, setEntries] = useState<Record<string, Request>>({});
  const [shown, setShown] = useState("");
  const selection = useRef({ key: "", copyKey: "" });
  useEffect(() => {
    const open = (event: Event) => {
      const request = (event as CustomEvent<Request>).detail;
      setEntries((old) => ({
        ...old,
        [request.key]: request,
      }));
      setShown(request.key);
      selection.current = request;
    };
    const close = (event: Event) => {
      const request = (event as CustomEvent<Request>).detail;
      if (selection.current.key === request.key && selection.current.copyKey === request.copyKey)
        setShown("");
      // Completed copies no longer need their potentially large File objects.
      setEntries((old) => {
        const entry = old[request.key];
        if (!entry || entry.copyKey !== request.copyKey) return old;
        return {
          ...old,
          [request.key]: {
            ...entry,
            props: { ...entry.props, initialFile: undefined, initialCopies: undefined },
          },
        };
      });
    };
    const end = () => {
      setShown("");
      setEntries({});
      counts.clear();
    };
    window.addEventListener("open-project-upload", open);
    window.addEventListener("close-project-upload", close);
    window.addEventListener("private-session-ended", end);
    return () => {
      window.removeEventListener("open-project-upload", open);
      window.removeEventListener("close-project-upload", close);
      window.removeEventListener("private-session-ended", end);
    };
  }, []);
  return (
    <Suspense fallback={null}>
      {Object.values(entries).map((entry) => (
        <Session
          key={entry.key}
          {...entry.props}
          shown={shown === entry.key}
          copyKey={entry.copyKey}
          onCount={(count) => {
            counts.set(entry.key, count);
            window.dispatchEvent(new Event("project-upload-count"));
          }}
          onDismiss={() => {
            setShown((value) => (value === entry.key ? "" : value));
            entry.props.onDismiss?.();
          }}
        />
      ))}
    </Suspense>
  );
}
