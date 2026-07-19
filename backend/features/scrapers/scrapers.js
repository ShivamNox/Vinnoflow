import ScraperSettings from './Models/ScraperSettingsModel.js';
import HDHub4u from './Models/HDHub4uModel.js';
import { getLatestReleases, processRelease } from './hdhub4u.js';

const scraperState = {
    pageInterval: null,
    processInterval: null,
    isProcessing: false,
    queue: []
};

function getIntervalMs(interval, unit) {
    return unit === 'minutes' ? interval * 60 * 1000 : interval * 1000;
}


function buildQualityLabel(qualityKey) {
    // Convert keys like "720p_low", "1080p_high", "480p_untouch", "720p" etc
    return qualityKey
        .replace(/_low$/i, ' (Low)')
        .replace(/_high$/i, ' (High)')
        .replace(/_untouch$/i, ' (Untouch)')
        .replace(/_hevc$/i, ' HEVC')
        .replace(/_x264$/i, ' x264')
        .toUpperCase();
}

// ====== Save result to DB - handles qualities as OBJECT (from original scraper) ======
function extractHost(url) {
    if (!url) return 'unknown';
    if (url.includes('hubcloud')) return 'hubcloud';
    if (url.includes('hubdrive')) return 'hubdrive';
    return 'direct';
}

async function saveResult(result, releaseLink) {
    const movieData = {
        title: result.title,
        link: result.link || releaseLink,
        thumbnail: result.thumbnail,
        type: result.type,
        pageUrl: releaseLink
    };

    if (result.type === 'movie') {
        // qualities is an OBJECT: { "720p": { quality: "720p HEVC [1.2GB]", link: "https://..." }, ... }
        movieData.qualities = Object.entries(result.qualities || {}).map(([key, val]) => ({
            quality: val.quality || key,       // "720p HEVC [1.2GB]"
            label: key.toUpperCase().replace(/_/g, ' '),  // "720P LOW", "1080P HIGH"
            link: val.link,
            size: extractSize(val.quality || ''),
            host: extractHost(val.link)
        }));
    } else {
        // episodes: array, each episode has qualities as OBJECT
        movieData.episodes = (result.episodes || [])
            .filter(ep => ep.qualities && Object.keys(ep.qualities).length > 0)
            .map(ep => ({
                episode: ep.episode,
                qualities: Object.entries(ep.qualities).map(([key, val]) => ({
                    quality: val.quality || key,
                    label: key.toUpperCase().replace(/_/g, ' '),
                    link: val.link,
                    host: extractHost(val.link)
                }))
            }));
    }

    return await HDHub4u.create(movieData);
}

function extractSize(qualityStr) {
    const m = qualityStr?.match(/\[([\d.]+\s*(?:GB|MB))\]/i);
    return m ? m[1] : '';
}

// ====== Process queue one by one ======
async function processNext() {
    if (scraperState.isProcessing || scraperState.queue.length === 0) return;
    scraperState.isProcessing = true;

    try {
        const release = scraperState.queue.shift();

        // Skip if already exists
        const exists = await HDHub4u.findOne({ link: release.link });
        if (exists) {
            console.log(`⏭️  Already scraped: ${release.title}`);
            return;
        }

        console.log(`🎬 Processing: ${release.title}`);

        const result = await processRelease(release);

        if (result) {
            await saveResult(result, release.link);
            console.log(`✅ Saved: ${result.title}`);
        } else {
            console.log(`⏭️  Skipped (no valid links): ${release.title}`);
        }
    } catch (error) {
        // Handle duplicate key gracefully
        if (error.code === 11000) {
            console.log(`⏭️  Duplicate (already in DB), skipping`);
        } else {
            console.error('❌ Processing error:', error.message);
        }
    } finally {
        scraperState.isProcessing = false;
    }
}

// ====== Fetch one page and queue any release not already in DB/queue ======
// Uses the existing getLatestReleases() untouched — only the scheduling
// around it changes.
async function scrapeAndQueuePage(page, label = '') {
    const releases = await getLatestReleases(page);
    if (releases.length === 0) {
        console.log(`⚠️ ${label}Page ${page}: no releases found`);
        return 0;
    }

    let added = 0;
    for (const release of releases) {
        const exists = await HDHub4u.findOne({ link: release.link });
        const inQueue = scraperState.queue.find(r => r.link === release.link);
        if (!exists && !inQueue) {
            scraperState.queue.push(release);
            added++;
        }
    }
    console.log(`📦 ${label}Page ${page}: added ${added} new item(s). Queue: ${scraperState.queue.length}`);
    return added;
}

