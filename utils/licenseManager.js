/**
 * HisaabBC - Universal License & Hardware-Lock Management Engine
 * Supports:
 * 1. Hardware Fingerprinting (Machine ID)
 * 2. Universal / Community Cloud Keys (e.g., TEST123 with remote GitHub expiry extension)
 * 3. Cryptographically Signed Personal Keys (Locked to specific Hardware ID)
 * 4. 100% Offline Resilience (Local SQLite caching + background GitHub sync)
 * 5. Auto-Provisioning for Zero Disruption
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const https = require('https');
const { getDb } = require('../database/db');

// Master Cryptographic Salt for Signed Personal Keys (Admin Only)
const MASTER_KEY_SALT = 'HISAAB_BC_APNA_HISAAB_SECURE_SALT_2026_X98';

// GitHub Raw & CDN URLs for Remote Cloud Sync
const GITHUB_LICENSE_URLS = [
    'https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite/config/licenses.json',
    'https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/config/licenses.json',
    'https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/config/licenses.json',
    'https://fastly.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/config/licenses.json'
];
const GITHUB_LICENSE_URL = GITHUB_LICENSE_URLS[0];
const LOCAL_CONFIG_PATH = path.join(__dirname, '..', 'config', 'licenses.json');

let cachedHardwareId = null;
let lastSyncTime = null;

/**
 * Generate or retrieve stable Hardware ID on Windows
 */
function getHardwareId() {
    if (cachedHardwareId) return cachedHardwareId;

    let rawGuid = '';
    try {
        const out = execSync('reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', {
            encoding: 'utf8',
            timeout: 2500,
            stdio: ['pipe', 'pipe', 'ignore']
        });
        const match = out.match(/MachineGuid\s+REG_SZ\s+([a-fA-F0-9\-]+)/);
        if (match && match[1]) {
            rawGuid = match[1].trim();
        }
    } catch (e) {
        // Fallback if reg query is restricted
    }

    if (!rawGuid) {
        const nics = os.networkInterfaces();
        let mac = '';
        for (const name of Object.keys(nics)) {
            for (const net of nics[name]) {
                if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
                    mac = net.mac;
                    break;
                }
            }
            if (mac) break;
        }
        rawGuid = (process.env.COMPUTERNAME || os.hostname()) + '-' + (os.userInfo()?.username || 'user') + '-' + mac;
    }

    const cpuModel = os.cpus()?.[0]?.model || 'StandardCPU';
    const composite = `${rawGuid}_${cpuModel}_HISAAB`;
    const hash = crypto.createHash('sha256').update(composite).digest('hex').toUpperCase();

    cachedHardwareId = `HWID-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}`;
    return cachedHardwareId;
}

/**
 * Load local config file fallback
 */
function getLocalConfig() {
    try {
        if (fs.existsSync(LOCAL_CONFIG_PATH)) {
            const raw = fs.readFileSync(LOCAL_CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.warn('[LicenseManager] Could not read local config:', e.message);
    }
    return {
        version: 1,
        universalKeys: {
            'TEST123': {
                key: 'TEST123',
                plan: '90 Days Free Trial',
                planHindi: '९० दिन फ्री ट्रायल (Universal Offer)',
                expiryDate: '2027-02-23',
                isActive: true,
                message: '९० दिन का विशेष फ्री ट्रायल ऑफर सभी केंद्रों के लिए सक्रिय है!'
            }
        },
        blacklistedHardwareIds: []
    };
}

/**
 * Fetch remote licenses config from GitHub/CDN with multi-mirror fallback
 */
function fetchSingleUrl(u) {
    return new Promise((resolve) => {
        try {
            const req = https.get(u, { timeout: 3500 }, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    return resolve(null);
                }
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data.replace(/^\uFEFF/, ''));
                        resolve(parsed);
                    } catch (err) {
                        resolve(null);
                    }
                });
            });
            req.on('error', () => resolve(null));
            req.on('timeout', () => {
                req.destroy();
                resolve(null);
            });
        } catch (_) {
            resolve(null);
        }
    });
}

async function fetchRemoteConfig() {
    for (const u of GITHUB_LICENSE_URLS) {
        try {
            const res = await fetchSingleUrl(u);
            if (res && res.universalKeys) {
                return res;
            }
        } catch (_) { }
    }
    return null;
}

/**
 * Get active license record from SQLite
 */
