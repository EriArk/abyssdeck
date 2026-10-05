export interface ClipboardClient {
  sendKeyEvent: (pressed: number, code: number) => void;
}

/** Same Unicode keysyms as Guacamole.Keyboard. Legacy VNC clipboard encodings
 * cannot reliably carry Unicode, so paste uses the existing authenticated input
 * channel. Bounded batches keep cancellation and the tunnel responsive. */
export function pasteRemoteText(client: ClipboardClient, text: string, signal: AbortSignal) {
  if (!text) return Promise.resolve();
  if (new TextEncoder().encode(text).length > 1024 * 1024)
    return Promise.reject(new Error("Текст больше 1 МБ."));
  // biome-ignore lint/suspicious/noControlCharactersInRegex: reject control input rather than sending it as desktop commands.
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))
    return Promise.reject(new Error("Текст содержит непечатаемые управляющие символы."));
  if (signal.aborted) return Promise.reject(new Error("Вставка отменена."));
  const characters = Array.from(text.replace(/\r\n?/g, "\n"));
  return new Promise<void>((resolve, reject) => {
    let offset = 0,
      done = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () =>
      finish(
        new Error(
          "Вставка остановлена. Часть текста могла быть введена; автоматического повтора нет.",
        ),
      );
    const next = () => {
      if (done) return;
      if (signal.aborted) return abort();
      const end = Math.min(offset + 32, characters.length);
      try {
        for (; offset < end; offset++) {
          const code = characters[offset]?.codePointAt(0);
          if (code === undefined) continue;
          const key =
            code === 10 ? 0xff0d : code === 9 ? 0xff09 : code <= 0xff ? code : 0x01000000 | code;
          client.sendKeyEvent(1, key);
          client.sendKeyEvent(0, key);
        }
      } catch {
        return finish(new Error("Связь прервалась. Проверь уже введённый текст перед повтором."));
      }
      if (offset === characters.length) finish();
      else timer = setTimeout(next, 16);
    };
    signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(next, 0);
  });
}
