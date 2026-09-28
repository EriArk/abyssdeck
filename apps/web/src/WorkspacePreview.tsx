import { useEffect, useRef, useState } from "react";
import { AutoTextarea } from "./AutoTextarea";
import { workspaceMediaUrl } from "./accountStorage";
import { api, messageOf } from "./api";
import "./workspace-preview.css";

type View = { id: string; width: number; height: number };
export function WorkspacePreview({ projectId }: { projectId: string }) {
  const base = `/projects/${encodeURIComponent(projectId)}/workspace-preview`;
  const [port, setPort] = useState("3000"),
    [size, setSize] = useState(() => (window.innerWidth < 600 ? "390" : "1024")),
    [view, setView] = useState<View>();
  const [frame, setFrame] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const alive = useRef(true),
    submitting = useRef(false),
    gesture = useRef<{ x: number; y: number } | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!view) return;
    let live = true,
      reading = false,
      failed = false,
      url = "";
    const abort = new AbortController();
    const read = async () => {
      if (reading || failed || document.hidden) return;
      reading = true;
      try {
        const response = await fetch(workspaceMediaUrl(`/api${base}/${view.id}/frame`)!, {
          signal: abort.signal,
          cache: "no-store",
        });
        if (!response.ok)
          throw Error(
            "Связь с просмотром прервалась. Закрой просмотр и открой снова; действие не повторялось.",
          );
        const blob = await response.blob();
        if (!live) return;
        const next = URL.createObjectURL(blob);
        setFrame(next);
        if (url) URL.revokeObjectURL(url);
        url = next;
      } catch (e) {
        if (live) {
          failed = true;
          setError(messageOf(e));
        }
      } finally {
        reading = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 1000);
    return () => {
      live = false;
      abort.abort();
      clearInterval(timer);
      if (url) URL.revokeObjectURL(url);
      void api(`${base}/${view.id}`, { method: "DELETE" }).catch(() => {});
    };
  }, [base, view]);
  const run = async (action: () => Promise<void>) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (alive.current) setError(messageOf(e));
    } finally {
      submitting.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const send = (value: object) =>
    view
      ? api(`${base}/${view.id}/input`, { method: "POST", body: value })
      : Promise.reject(Error("Просмотр закрыт"));
  const start = () =>
    run(async () => {
      const result = await api<View>(base, {
        method: "POST",
        body: { port: Number(port), width: Number(size), height: 720 },
      });
      if (alive.current) setView(result);
      else void api(`${base}/${result.id}`, { method: "DELETE" }).catch(() => {});
    });
  return (
    <section className="workspace-preview">
      {!view ? (
        <>
          <p>
            Запусти приложение в терминале своего окружения, затем укажи его HTTP-порт. Просмотр
            открывается внутри того же окружения.
          </p>
          <div className="workspace-preview-controls">
            <label>
              Порт
              <input
                inputMode="numeric"
                type="number"
                min="1024"
                max="65535"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </label>
            <label>
              Экран
              <select value={size} onChange={(e) => setSize(e.target.value)}>
                <option value="390">Телефон</option>
                <option value="1024">Планшет</option>
                <option value="1440">Компьютер</option>
              </select>
            </label>
          </div>
          <button type="button" className="secondary" disabled={busy} onClick={() => void start()}>
            {busy ? "Открываем…" : "Открыть приложение"}
          </button>
        </>
      ) : (
        <>
          <div className="workspace-preview-controls">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await send({ op: "reload" });
                })
              }
            >
              Обновить
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setView(undefined);
                setFrame("");
              }}
            >
              Закрыть просмотр
            </button>
          </div>
          <div className="workspace-preview-screen">
            {frame ? (
              <img
                src={frame}
                alt="Приложение в личном окружении. Нажми для управления; проведи вверх или вниз для прокрутки."
                draggable={false}
                role="application"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: Remote application surface accepts keyboard input.
                tabIndex={0}
                onPointerDown={(e) => {
                  gesture.current = { x: e.clientX, y: e.clientY };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerCancel={() => {
                  gesture.current = undefined;
                }}
                onPointerUp={(e) => {
                  const from = gesture.current;
                  gesture.current = undefined;
                  if (!from || busy) return;
                  const box = e.currentTarget.getBoundingClientRect(),
                    scale = view.width / box.width;
                  const delta = Math.round((from.y - e.clientY) * scale);
                  const value =
                    Math.abs(delta) > 12
                      ? { op: "scroll", delta: Math.max(-1200, Math.min(1200, delta)) }
                      : {
                          op: "click",
                          x: Math.max(
                            0,
                            Math.min(view.width - 1, Math.round((e.clientX - box.left) * scale)),
                          ),
                          y: Math.max(
                            0,
                            Math.min(view.height - 1, Math.round((e.clientY - box.top) * scale)),
                          ),
                        };
                  void run(async () => {
                    await send(value);
                  });
                }}
                onKeyDown={(e) => {
                  if (
                    [
                      "Enter",
                      "Tab",
                      "Backspace",
                      "Escape",
                      "ArrowUp",
                      "ArrowDown",
                      "ArrowLeft",
                      "ArrowRight",
                    ].includes(e.key)
                  ) {
                    e.preventDefault();
                    void run(async () => {
                      await send({ op: "key", key: e.key });
                    });
                  }
                }}
              />
            ) : (
              <p role="status">Загружаем изображение…</p>
            )}
          </div>
          <div className="workspace-preview-controls">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await send({ op: "scroll", delta: -480 });
                })
              }
            >
              Прокрутить вверх
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await send({ op: "scroll", delta: 480 });
                })
              }
            >
              Прокрутить вниз
            </button>
          </div>
          <details>
            <summary>Ввод текста и клавиши</summary>
            <AutoTextarea
              aria-label="Текст для приложения"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="button"
              className="secondary"
              disabled={busy || !text}
              onClick={() =>
                void run(async () => {
                  await send({ op: "text", text });
                  if (alive.current) setText((current) => (current === text ? "" : current));
                })
              }
            >
              Вставить в выбранное поле
            </button>
            <div className="workspace-preview-controls">
              {["Enter", "Tab", "Backspace", "Escape"].map((key) => (
                <button
                  type="button"
                  className="secondary"
                  key={key}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await send({ op: "key", key });
                    })
                  }
                >
                  {key}
                </button>
              ))}
            </div>
          </details>
          <p className="muted">
            Закрытие просмотра не останавливает приложение. Несохранённые поля открытой страницы
            существуют только в этом просмотре.
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
