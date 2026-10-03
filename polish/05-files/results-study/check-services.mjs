import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit, expect } from '@playwright/test';

const out='polish/05-files/results-study';
for(const type of [chromium,webkit]){
  const browser=await type.launch(),page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(pathToFileURL(resolve('.local/results-study-preview.html')).href);
    const root=page.frameLocator('iframe').locator('#cw-results-study');
    for(const width of [320,390,736])for(const theme of ['green','2000','organizer','dark'])for(const category of ['links','demos']){
      await page.setViewportSize({width,height:1000});
      await root.evaluate((node,state)=>node.ownerDocument.defaultView.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:{privateContent:state}}}})),{theme,category});
      const card=root.locator('.rs-service'),details=card.locator('[data-action="toggle-service"]'),menu=card.locator('.rs-item-menu');
      await details.click();
      await expect(details).toHaveAttribute('aria-expanded','true');
      await card.getByRole('button',{name:'Действия с результатом',exact:true}).click();
      await expect(menu).toBeVisible();
      await expect(details).toHaveAttribute('aria-expanded','true');
      const bounds=await root.boundingBox(),popup=await menu.boundingBox();
      const row=await card.locator('.rs-service-row').boundingBox(), key=await card.locator('[data-action="menu"]').boundingBox();
      assert.ok(Math.abs(key.y+key.height/2-row.y-row.height/2)<1,'Menu centered beside the title row');
      assert.ok(popup.x>=bounds.x && popup.x+popup.width<=bounds.x+bounds.width,'Menu within panel');
      assert.ok(await root.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
      if(type===webkit&&(width===390||width===736&&theme==='green')){
        const name=`${width}-${theme}-${category}`;
        await root.screenshot({path:`${out}/${name}.png`});
        await writeFile(`${out}/${name}.md`,`# ${category==='links'?'Ссылка':'HTML-демо'} — ${theme}, ${width} px\n\nОбновлённый эскиз: тонкая рамка и подложка карточки, раскрытое содержимое и отдельное меню «⋯» сбоку справа, на линии названия. «К сообщению» перенесено в меню. WebKit, примерные данные; production не менялся.\n`);
      }
      await menu.getByRole('button',{name:'К сообщению',exact:true}).click();
      await expect(root.getByRole('status')).toContainText(category==='links'?'Обсуждение интерфейса':'Эскиз результатов');
      await expect(details).toHaveAttribute('aria-expanded','true');
      await root.getByRole('button',{name:'Закрыть уведомление'}).click();
    }
    // Shared action builder retains all image actions.
    await root.evaluate(node=>node.ownerDocument.defaultView.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:{privateContent:{category:'images'}}}}})));
    await root.locator('.rs-image').first().getByRole('button',{name:'Действия с результатом',exact:true}).click();
    await expect(root.locator('.rs-item-menu:visible button')).toHaveCount(3);
    assert.deepEqual(errors,[]);
    console.log(`${type.name()}: links/demo disclosure and menus, exact source, 4 themes x 3 widths passed`);
  }finally{await browser.close();}
}
