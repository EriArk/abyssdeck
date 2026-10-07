// Implements the display/input boundary only. Remote.tsx and all its controls are real.
// Nothing here opens a remote socket or invokes the visitor's applications.
class Display {
  canvas = document.createElement("canvas");
  element = document.createElement("div");
  onresize = () => {};
  text = "Click here, type, or try the Paste control.";
  clicks = 0;
  constructor() {
    this.canvas.width = 1280;
    this.canvas.height = 800;
    this.element.append(this.canvas);
    this.element.style.transformOrigin = "0 0";
    this.draw();
  }
  draw() {
    const c = this.canvas.getContext("2d")!;
    c.fillStyle = "#152735";
    c.fillRect(0, 0, 1280, 800);
    c.fillStyle = "#274655";
    c.fillRect(0, 0, 1280, 48);
    c.fillStyle = "#f0e7d8";
    c.font = "18px sans-serif";
    c.fillText("Studio PC / Simulated desktop", 24, 31);
    c.fillStyle = "#f1eee4";
    c.fillRect(180, 140, 920, 510);
    c.fillStyle = "#d9d6c9";
    c.fillRect(180, 140, 920, 48);
    c.fillStyle = "#263c45";
    c.fillText("Northstar — Notes", 205, 171);
    c.font = "30px Georgia";
    c.fillText("A place for the next idea", 220, 250);
    c.font = "19px sans-serif";
    for (let i = 0; i < 5; i++)
      c.fillText(this.text.slice(i * 65, (i + 1) * 65), 220, 302 + i * 32);
    c.font = "15px sans-serif";
    c.fillText(
      `Local simulation · ${this.clicks} clicks · no computer connected`,
      220,
      611,
    );
    c.fillStyle = "#cfb886";
    c.fillRect(480, 720, 320, 50);
    c.fillStyle = "#203541";
    c.fillText("Files     Browser     Terminal", 510, 751);
  }
  getElement() {
    return this.element;
  }
  getWidth() {
    return 1280;
  }
  getHeight() {
    return 800;
  }
  scale(n: number) {
    this.element.style.transform = `scale(${n})`;
  }
  showCursor(_show: boolean) {}
  flatten() {
    return this.canvas;
  }
  flush(callback: () => void) {
    callback();
  }
}
class Client {
  display = new Display();
  onstatechange = (_state: number) => {};
  onsync = () => {};
  onerror = () => {};
  constructor(_tunnel: unknown) {}
  getDisplay() {
    return this.display;
  }
  connect() {
    setTimeout(() => {
      this.display.onresize();
      this.onstatechange(3);
      this.onsync();
    }, 20);
  }
  disconnect() {}
  sendMouseState(state: any) {
    if (state.left) {
      this.display.clicks++;
      this.display.draw();
    }
  }
  sendKeyEvent(pressed: number, code: number) {
    if (!pressed) return;
    if (this.display.text.startsWith("Click here")) this.display.text = "";
    if (code === 0xff08) this.display.text = this.display.text.slice(0, -1);
    else if (code === 0xff0d) this.display.text += " / ";
    else if (code >= 32 && code < 0xff00)
      this.display.text += String.fromCodePoint(code);
    else if (code >= 0x01000000)
      this.display.text += String.fromCodePoint(code & 0xffffff);
    this.display.draw();
  }
}
class Keyboard {
  onkeydown: any;
  onkeyup: any;
  constructor(element: HTMLElement) {
    element.addEventListener("keydown", (event) => {
      const code =
        event.key.length === 1
          ? event.key.codePointAt(0)
          : event.key === "Backspace"
            ? 0xff08
            : event.key === "Enter"
              ? 0xff0d
              : 0;
      if (code) {
        this.onkeydown?.(code);
        event.preventDefault();
      }
    });
    element.addEventListener("keyup", (event) => {
      if (event.key.length === 1) this.onkeyup?.(event.key.codePointAt(0));
    });
  }
  reset() {}
}
(window as any).Guacamole = {
  Client,
  Keyboard,
  WebSocketTunnel: class {
    constructor(_url: string) {}
  },
};
