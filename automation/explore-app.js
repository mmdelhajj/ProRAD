const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8080';
const SCREENSHOTS_DIR = '/root/proisp/automation/screenshots';

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForPageLoad(page) {
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await delay(1000);
}

async function takeScreenshot(page, name) {
    const filename = `${SCREENSHOTS_DIR}/${name}.png`;
    await page.screenshot({ path: filename, fullPage: true });
    console.log(`  Screenshot: ${name}.png`);
}

async function handleModals(page) {
    try {
        const closeButtons = await page.$$('button:has-text("Close"), button:has-text("Cancel"), button:has-text("×"), [class*="modal"] button[class*="close"], button[aria-label="Close"]');
        for (const btn of closeButtons) {
            try {
                if (await btn.isVisible()) {
                    await btn.click({ timeout: 1000 });
                    await delay(500);
                }
            } catch (e) {}
        }
    } catch (e) {}
}

async function expandCollapsible(page) {
    try {
        const expandButtons = await page.$$('[aria-expanded="false"], button:has-text("Show More"), button:has-text("Expand")');
        for (const btn of expandButtons) {
            try {
                if (await btn.isVisible()) {
                    await btn.click({ timeout: 1000 });
                    await delay(300);
                }
            } catch (e) {}
        }
    } catch (e) {}
}

async function checkPagination(page, pageName) {
    let pageNum = 1;
    let hasNextPage = true;

    while (hasNextPage && pageNum <= 3) {
        console.log(`    Page ${pageNum}`);

        const nextBtn = await page.$('button:has-text("Next"):not([disabled]), button[aria-label="Go to next page"]:not([disabled])');

        if (nextBtn && await nextBtn.isVisible()) {
            try {
                await nextBtn.click();
                await waitForPageLoad(page);
                pageNum++;
            } catch (e) {
                hasNextPage = false;
            }
        } else {
            hasNextPage = false;
        }
    }
}

async function exploreEditButtons(page, sectionName) {
    try {
        const editButtons = await page.$$('button:has(svg), button:has-text("Edit"), [title*="Edit"]');
        const visibleEditButtons = [];

        for (const btn of editButtons) {
            if (await btn.isVisible()) {
                const text = await btn.textContent().catch(() => '');
                const title = await btn.getAttribute('title').catch(() => '');
                if (text.includes('Edit') || title?.includes('Edit') || title?.includes('edit')) {
                    visibleEditButtons.push(btn);
                }
            }
        }

        if (visibleEditButtons.length > 0) {
            console.log(`    Found ${visibleEditButtons.length} edit button(s)`);

            try {
                await visibleEditButtons[0].click();
                await delay(1000);
                await takeScreenshot(page, `${sectionName}-edit-form`);

                const inputs = await page.$$('input:visible, select:visible, textarea:visible');
                console.log(`    Edit form has ${inputs.length} visible field(s)`);

                for (const input of inputs.slice(0, 10)) {
                    const name = await input.getAttribute('name') || await input.getAttribute('placeholder') || await input.getAttribute('id') || 'unnamed';
                    const type = await input.getAttribute('type') || 'text';
                    console.log(`      - ${name} (${type})`);
                }

                await handleModals(page);
                await page.keyboard.press('Escape');
                await delay(500);

            } catch (e) {
                console.log(`    Could not explore edit form: ${e.message}`);
            }
        }
    } catch (e) {}
}

async function exploreSelectOptions(page, sectionName) {
    try {
        const selects = await page.$$('select:visible');

        for (let i = 0; i < selects.length && i < 5; i++) {
            const select = selects[i];
            const name = await select.getAttribute('name') || await select.getAttribute('id') || `select-${i}`;

            const options = await select.$$('option');
            const optionTexts = [];
            for (const opt of options.slice(0, 10)) {
                const text = await opt.textContent();
                if (text.trim()) optionTexts.push(text.trim());
            }

            if (optionTexts.length > 0) {
                console.log(`    Select "${name}": ${optionTexts.slice(0, 5).join(', ')}${optionTexts.length > 5 ? '...' : ''}`);
            }
        }
    } catch (e) {}
}

