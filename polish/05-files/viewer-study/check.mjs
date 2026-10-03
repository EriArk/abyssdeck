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
  // Empty text is a draft too. View/edit never opens another shell or restores the original.
  await root.getByRole('textbox',{name:'Черновик копии'}).fill('');
  await root.getByRole('button',{name:'Просмотр',exact:true}).click();
  await expect(root.locator('.vs-book')).toHaveText('');
  await root.getByRole('button',{name:'Правка',exact:true}).click();
  const input=root.getByRole('textbox',{name:'Черновик копии'});
  await expect(input).toHaveValue('');
  await input.fill('Слово');await input.selectText();
  await root.getByRole('button',{name:'Полужирный',exact:true}).click();
  await expect(input).toHaveValue('**Слово**');
  await root.getByRole('button',{name:'Отменить изменение',exact:true}).click();
  await expect(input).toHaveValue('Слово');
  await root.getByRole('button',{name:'Повторить изменение',exact:true}).click();
  await expect(input).toHaveValue('**Слово**');
  await root.getByRole('button',{name:'Закрыть свойства',exact:true}).click();
  await page.setViewportSize({width:780,height:1100});
  if(engine==='webkit')await root.screenshot({path:`${out}/edit-markdown.png`});
  await root.getByRole('button',{name:'Предыдущий файл',exact:true}).click();
  await root.getByRole('button',{name:'Предыдущий файл',exact:true}).click();
  await root.getByRole('button',{name:'Редактировать копию',exact:true}).click();
  const draw=async()=>{
   const box=await root.locator('.vs-annotation > svg').boundingBox();
   await page.mouse.move(box.x+box.width*.2,box.y+box.height*.3);
   await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.4,{steps:8});await page.mouse.up();
  };
  await draw();await expect(root.locator('.vs-annotation path')).toHaveCount(1);
  await root.getByRole('button',{name:'Просмотр',exact:true}).click();
  await expect(root.locator('.vs-annotation path')).toHaveCount(1);
  await root.getByRole('button',{name:'Правка',exact:true}).click();
  await root.getByRole('button',{name:'Отменить изменение',exact:true}).click();
  await expect(root.locator('.vs-annotation path')).toHaveCount(0);
  await root.getByRole('button',{name:'Повторить изменение',exact:true}).click();
  await expect(root.locator('.vs-annotation path')).toHaveCount(1);
  if(engine==='webkit')await root.screenshot({path:`${out}/edit-image.png`});
  await root.getByRole('button',{name:'Следующий файл',exact:true}).click();
  await root.getByRole('button',{name:'Редактировать копию',exact:true}).click();
  await draw();
  await root.getByRole('button',{name:'Следующая страница',exact:true}).click();
  await expect(root.locator('.vs-annotation path')).toHaveCount(0);
  await root.getByRole('button',{name:'Предыдущая страница',exact:true}).click();
  await expect(root.locator('.vs-annotation path')).toHaveCount(1);
  if(engine==='webkit')await root.screenshot({path:`${out}/edit-document.png`});
  await root.getByRole('button',{name:'Следующий файл',exact:true}).click();
  await root.getByRole('button',{name:'Правка',exact:true}).click();
  await expect(input).toHaveValue('**Слово**');
  for(const width of [780,390,320])for(const theme of ['green','2000','organizer','dark']){
   await page.setViewportSize({width,height:1100});
   await root.evaluate((el,t)=>el.ownerDocument.defaultView.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:{privateContent:{theme:t,index:2}}}}})),theme);
   assert.ok(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   assert.equal(await root.locator('.vs-case').count(),1);
   if(engine==='webkit'&&width===390&&theme==='green')await root.screenshot({path:`${out}/edit-phone.png`});
  }
  assert.deepEqual(errors,[]);console.log(`${engine}: themes, layout, modes, empty draft, Markdown undo, image drawing and per-page annotations passed`);
 }finally{await browser.close();}
}
