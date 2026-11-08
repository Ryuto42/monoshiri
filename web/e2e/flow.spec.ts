import { expect, passOnboarding, seedConsent, startWithSample, test } from './mock';

const stored = (page: import('@playwright/test').Page) =>
  page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('monoshiri.stage.')).map(([, v]) => v));

test.describe('はじめて使う', () => {
  test('7さい: 保護者のチェックが必要で、段階 lower が保存されAPIに level が付く', async ({ page, api }) => {
    await page.goto('/');
    await passOnboardingGuardianCheck(page);
    expect(await stored(page)).toEqual(['lower', 'lower'].slice(0, (await stored(page)).length));
    expect((await stored(page)).every((v) => v === 'lower')).toBe(true);
    const consent = await page.evaluate(() => JSON.parse(localStorage.getItem('monoshiri.consent') ?? 'null'));
    expect(consent).toMatchObject({ v: 1 });
    expect(typeof consent.at).toBe('number');
    // Nothing but the stage is stored: no age.
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/"7"/);

    await page.getByRole('button', { name: 'つぎへ' }).click(); // welcome -> tour
    await skipTour(page);
    await page.getByRole('button', { name: 'つくえの上' }).click();
    await expect(page.getByRole('button', { name: 'ペットボトルをしらべる' })).toBeVisible();
    expect(api.of('/api/detect')[0].body.level).toBe('lower');
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'lower');
  });

  test('30さいでは保護者のチェックが出ない', async ({ page }) => {
    await page.goto('/');
    await passOnboarding(page, 30);
    await expect(page.getByRole('dialog', { name: /モノシリになれる/ })).toBeVisible();
    expect(await stored(page)).toContain('senior');
  });

  test('年齢の範囲外は進めない', async ({ page }) => {
    await page.goto('/');
    const dialog = page.getByRole('dialog', { name: 'なんさい？' });
    const next = dialog.getByRole('button', { name: 'つぎへ' });
    await expect(next).toBeDisabled();
    await dialog.getByRole('button', { name: '2', exact: true }).click();
    await expect(next).toBeDisabled();
    await dialog.getByRole('button', { name: '0', exact: true }).click();
    await expect(next).toBeEnabled();
  });

  test('案内カード → チュートリアルを最後まで進めるとカメラへ', async ({ page }) => {
    await page.goto('/');
    await passOnboarding(page, 10);
    await expect(page.getByRole('dialog', { name: /モノシリになれる/ })).toBeVisible();
    await page.getByRole('button', { name: 'つぎへ' }).click();
    const sample = page.getByRole('button', { name: 'つくえの上' });
    const next = page.getByRole('dialog').getByRole('button', { name: /(つぎへ|はじめる)$/ }).last();
    // After the last step the bubble animates out; its button is still in the DOM for a moment and must not be clicked again.
    for (let i = 0; i < 20 && !(await sample.isVisible()); i++) {
      if (await next.isVisible()) await next.click({ timeout: 2_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
    await expect(page.getByRole('button', { name: 'つくえの上' })).toBeVisible();
  });
});

async function passOnboardingGuardianCheck(page: import('@playwright/test').Page) {
  const dialog = page.getByRole('dialog', { name: 'なんさい？' });
  await dialog.getByRole('button', { name: '7', exact: true }).click();
  await expect(dialog.getByText('むけ」の せつめいに するよ')).toBeVisible();
  await dialog.getByRole('button', { name: 'つぎへ' }).click();
  const consent = page.getByRole('dialog', { name: /はじめる まえに/ });
  const go = consent.getByRole('button', { name: '同意して はじめる' });
  await expect(go).toBeDisabled();
  await consent.getByRole('checkbox', { name: /プライバシーポリシー/ }).check();
  await expect(go).toBeDisabled(); // under 13: the guardian also has to agree
  await consent.getByRole('checkbox', { name: /おうちの 人/ }).check();
  await expect(go).toBeEnabled();
  await go.click();
  await expect(consent).toBeHidden();
}

async function skipTour(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'スキップ' }).first().click();
}

