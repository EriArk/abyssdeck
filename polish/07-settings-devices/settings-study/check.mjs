import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium,webkit,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const out='polish/07-settings-devices/settings-study',cases=[];
const source=await readFile(out+'/settings-study.html','utf8');
assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/.test(source));
assert.ok(!source.includes('<html')&&!source.includes('<body'));
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch();
 try{
  const page=await browser.newPage({viewport:{width:1060,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(resolve('.local/settings-study-preview.html')).href);
  const root=page.frameLocator('iframe').locator('#cw-settings-study'),q=s=>root.locator(s);
  const action=async a=>q(`[data-action="${a}"]`).filter({visible:true}).first().click();
  const go=async id=>q(`[data-go="${id}"]`).filter({visible:true}).first().click();
  async function state(theme='green',view='connections',extra={}){
   await root.evaluate((_,v)=>window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:{privateContent:v}}}})),{theme,page:view,...extra});
  }
  async function shot(name,description){
   if(engine!=='chromium')return;
   await root.screenshot({animations:'disabled',path:`${out}/${name}.png`});
   await writeFile(`${out}/${name}.md`,`# ${description}\n\n![${description}](${name}.png)\n\nЭскиз настроек на демонстрационных данных. Chromium, без запросов к Hub и провайдерам. Это не установленный интерфейс и не физическая проверка телефона/планшета.\n\n[Описание и границы](README.md).\n`);
  }
  await expect(q('.st-header svg').first()).toBeVisible();
  for(const theme of ['green','2000','organizer','dark']){
   for(const width of [1060,768,390,320]){
    await page.setViewportSize({width,height:1000});
    for(const view of ['connections','pc','workspace','add','codex','limits','gpt','doctor','interface','appearance','keys','sound','data','maintenance','account','people']){
     await state(theme,view);
     for(const selector of ['.st-case','.st-header','.st-content','.st-path']){
      const b=await q(selector).evaluate(e=>({w:e.clientWidth,s:e.scrollWidth}));assert.ok(b.s<=b.w+1,`${engine}/${theme}/${width}/${view}/${selector}: ${JSON.stringify(b)}`);
     }
    }
    await state(theme,'connections');
    if(width===1060)await shot(`${theme}-wide`,'Подключения · '+theme+' · планшет');
    if(width===390)await shot(`${theme}-phone`,'Подключения · '+theme+' · телефон');
    cases.push({engine,theme,width,pages:16,overflow:false});
   }
  }
  await page.setViewportSize({width:390,height:900});await state('green','index');
  await expect(q('.st-nav')).toBeVisible();await expect(q('.st-screen')).toBeHidden();await shot('phone-index','Разделы настроек · телефон');
  await go('connections');await go('pc');await expect(q('.st-content h3')).toHaveText('Мой компьютер');await shot('phone-pc','Детали компьютера · телефон');
  await action('back');await expect(q('.st-content h3')).toHaveText('Подключения');await action('back');await expect(q('.st-nav')).toBeVisible();
  await go('connections');await go('add');await q('[data-draft="deviceName"]').fill('Ноутбук для работы');await action('back');await go('add');await expect(q('[data-draft="deviceName"]')).toHaveValue('Ноутбук для работы');
  await q('[data-demo="installer"]').click();await expect(q('.st-dialog-body')).toContainText('Ноутбук для работы');await page.keyboard.press('Escape');await expect(q('.st-overlay')).toBeHidden();await expect(q('[data-demo="installer"]')).toBeFocused();
  await action('search');await q('.st-search input').fill('кредиты');await expect(q('.st-content')).toContainText('Лимиты и кредиты');await shot('phone-search','Поиск настройки · телефон');await go('limits');await expect(q('.st-content h3')).toHaveText('Лимиты и кредиты');
  await action('search');await q('.st-search input').fill('пароль');await q('[data-open-action="password"]').click();await expect(q('.st-content h3')).toHaveText('Мой аккаунт');await expect(q('.st-dialog h3')).toHaveText('Изменить пароль');await action('dismiss');
  await state('green','gpt',{gptState:'prepare'});await shot('phone-gpt-first','Первое подключение GPT · телефон');
  for(const next of ['prepare-gpt','login-gpt','activate-gpt']){await q(`[data-demo="${next}"]`).click();await expect(q('.st-dialog h3')).toHaveText('Демонстрация шага');await action('dismiss');}
  await expect(q('[data-demo="open-gpt"]')).toHaveCount(1);await shot('phone-gpt','Подключённый GPT · телефон');await go('doctor');await q('[data-setting="doctor"]').selectOption('repair');await action('back');await go('doctor');await expect(q('[data-setting="doctor"]')).toHaveValue('repair');
  await state('green','maintenance');await go('doctor');await action('back');await expect(q('.st-content h3')).toHaveText('Обновления и диагностика');
  await state('green','account',{admin:false});await action('back');await expect(q('[data-go="people"]')).toHaveCount(0);await action('search');await q('.st-search input').fill('Участники');await expect(q('.st-content')).toContainText('Найдено: 0');
  await state('green','appearance');await q('[data-theme-choice="organizer"]').click();await expect(q('.st-case')).toHaveAttribute('data-theme','organizer');await q('[data-setting="casing"]').selectOption('graphite');await expect(q('.st-case')).toHaveAttribute('data-casing','graphite');
  await state('green','sound');await q('[data-setting="speech"]').check();await action('back');await go('sound');await expect(q('[data-setting="speech"]')).toBeChecked();
  await state('green','add');await q('[data-draft="deviceName"]').fill('Сохранённый черновик');await action('close');await expect(q('.st-parked')).toBeVisible();await action('restore');await expect(q('[data-draft="deviceName"]')).toHaveValue('Сохранённый черновик');
  await page.setViewportSize({width:1060,height:1000});await state('green','gpt');await shot('wide-gpt','Подключённый GPT · планшет');
  await state('green','appearance');await shot('wide-interface','Оформление · планшет');
  await state('green','connections');const grip=q('.st-grip');await grip.focus();await page.keyboard.press('ArrowRight');await expect(grip).toHaveAttribute('aria-label',/230/);await page.keyboard.press('Home');
  const b=await grip.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+100);await page.mouse.down();await page.mouse.move(b.x+35,b.y+100);await page.mouse.up();assert.ok(await q('.st-case').evaluate(e=>parseFloat(e.style.getPropertyValue('--st-nav-width')))>220);
  await action('minimize');await expect(q('.st-parked')).toBeVisible();await action('restore');await expect(q('.st-content h3')).toHaveText('Подключения');
  await action('help');await page.keyboard.press('Tab');await page.keyboard.press('Tab');await expect(q('.st-dialog [data-action="dismiss"]').first()).toBeFocused();await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
}
await writeFile(out+'/checks.json',JSON.stringify({scope:'Interactive settings proposal only; no real accounts, credentials, provider calls or installation changes.',cases,interactions:['phone index/detail/back','exact return from diagnostics','draft restoration','search page and nested action','non-admin navigation and search','GPT setup state sequence','one connected GPT launch entry','local toggles and theme','keyboard/pointer splitter','minimize/close restoration','dialog focus and Escape']},null,2)+'\n');
console.log('PASS',cases.length,'theme/width cases, 16 pages each, and navigation interactions');
