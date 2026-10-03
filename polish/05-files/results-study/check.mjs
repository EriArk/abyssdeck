import assert from 'node:assert/strict';
import { writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit, expect } from '@playwright/test';

const out = 'polish/05-files/results-study';
assert.ok((await stat(`${out}/results-study.html`)).size < 1_000_000);
for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await type.launch();
  const page = await browser.newPage({ viewport: { width: 736, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(pathToFileURL(resolve('.local/results-study-preview.html')).href);
    const frame = page.frameLocator('iframe');
    const root = frame.locator('#cw-results-study');
    const setState = async (theme = 'green', category = 'files') => {
      await root.evaluate((node, values) => node.ownerDocument.defaultView.dispatchEvent(
        new CustomEvent('openai:set_globals', { detail: { globals: { widgetState: {
          privateContent: { ...values, selecting: false, selected: [], query: '', searchType: 'all', sort: 'new' },
        } } } }),
      ), { theme, category });
    };
    const capture = async (name, description) => {
      if (engine !== 'webkit') return;
      await root.screenshot({ path: `${out}/${name}.png` });
      await writeFile(`${out}/${name}.md`, `# ${description}\n\nИнтерактивный эскиз Results, не установленный интерфейс. Контролируемые примерные данные. Снимок WebKit; не проверка физического устройства.\n`);
    };
    const fit = async () => {
      assert.ok(await root.evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'Root width');
      assert.deepEqual(await root.locator('button:visible').evaluateAll(buttons => buttons.filter(button => {
        const box = button.getBoundingClientRect();
        const rootBox = button.closest('#cw-results-study').getBoundingClientRect();
        return box.left < rootBox.left - 1 || box.right > rootBox.right + 1 || box.height < 43;
      }).map(button => button.getAttribute('aria-label') || button.textContent)), [], 'Reachable controls');
    };
    for (const width of [736, 390, 320]) {
      await page.setViewportSize({ width, height: 1200 });
      for (const theme of ['green', '2000', 'organizer', 'dark']) {
        await setState(theme);
        await expect(root.locator('.rs-row')).toHaveCount(5);
        assert.equal(await root.locator('.rs-row').first().evaluate(node=>getComputedStyle(node).minHeight), width > 600 ? '88px' : '70px');
        await fit();
        if (width === 736 || width === 390 && theme === 'green') {
          await capture(`${width}-${theme}-files`, `Файлы — ${theme}, ${width} px`);
        }
        await root.locator('[data-category="images"]').click();
        await expect(root.locator('.rs-thumb')).toHaveCount(2);
        await expect.poll(() => root.locator('.rs-thumb').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
        await fit();
        const imageCard=root.locator('.rs-image').first();
        const thumbnail=await imageCard.locator('.rs-thumb').boundingBox();
        const menuButton=imageCard.getByRole('button',{name:'Действия с результатом',exact:true});
        const menuBox=await menuButton.boundingBox();
        assert.ok(menuBox.y>=thumbnail.y && menuBox.y-thumbnail.y<10 && Math.abs(thumbnail.x+thumbnail.width-menuBox.x-menuBox.width)<10,'Image menu at thumbnail upper right');
        if (width===390 || width===736) await capture(`${width}-${theme}-images`, 'Изображения — рамка, подложка и меню в углу');
        await menuButton.click();
        await expect(root.locator('.rs-viewer')).toBeHidden();
        await expect(imageCard.locator('.rs-item-menu')).toBeVisible();
        await fit();
        if(width===390&&theme==='green')await capture('390-green-image-menu','Изображение — раскрытое меню в верхнем углу');
        await menuButton.click();
        await root.getByRole('button', { name: 'Открыть Файлы · зелёная тема', exact: true }).click();
        await expect(root.locator('.rs-viewer-name')).toHaveText('Файлы · зелёная тема');
        await root.getByRole('button', { name: 'Следующее изображение', exact: true }).click();
        await expect(root.locator('.rs-counter')).toHaveText('2 из 2');
        await fit();
        await root.getByRole('button', { name: 'Закрыть просмотр', exact: true }).click();
        await expect(root.locator('[data-category="images"]')).toHaveAttribute('aria-pressed', 'true');
        await root.getByRole('button', { name: 'Рассуждения', exact: true }).click();
        await expect(root.locator('.rs-request')).toHaveCount(2);
        await expect(root.locator('.rs-categories [data-category="reasoning"]')).toHaveAttribute('aria-pressed','true');
        await expect(root.locator('.rs-request-details[open]')).toHaveCount(0);
        await expect(root.locator('.rs-category-menu')).not.toContainText('Работа');
        await fit();
        if ((width===390||width===736)&&theme==='green')await capture(`${width}-green-requests`, 'Рассуждения — карточки запросов');
        const request=root.locator('.rs-request-details').first();
        await request.locator(':scope > summary').click();
        await expect(request.locator('.rs-step')).toHaveCount(3);
        await request.locator('.rs-task summary').last().click();
        await expect(request.locator('.rs-task').last()).toHaveAttribute('open', '');
        await fit();
        if ((width === 390 || width === 736) && theme === 'green') await capture(`${width}-green-reasoning`, 'Рассуждения — шаги и раскрытая карточка проверок');
        await request.locator(':scope > summary').click();
        await request.locator(':scope > summary').click();
        await expect(request.locator('.rs-task').last()).toHaveAttribute('open','');
        await root.locator('[data-category="files"]').click();
        await root.locator('[data-category="reasoning"]').click();
        await expect(root.locator('.rs-request-details').first()).toHaveAttribute('open','');
        await expect(root.locator('.rs-request-details').first().locator('.rs-task').last()).toHaveAttribute('open','');
      }
    }
    await page.setViewportSize({ width: 390, height: 1200 });
    await setState();
    await root.locator('.rs-row').first().getByRole('button', { name: 'Действия с результатом', exact: true }).click();
    await expect(root.locator('.rs-item-menu:visible')).toHaveCount(1);
    await fit();
    await capture('390-green-actions', 'Действия файла — компактное меню');
    await root.locator('.rs-item-menu:visible').getByRole('button', { name: 'К сообщению', exact: true }).click();
    await expect(root.getByRole('status')).toContainText('Эскиз: переход');
    await root.getByRole('button', { name: 'Закрыть уведомление' }).click();
    await root.getByRole('button', { name: 'Выбрать несколько', exact: true }).click();
    await root.getByRole('checkbox', { name: 'Выбрать Разбор интерфейса.md', exact: true }).check();
    await root.getByRole('checkbox', { name: 'Выбрать Сравнение тем.csv', exact: true }).check();
    await expect(root.locator('.rs-selected-count')).toHaveText('Выбрано: 2');
    await root.getByRole('button', { name: 'Открыть Разбор интерфейса.md', exact: true }).click();
    await root.getByRole('button', { name: 'Закрыть просмотр', exact: true }).click();
    await expect(root.locator('input[type="checkbox"]:checked')).toHaveCount(2);
    await capture('390-green-selection', 'Выбор файлов — общая подготовка пакета');
    await root.getByRole('button', { name: 'Поиск результатов', exact: true }).click();
    await root.getByRole('searchbox').fill('тем');
    await expect(root.locator('.rs-search-results .rs-row')).toHaveCount(2);
    await root.getByRole('combobox', { name: 'Тип результата' }).selectOption('files');
    await expect(root.locator('.rs-search-results .rs-row')).toHaveCount(1);
    await root.locator('.rs-search-results').getByRole('button').click();
    await root.getByRole('button', { name: 'Закрыть просмотр', exact: true }).click();
    await expect(root.getByRole('searchbox')).toHaveValue('тем');
    await root.getByRole('button', { name: 'Закрыть поиск', exact: true }).click();
    await expect(root.locator('input[type="checkbox"]:checked')).toHaveCount(2);
    await expect(root.getByRole('button', { name: 'Поиск результатов', exact: true })).toBeFocused();
    assert.deepEqual(errors, []);
    console.log(`${engine}: 4 themes × 3 widths, files/images, nested work cards, gallery, menus, search, selection continuity passed`);
  } finally {
    await browser.close();
  }
}
