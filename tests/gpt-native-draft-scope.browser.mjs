import assert from "node:assert/strict";
import { chromium, webkit } from "@playwright/test";
import { nativeControl } from "../ops/gpt-native/renderer-control.mjs";

// Native document cards and the message composer share the textbox role.
// Exercise actual DOM selection in both browser engines, without a native send.
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<main>
      ${Array.from({ length: 3 }, (_, i) => `<article><div role="textbox" contenteditable="true"><h1>Resume ${i}</h1><p>Completed document</p></div></article>`).join("")}
      <section data-composer-body><div role="textbox" contenteditable="true"><p><br></p></div></section>
    </main>`);
    const result = await page.evaluate(async (source) => {
      const control = (0, eval)(`(${source})`);
      const summary = { schemaVersion: 1, window: { route: { kind: "chatgpt-thread", threadId: "chat" }, thread: { kind: "chatgpt", id: "chat" } } };
      const actions = [], read = async () => ({ accountFingerprint: "bound" });
      const load = async () => ({ M9: { appActions: { runInPrimaryWindow: async ({ action }) => { actions.push(action.type); return summary; } } } });
      const run = () => control({ operation: "selectConversation", conversationId: "chat", accountFingerprint: "bound" }, read, load);
      const documents = [...document.querySelectorAll("article")].map((el) => el.innerHTML);
      const first = await run(), second = await run();
      const editor = document.querySelector("[data-composer-body] [contenteditable]");
      editor.textContent = "A real private draft";
      let draftError;
      try { await run(); } catch (e) { draftError = e.message; }
      const preserved = editor.textContent;
      editor.textContent = "";
      const attachment = document.createElement("button");
      attachment.setAttribute("aria-label", "Remove private.png");
      attachment.hidden = true;
      editor.parentElement.append(attachment);
      let fileError;
      try { await run(); } catch (e) { fileError = e.message; }
      return { first, second, draftError, fileError, preserved, navigations: actions.filter((a) => a === "windows.show_thread").length,
        documentsUnchanged: JSON.stringify(documents) === JSON.stringify([...document.querySelectorAll("article")].map((el) => el.innerHTML)) };
    }, nativeControl.toString());
    assert.equal(result.first.hasDraft, false);
    assert.equal(result.second.composerReady, true);
    assert.equal(result.draftError, "NATIVE_DRAFT_PRESENT");
    assert.equal(result.fileError, "NATIVE_DRAFT_PRESENT");
    assert.equal(result.preserved, "A real private draft");
    assert.equal(result.navigations, 2);
    assert.equal(result.documentsUnchanged, true);
    console.log(`${name}: editable documents ignored; consecutive admission and real draft/attachment protection pass; no sends`);
  } finally { await browser.close(); }
}
