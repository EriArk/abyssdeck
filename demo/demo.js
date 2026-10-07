(() => {
  "use strict";
  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];
  const esc = (s = "") =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const aliases = {
    bookmark: "results",
    monitor: "remote",
    maximize: "expand",
    download: "arrow-down",
    "chevron-left": "back",
    "chevron-right": "chevron",
    "arrow-right": "chevron",
  };
  const icon = (name) =>
    `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${(ICONS[aliases[name] || name] || ICONS.file).map((d) => `<path d="${d}"/>`).join("")}</svg>`;
  const ib = (name, label, attrs = "") =>
    `<button type="button" class="icon-button" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}>${icon(name)}</button>`;
  const key = (label, attrs = "", name = "") =>
    `<button type="button" class="key" ${attrs}>${name ? icon(name) : ""}${esc(label)}</button>`;
  const prefix = "abyssdeck-public-demo-v1:";
  const storage = {
    read(key, fallback) {
      try {
        return JSON.parse(localStorage.getItem(prefix + key)) ?? fallback;
      } catch {
        return fallback;
      }
    },
    write(key, data) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(data));
      } catch {
        /* Embeds may deny storage. In-memory state remains usable. */
      }
    },
  };
  const initial = () => ({
    project: "Northstar",
    client: "Codex",
    resultTab: "Files",
    file: "README.md",
    folder: "",
    draft: "",
    attachment: "",
    projects: ["Northstar", "Atlas", "Studio"],
    files: {
      "README.md":
        "# Northstar\n\nA portfolio for a small creative studio.\n\n## Release 1.2\n\n- A responsive gallery for phones, tablets and desktops.\n- Keyboard navigation and image captions.\n- Shared release notes and a clear review history.\n\n## Next steps\n\nReview the gallery and publish the release.\n",
      "src/App.tsx":
        "export function App() {\n  return (\n    <main>\n      <h1>Northstar</h1>\n      <Gallery columns={{ phone: 1, tablet: 2, desktop: 3 }} />\n    </main>\n  );\n}\n",
      "src/gallery.css":
        ".gallery {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));\n  gap: 24px;\n}\n",
      "docs/release.md":
        "# Gallery release\n\nThe new gallery adapts to every screen.\n\n## Review checklist\n\n- [x] Phone layout\n- [x] Tablet layout\n- [ ] Publish release notes\n",
      "public/credits.txt":
        "Northstar demo images are original SVG illustrations shipped with this demo.\n",
      "changelog.csv":
        "Feature,Status,Owner\nGallery,Ready,Alex\nNavigation,Reviewed,Jamie\nRelease notes,Draft,Alex\n",
      "package.json": '{\n  "name": "northstar",\n  "version": "1.2.0",\n  "private": true\n}\n',
    },
    notes: [
      {
        title: "Release direction",
        body: "Lead with the work. Keep the gallery spacious and make details easy to reach.",
      },
      {
        title: "Review notes",
        body: "Phone: one column. Tablet: two columns. Keep the selected image visible.",
      },
    ],
    tasks: [
      { title: "Build the responsive gallery", done: true },
      { title: "Review keyboard navigation", done: true },
      { title: "Prepare release notes", done: false },
      { title: "Publish the update", done: false },
    ],
    plans:
      "1. Review the current gallery.\n2. Implement responsive columns.\n3. Check keyboard navigation.\n4. Review and publish the release.",
    core: "Northstar is a portfolio for a small creative studio.\n\nPreserve existing URLs and accessibility. Keep changes focused. Working copy: Studio PC / projects/northstar.",
    messages: { Codex: [], GPT: [] },
    discussions: [],
    members: [
      { name: "Alex Morgan", role: "Owner" },
      { name: "Jamie Chen", role: "Collaborator" },
    ],
    issues: [
      { title: "Improve gallery keyboard navigation", state: "Open" },
      { title: "Review the tablet layout", state: "Closed" },
    ],
    commits: ["Prepare responsive gallery", "Add project foundation"],
    staged: [],
    gitDirty: true,
    notifications: ["Jamie reviewed the gallery changes", "Codex completed the layout task"],
    name: "Alex Morgan",
    pins: [],
    table: [
      ["Gallery", "Ready", "Alex"],
      ["Navigation", "Reviewed", "Jamie"],
      ["Release notes", "Draft", "Alex"],
    ],
    ideas: [
      { text: "Keep image details one tap away", votes: 3 },
      { text: "Use the same gallery on every screen", votes: 2 },
    ],
    receipts: {},
  });
  const drafts = {};
  let state = initial(); // A fresh load starts with fictional data, never imports private app storage.
  const finishes = {
    burgundy: ["crt-green", "green", "red"],
    blue: ["hitech-2000s", "light", "blue"],
    red: ["hitech-2000s", "light", "red"],
    paper: ["organizer", "light", "mint"],
    night: ["organizer", "dark", "mint"],
    classic: ["classic-dark", "dark", "graphite"],
  };
  function setFinish(id) {
    const [family, variant, color] = finishes[id] || finishes.burgundy;
    Object.assign(document.documentElement.dataset, {
      theme: family,
      themeVariant: variant,
      caseColor: color,
    });
    document.body.dataset.family = family;
    $("#finish").value = id in finishes ? id : "burgundy";
    storage.write("finish", $("#finish").value);
  }
  const art = (variant = 0) => {
    const sky = variant ? "#233b57" : "#152839",
      accent = variant ? "#d79e73" : "#a3c1b6";
    return (
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560"><rect width="900" height="560" fill="${sky}"/><circle cx="710" cy="110" r="48" fill="#eddcbc"/><path d="M0 340 180 200 330 330 520 125 770 330 900 245V560H0" fill="#31515b"/><path d="M0 425 230 335 440 420 665 270 900 400V560H0" fill="#172e38"/><path d="M0 480Q260 390 450 470T900 455V560H0" fill="${accent}" opacity=".55"/><g fill="#e9dfc4"><circle cx="100" cy="90" r="2"/><circle cx="290" cy="125" r="2"/><circle cx="440" cy="62" r="2"/><circle cx="800" cy="220" r="2"/></g><g fill="#f2e9d6" font-family="system-ui,sans-serif"><text x="55" y="72" font-size="18" letter-spacing="5">NORTHSTAR / FIELD STUDIES</text><text x="55" y="490" font-size="42">${variant ? "The blue hour" : "A quieter horizon"}</text><text x="57" y="525" font-size="15">${variant ? "02" : "01"} — Original demo illustration</text></g></svg>`,
      )
    );
  };
  const markdown = (text) =>
    esc(text)
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  let toastTimer;
  function toast(text) {
    clearTimeout(toastTimer);
    $("#toast").textContent = text;
    $("#toast").hidden = false;
    toastTimer = setTimeout(() => ($("#toast").hidden = true), 4500);
  }
  function download(name, text, mime = "text/plain") {
    const blob = text instanceof Blob ? text : new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function record(title) {
    state.notifications.unshift(title);
    renderResults();
  }
  const windows = new Map();
  let z = 100;
  function windowBody(id) {
    return windows.get(id)?.querySelector(".window-body");
  }
  function focusWindow(w) {
    $$(".demo-window").forEach((el) => el.classList.remove("front"));
    w.classList.add("front");
    w.style.zIndex = ++z;
  }
  function persistGeometry(id, w) {
    if (innerWidth <= 760 || w.classList.contains("full")) return;
    storage.write("window:" + id, {
      x: w.offsetLeft,
      y: w.offsetTop,
      w: w.offsetWidth,
      h: w.offsetHeight,
    });
  }
  function constrain(w) {
    if (innerWidth <= 760) return;
    const deck = $("#deck");
    const maxW = deck.clientWidth - 12,
      maxH = deck.clientHeight - 12;
    w.style.width = Math.min(w.offsetWidth, maxW) + "px";
    w.style.height = Math.min(w.offsetHeight, maxH) + "px";
    w.style.left = Math.max(4, Math.min(w.offsetLeft, maxW - w.offsetWidth + 8)) + "px";
    w.style.top = Math.max(4, Math.min(w.offsetTop, maxH - w.offsetHeight + 8)) + "px";
  }
  function openWindow(id, title, render) {
    if (windows.has(id)) {
      const w = windows.get(id);
      w.hidden = false;
      focusWindow(w);
      constrain(w);
      renderDock();
      return w;
    }
    const w = document.createElement("section");
    w.className = "demo-window";
    w.dataset.id = id;
    w.setAttribute("role", "dialog");
    w.setAttribute("aria-label", title);
    w.innerHTML = `<header class="window-heading"><span>${icon(FEATURES.find((f) => f[0] === id)?.[3] || "file")}</span><h2>${esc(title)}</h2><div class="window-controls">${ib("minus", "Minimize " + title, "").replace('class="icon-button"', 'class="icon-button minimize"')}${ib("maximize", "Maximize " + title).replace('class="icon-button"', 'class="icon-button maximize"')}${ib("close", "Close " + title).replace('class="icon-button"', 'class="icon-button close"')}</div></header><div class="window-body"></div><footer class="window-footer"><span>AbyssDeck · ${esc(state.project)}</span><span>Demo workspace · changes stay here</span></footer>`;
    $("#windows").append(w);
    windows.set(id, w);
    const geometry = storage.read("window:" + id, null);
    if (geometry && innerWidth > 760) {
      for (const [k, v] of Object.entries({
        left: geometry.x,
        top: geometry.y,
        width: geometry.w,
        height: geometry.h,
      }))
        if (Number.isFinite(v)) w.style[k] = v + "px";
    } else if (innerWidth > 760) {
      const offset = (windows.size % 5) * 13;
      w.style.left = Math.max(12, $("#deck").clientWidth * 0.12 + offset) + "px";
      w.style.top = 35 + offset + "px";
    }
    constrain(w);
    focusWindow(w);
    w.addEventListener("pointerdown", () => focusWindow(w));
    $(".close", w).onclick = () => {
      w.hidden = true;
      w.dataset.closed = "true";
      renderDock();
    };
    $(".minimize", w).onclick = () => {
      w.hidden = true;
      w.dataset.closed = "false";
      renderDock();
    };
    $(".maximize", w).onclick = () => w.classList.toggle("full");
    $(".window-heading", w).addEventListener("pointerdown", (event) => {
      if (innerWidth <= 760 || event.target.closest("button") || w.classList.contains("full"))
        return;
      const x = event.clientX,
        y = event.clientY,
        left = w.offsetLeft,
        top = w.offsetTop,
        head = event.currentTarget;
      head.setPointerCapture(event.pointerId);
      const move = (e) => {
        w.style.left = left + e.clientX - x + "px";
        w.style.top = top + e.clientY - y + "px";
        constrain(w);
      };
      const end = () => {
        head.removeEventListener("pointermove", move);
        head.removeEventListener("pointerup", end);
        persistGeometry(id, w);
      };
      head.addEventListener("pointermove", move);
      head.addEventListener("pointerup", end);
    });
    let resizeTimer;
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!w.hidden) persistGeometry(id, w);
      }, 250);
    }).observe(w);
    render(windowBody(id));
    w.querySelector(".close").focus({ preventScroll: true });
    return w;
  }
  function renderDock() {
    const parked = [...windows].filter(([, w]) => w.hidden && w.dataset.closed === "false");
    $("#dock").hidden = !parked.length;
    $("#dock").innerHTML = parked
      .map(([id, w]) =>
        ib(
          FEATURES.find((f) => f[0] === id)?.[3] || "file",
          "Restore " + w.getAttribute("aria-label"),
          `data-restore="${id}"`,
        ),
      )
      .join("");
  }
  function split(el, target, prop, min, max, reversed = false) {
    const apply = (value) =>
      target.style.setProperty(
        prop,
        Math.max(min, Math.min(typeof max === "function" ? max() : max, value)) + "px",
      );
    el.addEventListener("pointerdown", (e) => {
      const start = e.clientX,
        current = parseFloat(getComputedStyle(target).getPropertyValue(prop)) || min;
      el.setPointerCapture(e.pointerId);
      const move = (e) => apply(current + (e.clientX - start) * (reversed ? -1 : 1));
      const end = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
    });
    el.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      apply(
        (parseFloat(getComputedStyle(target).getPropertyValue(prop)) || min) +
          (e.key === "ArrowRight" ? 15 : -15) * (reversed ? -1 : 1),
      );
    });
  }
  function renderNav() {
    $("#nav-content").innerHTML =
      `<button type="button" class="nav-item" data-open="search">${icon("search")} Search & commands <small>⌘ K</small></button><section class="nav-section"><small>PROJECTS</small>${state.projects.map((p) => `<button type="button" class="nav-item ${p === state.project ? "active" : ""}" data-project="${esc(p)}">${icon("folder")}<span>${esc(p)}<small>Studio PC · ${p === "Northstar" ? "Shared project" : "Private project"}</small></span>${p === state.project ? '<span class="status-dot"></span>' : ""}</button>`).join("")}<button type="button" class="nav-item" data-open="projects">${icon("plus")} New project</button></section><section class="nav-section"><small>WORKSPACE</small>${[
        ["core", "folder", "Project Core"],
        ["spaces", "people", "Shared spaces"],
        ["brainstorm", "chat", "Brainstorm"],
        ["activity", "bell", "Activity & intake"],
      ]
        .map(
          ([id, i, t]) =>
            `<button type="button" class="nav-item" data-open="${id}">${icon(i)}${t}</button>`,
        )
        .join("")}</section><div class="nav-tools">${[
        ["tasks", "check", "Tasks"],
        ["notes", "note-edit", "Notes"],
        ["plans", "select", "Plans"],
        ["reports", "file", "Reports"],
        ["communication", "chat", "Messages"],
        ["notifications", "bell", "Notices"],
      ]
        .map(([id, i, t]) => `<button type="button" data-open="${id}">${icon(i)}${t}</button>`)
        .join("")}</div><div class="nav-bottom"><div class="nav-tools">${[
        ["settings", "settings", "Settings"],
        ["devices", "terminal", "Devices"],
        ["remote", "monitor", "Remote"],
      ]
        .map(([id, i, t]) => `<button type="button" data-open="${id}">${icon(i)}${t}</button>`)
        .join(
          "",
        )}</div><button type="button" class="nav-item" data-open="explore">${icon("grid")} All ${FEATURES.length} feature areas</button></div>`;
  }
  function renderHeader() {
    $("#workspace-header").innerHTML =
      `${ib("menu", "Toggle navigation", 'data-action="toggle-nav"')}<div class="project-heading"><strong>${esc(state.project)}</strong><small>${state.client} · Gallery, ready for every screen</small></div><span class="badge header-extra">Demo</span>${ib("plus", "New conversation", 'data-action="new-chat"')}${ib("history", "Conversation history", 'data-open="history"')}${ib("folder", "Project files", 'data-open="files"')}${ib("branch", "Git", 'data-open="git"')}${ib("bookmark", "Toggle results", 'data-action="toggle-results"').replace('class="icon-button"', 'class="icon-button header-extra"')}`;
  }
  function reasoning() {
    return `<details><summary>Public task summary & work</summary><div>Keep the existing gallery and improve its responsive behavior.<details><summary>File changes · 2 files</summary><div><pre>src/App.tsx     +12 −4\nsrc/gallery.css  +8 −2</pre></div></details><details><summary>Command · example output</summary><div><pre>$ pnpm build\n✓ TypeScript checked\n✓ Gallery build complete</pre><span class="badge">Simulated output</span></div></details><p>The selected image remains visible when the layout changes.</p></div></details>`;
  }
  function renderChat() {
    const gpt = state.client === "GPT";
    $("#chat-feed").innerHTML =
      `<article class="message user"><div class="message-head"><span class="avatar">A</span><strong>You</strong><time>10:24</time></div><div class="message-body">${gpt ? "Help me shape the story behind our next release. Keep the tone calm and concrete." : "Prepare the gallery for launch. One column on phones, two on tablets. Keep keyboard navigation and save the release notes."}</div></article><article class="message"><div class="message-head"><span class="avatar">${gpt ? "G" : "C"}</span><strong>${state.client}</strong><time>10:25</time><span class="badge">Example conversation</span></div><div class="message-body">${gpt ? "<h2>A quieter horizon</h2><p>A portfolio should give the work room to breathe. For Northstar, the next release begins with a simple gallery: generous images, useful captions and clear navigation.</p><p>We can turn this direction into a short implementation brief when you are ready.</p>" : "<h2>The gallery is ready for review.</h2><p>It now adapts to the available space and keeps the selected image in view.</p><ul><li><strong>Phone:</strong> one column, with touch-friendly navigation.</li><li><strong>Tablet:</strong> two columns and an open detail panel.</li><li><strong>Desktop:</strong> three columns, with keyboard navigation.</li></ul>"}${reasoning()}<button type="button" class="image-open" data-open="images" aria-label="Open gallery image" style="padding:0;border:0;background:none;width:100%"><img src="${art()}" alt="Northstar gallery illustration: mountains under a quiet night sky"></button><div class="message-actions">${key("Review files", 'data-open="files"', "folder")}${key(gpt ? "Prepare for Codex" : "View changes", `data-open="${gpt ? "prepare" : "git"}"`, gpt ? "code" : "branch")}</div></div></article>${state.messages[state.client].map((m) => `<article class="message ${m.role === "user" ? "user" : ""}"><div class="message-head"><span class="avatar">${m.role === "user" ? "A" : gpt ? "G" : "C"}</span><strong>${m.role === "user" ? "You" : state.client}</strong><span class="badge">${m.role === "user" ? "Local message" : "Scripted demo response"}</span></div><div class="message-body">${markdown(m.text)}</div></article>`).join("")}<div class="tour-hint">Try the files, Git review, device terminal or a different theme. All demo content is fictional; no AI request is sent.</div>`;
    $("#model").value = state.client;
  }
  function renderResults() {
    const r = $("#results");
    r.innerHTML = `<header class="pane-title"><strong>Results</strong>${ib("search", "Search results", 'data-open="search"')}</header><nav class="tabs">${["Files", "Images", "Reasoning", "Links"].map((t) => `<button type="button" class="${state.resultTab === t ? "active" : ""}" data-result-tab="${t}">${t}</button>`).join("")}</nav><div class="result-content"></div><div class="toolbar">${key("Select & export", 'data-open="batch"', "select")}</div>`;
    const b = $(".result-content", r);
    if (state.resultTab === "Files")
      b.innerHTML =
        "<small>THIS CONVERSATION · 3 FILES</small>" +
        ["docs/release.md", "src/App.tsx", "changelog.csv"]
          .map(
            (f) =>
              `<div class="file-row"><button type="button" data-file="${f}">${icon("file")}<span>${esc(f.split("/").at(-1))}<small>${f.endsWith("csv") ? "CSV table" : "Working file"} · Northstar</small></span></button>${ib("more", "Actions for " + f, `data-file-menu="${f}"`)}</div>`,
          )
          .join("");
    else if (state.resultTab === "Images")
      b.innerHTML = [0, 1]
        .map(
          (n) =>
            `<div class="image-card"><button type="button" class="image-open" data-image="${n}" aria-label="Open image ${n + 1}"><img src="${art(n)}" alt="${n ? "The blue hour" : "A quieter horizon"}"></button>${ib("more", "Image actions", `data-image-menu="${n}"`).replace('class="icon-button"', 'class="icon-button overflow"')}<p>${n ? "The blue hour" : "A quieter horizon"}</p><small>Original demo illustration · SVG</small></div>`,
        )
        .join("");
    else if (state.resultTab === "Reasoning")
      b.innerHTML = `<div class="card"><small>YOUR REQUEST</small><p>Prepare the gallery for launch.</p>${reasoning()}</div>`;
    else
      b.innerHTML = `<div class="file-row"><button type="button" data-open="issues">${icon("link")}<span>Gallery review<small>Example issue · #18</small></span></button>${ib("more", "Link actions", 'data-link-menu="true"')}</div><div class="file-row"><button type="button" data-open="browser">${icon("external")}<span>Application preview<small>Northstar · local demo</small></span></button>${ib("more", "Preview actions", 'data-link-menu="true"')}</div>`;
  }
  function renderExplore(body, search = false) {
    body.innerHTML = `<div class="padded"><div class="row"><div class="spacer"><h1>${search ? "Search your demo" : "Explore AbyssDeck"}</h1><p class="muted">${FEATURES.length} feature areas. Choose a workflow and try its example.</p></div></div><input class="searchbox" type="search" aria-label="Search features" placeholder="Try files, terminal, review, backup…"><div class="feature-results"></div></div>`;
    const draw = () => {
      const query = $("input", body).value.toLowerCase();
      const features = FEATURES.filter((f) => f.join(" ").toLowerCase().includes(query));
      $(".feature-results", body).innerHTML =
        (search
          ? Object.keys(state.files)
              .filter((f) => f.toLowerCase().includes(query))
              .map(
                (f) =>
                  `<div class="file-row"><button type="button" data-file="${esc(f)}">${icon("file")}${esc(f)}</button></div>`,
              )
              .join("")
          : "") +
        [...new Set(features.map((f) => f[1]))]
          .map(
            (group) =>
              `<h3 class="section-label">${group}</h3><div class="feature-grid">${features
                .filter((f) => f[1] === group)
                .map(
                  ([id, , title, i, desc]) =>
                    `<button type="button" class="feature-card" data-open="${id}"><span class="row">${icon(i)}<strong>${title}</strong></span><p>${desc}</p><small>${["linux"].includes(id) ? "Readiness & scope" : "Open example →"}</small></button>`,
                )
                .join("")}</div>`,
          )
          .join("");
      if (!features.length)
        $(".feature-results", body).insertAdjacentHTML(
          "beforeend",
          '<p class="empty">No matching feature. Try a shorter search.</p>',
        );
    };
    $("input", body).oninput = draw;
    draw();
  }
  function renderFiles(body) {
    body.innerHTML = `<div class="files-shell"><div class="toolbar">${ib("arrow-up", "Parent folder", 'data-fs="up"')}${ib("folder-plus", "New folder", 'data-fs="folder"')}${ib("file-plus", "New text file", 'data-fs="new"')}${ib("upload", "Upload a local text file", 'data-action="upload"')}<input type="search" placeholder="Find in files" aria-label="Find in files"><span class="badge">Demo copy</span></div><div class="content-split files-split" style="--list:220px"><div class="content-list"></div><div class="splitter" role="separator" tabindex="0" aria-label="File list width" aria-orientation="vertical"></div><div class="content-detail"></div></div></div>`;
    const draw = () => {
      const q = $("input", body).value.toLowerCase();
      const paths = Object.keys(state.files).filter(
        (f) => f.toLowerCase().includes(q) && f.startsWith(state.folder),
      );
      const folders = [
        ...new Set(
          paths
            .filter((f) => f.slice(state.folder.length).includes("/"))
            .map((f) => state.folder + f.slice(state.folder.length).split("/")[0] + "/"),
        ),
      ];
      $(".content-list", body).innerHTML =
        `<div class="padded"><small>${esc(state.project)} / ${esc(state.folder)}</small></div>` +
        folders
          .map(
            (f) =>
              `<button type="button" class="nav-item" data-folder="${esc(f)}">${icon("folder")}${esc(f.split("/").at(-2))}</button>`,
          )
          .join("") +
        paths
          .filter((f) => !f.slice(state.folder.length).includes("/"))
          .map(
            (f) =>
              `<div class="file-row"><button type="button" data-fs-file="${esc(f)}">${icon("file")}<span>${esc(f.split("/").at(-1))}<small>${new Blob([state.files[f]]).size} bytes</small></span></button>${ib("more", "File actions: " + f, `data-file-menu="${esc(f)}"`)}</div>`,
          )
          .join("");
    };
    const preview = () => {
      const detail = $(".content-detail", body);
      detail.innerHTML = `<div class="row"><strong class="spacer">${esc(state.file)}</strong>${ib("edit", "Edit selected file", 'data-open="viewer"')}${ib("download", "Download selected file", 'data-action="download-current"')}</div><hr style="border:0;border-top:1px solid var(--line);margin:16px 0"><article class="file-content">${state.file.endsWith(".md") ? markdown(state.files[state.file] || "") : esc(state.files[state.file] || "")}</article>`;
    };
    $("input", body).oninput = draw;
    body.onclick = (e) => {
      const f = e.target.closest("[data-fs-file]");
      if (f) {
        state.file = f.dataset.fsFile;
        preview();
      }
      const dir = e.target.closest("[data-folder]");
      if (dir) {
        state.folder = dir.dataset.folder;
        draw();
      }
      const action = e.target.closest("[data-fs]")?.dataset.fs;
      if (action === "up") {
        state.folder = state.folder.split("/").slice(0, -2).join("/");
        if (state.folder) state.folder += "/";
        draw();
      }
      if (action === "new" || action === "folder")
        editName(action === "new" ? "New file" : "New folder", "", (name) => {
          const path = state.folder + name + (action === "folder" ? "/README.md" : "");
          if (path in state.files) return toast("That demo filename already exists.");
          state.files[path] = action === "folder" ? "# " + name + "\n" : "";
          state.file = path;
          draw();
          preview();
        });
    };
    split($(".splitter", body), $(".content-split", body), "--list", 120, 350);
    draw();
    preview();
  }
  function editName(title, value, done) {
    const id = "name";
    const existing = windows.get(id);
    if (existing) {
      existing.remove();
      windows.delete(id);
    }
    openWindow(id, title, (body) => {
      body.innerHTML = `<form class="padded stack"><label>Name<input name="name" required value="${esc(value)}" maxlength="120"></label><button type="submit" class="primary">Save in demo</button><small>Changes apply only to this example workspace.</small></form>`;
      $("form", body).onsubmit = (e) => {
        e.preventDefault();
        const name = $("input", body).value.trim();
        if (!name || /[\\/]/.test(name)) return toast("Use a name without slashes.");
        done(name);
        windows.get(id).hidden = true;
      };
    });
  }
  function renderViewer(body) {
    let editing = false;
    const file = state.file;
    body.innerHTML = `<div class="files-shell"><div class="toolbar"><strong class="spacer">${esc(file)}</strong>${ib("edit", "Toggle editing", 'data-editor="edit"')}${ib("save", "Save demo file", 'data-editor="save"')}${ib("download", "Download file", 'data-editor="download"')}${ib("bold", "Insert bold text", 'data-editor="bold"')}${ib("heading", "Insert heading", 'data-editor="heading"')}</div><div class="content-detail" style="flex:1"><article class="reading file-content"></article><textarea class="file-editor" aria-label="File content" hidden spellcheck="false"></textarea></div><div class="toolbar"><small class="editor-status">Viewing the demo copy. Editing stays in this window.</small></div></div>`;
    const input = $("textarea", body);
    input.value = drafts[file] ?? state.files[file] ?? "";
    const preview = () =>
      ($(".reading", body).innerHTML = file.endsWith(".md")
        ? markdown(input.value)
        : esc(input.value));
    preview();
    body.onclick = (e) => {
      const op = e.target.closest("[data-editor]")?.dataset.editor;
      if (!op) return;
      if (op === "edit") {
        editing = !editing;
        input.hidden = !editing;
        $(".reading", body).hidden = editing;
        preview();
        if (editing) input.focus();
      }
      if (op === "save") {
        state.files[file] = input.value;
        delete drafts[file];
        state.gitDirty = true;
        $(".editor-status", body).textContent =
          "Saved in demo memory. Reloading resets sample files.";
        record("Demo file saved: " + file);
        if (windowBody("files")) renderFiles(windowBody("files"));
      }
      if (op === "download") download(file.split("/").at(-1), input.value);
      if (["bold", "heading"].includes(op)) {
        editing = true;
        input.hidden = false;
        $(".reading", body).hidden = true;
        const text = op === "bold" ? "**selected text**" : "\n## New heading\n";
        input.setRangeText(text, input.selectionStart, input.selectionEnd, "end");
        drafts[file] = input.value;
        input.focus();
      }
    };
    input.oninput = () => {
      drafts[file] = input.value;
      $(".editor-status", body).textContent =
        "Unsaved demo draft — close or minimize to keep it during this visit.";
    };
  }
  let imageIndex = 0;
  function renderImages(body) {
    body.innerHTML = `<div class="padded"><div class="row"><h2 class="spacer">${imageIndex ? "The blue hour" : "A quieter horizon"}</h2><span class="badge">Original SVG illustration</span></div><div class="annotator"><img class="preview-art" src="${art(imageIndex)}" alt="Mountain landscape for the Northstar demo"><canvas width="900" height="560" aria-label="Draw annotations on this example image"></canvas></div><div class="gallery-controls">${ib("chevron-left", "Previous image", 'data-image-step="-1"')}<span>${imageIndex + 1} of 2</span>${ib("chevron-right", "Next image", 'data-image-step="1"')}</div><div class="row">${key("Clear marks", 'data-image-action="clear"', "undo")}${key("Download PNG", 'data-image-action="export"', "download")}<label>Marker <input type="color" value="#ffbc63" aria-label="Marker color"></label></div><p class="notice" style="margin-top:15px">Draw directly on the image with a mouse or touch. This exports a new image; the original is preserved.</p></div>`;
    const canvas = $("canvas", body),
      ctx = canvas.getContext("2d");
    let drawing = false;
    const point = (e) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) * 900) / r.width, ((e.clientY - r.top) * 560) / r.height];
    };
    canvas.onpointerdown = (e) => {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      ctx.beginPath();
      ctx.moveTo(...point(e));
    };
    canvas.onpointermove = (e) => {
      if (!drawing) return;
      ctx.strokeStyle = $("input[type=color]", body).value;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.lineTo(...point(e));
      ctx.stroke();
    };
    canvas.onpointerup = () => (drawing = false);
    canvas.onpointercancel = () => (drawing = false);
    body.onclick = (e) => {
      const step = e.target.closest("[data-image-step]");
      if (step) {
        imageIndex = (imageIndex + Number(step.dataset.imageStep) + 2) % 2;
        renderImages(body);
      }
      const action = e.target.closest("[data-image-action]")?.dataset.imageAction;
      if (action === "clear") ctx.clearRect(0, 0, 900, 560);
      if (action === "export") {
        const out = document.createElement("canvas");
        out.width = 900;
        out.height = 560;
        const c = out.getContext("2d");
        c.drawImage($("img", body), 0, 0, 900, 560);
        c.drawImage(canvas, 0, 0);
        out.toBlob((blob) => {
          if (blob) download("northstar-annotated.png", blob);
        }, "image/png");
      }
    };
  }
  function renderTable(body) {
    body.innerHTML = `<div class="padded"><h2>Changelog</h2><p class="muted">Edit the example values, then export a CSV copy.</p><table><thead><tr><th>Feature</th><th>Status</th><th>Owner</th></tr></thead><tbody>${state.table.map((row, r) => `<tr>${row.map((v, c) => `<td><input value="${esc(v)}" aria-label="Row ${r + 1}, ${["Feature", "Status", "Owner"][c]}" data-cell="${r},${c}"></td>`).join("")}</tr>`).join("")}</tbody></table><div class="row" style="margin-top:18px">${key("Add row", 'data-table="add"', "plus")}${key("Download CSV", 'data-table="download"', "download")}</div><p class="notice" style="margin-top:16px">The production viewer supports CSV/TSV editing and XLSX value changes. This lightweight example uses CSV; it does not run an Excel workbook engine.</p></div>`;
    body.oninput = (e) => {
      if (e.target.dataset.cell) {
        const [r, c] = e.target.dataset.cell.split(",").map(Number);
        state.table[r][c] = e.target.value;
      }
    };
    body.onclick = (e) => {
      const op = e.target.closest("[data-table]")?.dataset.table;
      if (op === "add") {
        state.table.push(["New feature", "Draft", state.name.split(" ")[0]]);
        renderTable(body);
      }
      if (op === "download")
        download(
          "changelog.csv",
          [["Feature", "Status", "Owner"], ...state.table]
            .map((row) => row.map((v) => '"' + v.replaceAll('"', '""') + '"').join(","))
            .join("\r\n"),
          "text/csv",
        );
    };
  }
  function renderGit(body) {
    let tab = "Changes";
    const draw = () => {
      body.innerHTML = `<div class="files-shell"><div class="toolbar">${icon("branch")}<strong class="spacer">${esc(state.project.toLowerCase())} / main</strong>${key("Files", 'data-open="files"', "folder")}${key("Delivery", 'data-open="delivery"', "upload")}</div><nav class="tabs">${["Changes", "History", "Branches", "Issues & PRs"].map((t) => `<button type="button" data-git-tab="${t}" class="${tab === t ? "active" : ""}">${t}</button>`).join("")}</nav><div class="padded git-content"></div></div>`;
      const c = $(".git-content", body);
      if (tab === "Changes")
        c.innerHTML = state.gitDirty
          ? `<h2>Review your changes</h2><p class="muted">Stage the example files and create a local demo commit.</p>${["src/App.tsx", "src/gallery.css"].map((f) => `<label class="task-line"><input type="checkbox" data-stage="${f}" ${state.staged.includes(f) ? "checked" : ""}> <span>${f}</span><small>Modified</small></label>`).join("")}<pre style="margin:16px 0"><span class="diff-remove">− columns: 3</span>\n<span class="diff-add">+ columns: { phone: 1, tablet: 2, desktop: 3 }\n+ preserveSelection: true</span></pre><form class="row"><input name="message" aria-label="Commit message" placeholder="Commit message" required value="Prepare the responsive gallery" style="flex:1"><button type="submit" class="primary">Commit in demo</button></form>`
          : `<div class="empty">${icon("check")}<h2>Working copy is clean</h2><p>Your demo commit is in History.</p>${key("Review delivery", 'data-open="delivery"')}</div>`;
      else if (tab === "History")
        c.innerHTML = state.commits
          .map(
            (m, i) =>
              `<div class="file-row">${icon("branch")}<span><strong>${esc(m)}</strong><small>demo-${String(state.commits.length - i).padStart(3, "0")} · ${esc(state.name)} · Example commit</small></span></div>`,
          )
          .join("");
      else if (tab === "Branches")
        c.innerHTML = `<h2>Branches</h2><div class="file-row">${icon("branch")} main <span class="badge">Current</span></div><div class="file-row">${icon("branch")} demo/gallery-release</div><p class="notice" style="margin-top:20px">Branch creation and publication are illustrated in the delivery review. No Git repository is modified by this demo.</p>${key("Open delivery", 'data-open="delivery"')}`;
      else
        c.innerHTML = `<h2>Issues & pull requests</h2><p>Track the discussion alongside the working copy.</p>${key("Open review board", 'data-open="issues"', "repository")}`;
      const form = $("form", c);
      if (form)
        form.onsubmit = (e) => {
          e.preventDefault();
          if (!state.staged.length) return toast("Select at least one file to stage.");
          state.commits.unshift($("input[name=message]", form).value);
          state.gitDirty = false;
          record("Demo commit created");
          tab = "History";
          draw();
        };
    };
    body.onclick = (e) => {
      const t = e.target.closest("[data-git-tab]");
      if (t) {
        tab = t.dataset.gitTab;
        draw();
      }
    };
    body.onchange = (e) => {
      if (e.target.dataset.stage) {
        const f = e.target.dataset.stage;
        state.staged = e.target.checked
          ? [...new Set([...state.staged, f])]
          : state.staged.filter((x) => x !== f);
      }
    };
    draw();
  }
  function renderIssues(body) {
    body.innerHTML = `<div class="padded"><div class="row"><h2 class="spacer">Northstar · Review board</h2>${key("New issue", 'data-new-issue="true"', "plus")}</div>${state.issues.map((issue, i) => `<details><summary>#${18 + i} · ${esc(issue.title)} <span class="badge">${issue.state}</span></summary><div><p>Preserve keyboard navigation while improving the gallery layout. Review the phone and tablet behavior before release.</p><label>Review note<textarea rows="3" aria-label="Review note for issue ${18 + i}" placeholder="Add a local review note"></textarea></label>${key("Save review note", `data-review="${i}"`)}<div class="review-receipt"></div></div></details>`).join("")}<details><summary>PR #24 · Responsive gallery <span class="badge">Ready for review</span></summary><div><p>Two files changed. The demo build result is attached.</p>${key("Review diff", 'data-open="git"', "branch")}${key("Prepare for Codex", 'data-open="prepare"', "code")}</div></details><div class="issue-form" hidden><form class="stack"><label>Issue title<input required name="title" placeholder="Describe the issue"></label><label>Description<textarea rows="3" name="description"></textarea></label><button type="submit" class="primary">Create demo issue</button></form></div></div>`;
    $("[data-new-issue]", body).onclick = () => {
      $(".issue-form", body).hidden = false;
      $("input", body).focus();
    };
    $("form", body).onsubmit = (e) => {
      e.preventDefault();
      state.issues.unshift({ title: $("input", body).value, state: "Open" });
      record("Demo issue created");
      renderIssues(body);
    };
    body.onclick = (e) => {
      const b = e.target.closest("[data-review]");
      if (b) {
        const details = b.closest("details");
        $(".review-receipt", details).textContent =
          "Saved demo note: " + $("textarea", details).value;
      }
    };
  }
  function renderNotes(body, kind = "notes") {
    if (kind === "core" || kind === "plans") {
      body.innerHTML = `<div class="padded stack"><h2>${kind === "core" ? "Project Core" : "Release plan"}</h2><p class="muted">${kind === "core" ? "Project-owned context, independent of any one conversation." : "Review the sequence before turning it into work."}</p><textarea rows="10" aria-label="${kind === "core" ? "Project Core" : "Plan"}">${esc(state[kind])}</textarea><div class="row">${key("Save draft", 'data-note-save="true"', "save")}${key(kind === "plans" ? "Review execution" : "Prepare handoff", `data-open="${kind === "plans" ? "plan-review" : "rotation"}"`, "arrow-right")}</div><div class="save-receipt" role="status"></div></div>`;
      $("textarea", body).oninput = (e) => {
        state[kind] = e.target.value;
      };
      $("[data-note-save]", body).onclick = () =>
        ($(".save-receipt", body).textContent = "Saved in this demo workspace.");
      return;
    }
    let selected = 0;
    const draw = () => {
      body.innerHTML = `<div class="files-shell"><div class="toolbar"><strong class="spacer">Project notes</strong>${key("New note", 'data-new-note="true"', "plus")}</div><div class="content-split"><div class="content-list">${state.notes.map((n, i) => `<button type="button" class="nav-item ${i === selected ? "active" : ""}" data-note="${i}">${icon("note-edit")}<span>${esc(n.title)}</span></button>`).join("")}</div><div></div><div class="content-detail stack"><label>Title<input value="${esc(state.notes[selected].title)}" aria-label="Note title"></label><label>Note<textarea rows="12" aria-label="Note text">${esc(state.notes[selected].body)}</textarea></label><small>Your draft stays in this window while you use the rest of the demo.</small>${key("Download note", 'data-note-download="true"', "download")}</div></div></div>`;
      $("input", body).oninput = (e) => (state.notes[selected].title = e.target.value);
      $("textarea", body).oninput = (e) => (state.notes[selected].body = e.target.value);
    };
    body.onclick = (e) => {
      const b = e.target.closest("[data-note]");
      if (b) {
        selected = +b.dataset.note;
        draw();
      }
      if (e.target.closest("[data-new-note]")) {
        state.notes.push({ title: "New note", body: "" });
        selected = state.notes.length - 1;
        draw();
      }
      if (e.target.closest("[data-note-download]"))
        download(state.notes[selected].title + ".md", state.notes[selected].body);
    };
    draw();
  }
  function renderTasks(body) {
    body.innerHTML = `<div class="padded"><h2>Release checklist</h2><p class="muted">${state.tasks.filter((t) => t.done).length} of ${state.tasks.length} completed</p>${state.tasks.map((t, i) => `<label class="task-line"><input type="checkbox" data-task="${i}" ${t.done ? "checked" : ""}><span style="${t.done ? "text-decoration:line-through;opacity:.6" : ""}">${esc(t.title)}</span><span class="badge">${t.done ? "Done" : "To do"}</span></label>`).join("")}<form class="row" style="margin-top:20px"><input aria-label="New task" required placeholder="Add a task" style="flex:1"><button type="submit" class="primary">Add</button></form><div class="row" style="margin-top:18px">${key("Open plan", 'data-open="plans"', "select")}${key("Project report", 'data-open="reports"', "file")}</div></div>`;
    body.onchange = (e) => {
      if (e.target.dataset.task) {
        state.tasks[+e.target.dataset.task].done = e.target.checked;
        renderTasks(body);
      }
    };
    $("form", body).onsubmit = (e) => {
      e.preventDefault();
      state.tasks.push({ title: $("input[aria-label='New task']", body).value, done: false });
      renderTasks(body);
    };
  }
  function renderFlow(body, id) {
    const f = FLOWS[id];
    body.innerHTML = `<div class="padded"><span class="badge">Simulated workflow</span><h2 style="margin-top:14px">${esc(f.title)}</h2><p class="muted" style="line-height:1.6">${esc(f.intro)}</p><form class="stack">${f.fields.map(([label, value, type], i) => `<label>${esc(label)}${type === "textarea" ? `<textarea name="field${i}" rows="4" required>${esc(value)}</textarea>` : `<input name="field${i}" type="${type || "text"}" value="${esc(value)}" required>`}</label>`).join("")}<button type="submit" class="primary">Review</button></form><div class="flow-review"></div></div>`;
    $("form", body).onsubmit = (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const snapshot = [...new FormData(form)].map(([name, value]) => [
        f.fields[+name.slice(5)][0],
        value,
      ]);
      const review = $(".flow-review", body);
      review.innerHTML = `<div class="receipt"><strong>Review the demo action</strong><dl>${snapshot.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl><p>Nothing will be sent to a server or external service.</p><button type="button" class="primary">Confirm demo action</button></div>`;
      $("button", review).onclick = () => {
        state.receipts[id] = snapshot;
        review.innerHTML = `<div class="receipt" role="status"><strong>Demo receipt</strong><p>${esc(f.result)}</p><small>Saved for this visit only.</small></div>`;
        record("Demo action: " + f.title);
      };
      review.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
  }
  function renderDevices(body) {
    let device = "Studio PC",
      session = 1,
      logs = {};
    const output = () =>
      (logs[device + session] ||=
        "AbyssDeck demo terminal — simulated, no shell is connected.\nType help for example commands.\n");
    const draw = () => {
      body.innerHTML = `<div class="files-shell"><div class="toolbar"><select aria-label="Device"><option>Studio PC</option><option>Linux Hub</option></select><span class="badge">Simulated connection</span><span class="spacer"></span>${key("Remote", 'data-open="remote"', "monitor")}</div><div class="padded" style="padding-bottom:10px"><div class="grid"><div class="card"><small>SYSTEM</small><h3 style="margin:8px 0">${device === "Studio PC" ? "Windows · Studio" : "Linux · Hub"}</h3><small>Demo telemetry</small></div><div class="card"><small>CPU / MEMORY</small><div class="metric">12% <small>· 8 / 32 GB</small></div></div></div></div><div class="toolbar"><select aria-label="Terminal session">${[1, 2, 3].map((n) => `<option value="${n}">Terminal ${n}</option>`).join("")}</select>${key("Clear", 'data-terminal-clear="true"')}<span class="spacer"></span><small>Sample commands only</small></div><pre class="terminal" style="flex:1">${esc(output())}</pre><form class="terminal-form"><input aria-label="Terminal command" autocomplete="off" placeholder="help"><button class="primary" type="submit">Enter</button></form></div>`;
      $("select[aria-label=Device]", body).value = device;
      $("select[aria-label='Terminal session']", body).value = session;
      $("select[aria-label=Device]", body).onchange = (e) => {
        device = e.target.value;
        draw();
      };
      $("select[aria-label='Terminal session']", body).onchange = (e) => {
        session = +e.target.value;
        draw();
      };
      $("[data-terminal-clear]", body).onclick = () => {
        logs[device + session] = "";
        $("pre", body).textContent = "";
      };
      $("form", body).onsubmit = (e) => {
        e.preventDefault();
        const input = $("input", body),
          cmd = input.value.trim();
        const replies = {
          help: "Example commands: help, pwd, ls, git status, pnpm build, whoami, clear",
          pwd: device === "Studio PC" ? "D:/Projects/Northstar" : "/home/demo/northstar",
          ls: "README.md  src/  public/  docs/  changelog.csv",
          "git status": state.gitDirty
            ? "On branch main\nModified: src/App.tsx, src/gallery.css"
            : "On branch main\nWorking copy clean",
          "pnpm build":
            "[Simulated build]\n✓ TypeScript checked\n✓ Gallery bundle prepared\nNo command was executed.",
          whoami: "demo-user",
        };
        logs[device + session] +=
          "> " +
          cmd +
          "\n" +
          (replies[cmd] ||
            "This offline demo does not execute commands. Type help to see supported examples.") +
          "\n\n";
        if (cmd === "clear") logs[device + session] = "";
        $("pre", body).textContent = logs[device + session];
        input.value = "";
        $("pre", body).scrollTop = 100000;
      };
    };
    draw();
  }
  function renderRemote(body, id = "remote") {
    body.innerHTML = `<div class="padded"><div class="row"><h2 class="spacer">${id === "browser" ? "Companion browser" : id === "gui" ? "Application preview" : "Studio PC · Remote Desktop"}</h2><span class="badge">Interactive illustration</span></div><p class="muted">Choose an example app. Text stays in this demo desktop.</p><div class="remote-desktop"><button type="button" data-remote-app="Preview">${icon("external")} Preview</button><button type="button" data-remote-app="Editor">${icon("code")} Editor</button><button type="button" data-remote-app="Files">${icon("folder")} Files</button><div class="remote-app"><h3>Northstar preview</h3><p>The responsive gallery is ready for review.</p><small>Simulated desktop — no video stream or machine connection.</small></div></div><form class="row" style="margin:16px 0"><input aria-label="Text to paste into demo desktop" placeholder="Text to paste" style="flex:1"><button type="submit" class="primary">Paste text</button></form><div class="row">${key("Device terminal", 'data-open="devices"', "terminal")}${key("Computer Use", 'data-open="computer-use"', "touch")}</div></div>`;
    body.onclick = (e) => {
      const app = e.target.closest("[data-remote-app]")?.dataset.remoteApp;
      if (app)
        $(".remote-app", body).innerHTML =
          app === "Editor"
            ? `<h3>Example editor</h3><textarea rows="4" aria-label="Remote demo editor" style="width:100%">${esc(state.files["src/App.tsx"])}</textarea>`
            : app === "Files"
              ? `<h3>Project files</h3><p>README.md · src · docs · public</p>${key("Open project files", 'data-open="files"')}`
              : `<h3>Northstar preview</h3><img src="${art()}" alt="Example gallery" style="width:140px;float:right"><p>A portfolio for a small creative studio.</p>`;
    };
    $("form", body).onsubmit = (e) => {
      e.preventDefault();
      const text = $("form input", body).value;
      $(".remote-app", body).innerHTML =
        `<h3>Text received in the demo</h3><pre>${esc(text)}</pre><small>This does not use your system or a remote clipboard.</small>`;
    };
  }
  function renderSettings(body, page = "Appearance") {
    const tabs = [
      "Appearance",
      "Connections",
      "Usage",
      "History & data",
      "Updates",
      "My account",
      "Users & access",
    ];
    body.innerHTML = `<div class="files-shell"><nav class="tabs">${tabs.map((t) => `<button type="button" data-settings-tab="${t}" class="${t === page ? "active" : ""}">${t}</button>`).join("")}</nav><div class="padded settings-body"></div></div>`;
    const b = $(".settings-body", body);
    if (page === "Appearance")
      b.innerHTML = `<h2>Make it your workspace</h2><p class="muted">The demo uses AbyssDeck's own theme materials and icons.</p><div class="feature-grid">${Object.keys(
        finishes,
      )
        .map(
          (id) =>
            `<button type="button" class="feature-card" data-finish="${id}"><strong>${{ burgundy: "CRT · Burgundy", blue: "2000 · Blue", red: "2000 · Red", paper: "Organizer · Light", night: "Organizer · Dark", classic: "Classic · Dark" }[id]}</strong><small>${$("#finish").value === id ? "Selected" : "Apply theme"}</small></button>`,
        )
        .join(
          "",
        )}</div><div class="stack" style="margin-top:20px"><label>Interface text size<input type="range" min="12" max="18" value="14" aria-label="Interface text size" data-font-size></label><div class="row">${key("Toggle navigation", 'data-action="toggle-nav"')}${key("Toggle results", 'data-action="toggle-results"')}${key("Windows & dock", 'data-open="windows"')}</div>${key("Reset demo workspace", 'data-reset="true"', "refresh")}</div>`;
    if (page === "Connections")
      b.innerHTML = `<h2>Connections</h2><div class="grid">${["Codex · Studio PC", "GPT · Private client", "GitHub · demo/northstar"].map((t) => `<div class="card"><h3>${t}</h3><span class="badge">Fictional binding</span><p>No credentials or real accounts are present in this demo.</p></div>`).join("")}</div><div class="row" style="margin-top:20px">${key("Add a device", 'data-open="companion"', "plus")}${key("Bridge Doctor", 'data-open="doctor"', "check")}</div>`;
    if (page === "Usage")
      b.innerHTML = `<h2>Limits & credits</h2><label>Selected machine<select aria-label="Usage machine"><option>Studio PC</option><option>Linux Hub</option></select></label><div class="grid" style="margin-top:20px"><div class="card"><small>SESSION REMAINING</small><div class="metric" data-usage>76%</div><div class="progress"><span style="width:76%"></span></div><small>Example reset in 3 h 20 min</small></div><div class="card"><small>WEEKLY REMAINING</small><div class="metric">61%</div><small>Example account limits</small></div><div class="card"><small>CREDITS</small><div class="metric">120</div><small>Fictional balance</small></div></div><p class="notice" style="margin-top:18px">Usage is scoped to the selected machine in the product. These figures are static examples, not account or pricing information.</p>`;
    if (page === "History & data")
      b.innerHTML = `<h2>History & data</h2><div class="grid"><div class="card"><h3>History</h3><p>Keep conversations, source links and saved results together.</p>${key("Open history", 'data-open="history"')}</div><div class="card"><h3>Backups</h3><p>Latest three completed checkpoints. Review the example retention policy.</p>${key("Review backup", 'data-open="data"')}</div></div>`;
    if (page === "Updates")
      b.innerHTML = `<h2>Updates & diagnostics</h2><p>Review the affected component and preserve active work.</p><div class="row">${key("Review update", 'data-open="updates"', "refresh")}${key("Bridge Doctor", 'data-open="doctor"', "check")}${key("Companion", 'data-open="companion"', "server")}</div>`;
    if (page === "My account")
      b.innerHTML = `<h2>My account</h2><form class="stack"><label>Display name<input aria-label="Display name" value="${esc(state.name)}" required></label><label>Role<input value="Installation owner (demo)" readonly></label><button type="submit" class="primary">Save demo profile</button></form><div class="notice" style="margin-top:20px">No login, password or session token is stored in this demo. The real product manages private sessions and invited accounts.</div>`;
    if (page === "Users & access") {
      renderMembers(b);
    }
    body.onclick = (e) => {
      const tab = e.target.closest("[data-settings-tab]")?.dataset.settingsTab;
      if (tab) renderSettings(body, tab);
      const finish = e.target.closest("[data-finish]")?.dataset.finish;
      if (finish) {
        setFinish(finish);
        renderSettings(body, page);
      }
      if (e.target.closest("[data-reset]")) open("reset");
    };
    body.oninput = (e) => {
      if (e.target.hasAttribute("data-font-size"))
        document.documentElement.style.setProperty("--demo-text-size", e.target.value + "px");
    };
    const usage = $("select[aria-label='Usage machine']", body);
    if (usage)
      usage.onchange = () => {
        $("[data-usage]", body).textContent = usage.value === "Studio PC" ? "76%" : "92%";
      };
    const form = $("form", b);
    if (form && page === "My account")
      form.onsubmit = (e) => {
        e.preventDefault();
        state.name = $("input", form).value;
        toast("Demo profile updated.");
      };
  }
  function renderMembers(body) {
    body.innerHTML = `<h2>Members & access</h2><p class="muted">Roles apply to shared material, not to private machine access.</p>${state.members.map((m) => `<div class="file-row">${icon("person")}<span class="spacer">${esc(m.name)}</span><span class="badge">${esc(m.role)}</span></div>`).join("")}<form class="stack" style="margin-top:20px"><label>Invite a fictional member<input name="name" placeholder="Example name" required></label><label>Project role<select name="role"><option>Viewer</option><option>Collaborator</option></select></label><button type="submit" class="primary">Create demo invitation</button></form>`;
    $("form", body).onsubmit = (e) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      state.members.push({ name: data.get("name"), role: data.get("role") });
      record("Demo invitation created");
      renderMembers(body);
    };
  }
  function renderDiscussion(body, brainstorm = false) {
    body.innerHTML = `<div class="padded"><h2>${brainstorm ? "Northstar · Brainstorm" : "Studio · Team discussion"}</h2><p class="muted">${brainstorm ? "Collect ideas before deciding what becomes work." : "Shared discussion with private project context kept separate."}</p>${brainstorm ? state.ideas.map((idea, i) => `<div class="card" style="margin-bottom:12px"><p>${esc(idea.text)}</p><div class="row">${key("Vote · " + idea.votes, `data-vote="${i}"`)}${key("Save as note", `data-idea-note="${i}"`, "note-edit")}</div></div>`).join("") : `<div class="card"><strong>Jamie Chen</strong><p>The tablet layout looks good. Let's review the release notes next.</p></div>`}<div class="discussion-messages">${state.discussions.map((text) => `<div class="receipt"><strong>${esc(state.name)}</strong><p>${esc(text)}</p></div>`).join("")}</div><form class="stack" style="margin-top:20px"><label>${brainstorm ? "New idea" : "Message"}<textarea rows="3" required aria-label="Discussion message"></textarea></label><button type="submit" class="primary">${brainstorm ? "Add idea" : "Post in demo"}</button></form></div>`;
    $("form", body).onsubmit = (e) => {
      e.preventDefault();
      const value = $("textarea", body).value;
      if (brainstorm) state.ideas.push({ text: value, votes: 0 });
      else state.discussions.push(value);
      renderDiscussion(body, brainstorm);
    };
    body.onclick = (e) => {
      const vote = e.target.closest("[data-vote]");
      if (vote) {
        state.ideas[+vote.dataset.vote].votes++;
        renderDiscussion(body, brainstorm);
      }
      const note = e.target.closest("[data-idea-note]");
      if (note) {
        state.notes.push({
          title: "Brainstorm idea",
          body: state.ideas[+note.dataset.ideaNote].text,
        });
        toast("Idea saved to demo notes.");
        if (windowBody("notes")) renderNotes(windowBody("notes"));
      }
    };
  }
  function renderFormats(body) {
    const types = [
      "Text & code",
      "Markdown & books",
      "PDF & DOCX",
      "CSV / TSV / XLSX",
      "Images",
      "ZIP archives",
      "Audio & video",
      "DXF & CAD / 3D",
    ];
    body.innerHTML = `<div class="files-shell"><nav class="tabs">${types.map((t, i) => `<button type="button" data-format="${i}">${t}</button>`).join("")}</nav><div class="padded format-body"></div></div>`;
    const show = (n) => {
      $$("[data-format]", body).forEach((b) =>
        b.classList.toggle("active", +b.dataset.format === n),
      );
      const target = $(".format-body", body);
      if (n === 0 || n === 1)
        target.innerHTML = `<h2>${types[n]}</h2><p>Read the example document, then switch to editing in the same window.</p>${key("Open README.md", 'data-file="README.md"', "file")}<p class="notice" style="margin-top:18px">Production uses Monaco for desktop code, and CodeMirror for ordinary text, Markdown, tables and mobile fallback. TXT, Markdown, FB2 and EPUB support reading pages and speech. This self-contained demo uses a lightweight text editor.</p>`;
      if (n === 2)
        target.innerHTML = `<h2>Document pages</h2><p class="notice">Illustrated page layout, not a PDF or Word rendering engine. Production keeps PDF/DOCX document pages and supports PDF annotations; original files remain downloadable.</p><div class="card" style="max-width:400px;margin:20px auto;background:#fffdf8;color:#263b33;min-height:320px;padding:36px"><small>NORTHSTAR / RELEASE NOTES</small><h1 style="margin-top:40px">Gallery 1.2</h1><p>A responsive collection for every screen.</p><hr><p>One column on phones.<br>Two columns on tablets.<br>Three columns on desktop.</p><small>Sample document · page <span data-page-number>1</span> of 2</small></div><div class="gallery-controls">${key("Previous", 'data-page-step="-1"')}${key("Next", 'data-page-step="1"')}</div>`;
      if (n === 3)
        target.innerHTML = `<h2>Spreadsheet values</h2><p>Edit a table and export CSV. Original workbook structure is preserved by the production XLSX editor.</p>${key("Open editable table", 'data-open="tables"', "table-header")}`;
      if (n === 4)
        target.innerHTML = `<h2>Image gallery & markup</h2><p>Navigate two images, add marker strokes and download a new PNG.</p>${key("Open gallery", 'data-open="images"', "image")}`;
      if (n === 5)
        target.innerHTML = `<h2>Example archive contents</h2><p class="notice">This is an illustrated archive listing. The product inspects ZIP entries and saves extracted copies; this demo opens the bundled sample files.</p>${["README.md", "docs/release.md", "src/App.tsx"].map((f) => `<div class="file-row"><button type="button" data-file="${f}">${icon("file")}${f}</button></div>`).join("")}`;
      if (n === 6)
        target.innerHTML = `<h2>Audio & video</h2><p>Production uses in-app playback controls for supported browser media. Playback, original downloads and source links stay together.</p><div class="card"><h3>Sample playback controls</h3><input type="range" aria-label="Sample media position" min="0" max="90" value="0"><div class="row">${key("Play example", 'data-media="play"', "play")}<span data-time>0:00 / 1:30</span><span class="badge">Silent control simulation</span></div></div>`;
      if (n === 7)
        target.innerHTML = `<h2>Technical viewers</h2><p>DXF, STEP/IGES, STL, OBJ, 3MF and GLB/glTF have dedicated viewers in the product. They are viewers, not a full CAD editor.</p><div class="card" style="text-align:center"><svg viewBox="0 0 400 230" style="max-width:400px;width:100%" role="img" aria-label="Illustrated wireframe model"><g class="wireframe" transform="translate(200 115)" fill="none" stroke="currentColor" stroke-width="2"><path d="M-85 -50 35 -80 95 -25 -25 5Z M-85 -50v90l60 55V5 M95 -25v90L-25 95 M35 -80v90L-85 40 M35 10 95 65"/><path d="M-85 40-25 5 95 65" stroke-dasharray="4 5"/></g></svg><label>Illustration angle<input type="range" min="-45" max="45" value="0" aria-label="Model illustration angle" data-model-angle></label><small>Interactive wireframe illustration — no CAD parser is bundled.</small></div>`;
    };
    body.onclick = (e) => {
      const f = e.target.closest("[data-format]");
      if (f) show(+f.dataset.format);
      const step = e.target.closest("[data-page-step]");
      if (step) {
        const p = $("[data-page-number]", body);
        p.textContent = p.textContent === "1" ? "2" : "1";
      }
      if (e.target.closest("[data-media]")) {
        const b = e.target.closest("[data-media]");
        b.textContent = b.textContent.includes("Play") ? "Pause example" : "Play example";
        const pos = $("input[type=range]", body);
        pos.value = +pos.value + 15;
        $("[data-time]", body).textContent = "0:" + String(pos.value).padStart(2, "0") + " / 1:30";
      }
    };
    body.oninput = (e) => {
      if (e.target.hasAttribute("data-model-angle"))
        $(".wireframe", body).setAttribute(
          "transform",
          `translate(200 115) rotate(${e.target.value})`,
        );
      else if ($("[data-time]", body))
        $("[data-time]", body).textContent =
          `${Math.floor(e.target.value / 60)}:${String(e.target.value % 60).padStart(2, "0")} / 1:30`;
    };
    show(0);
  }
  function renderMisc(body, id) {
    body.classList.add("misc-body");
    const wrap = (html) => (body.innerHTML = `<div class="padded">${html}</div>`);
    if (id === "history") {
      wrap(
        `<h2>Conversations</h2><input type="search" class="searchbox" aria-label="Search conversations" placeholder="Find a conversation">${["Gallery, ready for every screen", "Plan the next release", "A story by the sea"].map((title, i) => `<div class="file-row" data-history-row="${esc(title.toLowerCase())}"><button type="button" data-chat-select="${i}">${icon("chat")}<span>${title}<small>${i === 2 ? "GPT" : "Codex"} · ${i === 0 ? "Current conversation" : "Previous conversation"}</small></span></button>${ib("pin", "Pin " + title, `data-pin="${i}"`)}</div>`).join("")}<div style="margin-top:20px">${key("Review conversation handoff", 'data-open="rotation"')}</div>`,
      );
      $("input", body).oninput = (e) =>
        $$("[data-history-row]", body).forEach(
          (el) => (el.hidden = !el.dataset.historyRow.includes(e.target.value.toLowerCase())),
        );
      body.onclick = (e) => {
        const p = e.target.closest("[data-pin]");
        if (p) {
          const id = p.dataset.pin;
          state.pins = state.pins.includes(id)
            ? state.pins.filter((x) => x !== id)
            : [...state.pins, id];
          p.style.background = state.pins.includes(id) ? "var(--soft)" : "";
          p.setAttribute("aria-pressed", String(state.pins.includes(id)));
        }
        const chat = e.target.closest("[data-chat-select]");
        if (chat) {
          state.client = chat.dataset.chatSelect === "2" ? "GPT" : "Codex";
          renderChat();
          renderHeader();
          toast("Opened the example " + state.client + " conversation.");
        }
      };
    }
    if (id === "projects") {
      wrap(
        `<h2>Create a project</h2><form class="stack"><label>Name<input required name="name" placeholder="Your demo project"></label><label>Machine<select name="machine"><option>Studio PC</option><option>Linux Hub</option></select></label><label>Working copy<input value="projects/new-project" name="path"></label><label>Repository (optional)<input name="repository" placeholder="demo/new-project"></label><button type="submit" class="primary">Create demo project</button></form><p class="notice" style="margin-top:15px">This adds a project to the demo navigation. No folder, account or GitHub repository is created.</p>`,
      );
      $("form", body).onsubmit = (e) => {
        e.preventDefault();
        const name = $("input[name=name]", body).value.trim();
        if (name && !state.projects.includes(name)) state.projects.push(name);
        state.project = name;
        renderNav();
        renderHeader();
        toast("Demo project created.");
      };
    }
    if (id === "reports") {
      wrap(
        `<h2>Project report</h2><span class="badge">Example digest</span><div class="report-copy" style="margin-top:18px"><p>Northstar's responsive gallery is ready for review.</p><ul><li>Two implementation tasks completed.</li><li>Release notes await publication.</li><li>Jamie reviewed the tablet layout.</li></ul></div>${key("Refresh example report", 'data-report="true"', "refresh")}${key("Open tasks", 'data-open="tasks"', "check")}`,
      );
      $("[data-report]", body).onclick = () => {
        $(".report-copy", body).innerHTML =
          `<p>${state.tasks.filter((t) => t.done).length} of ${state.tasks.length} demo tasks completed. ${state.notes.length} notes and ${state.commits.length} example commits are available.</p><p>Next: review the remaining release tasks.</p>`;
        record("Example project report prepared");
      };
    }
    if (id === "plan-review") {
      wrap(
        `<h2>Review plan execution</h2><p class="notice">Simulated task outcome. No plan is dispatched to an AI service.</p><pre>${esc(state.plans)}</pre><div class="card"><h3>Example result</h3><p>Gallery columns and navigation updated. The example build completed successfully.</p>${key("Accept result", 'data-plan-decision="Accepted"', "check")}${key("Request changes", 'data-plan-decision="Changes requested"', "edit")}<textarea aria-label="Review feedback" rows="3" placeholder="Optional feedback" style="width:100%;margin-top:15px"></textarea><div class="plan-receipt"></div></div>`,
      );
      body.onclick = (e) => {
        const decision = e.target.closest("[data-plan-decision]")?.dataset.planDecision;
        if (decision) {
          $(".plan-receipt", body).textContent = "Demo review: " + decision;
          record("Plan review: " + decision);
        }
      };
    }
    if (id === "capture") {
      wrap(
        `<h2>Capture a thought</h2><form class="stack"><label>Thought<textarea required rows="5" aria-label="Capture text" placeholder="Keep it here before it gets lost"></textarea></label><label>Save as<select><option>Note</option><option>Task</option><option>Discussion</option></select></label><button type="submit" class="primary">Save in demo</button></form>`,
      );
      $("form", body).onsubmit = (e) => {
        e.preventDefault();
        const text = $("textarea", body).value,
          kind = $("select", body).value;
        if (kind === "Note") state.notes.push({ title: text.slice(0, 40), body: text });
        if (kind === "Task") state.tasks.push({ title: text, done: false });
        if (kind === "Discussion") state.discussions.push(text);
        toast("Saved as a demo " + kind.toLowerCase() + ".");
        $("textarea", body).value = "";
        for (const win of ["notes", "tasks", "communication"]) {
          if (windows.has(win)) {
            windows.get(win).remove();
            windows.delete(win);
          }
        }
        renderDock();
      };
    }
    if (id === "batch") {
      wrap(
        `<h2>Select results to export</h2><form class="stack">${Object.keys(state.files)
          .map(
            (f) =>
              `<label><input type="checkbox" name="files" value="${esc(f)}" ${f.endsWith("md") ? "checked" : ""}> ${esc(f)}</label>`,
          )
          .join(
            "",
          )}<button type="submit" class="primary">Download text bundle</button></form><p class="notice" style="margin-top:15px">This demo creates one readable Markdown bundle. The production result-package workflow supports original file packages.</p>`,
      );
      $("form", body).onsubmit = (e) => {
        e.preventDefault();
        const files = new FormData(e.currentTarget).getAll("files");
        if (!files.length) return toast("Select at least one file.");
        download(
          "northstar-demo-bundle.md",
          files.map((f) => `# ${f}\n\n${state.files[f]}`).join("\n\n---\n\n"),
        );
      };
    }
    if (id === "spaces") {
      wrap(
        `<h2>Studio · Shared space</h2><p>One shared project, independent working copies and private conversations.</p><div class="grid"><div class="card"><h3>Northstar</h3><p>Shared files, plans and review material.</p>${key("Project files", 'data-open="files"')}</div><div class="card"><h3>People</h3><p>${state.members.length} example members. Project access does not grant host access.</p>${key("Members & roles", 'data-open="users"')}</div><div class="card"><h3>Collaboration</h3>${key("Discussion", 'data-open="communication"')}${key("Checkout sync", 'data-open="sync"')}</div><div class="card"><h3>Linked work</h3>${key("Consultations", 'data-open="links"')}${key("Bridge", 'data-open="bridge"')}</div></div>`,
      );
    }
    if (id === "activity" || id === "notifications") {
      wrap(
        `<h2>${id === "activity" ? "Project activity" : "Notifications"}</h2><nav class="tabs"><button type="button" class="active" data-notice-tab="events">Workspace events</button><button type="button" data-notice-tab="gpt">GPT answers</button></nav><div class="notice-list"></div><div style="margin-top:18px">${key("Mark all read", 'data-read="true"', "check")}${key("Review incoming work", 'data-open="intake"')}</div>`,
      );
      const draw = (gpt) =>
        ($(".notice-list", body).innerHTML = (
          gpt ? ["GPT prepared the release direction"] : state.notifications
        )
          .map(
            (t) =>
              `<div class="file-row">${icon("bell")}<span>${esc(t)}<small>Demo event · ${state.project}</small></span></div>`,
          )
          .join(""));
      body.onclick = (e) => {
        const tab = e.target.closest("[data-notice-tab]");
        if (tab) {
          $$("[data-notice-tab]", body).forEach((el) => el.classList.toggle("active", el === tab));
          draw(tab.dataset.noticeTab === "gpt");
        }
        if (e.target.closest("[data-read]")) {
          $(".notice-list", body).style.opacity = ".55";
          toast("Example notifications marked as read.");
        }
      };
      draw(false);
    }
    if (id === "users") {
      wrap('<div class="members"></div>');
      renderMembers($(".members", body));
    }
    if (id === "companion") {
      wrap(
        `<h2>Connect a device</h2><p class="muted">The Companion handles device integration, files, terminals and optional AI tools.</p><div class="stack">${["Sign in to your Hub account", "Verify the private device connection", "Choose project folders", "Check terminal and file access", "Connect optional Codex / GPT integrations"].map((t, i) => `<div class="card row"><span class="avatar">${i + 1}</span><span class="spacer">${t}</span><span data-setup-step="${i}" class="badge">Pending</span></div>`).join("")}</div><button type="button" class="primary" data-setup-next style="margin-top:20px">Simulate next setup step</button><p class="notice" style="margin-top:15px">No software is installed and no login is requested. Required real sign-in and OS permissions belong to the actual setup.</p>`,
      );
      let step = 0;
      $("[data-setup-next]", body).onclick = () => {
        if (step < 5) {
          $("[data-setup-step='" + step + "']", body).textContent = "Demo check ✓";
          step++;
        }
        if (step === 5) {
          $("[data-setup-next]", body).textContent = "Example device ready";
          $("[data-setup-next]", body).disabled = true;
        }
      };
    }
    if (id === "linux") {
      wrap(
        `<h2>Independent personal Linux</h2><span class="badge">Direction & readiness boundary</span><p style="margin-top:18px">An isolated personal environment for invited users: SSH/SFTP over VPN or Tailscale, persistent files, packages and bounded services. Codex is optional.</p><div class="notice">This direction is documented; provisioning, isolation acceptance and activation are separate work. This demo does not claim a ready public hosting service or install a container.</div><div class="grid" style="margin-top:18px"><div class="card"><h3>Member environment</h3><p>Own keys and resources. No access to the host, another user or management sockets.</p></div><div class="card"><h3>Installation owner</h3><p>Uses the existing full host connection, without a separate personal workspace.</p></div></div>${key("Explore device interface", 'data-open="devices"', "server")}`,
      );
    }
    if (id === "dictation") {
      wrap(
        `<h2>Dictation & reading</h2><p>Try the interaction with an example transcript. No microphone permission or speech service is requested.</p><label>Transcript<textarea rows="4" aria-label="Example transcript">Please review the release notes and summarize the next steps.</textarea></label><div class="row" style="margin:18px 0">${key("Insert into composer", 'data-transcript="true"', "microphone")}</div><label>Example reading voice<select><option>System voice</option><option>Private server voice</option></select></label><div class="notice" style="margin-top:18px">The product supports dictation and reading controls, including private speech configurations. Audio generation is not included in this offline edition.</div>`,
      );
      $("[data-transcript]", body).onclick = () => {
        state.draft = $("textarea", body).value;
        $("#prompt").value = state.draft;
        toast("Example transcript inserted into the composer.");
      };
    }
    if (id === "windows") {
      wrap(
        `<h2>A workspace that keeps its place</h2><p>On tablet and desktop, drag a window by its heading or resize it from the lower-right corner. Use <strong>−</strong> to park it in the vertical dock beside the navigation panel.</p><p>Window contents remain mounted. Demo window geometry and theme are remembered in this browser when storage is available.</p><div class="row">${key("Open notes", 'data-open="notes"', "note-edit")}${key("Open files", 'data-open="files"', "folder")}${key("Open devices", 'data-open="devices"', "terminal")}</div><p class="notice" style="margin-top:20px">Phones use full-size working windows. Parked windows return when switching to phone layout. The main panel dividers support dragging and keyboard arrows.</p>`,
      );
    }
    if (id === "about") {
      wrap(
        `<h1 class="brand">AbyssDeck</h1><p>A private workspace for AI conversations, real projects and connected machines.</p><div class="notice">Interactive English demonstration with fictional data. AI replies, terminals, remote desktops, GitHub writes and installation operations are simulations. No network connection, login or server is used.</div><h3 style="margin-top:22px">What really works here</h3><p>Navigation, themes, panels, window docking, local text editing, image annotations, CSV values, notes, task state and downloads work in your browser.</p><p>Refresh to reset fictional content. Theme and window geometry use namespaced local storage when available. Use Reset to clear these demo preferences.</p><div class="row">${key("Explore every feature area", 'data-open="explore"')}${key("Reset demo", 'data-open="reset"')}${key("License & source", 'data-open="license"')}</div>`,
      );
    }
    if (id === "reset") {
      wrap(
        `<h2>Reset the demo?</h2><p>This clears this visit's demo edits, open windows and demo-only preferences. It does not touch any other site's storage or AbyssDeck installation.</p><button type="button" class="primary" data-confirm-reset>Reset demo workspace</button>`,
      );
      $("[data-confirm-reset]", body).onclick = () => {
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith(prefix))
            .forEach((k) => localStorage.removeItem(k));
        } catch {}
        state = initial();
        for (const prop of ["--demo-text-size", "--nav-width", "--results-width"])
          document.documentElement.style.removeProperty(prop);
        $("#deck").classList.remove("results-closed", "phone-results", "nav-closed");
        if (innerWidth <= 760) $("#deck").classList.add("nav-closed");
        $("select[aria-label='Work mode']").value = "Work";
        $("select[aria-label='Reasoning effort']").value = "Medium";
        setPhoneTab(false);
        for (const key of Object.keys(drafts)) delete drafts[key];
        for (const w of windows.values()) w.remove();
        windows.clear();
        setFinish("burgundy");
        $("#prompt").value = "";
        $("#attachment-label").textContent = "";
        renderNav();
        renderHeader();
        renderChat();
        renderResults();
        renderDock();
        toast("Demo workspace reset.");
      };
    }
    if (id === "license") {
      wrap(
        `<h2>License & source</h2><p>AbyssDeck and this demo are licensed under AGPL-3.0-only. The standalone file contains original inline SVG illustrations and the project's own theme/icon definitions. System fonts are used; no font files or third-party libraries are embedded.</p><p><a href="https://github.com/EriArk/abyssdeck/tree/main/demo" target="_blank" rel="noopener noreferrer">Demo source on GitHub ↗</a></p><p><a href="https://github.com/EriArk/abyssdeck/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">Read the project license ↗</a></p><p class="notice">These links open only when you choose them. Running the demo does not request any external resources.</p>`,
      );
    }
  }
  function open(id) {
    if (id === "codex" || id === "gpt") {
      state.client = id === "gpt" ? "GPT" : "Codex";
      renderChat();
      renderHeader();
      return;
    }
    if (id === "results") {
      if (innerWidth <= 760) setPhoneTab(true);
      else $("#deck").classList.remove("results-closed");
      return;
    }
    const title =
      FEATURES.find((f) => f[0] === id)?.[2] ||
      {
        explore: "Explore AbyssDeck",
        about: "About this demo",
        reset: "Reset demo",
        license: "License & source",
        "plan-review": "Plan review",
      }[id] ||
      id;
    const settingsPages = { connections: "Connections", usage: "Usage", account: "My account" };
    const w = openWindow(id, title, (body) => {
      if (FLOWS[id]) return renderFlow(body, id);
      if (id === "explore" || id === "help" || id === "search")
        return renderExplore(body, id === "search");
      if (id === "files") return renderFiles(body);
      if (id === "viewer") {
        body.dataset.file = state.file;
        return renderViewer(body);
      }
      if (id === "images") return renderImages(body);
      if (id === "tables") return renderTable(body);
      if (id === "formats") return renderFormats(body);
      if (id === "git") return renderGit(body);
      if (id === "issues") return renderIssues(body);
      if (["notes", "core", "plans"].includes(id)) return renderNotes(body, id);
      if (id === "tasks") return renderTasks(body);
      if (id === "devices") return renderDevices(body);
      if (["remote", "browser", "gui"].includes(id)) return renderRemote(body, id);
      if (id === "settings" || settingsPages[id])
        return renderSettings(body, settingsPages[id] || "Appearance");
      if (id === "communication" || id === "brainstorm")
        return renderDiscussion(body, id === "brainstorm");
      renderMisc(body, id);
    });
    if (id === "viewer" && windowBody(id).dataset.file !== state.file) {
      windowBody(id).dataset.file = state.file;
      renderViewer(windowBody(id));
    }
    w.dataset.closed = "false";
    if (innerWidth <= 760) $("#deck").classList.add("nav-closed");
  }
  function setPhoneTab(results) {
    $("#deck").classList.toggle("phone-results", results);
    $$(".phone-tabs button").forEach((b) =>
      b.setAttribute("aria-pressed", String((b.dataset.action === "phone-results") === results)),
    );
  }
  function fileMenu(button, file) {
    menu(button, [
      [
        "Open",
        "file",
        () => {
          state.file = file;
          open("viewer");
        },
      ],
      ["Download", "download", () => download(file.split("/").at(-1), state.files[file] || "")],
      [
        "Rename",
        "edit",
        () =>
          editName("Rename file", file.split("/").at(-1), (name) => {
            const next = file.split("/").slice(0, -1).concat(name).join("/");
            if (next !== file && next in state.files)
              return toast("A file with that name already exists.");
            if (next !== file) {
              state.files[next] = state.files[file];
              delete state.files[file];
            }
            state.file = next;
            if (windowBody("files")) renderFiles(windowBody("files"));
            toast("Renamed the demo file.");
          }),
      ],
      ["Share", "link", () => open("sharing")],
    ]);
  }
  function menu(button, items) {
    $(".menu-pop")?.remove();
    const m = document.createElement("div");
    m.className = "menu-pop";
    m.setAttribute("role", "menu");
    m.innerHTML = items
      .map(
        ([name, i], n) =>
          `<button type="button" role="menuitem" data-menu-item="${n}">${icon(i)}${esc(name)}</button>`,
      )
      .join("");
    document.body.append(m);
    const rect = button.getBoundingClientRect();
    m.style.left = Math.max(5, Math.min(rect.left, innerWidth - m.offsetWidth - 8)) + "px";
    m.style.top = Math.max(5, Math.min(rect.bottom + 4, innerHeight - m.offsetHeight - 8)) + "px";
    m.onclick = (e) => {
      const b = e.target.closest("[data-menu-item]");
      if (b) {
        items[+b.dataset.menuItem][2]();
        m.remove();
      }
    };
    $("button", m).focus();
  }
  document.addEventListener("click", (e) => {
    const target = e.target.closest("button");
    if (!target) {
      if (!e.target.closest(".menu-pop")) $(".menu-pop")?.remove();
      return;
    }
    if (target.dataset.open) {
      const index = target.closest('.demo-window[data-id="explore"]');
      if (index) {
        index.hidden = true;
        index.dataset.closed = "true";
      }
      open(target.dataset.open);
    }
    if (target.dataset.restore) {
      const w = windows.get(target.dataset.restore);
      if (w) {
        w.hidden = false;
        focusWindow(w);
        renderDock();
      }
    }
    if (target.dataset.project) {
      state.project = target.dataset.project;
      renderNav();
      renderHeader();
      if (innerWidth <= 760) $("#deck").classList.add("nav-closed");
    }
    if (target.dataset.resultTab) {
      state.resultTab = target.dataset.resultTab;
      renderResults();
    }
    if (target.dataset.file) {
      state.file = target.dataset.file;
      open("viewer");
    }
    if (target.dataset.fileMenu) fileMenu(target, target.dataset.fileMenu);
    if (target.dataset.image !== undefined) {
      imageIndex = +target.dataset.image;
      open("images");
      renderImages(windowBody("images"));
    }
    if (target.dataset.imageMenu !== undefined)
      menu(target, [
        [
          "Open gallery",
          "image",
          () => {
            imageIndex = +target.dataset.imageMenu;
            open("images");
          },
        ],
        ["Share", "link", () => open("sharing")],
      ]);
    if (target.dataset.linkMenu)
      menu(target, [
        ["Open source", "external", () => open("issues")],
        [
          "Go to message",
          "chat",
          () => {
            $("#chat-feed").scrollTop = 0;
            setPhoneTab(false);
            toast("Source message selected in the demo conversation.");
          },
        ],
      ]);
    const action = target.dataset.action;
    if (action === "toggle-nav") $("#deck").classList.toggle("nav-closed");
    if (action === "toggle-results") $("#deck").classList.toggle("results-closed");
    if (action === "phone-chat") setPhoneTab(false);
    if (action === "phone-results") setPhoneTab(true);
    if (action === "new-chat") {
      state.messages[state.client] = [];
      state.draft = "";
      $("#prompt").value = "";
      renderChat();
      toast("A fresh scripted example conversation is ready.");
    }
    if (action === "attach") {
      state.attachment = "docs/release.md";
      $("#attachment-label").textContent = "release.md attached";
    }
    if (action === "upload") $("#file-input").click();
    if (action === "download-current")
      download(state.file.split("/").at(-1), state.files[state.file] || "");
  });
  $("#file-input").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast("Use a text sample under 2 MB in this lightweight demo.");
      return;
    }
    const path = state.folder + file.name;
    if (path in state.files) {
      toast("That demo filename already exists. Rename the sample first.");
      return;
    }
    state.files[path] = await file.text();
    state.file = path;
    if (windowBody("files")) renderFiles(windowBody("files"));
    toast("Text file loaded locally. Nothing was uploaded to a server.");
    e.target.value = "";
  };
  $("#composer").onsubmit = (e) => {
    e.preventDefault();
    const text = $("#prompt").value.trim();
    if (!text) return;
    state.messages[state.client].push({
      role: "user",
      text: text + (state.attachment ? "\n\nAttached demo file: " + state.attachment : ""),
    });
    const lower = text.toLowerCase();
    const response =
      lower.includes("test") || lower.includes("build")
        ? "Example build review: the gallery bundle is ready. Open Devices and type `pnpm build` to inspect the simulated terminal output."
        : lower.includes("file") || lower.includes("release")
          ? "I've prepared the example release notes in docs/release.md. Open Files to read or edit the demo copy, then review the changes in Git."
          : state.client === "GPT"
            ? "For this example, let's keep the direction simple: show the work, preserve useful context and turn the reviewed idea into a scoped implementation request. Open Prepare for Codex to explore the handoff."
            : "In this scripted example, the gallery is updated and ready to inspect. You can explore the files, results and Git review. This reply is a demo sample, not an AI response to your message.";
    const mode = $("select[aria-label='Work mode']").value;
    const effort = $("select[aria-label='Reasoning effort']").value;
    state.messages[state.client].push({
      role: "assistant",
      text:
        (mode === "Plan"
          ? "Example plan: inspect the gallery, check phone and tablet layouts, then review the release notes. Open Plans to adjust the steps. No files were changed."
          : response) +
        "\n\nDemo settings: " +
        mode +
        " / " +
        effort +
        " effort.",
    });
    state.draft = "";
    state.attachment = "";
    $("#prompt").value = "";
    $("#attachment-label").textContent = "";
    renderChat();
    $("#chat-feed").scrollTop = $("#chat-feed").scrollHeight;
    record("Demo " + state.client + " reply ready");
  };
  $("#prompt").oninput = (e) => (state.draft = e.target.value);
  $("#model").onchange = (e) => {
    state.client = e.target.value;
    renderChat();
    renderHeader();
  };
  $("#finish").onchange = (e) => setFinish(e.target.value);
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      open("search");
    }
    if (e.key === "Escape") {
      const menu = $(".menu-pop");
      if (menu) {
        menu.remove();
        return;
      }
      const top = [...windows.values()]
        .filter((w) => !w.hidden)
        .sort((a, b) => +b.style.zIndex - +a.style.zIndex)[0];
      if (top) {
        top.hidden = true;
        top.dataset.closed = "true";
        renderDock();
      }
    }
  });
  window.addEventListener("resize", () => {
    for (const w of windows.values()) {
      if (innerWidth <= 760 && w.hidden && w.dataset.closed === "false") w.hidden = false;
      if (!w.hidden) constrain(w);
    }
    renderDock();
  });
  setFinish(storage.read("finish", "burgundy"));
  renderNav();
  renderHeader();
  renderChat();
  renderResults();
  $("[data-action=attach]").innerHTML = icon("plus");
  $("[data-open=dictation]").innerHTML = icon("microphone");
  if (innerWidth <= 760) $("#deck").classList.add("nav-closed");
  split($("#nav-splitter"), document.documentElement, "--nav-width", 170, () =>
    Math.min(330, innerWidth * 0.32),
  );
  split(
    $("#results-splitter"),
    document.documentElement,
    "--results-width",
    230,
    () => Math.min(520, innerWidth * 0.45),
    true,
  );
})();
