const { chromium } = require('playwright');
const http = require('http');

const BASE_URL = 'http://localhost:3000';

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

    // Collect errors
    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push({ page: page.url(), error: msg.text() });
        }
    });
    page.on('pageerror', err => {
        errors.push({ page: page.url(), error: err.message });
    });

    // Set auth
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate((authState) => {
        localStorage.setItem('proisp-auth', authState);
    }, JSON.stringify({ state: { user: loginResponse.user, token: loginResponse.token, isAuthenticated: true }, version: 0 }));

    // Test all pages
    const pages = [
        { name: 'Dashboard', url: '/' },
        { name: 'Subscribers', url: '/subscribers' },
        { name: 'Services', url: '/services' },
        { name: 'NAS', url: '/nas' },
        { name: 'Resellers', url: '/resellers' },
        { name: 'Sessions', url: '/sessions' },
        { name: 'Invoices', url: '/invoices' },
        { name: 'Prepaid', url: '/prepaid' },
        { name: 'Bandwidth', url: '/bandwidth' },
        { name: 'FUP', url: '/fup' },
        { name: 'Communication', url: '/communication' },
        { name: 'Tickets', url: '/tickets' },
        { name: 'Permissions', url: '/permissions' },
        { name: 'Reports', url: '/reports' },
        { name: 'Settings', url: '/settings' },
        { name: 'Audit', url: '/audit' },
    ];

    console.log('Testing all pages...\n');

    for (const p of pages) {
        try {
            const startErrors = errors.length;
            await page.goto(`${BASE_URL}${p.url}`);
            await page.waitForLoadState('networkidle');
            await new Promise(r => setTimeout(r, 1000));

            const newErrors = errors.length - startErrors;
            if (newErrors > 0) {
                console.log(`✗ ${p.name} - ${newErrors} error(s)`);
                for (let i = startErrors; i < errors.length; i++) {
                    console.log(`  Error: ${errors[i].error.substring(0, 100)}`);
                }
            } else {
                console.log(`✓ ${p.name} - OK`);
            }
        } catch (e) {
            console.log(`✗ ${p.name} - FAILED: ${e.message}`);
        }
    }

    console.log('\n=== Summary ===');
    console.log(`Total errors: ${errors.length}`);
    if (errors.length > 0) {
        console.log('\nAll errors:');
        errors.forEach((e, i) => {
            console.log(`${i + 1}. ${e.error.substring(0, 150)}`);
        });
    }

    await browser.close();
}

main().catch(console.error);