test.describe('調べる流れ', () => {
  test('マーカー → ルビ付きの解説 → 学校の単元 → 深掘り', async ({ page, api }) => {
    await startWithSample(page);
    await page.getByRole('button', { name: 'ペットボトルをしらべる' }).click();

    await expect(page.locator('[data-speak]', { hasText: '石油' }).first()).toBeVisible();
    await expect(page.locator('ruby', { hasText: '石油' }).first()).toBeVisible();
    await expect(page.locator('ruby rt', { hasText: 'せきゆ' }).first()).toBeVisible();
    expect(api.of('/api/explore')[0].body).toMatchObject({ label: 'ペットボトル', level: 'lower' });

    const units = page.getByLabel('学校でならうよ');
    await expect(units.getByText('『家庭の生活』')).toBeVisible();
    await expect(units.getByText('『水のすがたと温度』')).toBeVisible();
    await expect(units.getByText('いま習うよ')).toBeVisible();
    await expect(units.getByText('もうすぐ習う')).toBeVisible();

    await page.getByRole('button', { name: /どうやってできる？/ }).click();
    const topic = page.getByRole('dialog', { name: 'どうやってできる？' });
    await expect(topic.getByText('石油から作られる')).toBeVisible();
    await expect(topic.locator('strong', { hasText: '樹脂' })).toBeVisible();
    await expect(topic.getByText('参考にしたページ')).toBeVisible();
    expect(api.of('/api/deep')[0].body).toMatchObject({ name: 'ペットボトル', topic: 'どうやってできる？', level: 'lower' });
  });

  test('もう習った単元は「学校でならうよ」に出ない', async ({ page, api }) => {
    await startWithSample(page, 'upper');
    await page.getByRole('button', { name: 'ペットボトルをしらべる' }).click();
    expect(api.of('/api/explore')[0].body.level).toBe('upper');
    const units = page.getByLabel('学校でならうよ');
    await expect(units.getByText('『水のすがたと温度』')).toBeVisible();
    await expect(units.getByText('『家庭の生活』')).toHaveCount(0);
  });

  test('カードにして図鑑にしまい、教科でみるにその単元だけが出る', async ({ page, api }) => {
    await startWithSample(page);
    await page.getByRole('button', { name: 'ペットボトルをしらべる' }).click();
    await expect(page.getByLabel('学校でならうよ').getByText('『家庭の生活』')).toBeVisible();

    await page.getByRole('button', { name: 'カードにする' }).click();
    await page.getByRole('button', { name: '図鑑にしまう' }).click();
    await expect(page.getByText(/図鑑 No\.001 に追加/)).toBeVisible();

    await page.getByRole('dialog').filter({ hasText: 'はじめてのカード' }).getByRole('button', { name: 'あとで', exact: true }).click();
    await page.getByRole('button', { name: 'カメラにもどる' }).click();
    await page.getByRole('button', { name: /図鑑をひらく（1枚）/ }).click();
    await expect(page).toHaveURL(/\/zukan$/);
    await expect(page.getByRole('heading', { name: 'モノシリ図鑑' })).toBeVisible();

    await page.getByRole('tab', { name: '教科でみる' }).click();
    const group = page.getByRole('region', { name: '小1-2 生活' });
    await expect(group).toContainText('1 単元・1まい');
    // Each unit lists its cards right there (no second step to open the unit).
    const home = group.getByRole('region', { name: '『家庭の生活』' });
    await expect(home).toContainText('1まい');
    await expect(home.getByRole('button', { name: /ペットボトル/ })).toBeVisible();
    await expect(page.getByRole('region', { name: '『学校生活と通学路』' })).toHaveCount(0);
    expect(api.of('/api/events').flatMap((c) => c.body.events as { name: string }[]).map((e) => e.name)).toContain('card_save');
  });

  test('段階チップで年齢を変えると、新しい level で解説を取り直す', async ({ page, api }) => {
    await startWithSample(page);
    await page.getByRole('button', { name: 'ペットボトルをしらべる' }).click();
    await expect(page.locator('ruby', { hasText: '石油' }).first()).toBeVisible();
    expect(api.of('/api/explore').map((c) => c.body.level)).toEqual(['lower']);

    await page.getByRole('button', { name: /せつめいの むずかしさ：低学年むけ/ }).click();
    const sheet = page.getByRole('dialog', { name: 'なんさい？' });
    for (const d of '13') await sheet.getByRole('button', { name: d, exact: true }).click();
    await sheet.getByRole('button', { name: 'これに する' }).click();

    await expect(page.getByText('石油から作られた、軽くて丈夫な容器です。')).toBeVisible();
    expect(api.of('/api/explore').map((c) => c.body.level)).toEqual(['lower', 'junior']);
    await expect(page.locator('[data-speak] ruby')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /せつめいの むずかしさ：中学生むけ/ })).toBeVisible();
    // Both mocked units are elementary-school ones, already behind a junior reader.
    await expect(page.getByLabel('学校でならうよ')).toHaveCount(0);
  });
});

void seedConsent;