// ====== Scheduled tick ======
// Behavior:
// - Start From Page not set (<=1): no catch-up needed, every tick just
//   re-checks the single latest page (page 1) for new releases.
// - Start From Page = N (>1): catch-up sweep runs one page per tick,
//   counting DOWN N, N-1, N-2, ..., 2, 1 until it reaches page 1.
// - Once caught up (sweep finished, or no sweep was needed), every
//   subsequent tick checks the latest 5 pages for anything new.
async function scrapeOnePage() {
    try {
        const settings = await ScraperSettings.findOne({ name: 'hdhub4u' });
        if (!settings?.enabled) return;

        const startPage = settings.startPage || 1;

        // No catch-up needed — just watch the latest page every tick
        if (startPage <= 1) {
            console.log(`\n📄 [Latest] Checking page 1...`);
            await scrapeAndQueuePage(1, 'Latest ');
            await ScraperSettings.findOneAndUpdate(
                { name: 'hdhub4u' },
                { lastScrapedPage: 1, caughtUp: true, lastRunAt: new Date() }
            );
            return;
        }

        if (!settings.caughtUp) {
            // ── Catch-up sweep: startPage → startPage-1 → ... → 1 (one page/tick) ──
            const currentPage = settings.lastScrapedPage || startPage;
            console.log(`\n📄 [Catch-up] Scraping page ${currentPage} (sweeping down to page 1)...`);

            await scrapeAndQueuePage(currentPage, 'Catch-up ');

            const nextPage = currentPage - 1;
            const finished = nextPage < 1;

            await ScraperSettings.findOneAndUpdate(
                { name: 'hdhub4u' },
                {
                    lastScrapedPage: finished ? 1 : nextPage,
                    caughtUp: finished,
                    lastRunAt: new Date(),
                }
            );

            if (finished) {
                console.log(`✅ Catch-up sweep complete — switching to maintenance mode (latest 5 pages/tick)`);
            }
        } else {
            // ── Maintenance mode: re-check latest 5 pages every tick ──
            console.log(`\n📄 [Maintenance] Checking latest 5 pages for new releases...`);
            for (let page = 1; page <= 5; page++) {
                await scrapeAndQueuePage(page, 'Maintenance ');
            }
            await ScraperSettings.findOneAndUpdate(
                { name: 'hdhub4u' },
                { lastRunAt: new Date() }
            );
        }
    } catch (error) {
        console.error('❌ Page scrape error:', error.message);
    }
}

// ====== Start scraper ======
async function startHDHub4uScraper(settings) {
    // Clear any existing intervals
    if (scraperState.pageInterval) {
        clearInterval(scraperState.pageInterval);
        scraperState.pageInterval = null;
    }
    if (scraperState.processInterval) {
        clearInterval(scraperState.processInterval);
        scraperState.processInterval = null;
    }

    scraperState.queue = [];
    scraperState.isProcessing = false;

    console.log(`🚀 Starting HDHub4u scraper (interval: ${settings.interval} ${settings.intervalUnit})`);

    // Immediately scrape first page
    await scrapeOnePage();

    // Schedule page scraping at the configured interval
    const intervalMs = getIntervalMs(settings.interval, settings.intervalUnit);
    scraperState.pageInterval = setInterval(scrapeOnePage, intervalMs);

    // Process queue every 1 second — sequential, one at a time
    scraperState.processInterval = setInterval(async () => {
        const current = await ScraperSettings.findOne({ name: 'hdhub4u' });
        if (!current?.enabled) {
            stopHDHub4uScraper();
            return;
        }
        await processNext();
    }, 1000);
}

// ====== Stop scraper ======
function stopHDHub4uScraper() {
    if (scraperState.pageInterval) {
        clearInterval(scraperState.pageInterval);
        scraperState.pageInterval = null;
    }
    if (scraperState.processInterval) {
        clearInterval(scraperState.processInterval);
        scraperState.processInterval = null;
    }
    scraperState.queue = [];
    scraperState.isProcessing = false;
    console.log('🛑 HDHub4u scraper stopped');
}

// ====== Init on boot ======
async function initScrapers() {
    try {
        const hdhub4uSettings = await ScraperSettings.findOne({ name: 'hdhub4u' });
        if (hdhub4uSettings?.enabled) {
            console.log('🔄 Auto-starting HDHub4u scraper...');
            await startHDHub4uScraper(hdhub4uSettings);
        }
    } catch (error) {
        console.error('Failed to initialize scrapers:', error.message);
    }
}

export { startHDHub4uScraper, stopHDHub4uScraper, initScrapers };