function getActiveRecord() {
    const db = getDb();
    const row = db.prepare(`
        SELECT * FROM AppLicenses 
        WHERE IsActive = 1 
        ORDER BY LicenseID DESC 
        LIMIT 1
    `).get();
    return row || null;
}

/**
 * Calculate days remaining between today and expiry date (YYYY-MM-DD)
 */
function getDaysRemaining(expiryDateStr) {
    if (!expiryDateStr) return 9999;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [y, m, d] = expiryDateStr.split('-').map(Number);
    const exp = new Date(y, m - 1, d);
    const diffMs = exp.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Initialize / Auto-provision license on server boot
 */
async function initLicense() {
    const db = getDb();
    const hwId = getHardwareId();

    let record = getActiveRecord();

    if (!record) {
        // Auto-provision TEST123 for seamless zero-downtime operation
        const localCfg = getLocalConfig();
        const testKeyInfo = localCfg.universalKeys?.['TEST123'] || {
            expiryDate: '2027-02-23',
            plan: '90 Days Free Trial'
        };

        let shopName = 'Apna CSC / BC Kendra';
        let ownerName = 'Sanchalak';
        let mobile = '';
        try {
            const u = db.prepare('SELECT ShopName, MobileNumber FROM Users LIMIT 1').get();
            if (u) {
                if (u.ShopName) shopName = u.ShopName;
                if (u.MobileNumber) mobile = u.MobileNumber;
            }
        } catch (e) {}

        const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

        db.prepare(`
            INSERT INTO AppLicenses (
                LicenseKey, CustomerShopName, OwnerName, MobileNumber,
                HardwareID, LicenseType, ActivationDate, ExpiryDate,
                MaxDevices, IsActive, Notes, CreatedAt, UpdatedAt
            ) VALUES (
                @key, @shop, @owner, @mobile,
                @hw, @type, @now, @exp,
                9999, 1, @notes, @now, @now
            )
        `).run({
            key: 'TEST123',
            shop: shopName,
            owner: ownerName,
            mobile: mobile,
            hw: hwId,
            type: '90 Days Free Trial',
            now: nowStr,
            exp: testKeyInfo.expiryDate,
            notes: 'Auto-provisioned 90-day universal key on v1.0.62 upgrade'
        });

        console.log(`[LicenseManager] Auto-provisioned TEST123 license for machine ${hwId} (Expires: ${testKeyInfo.expiryDate})`);
        record = getActiveRecord();
    }

    // Trigger non-blocking cloud sync in background
    syncWithCloud().catch(err => {
        console.warn('[LicenseManager] Background sync deferred:', err.message);
    });

    return record;
}

/**
 * Sync active universal license with GitHub remote config
 */
async function syncWithCloud() {
    const db = getDb();
    const hwId = getHardwareId();
    const record = getActiveRecord();
    if (!record) return null;

    const remoteCfg = await fetchRemoteConfig();
    if (remoteCfg && remoteCfg.universalKeys) {
        try {
            fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(remoteCfg, null, 2), 'utf8');
        } catch (_) {}
    }
    const cfg = remoteCfg || getLocalConfig();
    if (!cfg) return null;

    lastSyncTime = new Date().toISOString();

    // 1. Check Hardware ID Blacklist
    if (Array.isArray(cfg.blacklistedHardwareIds) && cfg.blacklistedHardwareIds.includes(hwId)) {
        db.prepare(`
            UPDATE AppLicenses 
            SET IsActive = 0, Notes = 'Hardware ID blacklisted via remote control', UpdatedAt = datetime('now', 'localtime')
            WHERE HardwareID = ?
        `).run(hwId);
        console.warn(`[LicenseManager] Machine ${hwId} has been revoked by admin via GitHub.`);
        return { revoked: true, reason: 'Machine blacklisted' };
    }

    // 2. Check Universal Key sync (e.g. TEST123)
    const upperKey = (record.LicenseKey || '').trim().toUpperCase();
    if (cfg.universalKeys && cfg.universalKeys[upperKey]) {
        const uInfo = cfg.universalKeys[upperKey];
        const newExpiry = uInfo.expiryDate;
        const newActive = uInfo.isActive ? 1 : 0;
        const newPlan = uInfo.plan || record.LicenseType;

        const currentExpiry = record.ExpiryDate;
        let changed = false;

        if (newExpiry && newExpiry !== currentExpiry) {
            changed = true;
        }
        if (newActive !== record.IsActive) {
            changed = true;
        }

        if (changed) {
            db.prepare(`
                UPDATE AppLicenses 
                SET ExpiryDate = @newExp,
                    IsActive = @newAct,
                    LicenseType = @newPlan,
                    UpdatedAt = datetime('now', 'localtime')
                WHERE LicenseID = @id
            `).run({
                newExp: newExpiry,
                newAct: newActive,
                newPlan: newPlan,
                id: record.LicenseID
            });
            console.log(`[LicenseManager] Remote sync updated ${upperKey}: Expiry=${newExpiry}, Active=${newActive}`);
        }
    }

    return getLicenseStatus();
}

