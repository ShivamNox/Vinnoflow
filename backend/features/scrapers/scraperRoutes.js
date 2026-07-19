import express from 'express';
import authMiddleware from '../../auth/auth.js';
import ScraperSettings from './Models/ScraperSettingsModel.js';
import HDHub4u from './Models/HDHub4uModel.js';
import { startHDHub4uScraper, stopHDHub4uScraper } from './scrapers.js';
import bypassHubCloudLink from './hubcloudbypass.js';

const router = express.Router();

// Get all scrapers status
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const scrapers = await ScraperSettings.find();
        res.json({ scrapers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get HDHub4u settings
router.get('/hdhub4u/settings', authMiddleware, async (req, res) => {
    try {
        let settings = await ScraperSettings.findOne({ name: 'hdhub4u' });
        if (!settings) {
            settings = await ScraperSettings.create({
                name: 'hdhub4u',
                enabled: false,
                interval: 10,
                intervalUnit: 'minutes',
                startPage: 1,
                lastScrapedPage: 0,
                caughtUp: false
            });
        }
        res.json({ settings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update HDHub4u settings
router.post('/hdhub4u/settings', authMiddleware, async (req, res) => {
    try {
        const { enabled, interval, intervalUnit, startPage } = req.body;

        let settings = await ScraperSettings.findOne({ name: 'hdhub4u' });
        if (!settings) {
            settings = new ScraperSettings({ name: 'hdhub4u' });
        }

        const wasEnabled = settings.enabled;
        const startPageChanged = settings.startPage !== startPage;

        settings.enabled = enabled;
        settings.interval = interval;
        settings.intervalUnit = intervalUnit;
        settings.startPage = startPage;

        // Changing Start From Page restarts the catch-up sweep from that page
        if (startPageChanged) {
            settings.lastScrapedPage = startPage > 1 ? startPage : 1;
            settings.caughtUp = startPage <= 1;
        }

        await settings.save();

        if (enabled && !wasEnabled) {
            await startHDHub4uScraper(settings);
            res.json({ message: 'Scraper started', settings });
        } else if (!enabled && wasEnabled) {
            stopHDHub4uScraper();
            res.json({ message: 'Scraper stopped', settings });
        } else if (enabled && wasEnabled) {
            stopHDHub4uScraper();
            await startHDHub4uScraper(settings);
            res.json({ message: 'Scraper restarted with new settings', settings });
        } else {
            res.json({ message: 'Settings updated', settings });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all HDHub4u content
router.get('/hdhub4u/content', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, type, search } = req.query;
        const query = {};
        if (type) query.type = type;
        if (search) query.title = { $regex: search, $options: 'i' };

        const total = await HDHub4u.countDocuments(query);
        const content = await HDHub4u.find(query)
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        res.json({
            content,
            totalPages: Math.ceil(total / Number(limit)),
            currentPage: Number(page),
            total
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single HDHub4u item
router.get('/hdhub4u/content/:id', authMiddleware, async (req, res) => {
    try {
        const content = await HDHub4u.findById(req.params.id);
        if (!content) return res.status(404).json({ error: 'Content not found' });
        res.json({ content });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete HDHub4u item
router.delete('/hdhub4u/content/:id', authMiddleware, async (req, res) => {
    try {
        await HDHub4u.findByIdAndDelete(req.params.id);
        res.json({ message: 'Content deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ BYPASS ROUTE ============
// Mirrors PHP: process single quality ajax handler
router.post('/bypass', authMiddleware, async (req, res) => {
    try {
        const { url, quality } = req.body;
        if (!url) return res.status(400).json({ error: 'URL required' });

        console.log(`\n🔓 Bypass request: ${url}`);
        const result = await bypassHubCloudLink(url);

        if (result.success) {
            res.json({
                success:     true,
                directUrl:   result.url,
                server:      result.server,
                type:        result.type || 'video',   // 'video' | 'gdrive'
                gdriveFileId: result.gdriveFileId || null,
                quality:     quality || null,
                // All available links in priority order — callers can try
                // alternatives if the primary server is unavailable.
                allLinks:    result.allLinks || [{ url: result.url, server: result.server, type: result.type || 'video' }],
            });
        } else {
            res.json({
                success: false,
                error: result.error || 'Bypass failed'
            });
        }
    } catch (error) {
        console.error('Bypass route error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;