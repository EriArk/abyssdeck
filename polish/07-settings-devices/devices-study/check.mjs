import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium,webkit,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const out='polish/07-settings-devices/devices-study',cases=[];
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch();
 try{
  const page=await browser.newPage({viewport:{width:1060,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(resolve('.local/devices-study-preview.html')).href);
  const root=page.frameLocator('iframe').locator('#cw-devices-study'),q=s=>root.locator(s);
  await expect(q('.dw-header svg').first()).toBeVisible();
  const action=async a=>q(`[data-action="${a}"]`).filter({visible:true}).first().click();
  async function state(theme,device='server',offline=false,view='terminal'){
   await root.evaluate((_,v)=>window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:{privateContent:v,modelContent:{view:v.view}}}}})),{theme,device,offline,collapsed:false,width:220,view});
  }
  async function shot(name,description){if(engine!=='chromium')return;await root.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));await root.screenshot({animations:'disabled',path:`${out}/${name}.png`});await writeFile(`${out}/${name}.md`,`# ${description}\n\n![${description}](${name}.png)\n\nИнтерактивный эскиз «Устройств», демонстрационные данные. Chromium; реальные команды и сетевые обращения отсутствуют. Это не установленный интерфейс и не проверка физического устройства.\n\n[Описание и границы](README.md).\n`);}
  for(const theme of ['green','2000','organizer','dark']){
   for(const width of [1060,768,390,320]){
    await page.setViewportSize({width,height:1000});await state(theme);
    await expect.poll(()=>root.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    await expect.poll(()=>q('.dw-case').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    for(const selector of ['.dw-header','.dw-machine-row','.dw-terminal-head','.dw-keys']){
     const bounds=await q(selector).evaluate(el=>({w:el.clientWidth,s:el.scrollWidth}));assert.ok(bounds.s<=bounds.w+1,`${theme}/${width}: ${selector} overflows`);
    }
    await q('button[data-menu="machines"]').click();await expect(q('.dw-popover')).toBeVisible();
    await q('[data-device="workspace"]').click();await expect(q('.dw-machine-label')).toContainText('Моё серверное окружение');
    await q('button[data-menu="device"]').click();await expect(q('.dw-popover')).toContainText('Питание управляется сервером');await page.keyboard.press('Escape');
    await q('button[data-menu="machines"]').click();await q('[data-device="server"]').click();
    if(width===1060)await shot(`${theme}-wide`,'Устройства · '+theme+' · планшет');
    if(width===390)await shot(`${theme}-phone`,'Устройства · '+theme+' · телефон');
    cases.push({engine,theme,width,actualWidth:await root.evaluate(e=>e.clientWidth),overflow:false});
   }
  }
  await page.setViewportSize({width:390,height:900});await state('green');
  await action('input');await q('.dw-input input').fill('sample draft');
  await q('button[data-menu="machines"]').click();await q('[data-device="pc"]').click();await action('new');
  await q('button[data-menu="machines"]').click();await q('[data-device="server"]').click();await action('input');await expect(q('.dw-input input')).toHaveValue('sample draft');
  await action('input-close');await q('button[data-menu="machines"]').click();await q('[data-device="pc"]').click();await expect(q('.dw-session')).toContainText('PowerShell 2');
  await q('[data-page="system"]').click();await q('button[data-menu="machines"]').click();await q('[data-device="server"]').click();await expect(q('.dw-aperture')).toHaveAttribute('data-page','terminal');
  await q('button[data-menu="machines"]').click();await q('[data-device="pc"]').click();await expect(q('.dw-aperture')).toHaveAttribute('data-page','system');
  await state('green');await action('password');await q('.dw-input input').fill('demo');await action('input-close');await action('password');await expect(q('.dw-input input')).toHaveValue('');await action('input-close');
  await action('input');await action('paste');await expect(q('.dw-input input')).toHaveValue('pwd');await action('dismiss');await shot('phone-input','Ввод команды · телефон');await q('[data-action="submit-input"]').click();await expect(q('.dw-output')).toContainText('выполнение отключено');await action('dismiss');await action('input-close');
  await q('button[data-menu="device"]').click();await shot('phone-menu','Действия машины · телефон');await action('restart');await expect(q('.dw-dialog h3')).toHaveText('Перезагрузить · Сервер');await shot('phone-confirmation','Подтверждение действия · телефон');await action('cancel');
  await q('button[data-menu="device"]').click();await action('mount');await expect(q('[aria-label="Назначение диска"]')).toHaveValue('share');await action('cancel');
  await q('button[data-menu="terminal"]').click();await action('end');await action('confirm');await expect(q('.dw-terminal-status')).toHaveText('Завершён');await expect(q('[data-action="input"]')).toBeDisabled();await action('dismiss');await action('new');
  await action('keys');await expect(q('.dw-extra')).toBeVisible();await action('keys');
  await q('[data-page="system"]').click();await shot('phone-system','Системная сводка · телефон');
  await state('green','server',true);await expect(q('.dw-terminal-status')).toHaveText('Нет связи');await expect(q('[data-action="input"]')).toBeDisabled();await q('[data-page="system"]').click();await expect(q('.dw-specs')).toContainText('Последние сведения');
  await page.setViewportSize({width:1060,height:1000});await state('green');
  const grip=q('.dw-grip');await grip.focus();await page.keyboard.press('ArrowRight');await expect(grip).toHaveAttribute('aria-label',/230/);await page.keyboard.press('Home');
  const box=await grip.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+30,box.y+box.height/2);await page.mouse.up();assert.ok(await q('.dw-case').evaluate(e=>parseFloat(e.style.getPropertyValue('--dw-panel')))>220);
  await action('collapse');await expect(q('.dw-system')).toBeHidden();await shot('wide-terminal-only','Терминал со свёрнутой сводкой');await action('collapse');await expect(q('.dw-system')).toBeVisible();
  await action('input');await q('.dw-input input').fill('keep draft');await action('minimize');await expect(q('.dw-parked')).toBeVisible();await action('restore');await action('input');await expect(q('.dw-input input')).toHaveValue('keep draft');await action('input-close');
  await action('close');await action('restore');await action('help');await page.keyboard.press('Escape');await expect(q('.dw-overlay')).toBeHidden();
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
}
await writeFile(out+'/checks.json',JSON.stringify({scope:'Interactive design study only. No real commands or production changes.',cases,interactions:['device/page/session restoration','command draft retained locally','password cleared','sample paste and local send','device capability menus','power confirmation','mount form','terminal end/new','offline data retention','extra keys','keyboard and pointer panel resizing','collapse','minimize/restore','close/reopen','help/Escape']},null,2)+'\n');
console.log('PASS',cases.length,'theme/width cases and study interactions');
