import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { AutoTextarea } from "./AutoTextarea";
import { workspaceSocket } from "./accountStorage.ts";
import { ApiError, api } from "./api";
import { Icon } from "./icons";
import "@xterm/xterm/css/xterm.css";

export function DeviceTerminal({ id, onExit }: { id: string; onExit: () => void }) {
  const host = useRef<HTMLElement>(null),
    termRef = useRef<Terminal | null>(null),
    socketRef = useRef<WebSocket | null>(null),
    exitRef = useRef(onExit);
  exitRef.current = onExit;
  const [status, setStatus] = useState("Подключаемся…"),
    [failed, setFailed] = useState(false),
    [connected, setConnected] = useState(false);
  const [readingHistory, setReadingHistory] = useState(false);
  const retryRef = useRef(() => {});
  const secretRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLTextAreaElement>(null);
  const pasteRequest = useRef(0);
  const [pasting, setPasting] = useState(false);
  const [pasteHint, setPasteHint] = useState("");
  const [entry, setEntry] = useState<"command" | "password" | null>(null);
  const [command, setCommand] = useState("");
  useEffect(() => {
    pasteRequest.current++;
    setPasting(false);
    setPasteHint("");
    return () => {
      pasteRequest.current++;
    };
  }, [entry, id, connected]);
  useEffect(() => {
    const clear = () => {
      pasteRequest.current++;
      setPasting(false);
      if (secretRef.current) secretRef.current.value = "";
    };
    document.addEventListener("visibilitychange", clear);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);
  useEffect(() => {
    if (!connected) {
      if (secretRef.current) secretRef.current.value = "";
      setEntry(null);
    }
  }, [connected]);
  useEffect(() => {
    if (!host.current) return;
    let stopped = false,
      socket: WebSocket | undefined,
      ready = false,
      ended = false,
      connecting = false,
      attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined,
      deadline: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
      scrollback: 2000,
      allowProposedApi: false,
      convertEol: false,
      screenReaderMode: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    termRef.current = term;
    const screen = host.current;
    const reading = () => setReadingHistory(term.buffer.active.viewportY < term.buffer.active.baseY);
    const scroll = term.onScroll(reading);
    const parsed = term.onWriteParsed(reading);
    let gesture: { id: number; x: number; y: number; line: number; height: number; moved: boolean } | undefined;
    const touchStart = (event: TouchEvent) => {
      gesture = undefined;
      if (event.touches.length !== 1 || (event.target as Element).closest(".scrollbar")) return;
      const point = event.touches[0];
      const height = screen.querySelector(".xterm-screen")?.getBoundingClientRect().height ?? 0;
      if (!point || !height) return;
      gesture = { id: point.identifier, x: point.clientX, y: point.clientY,
        line: term.buffer.active.viewportY, height: height / term.rows, moved: false };
    };
    const touchMove = (event: TouchEvent) => {
      if (!gesture || event.touches.length !== 1) { gesture = undefined; return; }
      const point = event.touches[0];
      if (!point || point.identifier !== gesture.id) return;
      const dy = gesture.y - point.clientY;
      if (!gesture.moved && (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(gesture.x - point.clientX))) return;
      gesture.moved = true;
      // xterm 6's custom scrollbar handles the rail, but does not provide touch
      // panning across the output. Scroll only the local buffer, never emit keys.
      event.preventDefault();
      event.stopImmediatePropagation();
      term.scrollToLine(Math.max(0, Math.round(gesture.line + dy / gesture.height)));
    };
    const touchEnd = (event: TouchEvent) => {
      if (gesture?.moved) { event.preventDefault(); event.stopImmediatePropagation(); }
      gesture = undefined;
    };
    screen.addEventListener("touchstart", touchStart, { capture: true, passive: true });
    screen.addEventListener("touchmove", touchMove, { capture: true, passive: false });
    screen.addEventListener("touchend", touchEnd, { capture: true, passive: false });
    screen.addEventListener("touchcancel", touchEnd, { capture: true, passive: false });
    // Never let remote OSC sequences write the device clipboard.
    const clipboard = term.parser.registerOscHandler(52, () => true);
    const theme = () => {
      const css = getComputedStyle(document.documentElement);
      term.options.theme = {
        background: css.getPropertyValue("--paper").trim() || "#11151b",
        foreground: css.getPropertyValue("--ink").trim() || "#dce4ed",
        cursor: css.getPropertyValue("--accent").trim() || "#bed1ec",
        selectionBackground: "#71869e66",
      };
    };
    theme();
    const themes = new MutationObserver(theme);
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const resize = () => {
      if (!host.current?.clientWidth || !host.current?.clientHeight) return;
      fit.fit();
      if (socket?.readyState === 1)
        socket.send(
          JSON.stringify({
            type: "resize",
            cols: Math.min(300, Math.max(2, term.cols)),
            rows: Math.min(150, Math.max(2, term.rows)),
          }),
        );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    resize();
    const data = term.onData((value) => {
      if (!ready || socket?.readyState !== 1) return;
      for (let i = 0; i < value.length; i += 1024)
        socket.send(JSON.stringify({ type: "input", data: value.slice(i, i + 1024) }));
    });
    const cancelTimers = () => {
      clearTimeout(timer);
      clearTimeout(deadline);
    };
    const fail = (message: string, permanent = false) => {
      if (stopped || ended) return;
      connecting = false;
      ready = false;
      setConnected(false);
      clearTimeout(deadline);
      if (!permanent && attempts < 3) {
        setStatus("Соединение…");
        setFailed(false);
        clearTimeout(timer);
        timer = setTimeout(() => void connect(), 800 * 2 ** attempts++);
      } else {
        setStatus(message);
        setFailed(true);
      }
    };
    const connect = async () => {
      if (stopped || ended || connecting || document.hidden) return;
      connecting = true;
      ready = false;
      setConnected(false);
      setFailed(false);
      setStatus("Соединение…");
      const previous = socket;
      socket = undefined;
      socketRef.current = null;
      previous?.close();
      try {
        const { ticket } = await api<{ ticket: string }>(`/device-terminals/${id}/ticket`, {
          method: "POST",
          signal: abort.signal,
          timeoutMs: 15000,
        });
        if (stopped) return;
        const url = new URL(`/api/device-terminals/${id}/socket`, location.href);
        url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const current = workspaceSocket(url);
        socket = current;
        socketRef.current = current;
        deadline = setTimeout(() => {
          if (!ready) current.close();
        }, 12000);
        current.onopen = () => current.send(JSON.stringify({ ticket }));
        current.onmessage = (e) => {
          if (stopped || socket !== current) return;
          const msg = JSON.parse(e.data);
          if (msg.type === "ready") {
            connecting = false;
            clearTimeout(deadline);
            ready = msg.state === "open";
            ended = !ready;
            setConnected(ready);
            setFailed(false);
            setStatus(ready ? "Подключено" : "Сессия завершена");
            // Every attach replays the server's bounded screen. Replace it, never append twice.
            term.write("", () => term.reset());
            resize();
            timer = setTimeout(() => {
              attempts = 0;
            }, 10000);
          }
          if (msg.type === "output" && typeof msg.data === "string")
            term.write(msg.data, () => {
              if (!stopped && socket === current && current.readyState === 1)
                current.send(JSON.stringify({ type: "ack", length: msg.data.length }));
            });
          if (msg.type === "exit") {
            ended = true;
            ready = false;
            cancelTimers();
            setConnected(false);
            setFailed(false);
            setStatus(
              msg.exitCode === null ? "Сессия завершена" : `Завершено · код ${msg.exitCode}`,
            );
            exitRef.current();
          }
        };
        current.onclose = (e) => {
          if (socket === current && !stopped && !ended) {
            clearTimeout(timer);
            fail("Не удалось восстановить связь с терминалом.", e.code === 1008);
          }
        };
        current.onerror = () => current.close();
      } catch (e) {
        if (stopped) return;
        const permanent = e instanceof ApiError && [401, 403, 404, 410].includes(e.status);
        if (e instanceof ApiError && e.status === 410) {
          ended = true;
          setStatus(e.message);
          setConnected(false);
          setFailed(false);
        } else fail(e instanceof Error ? e.message : "Нет связи с терминалом", permanent);
      }
    };
    retryRef.current = () => {
      attempts = 0;
      cancelTimers();
      void connect();
    };
    const wake = () => {
      if (!document.hidden && !ready && !connecting && !ended) retryRef.current();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    void connect();
    return () => {
      stopped = true;
      cancelTimers();
      retryRef.current = () => {};
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      abort.abort();
      socket?.close();
      socketRef.current = null;
      data.dispose();
      clipboard.dispose();
      observer.disconnect();
      themes.disconnect();
      scroll.dispose();
      parsed.dispose();
      screen.removeEventListener("touchstart", touchStart, true);
      screen.removeEventListener("touchmove", touchMove, true);
      screen.removeEventListener("touchend", touchEnd, true);
      screen.removeEventListener("touchcancel", touchEnd, true);
      term.dispose();
      termRef.current = null;
    };
  }, [id]);
  const input = (data: string) => {
    if (connected && socketRef.current?.readyState === 1)
      for (let i = 0; i < data.length; i += 1024)
        socketRef.current.send(JSON.stringify({ type: "input", data: data.slice(i, i + 1024) }));
    termRef.current?.focus();
  };
  const paste = async () => {
    const field = entry === "password" ? secretRef.current : commandRef.current;
    if (!field) return;
    const request = ++pasteRequest.current;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    setPasting(true);
    setPasteHint("");
    try {
      const text = await navigator.clipboard.readText();
      if (request !== pasteRequest.current || !field.isConnected || document.hidden) return;
      // Only edit the local field. Even multiline clipboard text never reaches the PTY here.
      const value =
        entry === "password"
          ? text
              .replace(/[\r\n]/g, "")
              .slice(0, Math.max(0, 4096 - field.value.length + end - start))
          : text.replace(/\r\n?/g, "\n");
      field.setRangeText(value, start, end, "end");
      if (entry === "command") setCommand(field.value);
      field.focus({ preventScroll: true });
    } catch {
      if (request !== pasteRequest.current || !field.isConnected || document.hidden) return;
      setPasteHint("Зажми поле и выбери «Вставить» в меню устройства.");
      field.focus({ preventScroll: true });
    } finally {
      if (request === pasteRequest.current) setPasting(false);
    }
  };
  return (
    <div className="device-terminal">
      <div className="device-terminal-status">
        <span className={connected ? "online" : ""}>{status}</span>
        {readingHistory && (
          <button type="button" className="icon-button" aria-label="К последнему выводу"
            title="К последнему выводу" onClick={() => termRef.current?.scrollToBottom()}>
            <Icon name="arrow-down" size={17} />
          </button>
        )}
        {failed && (
          <button
            type="button"
            className="icon-button"
            title="Подключиться снова"
            aria-label="Подключиться снова"
            onClick={() => retryRef.current()}
          >
            <Icon name="refresh" size={17} />
          </button>
        )}
      </div>
      <section className="device-terminal-screen" ref={host} aria-label="Терминал устройства" />
      {entry && (
        <form
          className="device-terminal-entry"
          onInput={() => {
            pasteRequest.current++;
            setPasting(false);
            setPasteHint("");
          }}
          onSubmit={(event) => {
            event.preventDefault();
            pasteRequest.current++;
            if (!connected || socketRef.current?.readyState !== 1) return;
            const value = entry === "password" ? (secretRef.current?.value ?? "") : command;
            if (secretRef.current) secretRef.current.value = "";
            setCommand("");
            setEntry(null);
            input(value.replace(/\r\n|\n/g, "\r") + "\r");
          }}
        >
          {entry === "password" ? (
            <label>
              Пароль для текущего запроса терминала
              <input
                ref={secretRef}
                type="password"
                name="terminal-secret"
                aria-label="Пароль терминала"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={4096}
              />
            </label>
          ) : (
            <AutoTextarea
              ref={commandRef}
              aria-label="Команда терминала"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
          {pasteHint && (
            <p className="device-muted" role="status">
              {pasteHint}
            </p>
          )}
          <div>
            <button
              type="button"
              className="secondary"
              disabled={pasting}
              onClick={() => void paste()}
            >
              Вставить
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                pasteRequest.current++;
                if (secretRef.current) secretRef.current.value = "";
                setEntry(null);
              }}
            >
              Отмена
            </button>
            <button type="submit" className="primary" disabled={!connected}>
              Ввести
            </button>
          </div>
        </form>
      )}
      <div className="device-terminal-keys" role="toolbar" aria-label="Клавиши терминала">
        <button
          type="button"
          disabled={!connected}
          onClick={() => {
            if (secretRef.current) secretRef.current.value = "";
            setEntry(entry === "command" ? null : "command");
          }}
          aria-label="Ввести команду"
        >
          Ввод
        </button>
        <button
          type="button"
          disabled={!connected}
          onClick={() => {
            if (secretRef.current) secretRef.current.value = "";
            setEntry(entry === "password" ? null : "password");
          }}
          aria-label="Ввести пароль"
        >
          <Icon name="lock" />
        </button>
        <button
          type="button"
          onClick={() => termRef.current?.focus()}
          aria-label="Открыть клавиатуру"
        >
          <Icon name="keyboard" />
        </button>
        {[
          ["Enter", "\r"],
          ["Esc", "\u001b"],
          ["Tab", "\t"],
          ["Ctrl C", "\u0003"],
          ["↑", "\u001b[A"],
          ["↓", "\u001b[B"],
          ["←", "\u001b[D"],
          ["→", "\u001b[C"],
        ].map(([label, key]) => (
          <button type="button" key={label} disabled={!connected} onClick={() => input(key ?? "")}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
