import { expect, test } from './mock';

test('/privacy が開ける', async ({ page }) => {
  await page.goto('/privacy');
  const dialog = page.getByRole('dialog', { name: /プライバシー/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'とじる' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('新規登録は同意のチェックがないと押せない', async ({ page }) => {
  await page.goto('/account');
  await page.getByRole('tab', { name: '新規登録' }).click();

  const submit = page.getByRole('button', { name: '登録する' });
  await expect(submit).toBeDisabled();

  const agree = page.getByRole('checkbox', { name: /13さい以上です/ });
  await agree.check();
  await expect(submit).toBeEnabled();
  await agree.uncheck();
  await expect(submit).toBeDisabled();
});
