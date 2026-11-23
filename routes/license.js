const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const lm = require('../utils/licenseManager');

const LOCAL_CONFIG_PATH = path.join(__dirname, '..', 'config', 'licenses.json');

function isAuthorizedAdmin(req) {
    const isLoopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(req.hostname) || ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
    const userRole = req.user?.Role;
    const userId = req.user?.UserID;
    return isLoopback || userRole === 'SuperAdmin' || userRole === 'Admin' || userId === 1;
}

// GET /api/license/status - Get current license state
router.get('/status', async (req, res) => {
    try {
        const status = lm.getLicenseStatus();
        res.json({ success: true, license: status });
    } catch (err) {
        console.error('[LicenseRoute] Error getting status:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/license/hardware-id - Get local machine Hardware ID
router.get('/hardware-id', (req, res) => {
    try {
        const hwId = lm.getHardwareId();
        res.json({ success: true, hardwareId: hwId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/license/activate - Activate a license key
router.post('/activate', async (req, res) => {
    try {
        const { licenseKey, shopName, ownerName, mobileNumber } = req.body || {};
        if (!licenseKey || !licenseKey.trim()) {
            return res.status(400).json({ success: false, error: 'कृपया लाइसेंस की दर्ज करें।' });
        }

        const result = await lm.activateKey(licenseKey, {
            shopName: shopName || req.user?.ShopName,
            ownerName: ownerName || req.user?.Username,
            mobileNumber: mobileNumber || req.user?.MobileNumber
        });

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (err) {
        console.error('[LicenseRoute] Error activating key:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/license/sync - Trigger on-demand sync with GitHub
router.post('/sync', async (req, res) => {
    try {
        const updated = await lm.syncWithCloud();
        res.json({ success: true, message: 'क्लाउड सिंक संपन्न हुआ', status: updated });
    } catch (err) {
        console.error('[LicenseRoute] Error syncing:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/license/admin/cloud-config - Read config/licenses.json
router.get('/admin/cloud-config', (req, res) => {
    if (!isAuthorizedAdmin(req)) {
        return res.status(403).json({ success: false, error: 'अनुमति नहीं है (Admin Only)' });
    }
    try {
        if (!fs.existsSync(LOCAL_CONFIG_PATH)) {
            return res.status(404).json({ success: false, error: 'licenses.json file not found' });
        }
        const data = JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf8'));
        res.json({ success: true, config: data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/license/admin/cloud-config - Save config/licenses.json & Auto-Push to GitHub
router.post('/admin/cloud-config', (req, res) => {
    if (!isAuthorizedAdmin(req)) {
        return res.status(403).json({ success: false, error: 'अनुमति नहीं है (Admin Only)' });
    }
    const { universalKeys, blacklistedHardwareIds } = req.body || {};
    if (!universalKeys || typeof universalKeys !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid universalKeys object' });
    }

    try {
        const newConfig = {
            version: 1,
            updatedAt: new Date().toISOString(),
            universalKeys: universalKeys,
            blacklistedHardwareIds: Array.isArray(blacklistedHardwareIds) ? blacklistedHardwareIds : []
        };

        fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf8');

        // Automatically commit & push to GitHub
        const cmd = 'git add config/licenses.json && git commit -m "chore(license): update cloud licenses config via admin control panel" && git push origin sqlite && git push origin sqlite:main';

        exec(cmd, { cwd: path.join(__dirname, '..'), timeout: 30000 }, (err, stdout, stderr) => {
            if (err) {
                console.error('[AdminLicenseControl] Push error:', err.message, stderr);
                return res.json({
                    success: true,
                    localSaved: true,
                    pushedToGitHub: false,
                    warning: 'स्थानीय रूप से सुरक्षित हुआ, किंतु GitHub पर पुश विफल: ' + (err.message || stderr),
                    config: newConfig
                });
            }
            console.log('[AdminLicenseControl] Successfully pushed updated licenses to GitHub!');
            res.json({
                success: true,
                localSaved: true,
                pushedToGitHub: true,
                message: 'बधाई! GitHub पर सफलतापूर्वक सेव और लाइव पुश हो गया!',
                config: newConfig
            });
        });
    } catch (e) {
        console.error('[AdminLicenseControl] Save error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/license/admin/launch-wizard - Launch native desktop PowerShell WPF wizard on host PC
router.post('/admin/launch-wizard', (req, res) => {
    if (!isAuthorizedAdmin(req)) {
        return res.status(403).json({ success: false, error: 'अनुमति नहीं है (Admin Only)' });
    }
    const psScript = path.join(__dirname, '..', 'scripts', 'license_control_wizard.ps1');
    const cmd = `start powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psScript}"`;
    exec(cmd, { cwd: path.join(__dirname, '..') });
    res.json({ success: true, message: 'डेस्कटॉप मास्टर लाइसेंस विजार्ड आपकी स्क्रीन पर खुल रहा है...' });
});

module.exports = router;
