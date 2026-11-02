import { expect, test, chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dist = path.join(root, 'dist');
const fixture = readFileSync(path.join(root, 'tests/e2e/fixture.html'), 'utf8');

function findMenuDisplay(page: import('@playwright/test').Page): Promise<string> {
    return page.evaluate(() => {
        const menu = document.querySelector('.bpx-player-ctrl-playbackrate-menu');
        return menu ? getComputedStyle(menu).display : 'missing';
    });
}

function readSettings(page: import('@playwright/test').Page): Promise<{ defaultRate?: number; presets?: number[] }> {
    return page.evaluate(() => new Promise((resolve) => {
        chrome.storage.local.get('bili_speed_settings', (result) => {
            resolve((result.bili_speed_settings ?? {}) as { defaultRate?: number; presets?: number[] });
        });
    }));
}

test('menu injection, rate persistence, native selection and SPA recovery', async () => {
    const context = await chromium.launchPersistentContext('', {
        headless: true,
        channel: 'chromium',
        args: [
            `--disable-extensions-except=${dist}`,
            `--load-extension=${dist}`,
        ],
    });

    try {
        await context.route('https://www.bilibili.com/**', (route) => route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: fixture,
        }));

        const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
        const extensionId = new URL(worker.url()).host;
        const optionsUrl = `chrome-extension://${extensionId}/options.html`;

        const optionsPage = await context.newPage();
        await optionsPage.goto(optionsUrl);
        await optionsPage.evaluate(() => chrome.storage.local.clear());
        await optionsPage.close();

        const page = await context.newPage();
        await page.goto('https://www.bilibili.com/video/BV1xx411c7mD');

        await expect(page.locator('.custom-speed-item')).toHaveCount(4);
        await expect(page.locator('.custom-speed-input')).toHaveCount(1);

        const control = page.locator('#rateControl');
        await page.evaluate(() => document.getElementById('rateControl')?.classList.add('bpx-state-show'));
        expect(await findMenuDisplay(page)).not.toBe('none');

        // 选择自定义预设，菜单应关闭
        await page.locator('.custom-speed-item[data-value="3"]').click();
        await expect.poll(() => page.evaluate(() => document.querySelector('video')?.playbackRate)).toBe(3);
        expect(await findMenuDisplay(page)).toBe('none');
        expect(await control.evaluate((element) => element.classList.contains('bpx-state-show'))).toBe(false);

        // 再次悬停/点击，菜单必须能重新打开（历史回归）
        await page.evaluate(() => document.getElementById('rateControl')?.classList.add('bpx-state-show'));
        expect(await findMenuDisplay(page)).not.toBe('none');

        // 原生菜单选择也要被保存
        await page.locator('#rateMenu > .bpx-player-ctrl-playbackrate-menu-item[data-value="1.5"]').click();
        await expect.poll(() => page.evaluate(() => document.querySelector('video')?.playbackRate)).toBe(1.5);
        const settingsPage = await context.newPage();
        await settingsPage.goto(optionsUrl);
        await expect.poll(async () => (await readSettings(settingsPage)).defaultRate).toBe(1.5);
        await settingsPage.close();

        // 任意输入 + 回车
        await page.evaluate(() => document.getElementById('rateControl')?.classList.add('bpx-state-show'));
        await page.locator('.custom-speed-input').fill('3,7');
        await page.locator('.custom-speed-input').press('Enter');
        await expect.poll(() => page.evaluate(() => document.querySelector('video')?.playbackRate)).toBe(3.7);
        expect(await findMenuDisplay(page)).toBe('none');

        const afterInputPage = await context.newPage();
        await afterInputPage.goto(optionsUrl);
        await expect.poll(async () => (await readSettings(afterInputPage)).defaultRate).toBe(3.7);
        await afterInputPage.close();

        // SPA 切换视频后应恢复已保存的全局倍速
        await page.evaluate(() => {
            (window as unknown as { __swapVideo: (url: string) => void }).__swapVideo('/video/BV1yy411c7mE?p=2');
        });
        await expect.poll(
            () => page.evaluate(() => document.querySelector('video')?.playbackRate),
            { timeout: 5000 },
        ).toBe(3.7);

        // Options 页面修改默认倍速后，已打开的视频页也应同步
        const options = await context.newPage();
        await options.goto(optionsUrl);
        await expect(options.locator('.preset-row')).toHaveCount(4);
        await options.locator('#defaultRate').fill('2.25');
        await options.locator('#save').click();
        await expect(options.locator('#saveStatus')).toHaveText('已保存');
        await expect.poll(
            () => page.evaluate(() => document.querySelector('video')?.playbackRate),
            { timeout: 5000 },
        ).toBe(2.25);

        // Popup 在非视频标签页也能显示当前设置
        const popup = await context.newPage();
        await popup.goto(`chrome-extension://${extensionId}/popup.html`);
        await expect(popup.locator('.presets button')).toHaveCount(4);
        await expect(popup.locator('#currentRate')).toHaveText('2.25x');
    } finally {
        await context.close();
    }
});
