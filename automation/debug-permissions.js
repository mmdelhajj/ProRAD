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

    // Capture network requests
    page.on('response', async response => {
        if (response.url().includes('/permissions')) {
            console.log('URL:', response.url());
            console.log('Status:', response.status());
            try {
                const body = await response.json();
                console.log('Response:', JSON.stringify(body, null, 2).substring(0, 500));
            } catch (e) {
                console.log('Could not parse response');
            }
        }
    });

    // Capture console errors
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('Console Error:', msg.text());
        }
    });

    // Set auth
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate((authState) => {
        localStorage.setItem('proisp-auth', authState);
    }, JSON.stringify({ state: { user: loginResponse.user, token: loginResponse.token, isAuthenticated: true }, version: 0 }));

    // Go to permissions page
    await page.goto(`${BASE_URL}/permissions`);
    await page.waitForLoadState('networkidle');
    await new Promise(r => setTimeout(r, 3000));

    // Check what the page sees
    const debugInfo = await page.evaluate(() => {
        const authData = localStorage.getItem('proisp-auth');
        return {
            authData: authData ? JSON.parse(authData) : null,
            url: window.location.href
        };
    });
    console.log('Auth data:', JSON.stringify(debugInfo, null, 2));

    await browser.close();
}

main().catch(console.error);