async function explorePage(page, path, name) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Exploring: ${name} (${path})`);
    console.log('='.repeat(60));

    try {
        await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    } catch (e) {
        await page.goto(`${BASE_URL}${path}`);
    }
    await waitForPageLoad(page);

    // Check if redirected to login
    if (page.url().includes('/login')) {
        console.log(`  Redirected to login - need to re-authenticate`);
        return;
    }

    await takeScreenshot(page, name);

    // Check page title/header
    try {
        const header = await page.$('h1, h2');
        if (header) {
            const headerText = await header.textContent().catch(() => '');
            if (headerText && !headerText.includes('ProISP')) {
                console.log(`  Page header: ${headerText.trim()}`);
            }
        }
    } catch (e) {}

    await expandCollapsible(page);
    await exploreSelectOptions(page, name);

    // Check for tabs
    try {
        const tabs = await page.$$('[role="tab"], button[class*="tab"], [class*="tab-button"]');
        const visibleTabs = [];
        for (const tab of tabs) {
            if (await tab.isVisible()) visibleTabs.push(tab);
        }

        if (visibleTabs.length > 1) {
            console.log(`  Found ${visibleTabs.length} tab(s)`);
            for (let i = 0; i < visibleTabs.length; i++) {
                try {
                    const tabText = await visibleTabs[i].textContent();
                    console.log(`    Tab: ${tabText.trim()}`);
                    await visibleTabs[i].click();
                    await waitForPageLoad(page);
                    await takeScreenshot(page, `${name}-tab-${i+1}`);
                } catch (e) {}
            }
        }
    } catch (e) {}

    await checkPagination(page, name);

    // Look for "Add" or "Create" buttons
    try {
        const addButtons = await page.$$('button:has-text("Add"), button:has-text("Create"), button:has-text("New")');
        const visibleAddButtons = [];
        for (const btn of addButtons) {
            if (await btn.isVisible()) visibleAddButtons.push(btn);
        }

        if (visibleAddButtons.length > 0) {
            console.log(`  Found ${visibleAddButtons.length} add/create button(s)`);

            try {
                await visibleAddButtons[0].click();
                await delay(1000);
                await takeScreenshot(page, `${name}-add-form`);

                const inputs = await page.$$('input:visible, select:visible, textarea:visible');
                console.log(`  Add form has ${inputs.length} visible field(s):`);

                for (const input of inputs.slice(0, 20)) {
                    const inputName = await input.getAttribute('name') || await input.getAttribute('placeholder') || await input.getAttribute('id') || 'unnamed';
                    const type = await input.getAttribute('type') || 'text';
                    console.log(`    - ${inputName} (${type})`);
                }

                await exploreSelectOptions(page, `${name}-add-form`);
                await handleModals(page);
                await page.keyboard.press('Escape');
                await delay(500);

            } catch (e) {
                console.log(`  Could not explore add form: ${e.message}`);
            }
        }
    } catch (e) {}

    await exploreEditButtons(page, name);

    // Look for bulk action buttons
    try {
        const bulkButtons = await page.$$('button:has-text("Bulk"), button:has-text("Import"), button:has-text("Export"), button:has-text("Actions")');
        for (const btn of bulkButtons) {
            if (await btn.isVisible()) {
                const text = await btn.textContent();
                console.log(`  Action button: ${text.trim()}`);

                try {
                    await btn.click();
                    await delay(500);
                    await takeScreenshot(page, `${name}-bulk-action`);

                    const options = await page.$$('[role="menuitem"], [class*="dropdown"] button, [class*="menu"] button');
                    for (const opt of options) {
                        if (await opt.isVisible()) {
                            const optText = await opt.textContent();
                            console.log(`    - ${optText.trim()}`);
                        }
                    }

                    await page.keyboard.press('Escape');
                    await delay(300);
                } catch (e) {}
            }
        }
    } catch (e) {}

    // Look for filter/search options
    try {
        const filters = await page.$$('input[placeholder*="Search"], input[placeholder*="Filter"], input[placeholder*="search"]');
        let visibleFilters = 0;
        for (const f of filters) {
            if (await f.isVisible()) visibleFilters++;
        }
        if (visibleFilters > 0) {
            console.log(`  Search/filter fields: ${visibleFilters}`);
        }
    } catch (e) {}

    // Count table rows
    try {
        const rows = await page.$$('table tbody tr');
        const visibleRows = [];
        for (const row of rows) {
            if (await row.isVisible()) visibleRows.push(row);
        }
        console.log(`  Data rows: ${visibleRows.length}`);
    } catch (e) {}

    // Check for stats/cards
    try {
        const cards = await page.$$('[class*="stat"], [class*="card"], [class*="metric"]');
        let visibleCards = 0;
        for (const card of cards) {
            if (await card.isVisible()) visibleCards++;
        }
        if (visibleCards > 0) {
            console.log(`  Stats/Cards: ${visibleCards}`);
        }
    } catch (e) {}
}

async function main() {
    console.log('Starting ProISP Application Exploration');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`API URL: ${API_URL}`);
    console.log(`Screenshots will be saved to: ${SCREENSHOTS_DIR}`);

    // First, get a valid token from the API
    console.log('\n--- Getting authentication token ---');
    const http = require('http');

    const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });

    const loginResponse = await new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 8080,
            path: '/api/auth/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': loginData.length
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.token) {
                        console.log(`  Got token: ${json.token.substring(0, 50)}...`);
                        resolve(json);
                    } else {
                        console.log(`  Login response: ${data}`);
                        reject(new Error('No token in response'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(loginData);
        req.end();
    });

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    // Listen for console messages
    page.on('console', msg => {
        if (msg.type() === 'error') {
            const text = msg.text();
            if (!text.includes('favicon')) {
                console.log(`  [Console Error]: ${text.substring(0, 100)}`);
            }
        }
    });

    try {
        // Navigate to app and inject token into localStorage in the correct format
        console.log('\n--- Setting up authentication ---');
        await page.goto(`${BASE_URL}/login`);
        await delay(1000);

        // Inject token into localStorage with the correct Zustand persist format
        const authState = {
            state: {
                user: loginResponse.user,
                token: loginResponse.token,
                isAuthenticated: true
            },
            version: 0
        };

        await page.evaluate((authStateJson) => {
            localStorage.setItem('proisp-auth', authStateJson);
        }, JSON.stringify(authState));

        console.log('  Token injected into localStorage (proisp-auth)');

        // Refresh the page to pick up the auth state
        await page.reload();
        await waitForPageLoad(page);

        // Navigate to dashboard
        await page.goto(`${BASE_URL}/dashboard`);
        await waitForPageLoad(page);

        const currentUrl = page.url();
        console.log(`  Current URL: ${currentUrl}`);

        await takeScreenshot(page, '01-dashboard-initial');
        console.log(`  Final URL: ${page.url()}`);

        // Define all pages to explore
        const pages = [
            { path: '/dashboard', name: '02-dashboard' },
            { path: '/subscribers', name: '03-subscribers' },
            { path: '/services', name: '04-services' },
            { path: '/nas', name: '05-nas-devices' },
            { path: '/resellers', name: '06-resellers' },
            { path: '/sessions', name: '07-sessions' },
            { path: '/bandwidth', name: '08-bandwidth-rules' },
            { path: '/fup', name: '09-fup-management' },
            { path: '/communication/templates', name: '10-comm-templates' },
            { path: '/communication/rules', name: '11-comm-rules' },
            { path: '/invoices', name: '12-invoices' },
            { path: '/prepaid', name: '13-prepaid-cards' },
            { path: '/tickets', name: '14-tickets' },
            { path: '/audit', name: '15-audit-logs' },
            { path: '/users', name: '16-users' },
            { path: '/permissions', name: '17-permissions' },
            { path: '/settings', name: '18-settings' },
            { path: '/reports', name: '19-reports' },
            { path: '/backups', name: '20-backups' },
        ];

        for (const p of pages) {
            await explorePage(page, p.path, p.name);
        }

        // Final summary
        console.log('\n' + '='.repeat(60));
        console.log('EXPLORATION COMPLETE');
        console.log('='.repeat(60));
        console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}`);

        const files = fs.readdirSync(SCREENSHOTS_DIR).sort();
        console.log(`\nTotal screenshots: ${files.length}`);
        files.forEach(f => console.log(`  - ${f}`));

    } catch (error) {
        console.error('Error during exploration:', error);
        await takeScreenshot(page, 'error-state');
    } finally {
        await browser.close();
    }
}

main().catch(console.error);
