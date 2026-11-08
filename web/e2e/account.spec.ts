import { expect, seedConsent, test } from './mock';

test('/privacy が開ける', async ({ page }) => {
  await seedConsent(page);
  await page.goto('/privacy');
  const dialog = page.getByRole('dialog', { name: /プライバシー/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'とじる' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('新規登録に同意の一文とリンクがあり、チェックボックスは無い', async ({ page }) => {
  await seedConsent(page);
  await page.goto('/account');
  await page.getByRole('tab', { name: '新規登録' }).click();
  await expect(page.getByText(/の内容で登録します/)).toBeVisible();
  await expect(page.getByText(/はじめに同意した/)).toBeVisible();
  await expect(page.getByRole('link', { name: /プライバシー/ }).or(page.getByRole('button', { name: /プライバシー/ })).first()).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '登録する' })).toBeVisible();
});
