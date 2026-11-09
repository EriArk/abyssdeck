import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";
for (const type of [chromium, webkit]) {
  const origin = "http://127.0.0.1:18937", f = await handoffFixture(origin);
  f.store.setPreferences({projectId:"project", threadId:f.thread.id, view:"chat", theme:"crt-green"});
  const browser = await type.launch(), context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:"block",reducedMotion:"reduce"});
  try {
    await f.app.listen({port:18937,host:"127.0.0.1"});
    const [name,value]=f.headers.cookie.split("=");
    await context.addCookies([{name,value,url:origin,httpOnly:true}]);
    await context.addInitScript(() => {
      window.remoteUrls = [];
      window.remoteConnections = 0;
      window.remoteDisconnections = 0;
      window.Guacamole = {
        WebSocketTunnel: class {
          constructor(url) {
            window.remoteUrls.push(url);
          }
        },
        Keyboard: class {
          reset() {}
        },
        Client: class {
          constructor() {
            const canvas = document.createElement("canvas");
            canvas.width = 1280;
            canvas.height = 720;
            canvas.getContext("2d").fillRect(0, 0, 1280, 720);
            this.display = {
              getElement: () => canvas,
              getWidth: () => 1280,
              getHeight: () => 720,
              scale: () => {},
              showCursor: () => {},
              flatten: () => canvas,
              flush: (fn) => fn(),
            };
          }
          getDisplay() {
            return this.display;
          }
          sendMouseState() {}
          sendKeyEvent() {}
          connect() {
            window.remoteConnections++;
            setTimeout(() => {
              this.onstatechange?.(3);
              this.onsync?.();
            }, 0);
          }
          disconnect() {
            window.remoteDisconnections++;
          }
        },
      };
    });

    const page=await context.newPage(), errors=[];
    page.on("pageerror", e=>errors.push(e.message));
    await page.route(/\/api\/projects(?:\?|$)/,async route=>{
      const response=await route.fetch(),data=await response.json();
      for(const project of data.projects)project.remoteAvailable=true;
      await route.fulfill({response,json:data});
    });
    await page.route(/\/api\/machines(?:\?|$)/,async route=>{
      const response=await route.fetch(),data=await response.json();
      for(const machine of data.machines)machine.type="ssh-linux";
      await route.fulfill({response,json:data});
    });
    await page.goto(origin);
    const editor=page.getByRole("textbox",{name:"Сообщение Codex"});
    await expect(editor).toBeVisible();await editor.fill("Черновик Linux остаётся");
    await editor.evaluate(el=>window.originalEditor=el);
    const button=name=>page.getByRole("button",{name,exact:true}).filter({visible:true}).first();
    await mkdir(".local/qa-linux-remote",{recursive:true});
    for(const width of [390,1366]){
      await page.setViewportSize({width,height:844});
      if(!(await button("Настройки").isVisible()))await button("Открыть проекты").click();
      await button("Открыть Remote").click();
      const remote=page.getByRole("dialog",{name:"Remote ПК",exact:true});
      await expect(remote.getByText("Подключено",{exact:true})).toBeVisible();
      assert.equal(await page.evaluate(()=>new URL(window.remoteUrls.at(-1)).pathname),"/api/projects/project/remote");
      await page.screenshot({path:`.local/qa-linux-remote/${type.name()}-${width}.png`});
      await remote.getByRole("button",{name:"Свернуть Remote",exact:true}).click();
      await expect(remote).toHaveCount(0);await expect(editor).toHaveValue("Черновик Linux остаётся");
      assert(await editor.evaluate(el=>el===window.originalEditor));
    }
    assert.deepEqual(errors,[]);
    console.log(type.name()+": Linux Remote selection, phone/desktop and mounted draft verified");
  } finally {await browser.close();await f.close();}
}