/**
 * Cryptographic validation for Personal Signed Keys:
 * Format: HISAAB-<PLAN>-<HW_SHORT>-<EXPIRY_YYYYMMDD>-<SIGNATURE>
 * e.g., HISAAB-PRO-A01E-20271123-8B3F21
 */
function verifyPersonalKey(keyStr, hwId) {
    if (!keyStr || typeof keyStr !== 'string') return null;
    const parts = keyStr.trim().toUpperCase().split('-');
    if (parts.length < 5 || parts[0] !== 'HISAAB') return null;

    const [prefix, plan, hwShort, expiryYmd, signature] = parts;

    // Verify Hardware ID segment
    const localHwShort = hwId.replace(/[^A-F0-9]/g, '').substring(0, 4);
    if (hwShort !== localHwShort && hwShort !== 'ALL') {
        return { valid: false, error: 'यह लाइसेंस की इस कंप्यूटर के लिए मान्य नहीं है (Hardware Mismatch)' };
    }

    // Verify Signature
    const payload = `${prefix}-${plan}-${hwShort}-${expiryYmd}`;
    const expectedSig = crypto.createHmac('sha256', MASTER_KEY_SALT)
        .update(payload)
        .digest('hex')
        .substring(0, 6)
        .toUpperCase();

    if (signature !== expectedSig) {
        return { valid: false, error: 'अमान्य डिजिटल सिग्नेचर (Invalid Cryptographic Signature)' };
    }

    // Parse Expiry Date
    let expFormatted = '2099-12-31';
    if (expiryYmd !== 'LIFETIME' && expiryYmd.length === 8) {
        const y = expiryYmd.substring(0, 4);
        const m = expiryYmd.substring(4, 6);
        const d = expiryYmd.substring(6, 8);
        expFormatted = `${y}-${m}-${d}`;
    }

    let planName = 'Annual Pro Plan';
    if (plan === 'LIFE') planName = 'Lifetime Pro Plan';
    else if (plan === 'MONTH') planName = 'Monthly Plan';

    return {
        valid: true,
        plan: planName,
        expiryDate: expFormatted
    };
}

/**
 * Helper to generate Personal Signed Key (Used by Admin tool)
 */
function generatePersonalKey(planCode, hwId, expiryYmd) {
    const hwShort = hwId ? hwId.replace(/[^A-F0-9]/g, '').substring(0, 4) : 'ALL';
    const plan = planCode || 'PRO';
    const exp = expiryYmd || '20271123';
    const payload = `HISAAB-${plan}-${hwShort}-${exp}`;
    const signature = crypto.createHmac('sha256', MASTER_KEY_SALT)
        .update(payload)
        .digest('hex')
        .substring(0, 6)
        .toUpperCase();

    return `${payload}-${signature}`;
}

/**
 * Activate a license key entered by user
 */
