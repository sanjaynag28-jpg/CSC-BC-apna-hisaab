const express = require('express');
const router = express.Router();
const lm = require('../utils/licenseManager');

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

module.exports = router;
