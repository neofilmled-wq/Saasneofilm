import { type Page, expect } from '@playwright/test';

export const ADMIN_EMAIL = 'admin@neofilm.com';
export const ADMIN_PASSWORD = 'Password123!';

/**
 * Login as admin and return the authenticated page
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Mot de passe').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /connexion/i }).click();

  // Wait for redirect to admin dashboard
  await page.waitForURL('/admin', { timeout: 10000 });
  await expect(page.getByText('Tableau de bord')).toBeVisible({ timeout: 10000 });
}

/**
 * Navigate to an admin page after login
 */
export async function navigateToAdminPage(page: Page, path: string) {
  await page.goto(`/admin${path}`);
  await page.waitForLoadState('networkidle');
}
