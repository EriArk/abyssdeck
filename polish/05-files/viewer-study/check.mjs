import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit, expect } from '@playwright/test';
const out='polish/05-files/viewer-study';
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch(),page=await browser.newPage({viewport:{width:780,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(pathToFileURL(resolve('.local/viewer-study-preview.html')).href);
  const frame=page.frameLocator('iframe'),root=frame.locator('#cw-viewer-study');
  await expect(root.locator('img')).toBeVisible();
  await expect.poll(()=>root.locator('img').evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);
  for(const width of [780,390])for(const theme of ['green','2000','organizer','dark']){
   await page.setViewportSize({width,height:1100});
   await root.evaluate((el,t)=>el.ownerDocument.defaultView.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:{privateContent:{theme:t,index:0}}}}})),theme);
   await expect(root.locator('.vs-case')).toHaveAttribute('data-theme',theme);
   assert.ok(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await root.getByRole('button',{name:'Свойства файла',exact:true}).click();
   await expect(root.getByRole('complementary')).toBeVisible();
   await root.getByRole('button',{name:'Закрыть свойства',exact:true}).click();
   if(engine==='webkit'&&(width===780||theme==='green')){
    const name=`${width<500?'phone':'wide'}-${theme}`;
    await root.screenshot({path:`${out}/${name}.png`});
    await writeFile(`${out}/${name}.md`,`# Предложение просмотрщика — ${theme}, ${width}px\n\nЭскиз компоновки, не установленный интерфейс. Перелистывание файлов, инструменты формата и компактные действия внутри общего корпуса. WebKit.\n`);
   }
  }
  await root.getByRole('button',{name:'Следующий файл',exact:true}).click();
  await expect(root.locator('.vs-sheet h2')).toHaveText('Общий просмотрщик');
  await root.getByRole('button',{name:'Следующая страница',exact:true}).click();
  await expect(root.locator('.vs-sheet h2')).toHaveText('Содержимое');
  await root.getByRole('button',{name:'Следующий файл',exact:true}).click();
  await expect(root.locator('.vs-book')).toContainText('Глава первая');
  await root.getByRole('button',{name:'Исходный текст',exact:true}).click();
  await expect(root.locator('.vs-screen pre')).toContainText('# Глава первая');
  await root.getByRole('button',{name:'Редактировать копию',exact:true}).click();
  await root.getByRole('textbox',{name:'Черновик копии'}).fill('Сохраняемый черновик');
  await root.getByRole('button',{name:'Свойства файла',exact:true}).click();
  await expect(root.getByRole('textbox',{name:'Черновик копии'})).toHaveValue('Сохраняемый черновик');
  await root.getByRole('button',{name:'Закрыть просмотр',exact:true}).click();
  await expect(root.locator('.vs-case')).toBeHidden();
  await root.getByRole('button',{name:/Открыть просмотр/}).click();
  await expect(root.getByRole('textbox',{name:'Черновик копии'})).toHaveValue('Сохраняемый черновик');
  assert.deepEqual(errors,[]);console.log(`${engine}: themes, narrow/wide, files/pages, properties, source and draft passed`);
 }finally{await browser.close();}
}
