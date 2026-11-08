import { expect, startWithSample, test } from './mock';

test.describe('はじめて使う', () => {
  test('学年を選ぶと段階が保存され、APIに level が付く', async ({ page, api }) => {
    await page.goto('/');
    await expect(page.getByRole('dialog', { name: /モノシリになれる/ })).toBeVisible();
    await page.getByRole('button', { name: 'この写真でためしてみる' }).click();

    await expect(page.getByRole('heading', { name: 'なんねんせい？' })).toBeVisible();
    await page.getByRole('button', { name: '小2', exact: true }).click();
    await expect(page.getByText('むけ」の せつめいに するよ')).toBeVisible();
    await page.getByRole('button', { name: 'これで ためしてみる' }).click();

    await expect(page.getByRole('button', { name: 'ペットボトルをしらべる' })).toBeVisible();
    expect(api.of('/api/detect')[0].body.level).toBe('lower');
    const stored = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('monoshiri.stage.')).map(([, v]) => v));
    expect(stored).toEqual(['lower']);
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'lower');
  });
});

test.describe('調べる流れ', () => {
  test('マーカー → ルビ付きの解説 → 学校の単元 → 深掘り', async ({ page, api }) => {
    await startWithSample(page);
    await page.getByRole('button', { name: 'ペットボトルをしらべる' }).click();

    const summary = page.locator('[data-speak]', { hasText: '石油' }).first();
    await expect(summary).toBeVisible();
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

  test('カードにして図鑑にしまい、教科でみるでその単元が強調される', async ({ page, api }) => {
    await startWithSample(page);
    await page.getByRole('button', { name: 'ペットボトルをしらべる' }).click();
    await expect(page.getByLabel('学校でならうよ').getByText('『家庭の生活』')).toBeVisible();

    await page.getByRole('button', { name: 'カードにする' }).click();
    await page.getByRole('button', { name: '図鑑にしまう' }).click();
    await expect(page.getByText(/図鑑 No\.001 に追加/)).toBeVisible();

    // The first card offers to register; dismiss it to get back to the camera.
    await page.getByRole('dialog').filter({ hasText: 'はじめてのカード' }).getByRole('button', { name: 'あとで', exact: true }).click();
    await page.getByRole('button', { name: 'カメラにもどる' }).click();
    await page.getByRole('button', { name: /図鑑をひらく（1枚）/ }).click();
    await expect(page).toHaveURL(/\/zukan$/);
    await expect(page.getByRole('heading', { name: 'モノシリ図鑑' })).toBeVisible();
    await expect(page.getByRole('button', { name: /ペットボトル/ }).first()).toBeVisible();

    await page.getByRole('tab', { name: '教科でみる' }).click();
    await expect(page.getByText('あなたの学年')).toBeVisible();
    const home = page.getByRole('button', { name: /『家庭の生活』/ });
    await expect(home).toContainText('ペットボトル');
    await expect(home).toContainText('1まい');
    await expect(page.getByRole('button', { name: /『学校生活と通学路』/ })).not.toContainText('まい');
    await expect(page.getByRole('region', { name: '小1-2 生活' })).toContainText('1/');
    expect(api.of('/api/events').flatMap((c) => c.body.events as { name: string }[]).map((e) => e.name)).toContain('card_save');
  });

  test('段階チップで段階を変えると、新しい level で解説を取り直す', async ({ page, api }) => {
    await startWithSample(page);
    await page.getByRole('button', { name: 'ペットボトルをしらべる' }).click();
    await expect(page.locator('ruby', { hasText: '石油' }).first()).toBeVisible();
    expect(api.of('/api/explore').map((c) => c.body.level)).toEqual(['lower']);

    await page.getByRole('button', { name: /せつめいの むずかしさ：低学年むけ/ }).click();
    const sheet = page.getByRole('dialog', { name: 'なんねんせい？' });
    await sheet.getByRole('button', { name: '中2', exact: true }).click();
    await sheet.getByRole('button', { name: 'これに する' }).click();

    await expect(page.getByText('石油から作られた、軽くて丈夫な容器です。')).toBeVisible();
    expect(api.of('/api/explore').map((c) => c.body.level)).toEqual(['lower', 'junior']);
    await expect(page.locator('[data-speak] ruby')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /せつめいの むずかしさ：中学生むけ/ })).toBeVisible();
    // Both mocked units are elementary-school ones, already behind a 中2 reader, so the section goes away.
    await expect(page.getByLabel('学校でならうよ')).toHaveCount(0);
  });
});
