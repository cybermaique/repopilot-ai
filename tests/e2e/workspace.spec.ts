import { test, expect } from '@playwright/test';

test('index fixture → ask → inspect real source → reopen persistent history', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Answers grounded in code.' }),
  ).toBeVisible();
  const register = page.getByRole('button', {
    name: 'Register sample repository',
    exact: true,
  });
  if (await register.count()) {
    await register.click();
  }
  await page
    .getByRole('button', { name: /^(Reindex fixture|Index fixture)$/ })
    .click();
  await expect(
    page.getByText(/Snapshot activated\.|Existing snapshot reused\./),
  ).toBeVisible();
  await expect(page.getByText('Snapshot ready', { exact: true })).toBeVisible();
  const question = 'Why does renewSession keep the token expired?';
  await page.getByRole('textbox', { name: 'Question' }).fill(question);
  await page
    .getByRole('form', { name: 'Ask a repository question' })
    .getByRole('button', { name: 'Ask repository', exact: false })
    .click();
  await expect(page.getByText('Evidence found', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Answer' })).toContainText(
    'Demo provider',
  );
  const citation = page.getByRole('button', { name: /^Open source / }).first();
  await page.screenshot({
    path: testInfo.outputPath('workspace.png'),
    fullPage: true,
  });
  await citation.click();
  const dialog = page.getByRole('dialog', { name: 'Source evidence' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('SHA-256');
  await expect(dialog.getByLabel('Source excerpt')).toContainText(
    'renewSession',
  );
  await page.getByRole('button', { name: 'Close source' }).click();
  await citation.click();
  await page.screenshot({ path: testInfo.outputPath('source.png') });
  await page.getByRole('button', { name: 'Close source' }).click();
  await page.getByRole('button', { name: /Run history/ }).click();
  await expect(
    page
      .getByRole('button', { name: new RegExp(question.replace('?', '\\?')) })
      .first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Run history/ }).click();
  await page
    .getByRole('button', { name: new RegExp(question.replace('?', '\\?')) })
    .first()
    .click();
  await expect(page.getByText('Evidence found', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Open source / }).first(),
  ).toBeVisible();
});

test('unknown question visibly abstains and has no invented source', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Snapshot ready', { exact: true })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Question' })
    .fill('How does lunar telemetry work?');
  await page
    .getByRole('form', { name: 'Ask a repository question' })
    .getByRole('button', { name: 'Ask repository', exact: false })
    .click();
  await expect(
    page.getByText('Insufficient evidence', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open source / })).toHaveCount(
    0,
  );
});
