import { type FileLaunchPrepared, runnableFile } from "@codex-web/shared";
import { lazy, Suspense, useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { Icon } from "./icons";

const Panel = lazy(() => import("./FileLaunchPanel"));

/** Inspection prepares an exact capability, but never launches. All entry points use this control. */
export function FileLaunch({ name, source }: { name: string; source?: string }) {
  const [prepared, setPrepared] = useState<FileLaunchPrepared>(),
    [open, setOpen] = useState(false);
  const [failure, setFailure] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  const candidate =
    runnableFile(name) && !!source && /^\/api\/(artifacts\/|projects\/)/.test(source);
  useEffect(() => {
    let active = true;
    setPrepared(undefined);
    setFailure(false);
    setUnavailable(false);
    setOpen(false);
    if (candidate)
      void api<FileLaunchPrepared>("/file-launches/prepare", { method: "POST", body: { source } })
        .then((v) => {
          if (active) setPrepared(v);
        })
        .catch((e) => {
          if (active) {
            setFailure(true);
            setUnavailable(
              e instanceof ApiError && ["LAUNCH_PATH", "LAUNCH_FORMAT"].includes(e.code),
            );
          }
        });
    return () => {
      active = false;
    };
  }, [candidate, source]);
  if (!candidate || unavailable) return null;
  return (
    <>
      <button
        type="button"
        className="secondary"
        disabled={!prepared && !failure}
        onClick={() => setOpen(true)}
      >
        <Icon name="play" size={17} />
        Запустить и показать
      </button>
      {open && (
        <Suspense fallback={<span role="status">Открываем запуск…</span>}>
          <Panel source={source!} name={name} initial={prepared} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
