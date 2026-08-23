const fs = require('fs').promises;
const { test, expect } = require('@playwright/test');

async function openViewer(page) {
  await page.goto('/viewer.html');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#content')).toBeVisible();
}

test('loads fixture data from the HTTP source and renders the viewer', async ({ page }) => {
  await openViewer(page);

  await expect(page.locator('.stat-card').filter({ hasText: '会话数' }).locator('.value')).toHaveText('7');
  await expect(page.locator('.stat-card').filter({ hasText: '项目数' }).locator('.value')).toHaveText('1');
  await expect(page.locator('.stat-card').filter({ hasText: '主题数' }).locator('.value')).toHaveText('1');
  await expect(page.locator('#dataContent')).toContainText('browser-e2e-model');
  await expect(page.locator('#dataContent')).toContainText('browser-fixture-project');
  await expect(page.locator('#dataContent')).toContainText('browser e2e topic');
  await expect(page.locator('#dataContent')).toContainText('browser-tool: 4 次');
  expect(await page.evaluate(() => localStorage.getItem('memory-plugin-data'))).toContain('browser-e2e-model');
});

test('clears viewer cache without deleting source data', async ({ page }) => {
  await openViewer(page);
  const dialogs = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });

  await page.getByRole('button', { name: '清除查看器缓存' }).click();
  await expect(page.locator('#content')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('memory-plugin-data'))).toBeNull();
  expect(dialogs.some((message) => message.includes('原始记忆文件不会被修改'))).toBe(true);

  await page.reload();
  await expect(page.locator('#content')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('memory-plugin-data'))).toContain('browser-e2e-model');
  expect((await page.request.get('/.dsh-memory.json')).status()).toBe(200);
});

test('downloads the current memory as JSON', async ({ page }) => {
  await openViewer(page);
  const dialogs = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出数据' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^memory-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const downloaded = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  expect(downloaded.version).toBe('1.1.0');
  expect(downloaded.userPreferences.defaultModel).toBe('browser-e2e-model');
  expect(dialogs.some((message) => message.includes('数据已导出'))).toBe(true);
});
