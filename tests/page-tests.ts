import { chromium, Browser, Page } from 'playwright';

interface PageTest {
  path: string;
  name: string;
}

const pages: PageTest[] = [
  { path: '/', name: 'Dashboard' },
  { path: '/catalog/works', name: 'Works_Catalog' },
  { path: '/data', name: 'Data_Hub' },
  { path: '/cwr/generate', name: 'CWR_Files' },
  { path: '/ai', name: 'AI_Dashboard' },
  { path: '/ai/enrichment', name: 'AI_Enrichment' },
  { path: '/ai/conflicts', name: 'AI_Conflicts' },
];

async function testAllPages() {
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  const results: { name: string; status: string; errors: string[] }[] = [];

  for (const pageTest of pages) {
    const page: Page = await context.newPage();
    const errors: string[] = [];

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Capture page errors
    page.on('pageerror', (err) => {
      errors.push(err.message);
    });

    try {
      console.log(`\nTesting: ${pageTest.name} (${pageTest.path})`);

      const response = await page.goto(`http://localhost:3000${pageTest.path}`, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      const status = response?.status() || 0;

      // Wait for Vue to hydrate
      await page.waitForTimeout(1000);

      // Take screenshot
      await page.screenshot({
        path: `./tests/screenshots/${pageTest.name}.png`,
        fullPage: true,
      });

      // Check for critical elements (sidebar, header, main content)
      const hasSidebar = await page.locator('aside').isVisible().catch(() => false);
      const hasHeader = await page.locator('header').isVisible().catch(() => false);
      const hasMain = await page.locator('main').isVisible().catch(() => false);

      const criticalErrors = errors.filter(e =>
        !e.includes('favicon') &&
        !e.includes('Failed to load resource')
      );

      if (status === 200 && hasSidebar && hasHeader && hasMain && criticalErrors.length === 0) {
        results.push({ name: pageTest.name, status: 'PASS', errors: [] });
        console.log(`  ✅ PASS - HTTP ${status}, layout rendered correctly`);
      } else if (status === 200) {
        results.push({ name: pageTest.name, status: 'WARN', errors: criticalErrors });
        console.log(`  ⚠️  WARN - HTTP ${status}, but some issues detected`);
        if (!hasSidebar) console.log('     - Sidebar not visible');
        if (!hasHeader) console.log('     - Header not visible');
        if (!hasMain) console.log('     - Main content not visible');
        if (criticalErrors.length > 0) {
          console.log('     - Console errors:', criticalErrors.join(', '));
        }
      } else {
        results.push({ name: pageTest.name, status: 'FAIL', errors: [`HTTP ${status}`] });
        console.log(`  ❌ FAIL - HTTP ${status}`);
      }
    } catch (error: any) {
      results.push({ name: pageTest.name, status: 'FAIL', errors: [error.message] });
      console.log(`  ❌ FAIL - ${error.message}`);
    }

    await page.close();
  }

  await browser.close();

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.status === 'PASS').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌';
    console.log(`${icon} ${r.name}: ${r.status}`);
  });

  console.log('='.repeat(60));
  console.log(`Total: ${results.length} | Passed: ${passed} | Warnings: ${warned} | Failed: ${failed}`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

testAllPages().catch(console.error);
