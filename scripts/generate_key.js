/**
 * Admin License Key Generator CLI for Sanjay ji
 * Run via: node scripts/generate_key.js or GENERATE_KEY.bat
 */
const readline = require('readline');
const lm = require('../utils/licenseManager');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(q) {
    return new Promise(resolve => rl.question(q, resolve));
}

async function main() {
    console.log('\n======================================================');
    console.log('   HisaabBC - Personal License Key Generator (Admin)   ');
    console.log('======================================================\n');

    const customerHwId = (await ask('1. Customer Machine Hardware ID (e.g., HWID-E8D1-DE0E-4925): ')).trim();
    if (!customerHwId) {
        console.log('Hardware ID required. Aborted.');
        rl.close();
        return;
    }

    console.log('\nPlan Types:');
    console.log('  1. Annual Pro (1 Year - 365 Days)');
    console.log('  2. Monthly (30 Days)');
    console.log('  3. Lifetime (No Expiry)');
    const planChoice = (await ask('Select Plan (1/2/3) [Default: 1]: ')).trim() || '1';

    let planCode = 'PRO';
    let expiryYmd = '';

    const now = new Date();
    if (planChoice === '2') {
        planCode = 'MONTH';
        const exp = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        expiryYmd = exp.toISOString().slice(0, 10).replace(/-/g, '');
    } else if (planChoice === '3') {
        planCode = 'LIFE';
        expiryYmd = 'LIFETIME';
    } else {
        planCode = 'PRO';
        const exp = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
        expiryYmd = exp.toISOString().slice(0, 10).replace(/-/g, '');
    }

    const key = lm.generatePersonalKey(planCode, customerHwId, expiryYmd);

    console.log('\n======================================================');
    console.log('               LICENSE KEY GENERATED!                 ');
    console.log('======================================================');
    console.log(`Customer Hardware ID: ${customerHwId}`);
    console.log(`Plan                : ${planCode === 'LIFE' ? 'Lifetime' : planCode === 'MONTH' ? 'Monthly' : 'Annual Pro'}`);
    console.log(`Expiry Date         : ${expiryYmd === 'LIFETIME' ? 'Never' : expiryYmd}`);
    console.log('------------------------------------------------------');
    console.log(`KEY:  ${key}`);
    console.log('------------------------------------------------------');
    console.log('Copy the KEY above and send to customer via WhatsApp.');
    console.log('======================================================\n');

    rl.close();
}

main().catch(err => {
    console.error(err);
    rl.close();
});