async function activateKey(keyInput, shopDetails = {}) {
    const db = getDb();
    const hwId = getHardwareId();
    const cleanKey = (keyInput || '').trim().toUpperCase();

    if (!cleanKey) {
        return { success: false, error: 'कृपया लाइसेंस की दर्ज करें' };
    }

    // Check Cloud & Local Universal Keys
    const remoteCfg = await fetchRemoteConfig();
    if (remoteCfg && remoteCfg.universalKeys) {
        try {
            fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(remoteCfg, null, 2), 'utf8');
        } catch (_) {}
    }
    const cfg = remoteCfg || getLocalConfig();

    let planName = 'Universal Free Trial';
    let expiryDate = '2027-02-23';
    let isUniversal = false;

    if (cfg.universalKeys && cfg.universalKeys[cleanKey]) {
        const u = cfg.universalKeys[cleanKey];
        if (!u.isActive) {
            return { success: false, error: 'यह ट्रायल की अब सक्रिय नहीं है (Expired Offer)' };
        }
        planName = u.planHindi || u.plan || '90 Days Free Trial';
        expiryDate = u.expiryDate;
        isUniversal = true;
    } else {
        // Try personal signed key verification
        const personal = verifyPersonalKey(cleanKey, hwId);
        if (!personal || !personal.valid) {
            return {
                success: false,
                error: personal?.error || 'अमान्य लाइसेंस की! कृपया सही की दर्ज करें अथवा संजय जी से संपर्क करें।'
            };
        }
        planName = personal.plan;
        expiryDate = personal.expiryDate;
    }

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const shop = shopDetails.shopName || 'Apna CSC / BC Kendra';
    const owner = shopDetails.ownerName || 'Sanchalak';
    const mobile = shopDetails.mobileNumber || '';

    // Deactivate previous licenses
    db.prepare(`UPDATE AppLicenses SET IsActive = 0 WHERE IsActive = 1`).run();

    // Insert new license
    const res = db.prepare(`
        INSERT INTO AppLicenses (
            LicenseKey, CustomerShopName, OwnerName, MobileNumber,
            HardwareID, LicenseType, ActivationDate, ExpiryDate,
            MaxDevices, IsActive, Notes, CreatedAt, UpdatedAt
        ) VALUES (
            @key, @shop, @owner, @mobile,
            @hw, @type, @now, @exp,
            @maxDev, 1, @notes, @now, @now
        )
    `).run({
        key: cleanKey,
        shop: shop,
        owner: owner,
        mobile: mobile,
        hw: hwId,
        type: planName,
        now: nowStr,
        exp: expiryDate,
        maxDev: isUniversal ? 9999 : 1,
        notes: isUniversal ? 'Activated via Universal Key' : 'Activated via Signed Personal Key'
    });

    return {
        success: true,
        message: 'लाइसेंस सफलतापूर्वक सक्रिय हो गया!',
        licenseId: res.lastInsertRowid,
        status: getLicenseStatus()
    };
}

/**
 * Get comprehensive license status for API and UI
 */
function getLicenseStatus() {
    const hwId = getHardwareId();
    const record = getActiveRecord();

    const localCfg = getLocalConfig();
    if (!record) {
        return {
            isLicensed: false,
            isExpired: true,
            daysRemaining: 0,
            hardwareId: hwId,
            plan: 'लाइसेंस अनुपलब्ध',
            status: 'Inactive',
            expiryDate: null,
            message: 'कृपया सॉफ्टवेयर एक्टिवेट करें',
            announcement: localCfg.announcement || null,
            adminContact: localCfg.adminContact || { whatsapp: '919616928635', name: 'Sanjay Nag' }
        };
    }

    const days = getDaysRemaining(record.ExpiryDate);
    const isExpired = !record.IsActive || days < 0;

    let statusText = 'Active';
    let statusBadgeHindi = 'सक्रिय';
    if (!record.IsActive) {
        statusText = 'Revoked';
        statusBadgeHindi = 'रद्द (Revoked)';
    } else if (days < 0) {
        statusText = 'Expired';
        statusBadgeHindi = 'समाप्त (Expired)';
    } else if (days <= 7) {
        statusText = 'ExpiringSoon';
        statusBadgeHindi = 'शीघ्र समाप्त';
    }

    return {
        isLicensed: record.IsActive === 1 && days >= 0,
        isExpired: isExpired,
        daysRemaining: Math.max(0, days),
        rawDaysRemaining: days,
        status: statusText,
        statusHindi: statusBadgeHindi,
        licenseKey: record.LicenseKey,
        plan: record.LicenseType || 'Standard Plan',
        expiryDate: record.ExpiryDate,
        activationDate: record.ActivationDate,
        hardwareId: hwId,
        shopName: record.CustomerShopName || '',
        ownerName: record.OwnerName || '',
        mobileNumber: record.MobileNumber || '',
        lastSync: lastSyncTime,
        announcement: localCfg.announcement || null,
        adminContact: localCfg.adminContact || { whatsapp: '919616928635', name: 'Sanjay Nag' }
    };
}

module.exports = {
    getHardwareId,
    initLicense,
    syncWithCloud,
    activateKey,
    getLicenseStatus,
    verifyPersonalKey,
    generatePersonalKey
};
