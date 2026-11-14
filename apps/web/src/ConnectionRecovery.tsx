import { useEffect, useRef, useState } from "react";
import { messageOf } from "./api";
import { Icon } from "./icons";
export type RecoveryOutcome = { ok: boolean; message: string };
export function ConnectionRecovery({
  needed,
  error,
  connection,
  disabled,
  onRecover,
}: {
  needed: boolean;
  error: string;
  connection: string;
  disabled: boolean;
  onRecover: () => Promise<RecoveryOutcome>;
}) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const locked = useRef(false),
    attempted = useRef(false),
    mounted = useRef(true);
  const problem = needed || !!error;
  const current = useRef({ problem, generation: 0 });
  if (current.current.problem && !problem) current.current.generation++;
  current.current.problem = problem;
  const connectionLost = useRef(false);
  const recoverRef = useRef(onRecover);
  recoverRef.current = onRecover;
  const recover = async () => {
    if (disabled || locked.current || !current.current.problem || document.hidden) return;
    const generation = current.current.generation;
    locked.current = true;
    attempted.current = true;
    setPending(true);
    try {
      const result = await recoverRef.current();
      if (mounted.current && current.current.problem && current.current.generation === generation)
        setFailure(result.ok ? "" : result.message);
    } catch (e) {
      if (mounted.current && current.current.problem && current.current.generation === generation)
        setFailure(messageOf(e));
    } finally {
      locked.current = false;
      if (mounted.current) setPending(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current.generation++;
    };
  }, []);
  // One quiet attempt per outage; normal rendering must not create a retry loop.
  useEffect(() => {
    if (!problem) {
      attempted.current = false;
      setFailure("");
      return;
    }
    if (!disabled && !attempted.current) void recover();
  });
  // A new event stream proves Hub connectivity, not native availability. Check
  // the native status once instead of clearing the error or replaying a send.
  useEffect(() => {
    if (connection === "reconnecting" || connection === "offline") connectionLost.current = true;
    if (connection === "connected" && connectionLost.current) {
      connectionLost.current = false;
      void recover();
    }
  });
  // iOS can return from suspension without firing an online event.
  useEffect(() => {
    const wake = () => void recover();
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  });
  if (!problem || !failure) return null;
  return (
    <div className="connection-recovery">
      <div className="notice" role="alert">
        <span>{failure}</span>
      </div>
      <button
        type="button"
        className="secondary recovery-button"
        disabled={disabled || pending}
        onClick={() => void recover()}
      >
        <Icon name="refresh" />
        {pending ? "Подключаемся…" : "Повторить подключение"}
      </button>
    </div>
  );
}
