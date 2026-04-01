import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateToAdminPage } from './helpers';

test.describe('Admin Cockpit E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ─── Login ───────────────────────────────────

  test('should login as admin and see dashboard', async ({ page }) => {
    await expect(page.getByText('Tableau de bord')).toBeVisible();
    // Dashboard should show stat cards
    await expect(page.locator('[data-testid="stat-card"], .stat-card, h1').first()).toBeVisible();
  });

  // ─── Users ───────────────────────────────────

  test('should list users and create a new one', async ({ page }) => {
    await navigateToAdminPage(page, '/users');
    await expect(page.getByText('Utilisateurs')).toBeVisible();

    // Click create button
    await page.getByRole('button', { name: /nouvel utilisateur/i }).click();
    await expect(page.getByText('Nouvel utilisateur')).toBeVisible();

    // Fill form
    await page.getByLabel('Prénom').fill('Test');
    await page.getByLabel('Nom').fill('Utilisateur');
    await page.getByLabel('Email').fill(`test-e2e-${Date.now()}@neofilm.com`);

    // Toggle auto-generate password
    const autoGenSwitch = page.locator('text=Générer mot de passe automatiquement').locator('..').getByRole('switch');
    await autoGenSwitch.click();

    // Submit
    await page.getByRole('button', { name: /créer/i }).click();

    // Should show success toast
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10000 });
  });

  test('should search users', async ({ page }) => {
    await navigateToAdminPage(page, '/users');

    // Type in search
    await page.getByPlaceholder(/rechercher/i).fill('admin');
    await page.waitForTimeout(500); // debounce

    // Should show filtered results
    await expect(page.getByText('admin@neofilm.com')).toBeVisible({ timeout: 5000 });
  });

  // ─── Partners ────────────────────────────────

  test('should list partners and create one', async ({ page }) => {
    await navigateToAdminPage(page, '/partners');
    await expect(page.getByText('Partenaires')).toBeVisible();

    // Should see existing partners from seed
    await expect(page.getByText('Cinémas Lumière')).toBeVisible({ timeout: 10000 });

    // Click create button
    await page.getByRole('button', { name: /ajouter partenaire/i }).click();

    // Fill form
    await page.getByLabel('Nom').fill('Cinema Test E2E');
    await page.getByLabel('Email de contact').fill('test@cinema-e2e.fr');
    await page.getByLabel('Ville').fill('Lyon');

    // Submit
    await page.getByRole('button', { name: /créer/i }).click();

    // Should show success toast
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to partner detail page', async ({ page }) => {
    await navigateToAdminPage(page, '/partners');

    // Click on first partner link
    await page.getByText('Cinémas Lumière').click();

    // Should show partner detail
    await expect(page.getByText('Cinémas Lumière')).toBeVisible({ timeout: 10000 });
    // Should see tabs
    await expect(page.getByRole('tab', { name: /écrans/i })).toBeVisible();
  });

  // ─── Advertisers ─────────────────────────────

  test('should list advertisers and create one', async ({ page }) => {
    await navigateToAdminPage(page, '/advertisers');
    await expect(page.getByText('Annonceurs')).toBeVisible();

    // Should see existing advertisers from seed
    await expect(page.getByText('FrenchTech Ads')).toBeVisible({ timeout: 10000 });

    // Click create button
    await page.getByRole('button', { name: /ajouter annonceur/i }).click();

    // Fill form
    await page.getByLabel('Nom').fill('Annonceur Test E2E');
    await page.getByLabel('Email de contact').fill('test@adv-e2e.fr');

    // Submit
    await page.getByRole('button', { name: /créer/i }).click();

    // Should show success toast
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10000 });
  });

  // ─── Campaigns ───────────────────────────────

  test('should list campaigns and see status filters', async ({ page }) => {
    await navigateToAdminPage(page, '/campaigns');
    await expect(page.getByText('Campagnes')).toBeVisible();

    // Should see campaigns from seed
    await expect(page.getByText('Lancement App FrenchTech Q1 2026')).toBeVisible({ timeout: 10000 });

    // Should be able to filter by status
    await page.getByRole('button', { name: /en attente/i }).click();
    await page.waitForTimeout(500);

    // Should show the pending campaign
    await expect(page.getByText('Promo Rentrée MéditerranéeFood')).toBeVisible({ timeout: 5000 });
  });

  test('should approve a pending campaign', async ({ page }) => {
    await navigateToAdminPage(page, '/campaigns');

    // Filter to pending
    await page.getByRole('button', { name: /en attente/i }).click();
    await page.waitForTimeout(500);

    // Open row actions for the pending campaign
    const row = page.locator('tr').filter({ hasText: 'Promo Rentrée' });
    await row.getByRole('button').filter({ has: page.locator('svg') }).last().click();

    // Click approve
    await page.getByText(/approuver/i).click();

    // Should show success toast
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to campaign detail', async ({ page }) => {
    await navigateToAdminPage(page, '/campaigns');

    // Click on first campaign
    await page.getByText('Lancement App FrenchTech Q1 2026').click();

    // Should show campaign detail page
    await expect(page.getByText('Lancement App FrenchTech Q1 2026')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('tab', { name: /informations/i })).toBeVisible();
  });

  // ─── Devices / Screens ───────────────────────

  test('should list devices with real-time status', async ({ page }) => {
    await navigateToAdminPage(page, '/devices');
    await expect(page.getByText('Écrans & Appareils')).toBeVisible();

    // Should see screens from seed
    await expect(page.getByText('Lumière - Hall Principal')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to screen detail', async ({ page }) => {
    await navigateToAdminPage(page, '/devices');

    // Click on first screen link
    await page.getByText('Lumière - Hall Principal').click();

    // Should show screen detail
    await expect(page.getByText('Lumière - Hall Principal')).toBeVisible({ timeout: 10000 });
  });

  // ─── Live Map ────────────────────────────────

  test('should show live map with markers', async ({ page }) => {
    await navigateToAdminPage(page, '/live-map');
    await expect(page.getByText('Carte live')).toBeVisible();

    // Should see status cards
    await expect(page.getByText('En ligne')).toBeVisible();
    await expect(page.getByText('Total')).toBeVisible();

    // Wait for map to load (Leaflet container)
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15000 });

    // Should see at least one marker (SVG-based)
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 10000 });
  });

  test('should filter map by status', async ({ page }) => {
    await navigateToAdminPage(page, '/live-map');

    // Wait for map
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15000 });

    // Change status filter to "Hors ligne"
    await page.locator('button[role="combobox"]').first().click();
    await page.getByText('Hors ligne', { exact: true }).click();
  });

  // ─── Schedules ───────────────────────────────

  test('should show schedules and blackouts', async ({ page }) => {
    await navigateToAdminPage(page, '/schedules');
    await expect(page.getByText('Programmation')).toBeVisible();

    // Should see tabs
    await expect(page.getByRole('tab', { name: /grilles/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /blackout/i })).toBeVisible();

    // Switch to blackouts tab
    await page.getByRole('tab', { name: /blackout/i }).click();

    // Should see the seeded blackout
    await expect(page.getByText('Maintenance serveurs')).toBeVisible({ timeout: 10000 });
  });

  // ─── Invoices ────────────────────────────────

  test('should show invoices from API', async ({ page }) => {
    await navigateToAdminPage(page, '/invoices');
    await expect(page.getByText('Factures')).toBeVisible();

    // Should see filter tabs
    await expect(page.getByText('Toutes')).toBeVisible();
  });

  // ─── Analytics ───────────────────────────────

  test('should show analytics with filters', async ({ page }) => {
    await navigateToAdminPage(page, '/analytics');
    await expect(page.getByText('Analytiques')).toBeVisible();

    // Should show stat cards
    await expect(page.getByText('Total événements')).toBeVisible({ timeout: 10000 });
  });

  // ─── Settings ────────────────────────────────

  test('should load and save settings', async ({ page }) => {
    await navigateToAdminPage(page, '/settings');
    await expect(page.getByText('Paramètres')).toBeVisible();

    // Should see pre-filled values from seed
    const nameInput = page.locator('#platform-name');
    await expect(nameInput).toHaveValue('NeoFilm', { timeout: 10000 });

    // Modify and save
    await nameInput.fill('NeoFilm Test');
    await page.getByRole('button', { name: /sauvegarder/i }).click();

    // Should show success toast
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10000 });

    // Restore
    await nameInput.fill('NeoFilm');
    await page.getByRole('button', { name: /sauvegarder/i }).click();
  });
});
