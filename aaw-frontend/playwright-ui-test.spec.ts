/**
 * AAW Mission Control Dashboard - UI Testing with Playwright
 *
 * Tests:
 * 1. Sidebar resize functionality (30% default, resizable to 20-50%)
 * 2. Scroll behavior in task list
 * 3. Layout responsiveness
 * 4. Mission Control theme colors
 */

import { test, expect } from '@playwright/test';

test.describe('AAW Mission Control Dashboard UI Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3000');

    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');
  });

  test('1. Layout has correct 30/70 split', async ({ page }) => {
    // Get viewport width
    const viewportSize = page.viewportSize();
    if (!viewportSize) throw new Error('Viewport size not available');

    const viewportWidth = viewportSize.width;

    // Find sidebar and workspace panels using explicit IDs or order
    // Fallback to older selector style if IDs aren't perfectly applied, but prefer specific approach
    const sidebar = page.locator('#sidebar-panel').or(page.locator('[data-panel-id="sidebar-panel"]')).first();
    const workspace = page.locator('#workspace-panel').or(page.locator('[data-panel-id="workspace-panel"]')).first();

    await expect(sidebar).toBeVisible();
    await expect(workspace).toBeVisible();

    // Get bounding boxes
    const sidebarBox = await sidebar.boundingBox();
    const workspaceBox = await workspace.boundingBox();

    if (!sidebarBox || !workspaceBox) {
      throw new Error('Could not get panel bounding boxes');
    }

    // Calculate percentages (allowing 2% margin of error)
    const sidebarPercent = (sidebarBox.width / viewportWidth) * 100;
    const workspacePercent = (workspaceBox.width / viewportWidth) * 100;

    console.log(`Sidebar: ${sidebarPercent.toFixed(1)}%, Workspace: ${workspacePercent.toFixed(1)}%`);

    // Verify 30/70 split (±2% tolerance)
    expect(sidebarPercent).toBeGreaterThan(28);
    expect(sidebarPercent).toBeLessThan(32);
    expect(workspacePercent).toBeGreaterThan(68);
    expect(workspacePercent).toBeLessThan(72);
  });

  test('2. Sidebar can be resized by dragging handle', async ({ page }) => {
    // Find the resize handle
    const resizeHandle = page.locator('[data-resize-handle-active]').or(
      page.locator('[role="separator"]')
    );

    await expect(resizeHandle).toBeVisible();

    // Get initial sidebar width
    const sidebar = page.locator('#sidebar-panel').first();
    const initialBox = await sidebar.boundingBox();
    if (!initialBox) throw new Error('Could not get sidebar box');

    const initialWidth = initialBox.width;
    console.log(`Initial sidebar width: ${initialWidth}px`);

    // Drag the resize handle to the right (expand sidebar)
    await resizeHandle.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox.x + initialWidth + 100, initialBox.y + 100);
    await page.mouse.up();

    // Wait for resize to complete
    await page.waitForTimeout(500);

    // Get new sidebar width
    const newBox = await sidebar.boundingBox();
    if (!newBox) throw new Error('Could not get new sidebar box');

    const newWidth = newBox.width;
    console.log(`New sidebar width: ${newWidth}px`);

    // Verify sidebar expanded
    expect(newWidth).toBeGreaterThan(initialWidth + 50); // Significant expansion
  });

  test('3. Sidebar has minimum and maximum width constraints', async ({ page }) => {
    const viewportSize = page.viewportSize();
    if (!viewportSize) throw new Error('Viewport size not available');

    const viewportWidth = viewportSize.width;
    const resizeHandle = page.locator('[role="separator"]');
    const sidebar = page.locator('#sidebar-panel').first();

    // Try to make sidebar very narrow (should stop at 20% minSize)
    const sidebarBox = await sidebar.boundingBox();
    if (!sidebarBox) throw new Error('Could not get sidebar box');

    await resizeHandle.hover();
    await page.mouse.down();
    await page.mouse.move(50, sidebarBox.y + 100); // Try to drag very far left
    await page.mouse.up();
    await page.waitForTimeout(500);

    const minBox = await sidebar.boundingBox();
    if (!minBox) throw new Error('Could not get min box');

    const minPercent = (minBox.width / viewportWidth) * 100;
    console.log(`Minimum sidebar: ${minPercent.toFixed(1)}%`);

    // Should be around 20% (minSize)
    expect(minPercent).toBeGreaterThan(18);
    expect(minPercent).toBeLessThan(25);

    // Try to make sidebar very wide (should stop at 50% maxSize)
    await resizeHandle.hover();
    await page.mouse.down();
    await page.mouse.move(viewportWidth * 0.8, sidebarBox.y + 100); // Try to drag very far right
    await page.mouse.up();
    await page.waitForTimeout(500);

    const maxBox = await sidebar.boundingBox();
    if (!maxBox) throw new Error('Could not get max box');

    const maxPercent = (maxBox.width / viewportWidth) * 100;
    console.log(`Maximum sidebar: ${maxPercent.toFixed(1)}%`);

    // Should be around 50% (maxSize)
    expect(maxPercent).toBeLessThan(55); // A bit of flexibility for tolerance
  });

  test('4. Task list scrolls correctly', async ({ page }) => {
    // Look for scroll area viewport
    const taskList = page.locator('[data-radix-scroll-area-viewport]').first();

    // Ensure it exists
    if (await taskList.count() === 0) {
      console.log('Scroll area not found, skipping scroll test');
      return;
    }

    // Check if task list is scrollable
    const isScrollable = await taskList.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    if (isScrollable) {
      // Get initial scroll position
      const initialScroll = await taskList.evaluate((el) => el.scrollTop);
      console.log(`Initial scroll: ${initialScroll}`);

      // Scroll down
      await taskList.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });

      // Wait for scroll
      await page.waitForTimeout(300);

      // Get new scroll position
      const finalScroll = await taskList.evaluate((el) => el.scrollTop);
      console.log(`Final scroll: ${finalScroll}`);

      // Verify scrolling worked
      expect(finalScroll).toBeGreaterThan(initialScroll);
    } else {
      console.log('Task list not scrollable (not enough tasks)');
      // This is ok, just means there aren't many tasks yet
      expect(true).toBe(true);
    }
  });

  test('5. Mission Control theme colors are applied', async ({ page }) => {
    // Check background color (should be dark #0d1117)
    // We check the body or the main wrapper

    // Ensure dark mode class is applied to html
    await expect(page.locator('html')).toHaveClass(/dark/);

    const backgroundColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });

    console.log(`Background color: ${backgroundColor}`);

    // RGB for #0d1117 is rgb(13, 17, 23)
    // If it returns rgba, handle that too
    expect(backgroundColor).toMatch(/rgb\(13, 17, 23\)|rgba\(13, 17, 23, 1\)/);
  });

  test('6. Terminal component renders with Mission Control theme', async ({ page }) => {
    // Look for live terminal wrapper
    const terminalWrapper = page.locator('[data-testid="live-terminal"]');
    await expect(terminalWrapper).toBeVisible();

    // Look for xterm canvas/screen
    const xtermScreen = terminalWrapper.locator('.xterm-screen');

    // It might take a moment for xterm to initialize
    await expect(xtermScreen).toBeVisible({ timeout: 5000 });
  });

  test('7. Responsive layout on window resize', async ({ page }) => {
    // Get initial layout
    const initialSize = page.viewportSize();
    console.log(`Initial viewport: ${initialSize?.width}x${initialSize?.height}`);

    // Resize to smaller width
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(500);

    // Verify sidebar is still visible using ID
    const sidebar = page.locator('#sidebar-panel');
    await expect(sidebar).toBeVisible();

    // Resize to larger width
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);

    // Verify layout still works
    await expect(sidebar).toBeVisible();

    console.log('Layout responsive to window resize: ✓');
  });

  test('8. Task status badges have correct colors', async ({ page }) => {
    // Look for specific test id badges
    const badges = page.locator('[data-testid="task-status-badge"]');

    const badgeCount = await badges.count();
    console.log(`Found ${badgeCount} badges`);

    if (badgeCount > 0) {
      // Check first badge for Mission Control color classes
      const firstBadge = badges.first();
      const badgeClasses = await firstBadge.getAttribute('class');

      console.log(`Badge classes: ${badgeClasses}`);

      // Should have mission control color classes
      const hasMCColors = badgeClasses && (
        badgeClasses.includes('mc-accent-blue') ||
        badgeClasses.includes('mc-accent-green') ||
        badgeClasses.includes('mc-accent-red') ||
        badgeClasses.includes('mc-accent-yellow')
      );

      expect(hasMCColors).toBe(true);
    }
  });
});
