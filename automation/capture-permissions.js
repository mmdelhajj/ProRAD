const { chromium } = require('playwright');
const http = require('http');

const BASE_URL = 'http://localhost:3000';
const SCREENSHOTS_DIR = '/root/proisp/automation/screenshots';

async function main() {
    // Get token
    const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });
    const loginResponse = await new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 8080,
            path: '/api/auth/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.write(loginData);
        req.end();
    });

    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    // Set auth
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate((authState) => {
        localStorage.setItem('proisp-auth', authState);
    }, JSON.stringify({ state: { user: loginResponse.user, token: loginResponse.token, isAuthenticated: true }, version: 0 }));

    // Go to permissions page and wait for data
    await page.goto(`${BASE_URL}/permissions`);
    await page.waitForLoadState('networkidle');
    await new Promise(r => setTimeout(r, 3000));

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/21-permissions-final.png`, fullPage: true });
    console.log('Screenshot saved: 21-permissions-final.png');

    // Click Create Group to show modal
    const createBtn = await page.$('button:has-text("Create Group")');
    if (createBtn) {
        await createBtn.click();
        await new Promise(r => setTimeout(r, 1000));
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/21-permissions-create-group.png`, fullPage: true });
        console.log('Screenshot saved: 21-permissions-create-group.png');
    }

    await browser.close();
    console.log('Done!');
}

main().catch(console.error);
