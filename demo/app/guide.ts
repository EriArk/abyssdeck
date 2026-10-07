import features from "./features.json";
import {
  applyTheme,
  setCaseColor,
  setThemeVariant,
} from "../../apps/web/src/theme";
import "./guide.css";

const button = document.createElement("button");
button.type = "button";
button.className = "demo-guide-launcher";
button.textContent = "Demo · Explore";
button.setAttribute("aria-label", "About this demo and feature guide");
const dialog = document.createElement("dialog");
dialog.className = "demo-guide";
dialog.setAttribute("aria-label", "About the AbyssDeck demo");
dialog.innerHTML = `<header><strong>AbyssDeck / Interactive demo</strong><button type="button" data-close aria-label="Close demo guide">×</button></header>
<p>This is the real AbyssDeck interface with fictional projects. Sample edits stay in this page and reset on reload. AI replies, Git operations and remote computers are simulated. No account is needed.</p>
<h2>Try a finish</h2><div class="demo-finishes"></div>
<h2>Explore the workspace</h2><div class="demo-shortcuts"></div>
<p>Files, Markdown editing, notes, tasks, plans, image browsing and window controls use the app’s components. Connected services, account administration and maintenance require an installed AbyssDeck; the catalogue below explains their role.</p>
<label>Find a feature<input type="search" placeholder="Files, Git, devices, collaboration…"></label><div class="demo-catalogue"></div>
<footer><button type="button" data-reset>Reset demo</button><a href="https://github.com/EriArk/abyssdeck" target="_blank" rel="noopener noreferrer">Source / AGPL-3.0</a><a href="./THIRD_PARTY_NOTICES.txt" target="_blank" rel="noopener noreferrer">Third-party notices</a></footer>`;
document.body.append(button, dialog);
button.onclick = () => dialog.showModal();
dialog.querySelector<HTMLButtonElement>("[data-close]")!.onclick = () =>
  dialog.close();
dialog.querySelector<HTMLButtonElement>("[data-reset]")!.onclick = () =>
  location.reload();
const finishes: any[] = [
  ["CRT · burgundy", "crt-green", "green", "red"],
  ["2000 · light", "hitech-2000s", "light", "silver"],
  ["2000 · blue", "hitech-2000s", "light", "blue"],
  ["2000 · red", "hitech-2000s", "light", "red"],
  ["Organizer · light", "organizer", "light", "green"],
  ["Organizer · dark", "organizer", "dark", "green"],
];
for (const [label, theme, variant, color] of finishes) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.onclick = () => {
    localStorage.setItem("codex-theme", theme);
    (window as any).__demo.values["/preferences"].theme = theme;
    setThemeVariant(theme, variant);
    setCaseColor(theme, color);
    applyTheme(theme);
    dialog.close();
  };
  dialog.querySelector(".demo-finishes")!.append(b);
}
for (const [label, target] of [
  ["Files & editor", "Project files"],
  ["Git & delivery", "Project Git"],
  ["Notes", "Notes"],
  ["Tasks", "Tasks"],
  ["Plans", "Plans"],
  ["Devices & terminal", "Open devices"],
  ["Remote Desktop", "Open Remote"],
  ["Settings & help", "Settings"],
]) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.onclick = () => {
    dialog.close();
    const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
    buttons
      .find(
        (x) =>
          x !== b &&
          (x.getAttribute("aria-label") === target ||
            x.title === target ||
            x.textContent?.trim() === target),
      )
      ?.click();
  };
  dialog.querySelector(".demo-shortcuts")!.append(b);
}
const catalogue = dialog.querySelector(".demo-catalogue")!;
for (const [, group, title, , description] of features) {
  const entry = document.createElement("details"),
    summary = document.createElement("summary"),
    p = document.createElement("p");
  summary.textContent = `${group} / ${title}`;
  p.textContent = description;
  entry.append(summary, p);
  catalogue.append(entry);
}
dialog.querySelector("input")!.oninput = (event) => {
  const q = (event.target as HTMLInputElement).value.toLowerCase();
  for (const entry of catalogue.children)
    (entry as HTMLElement).hidden = !entry.textContent
      ?.toLowerCase()
      .includes(q);
};
