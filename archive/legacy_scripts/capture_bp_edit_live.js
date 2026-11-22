const puppeteer = require('puppeteer');
const path = require('path');

const artifactDir = 'C:\\Users\\sanjay nag\\.gemini\\antigravity\\brain\\d7348a13-a163-4f24-ac0f-b3ce70aedc69';

async function capture() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });

        console.log('Navigating to app...');
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));

        // Switch to Bill & EMI section
        console.log('Switching to billPaymentsSection...');
        await page.evaluate(() => {
            if (typeof switchSection === 'function') {
                switchSection('billPaymentsSection');
            } else {
                const el = document.querySelector('[data-section=\"billPaymentsSection\"], #nav-bill-payments');
                if (el) el.click();
            }
        });
        await new Promise(r => setTimeout(r, 1500));

        // Screenshot 1: Table with Edit button
        const tableShotPath = path.join(artifactDir, 'bp_table_with_edit_btn.png');
        await page.screenshot({ path: tableShotPath });
        console.log('Captured:', tableShotPath);

        // Click Edit on first row
        console.log('Clicking ✏️ Edit button on first row...');
        await page.evaluate(() => {
            const firstRowEditBtn = document.querySelector('#billPaymentsTableBody tr button[onclick*=\"openEditBillPaymentModal\"]');
            if (firstRowEditBtn) {
                firstRowEditBtn.click();
            } else {
                console.warn('Edit button not found in table body!');
            }
        });

        await new Promise(r => setTimeout(r, 1500));

        // Screenshot 2: Edit Modal with pre-filled details
        const modalShotPath = path.join(artifactDir, 'bp_edit_modal_live.png');
        await page.screenshot({ path: modalShotPath });
        console.log('Captured:', modalShotPath);

    } catch (err) {
        console.error('Puppeteer capture error:', err);
    } finally {
        await browser.close();
    }
}

capture();
