import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://new1.hdhub4u.limo';
const DEFAULT_THUMB = 'https://media.gettyimages.com/id/1467642341/photo/red-paper-striped-bucket-with-popcorn-on-the-blue-background.jpg?s=612x612&w=gi&k=20&c=gAj9CaIxUlaqKXXh1j7e5QFnwl6TFPCyE4G6VKHDL7Y=';

// ============ UTILITIES (exact copy from original) ============
const decode = (text) => {
    const e = {
        '&#038;': '&', '&#8211;': '–', '&#8217;': "'", '&#8216;': "'",
        '&#8220;': '"', '&#8221;': '"', '&amp;': '&', '&lt;': '<',
        '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&#8230;': '...'
    };
    for (const [k, v] of Object.entries(e)) text = text.replace(new RegExp(k, 'g'), v);
    return text.trim();
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const getDomain = (url) => {
    try { return new URL(url).hostname.replace('www.', ''); }
    catch { return ''; }
};

const parseSize = (s) => {
    const m = s?.match(/([\d.]+)\s*(GB|MB|TB)/i);
    if (!m) return 0;
    const num = parseFloat(m[1]);
    const unit = m[2].toUpperCase();
    if (unit === 'TB') return num * 1024 * 1024 * 1024 * 1024;
    if (unit === 'GB') return num * 1024 * 1024 * 1024;
    if (unit === 'MB') return num * 1024 * 1024;
    return num;
};

const rot13 = (s) => s.replace(/[a-zA-Z]/g, c =>
    String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)
);
const b64 = (s) => Buffer.from(s, 'base64').toString('utf-8');

const isHubCloudDomain = (d) => {
    if (!d) return false;
    return /hubcloud\.[a-z]{2,10}/i.test(d) || d.includes('hubcloud');
};
const isHubDriveDomain = (d) => {
    if (!d) return false;
    return /hubdrive\.[a-z]{2,10}/i.test(d) || d.includes('hubdrive');
};
const isHubCDNDomain = (d) => /hubcdn\.[a-z]{2,10}$/i.test(d);
const getUrl = (obj) => obj?.url || obj?.link || null;

// ============ PAGE SCRAPING ============
async function getLatestReleases(page = 1) {
    try {
        const url = page === 1 ? BASE_URL : `${BASE_URL}/page/${page}/`;
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 30000
        });
        const $ = cheerio.load(data);
        const releases = [];

        $('ul.recent-movies li.thumb').each((i, el) => {
            const $el = $(el);
            const link = $el.find('figcaption a').attr('href') || '';
            let title = $el.find('figcaption a p').text().trim() ||
                $el.find('figure img').attr('alt') || '';
            let thumb = $el.find('figure img').attr('src') || '';
            if (!thumb || !thumb.startsWith('http')) thumb = DEFAULT_THUMB;
            if (link && title) releases.push({ title: decode(title), link, thumb });
        });

        return releases;
    } catch (e) {
        console.error('❌ Fetch error:', e.message);
        return [];
    }
}

// ============ DETECT TYPE (exact copy from original) ============
function detectType($) {
    const title = $('h1.page-title, .page-title').text().toLowerCase();

    if (/\b(?:season|s0?\d{1,2})\s*\d+|series|complete\s*series/i.test(title)) {
        console.log('   🔍 SERIES (title)');
        return 'series';
    }

    const pageText = $('body').text();
    const epMatch = pageText.match(/No\.\s*of\s*Episodes?:\s*(\d+)/i);
    if (epMatch && parseInt(epMatch[1]) > 1) {
        console.log(`   🔍 SERIES (${epMatch[1]} eps)`);
        return 'series';
    }

    let epCount = 0;
    $('h3, h4').each((i, el) => {
        if (/\bepisode\s*\d+|\bep[\s\-]?\d+/i.test($(el).text())) epCount++;
    });
    if (epCount >= 2) {
        console.log(`   🔍 SERIES (${epCount} headers)`);
        return 'series';
    }

    if (/single\s*episode/i.test(pageText)) {
        console.log('   🔍 SERIES (Single Episode)');
        return 'series';
    }

    console.log('   🔍 MOVIE');
    return 'movie';
}

// ============ EXTRACT MOVIE LINKS (exact copy from original) ============
async function extractMovieLinks($, host) {
    const links = [];
    const qualitySizes = {};
    const directHubLinks = [];
    let hbLinksUrl = null;

    const isValidSize = (size) => parseSize(size) > 0;

    // Scan for quality sizes - pass 1
    $('h3, h4, h5, p, pre').each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 200) return;

        const bracketMatch = text.match(/(\d{3,4}p|4K)\s*(hevc|x265|x264|hq[- ]?rip|hq|10bit|sdr)?[^\[]*\[([\d.]+)\s*(GB|MB|TB)\]/i);
        if (bracketMatch) {
            let quality = bracketMatch[1].toLowerCase();
            if (quality === '4k') quality = '2160p';
            const variant = (bracketMatch[2] || '').toLowerCase().replace(/[- ]/g, '');
            const size = `${bracketMatch[3]}${bracketMatch[4].toUpperCase()}`;
            if (isValidSize(size)) {
                const key = variant ? `${quality}_${variant}` : quality;
                if (!qualitySizes[key]) { qualitySizes[key] = size; console.log(`   📏 Found size: ${key} = ${size}`); }
            }
        }

        const dashMatch = text.match(/(\d{3,4}p|4K)\s*(hevc|x265|x264|hq[- ]?rip|hq|10bit|sdr)?[^–\-]*(–|-)\s*([\d.]+)\s*(GB|MB|TB)/i);
        if (dashMatch) {
            let quality = dashMatch[1].toLowerCase();
            if (quality === '4k') quality = '2160p';
            const variant = (dashMatch[2] || '').toLowerCase().replace(/[- ]/g, '');
            const size = `${dashMatch[4]}${dashMatch[5].toUpperCase()}`;
            if (isValidSize(size)) {
                const key = variant ? `${quality}_${variant}` : quality;
                if (!qualitySizes[key]) { qualitySizes[key] = size; console.log(`   📏 Found size: ${key} = ${size}`); }
            }
        }
    });

    // Scan for quality sizes - pass 2 (with untouch)
    $('h3, h4, h5, p, pre').each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 200) return;

        const bracketMatch = text.match(/(\d{3,4}p|4K)\s*(hevc|x265|x264|hq[- ]?rip|hq|10bit|sdr|untouch)?[^\[]*\[([\d.]+)\s*(GB|MB|TB)\]/i);
        if (bracketMatch) {
            let quality = bracketMatch[1].toLowerCase();
            if (quality === '4k') quality = '2160p';
            const variant = (bracketMatch[2] || '').toLowerCase().replace(/[- ]/g, '');
            const size = `${bracketMatch[3]}${bracketMatch[4].toUpperCase()}`;
            if (isValidSize(size)) {
                const key = variant ? `${quality}_${variant}` : quality;
                if (!qualitySizes[key]) { qualitySizes[key] = size; console.log(`   📏 Found size: ${key} = ${size}`); }
            }
        }

        const typoMatch = text.match(/(\d{3,4}p)\s*(hevc|x265|x264|untouch|10bit)?\s*([\d.]+)\s*(GB|MB)\]/i);
        if (typoMatch) {
            let quality = typoMatch[1].toLowerCase();
            const variant = (typoMatch[2] || '').toLowerCase();
            const size = `${typoMatch[3]}${typoMatch[4].toUpperCase()}`;
            if (isValidSize(size)) {
                const key = variant ? `${quality}_${variant}` : quality;
                if (!qualitySizes[key]) { qualitySizes[key] = size; console.log(`   📏 Found size: ${key} = ${size}`); }
            }
        }

        const dashMatch = text.match(/(\d{3,4}p|4K)\s*(hevc|x265|x264|hq[- ]?rip|hq|10bit|sdr|untouch)?[^–\-]*(–|-)\s*([\d.]+)\s*(GB|MB|TB)/i);
        if (dashMatch) {
            let quality = dashMatch[1].toLowerCase();
            if (quality === '4k') quality = '2160p';
            const variant = (dashMatch[2] || '').toLowerCase().replace(/[- ]/g, '');
            const size = `${dashMatch[4]}${dashMatch[5].toUpperCase()}`;
            if (isValidSize(size)) {
                const key = variant ? `${quality}_${variant}` : quality;
                if (!qualitySizes[key]) { qualitySizes[key] = size; console.log(`   📏 Found size: ${key} = ${size}`); }
            }
        }

        if (/untouch/i.test(text)) {
            const qMatch = text.match(/(\d{3,4}p)/i);
            if (qMatch) {
                const quality = qMatch[1].toLowerCase();
                const key = `${quality}_untouch`;
                const sizeMatch = text.match(/([\d.]+)\s*(GB|MB)/i);
                if (sizeMatch && isValidSize(`${sizeMatch[1]}${sizeMatch[2]}`)) {
                    if (!qualitySizes[key]) {
                        qualitySizes[key] = `${sizeMatch[1]}${sizeMatch[2].toUpperCase()}`;
                        console.log(`   📏 Found size: ${key} = ${qualitySizes[key]}`);
                    }
                }
            }
        }
    });

    // Extract size from link text
    $('a').each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 100) return;
        const linkMatch = text.match(/(\d{3,4}p)\s*(hevc|x265|x264|10bit)?[^\[]*\[([\d.]+)\s*(GB|MB)\]/i);
        if (linkMatch) {
            const quality = linkMatch[1].toLowerCase();
            const variant = (linkMatch[2] || '').toLowerCase();
            const size = `${linkMatch[3]}${linkMatch[4].toUpperCase()}`;
            if (isValidSize(size)) {
                const key = variant ? `${quality}_${variant}` : quality;
                if (!qualitySizes[key]) { qualitySizes[key] = size; console.log(`   📏 Found size: ${key} = ${size}`); }
            }
        }
    });

    // Extract from headers
    $('h3, h4').each((i, el) => {
        const headerText = $(el).text().trim();
        if (/4k|2160p/i.test(headerText)) {
            const sizeMatch = headerText.match(/\[([\d.]+)\s*(GB|MB)\]|([\d.]+)\s*(GB|MB)/i);
            if (sizeMatch) {
                const num = sizeMatch[1] || sizeMatch[3];
                const unit = sizeMatch[2] || sizeMatch[4];
                const size = `${num}${unit.toUpperCase()}`;
                if (isValidSize(size) && !qualitySizes['2160p']) {
                    qualitySizes['2160p'] = size;
                    console.log(`   📏 Found size: 2160p = ${size}`);
                }
            }
        }
        const qMatch = headerText.match(/(\d{3,4}p)/i);
        if (!qMatch) return;
        const quality = qMatch[1].toLowerCase();
        const sizeInHeader = headerText.match(/\[([\d.]+)\s*(GB|MB)\]|([\d.]+)\s*(GB|MB)/i);
        if (sizeInHeader) {
            const num = sizeInHeader[1] || sizeInHeader[3];
            const unit = sizeInHeader[2] || sizeInHeader[4];
            const size = `${num}${unit.toUpperCase()}`;
            if (isValidSize(size) && !qualitySizes[quality]) {
                qualitySizes[quality] = size;
                console.log(`   📏 Found size: ${quality} = ${size}`);
            }
        }
    });

    // Extract links from h3/h4/h5 headers
    $('h3, h4, h5').each((i, el) => {
        const text = $(el).text().trim();
        if (/episode|ep[\s\-]?\d+|watch\s*online|how\s*to\s*download|screen\s*shot/i.test(text)) return;
        const $a = $(el).find('a');
        if ($a.length) {
            const href = $a.attr('href');
            const q = $a.text().trim() || text;
            if (href && /\d{3,4}p|hevc|x264|4k|2160|links/i.test(q)) {
                const d = getDomain(href);
                if (d.includes('hblinks') || d.includes('4khdhub')) { hbLinksUrl = href; return; }
                if (d && !d.includes(host) && !d.includes('hdhub4u') && !d.includes('imdb') && !d.includes('discord')) {
                    if (!links.find(l => l.link === href))
                        links.push({ quality: decode(q), link: href, domain: d, size: parseSize(q) });
                }
            }
        }
    });

    // Extract gadgetsweb links
    $('a[href*="gadgetsweb"]').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        const parentText = $(el).closest('h3, h4, h5, p, div').text().trim();
        if (/watch\s*online|hdhub4u/i.test(text)) return;
        let quality = text;
        if (!/\d{3,4}p/i.test(quality)) {
            const m = parentText.match(/(\d{3,4}p[^\n]*)/i);
            if (m) quality = m[1];
        }
        if (quality && !links.find(l => l.link === href))
            links.push({ quality: decode(quality), link: href, domain: 'gadgetsweb.xyz', size: parseSize(parentText) });
    });

    $('a[href*="hblinks"], a[href*="4khdhub"]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && !$(el).text().toLowerCase().includes('watch')) hbLinksUrl = href;
    });

    console.log(`   📎 Found ${links.length} links + ${directHubLinks.length} direct hub links${hbLinksUrl ? ' + hblinks' : ''}`);
    console.log(`   📏 Quality sizes: ${JSON.stringify(qualitySizes)}`);

    return { links, hbLinksUrl, qualitySizes, directHubLinks };
}

// ============ EXTRACT SERIES EPISODES (exact copy from original) ============
async function extractSeriesEpisodes($) {
    const eps = [];
    const isDownloadDomain = (d) =>
        isHubCloudDomain(d) || isHubDriveDomain(d) || isHubCDNDomain(d) ||
        d.includes('gdtot') || d.includes('gadgetsweb');

    // Strategy 1: Single Episode section
    const singleEpSection = $('h2:contains("Single Episode"), h2:contains("Episode Links"), pre:contains("Single Episode")').length > 0;
    if (singleEpSection) {
        console.log('   📦 Single Episode section');
        const episodeData = {};
        $('h4').each((i, el) => {
            const text = $(el).text().trim();
            const epMatch = text.match(/E(\d+)/i);
            if (epMatch) {
                const epNum = parseInt(epMatch[1]);
                if (!episodeData[epNum]) episodeData[epNum] = { links: [] };
                $(el).find('a').each((j, a) => {
                    const href = $(a).attr('href');
                    const linkText = $(a).text().trim().toLowerCase();
                    const d = getDomain(href);
                    if (linkText.includes('watch')) return;
                    let quality = '720p';
                    const parentText = $(el).closest('div, section').prevAll('h2, h3, pre').first().text();
                    if (/480p/i.test(parentText)) quality = '480p';
                    else if (/1080p/i.test(parentText)) quality = '1080p';
                    if (d && isDownloadDomain(d))
                        episodeData[epNum].links.push({ quality, url: href, domain: d, type: linkText.includes('instant') ? 'instant' : 'drive' });
                });
            }
        });
        for (const [epNum, data] of Object.entries(episodeData)) {
            if (data.links.length > 0)
                eps.push({ ep: parseInt(epNum), links: data.links, isDirectStructure: true });
        }
        if (eps.length > 0) { console.log(`   ✅ ${eps.length} episodes`); return eps; }
    }

    // Strategy 2: h4 episode headers with quality sub-headers
    let currentEp = null;
    const episodeData = {};
    $('h4').each((i, el) => {
        const text = $(el).text().trim();
        const epMatch = text.match(/episode\s*(\d+)|ep[\s\-]?(\d+)/i);
        if (epMatch) {
            currentEp = parseInt(epMatch[1] || epMatch[2]);
            if (!episodeData[currentEp]) episodeData[currentEp] = {};
            return;
        }
        if (currentEp && /\d{3,4}p/i.test(text)) {
            const qMatch = text.match(/(\d{3,4}p)/i);
            const quality = qMatch ? qMatch[1].toLowerCase() : null;
            if (quality) {
                $(el).find('a').each((j, a) => {
                    const href = $(a).attr('href');
                    const linkText = $(a).text().trim().toLowerCase();
                    const d = getDomain(href);
                    if (linkText.includes('watch')) return;
                    if (d && (isHubCloudDomain(d) || isHubDriveDomain(d) || isHubCDNDomain(d) || d.includes('gdtot'))) {
                        if (!episodeData[currentEp][quality]) episodeData[currentEp][quality] = [];
                        episodeData[currentEp][quality].push({ url: href, domain: d, type: linkText });
                    }
                });
            }
        }
    });

    for (const [epNum, qualities] of Object.entries(episodeData)) {
        const allLinks = [];
        for (const [quality, links] of Object.entries(qualities))
            links.forEach(l => allLinks.push({ quality, url: l.url, domain: l.domain, type: l.type }));
        if (allLinks.length > 0)
            eps.push({ ep: parseInt(epNum), links: allLinks, isDirectStructure: true });
    }
    if (eps.length > 0) { console.log(`   ✅ ${eps.length} episodes`); return eps; }

    // Strategy 3: h3 with gadgetsweb links
    $('h3').each((i, el) => {
        const text = $(el).text().trim();
        if (/episode\s*\d+|ep[\s\-]?\d+/i.test(text)) {
            $(el).find('a[href*="gadgetsweb"]').each((j, a) => {
                const href = $(a).attr('href');
                if (!$(a).text().toLowerCase().includes('watch')) {
                    const m = text.match(/episode\s*(\d+)|ep[\s\-]?(\d+)/i);
                    const epNum = m ? parseInt(m[1] || m[2]) : i + 1;
                    if (!eps.find(e => e.ep === epNum))
                        eps.push({ ep: epNum, gadget: href, isGadgetStructure: true });
                }
            });
        }
    });

    console.log(eps.length > 0 ? `   ✅ ${eps.length} episodes` : '   ❌ No episodes');
    return eps;
}

// ============ BYPASS GADGETSWEB (exact copy from original) ============
async function bypassGadgets(url) {
    try {
        console.log(`      🔗 Bypassing gadgetsweb...`);
        const { data } = await axios.get(url, { timeout: 30000 });
        const m = data.match(/s\('o','([^']+)'/);
        if (!m) { console.log(`      ❌ Encoded data not found`); return null; }
        const finalUrl = b64(JSON.parse(b64(rot13(b64(b64(m[1]))))).o);
        console.log(`      ✅ Got ${finalUrl.includes('hblinks') || finalUrl.includes('4khdhub') ? 'hblinks' : 'direct'} URL`);
        return finalUrl;
    } catch (e) {
        console.log(`      ❌ Gadgetsweb error: ${e.message}`);
        return null;
    }
}

// ============ BYPASS HUBDRIVE (original - finds HubCloud link inside HubDrive page) ============
async function bypassHubDriveForHubCloud(url) {
    if (!url) { console.log(`         ❌ HubDrive: URL undefined`); return null; }
    try {
        console.log(`         🔗 Fetching HubDrive...`);
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 30000
        });
        const $ = cheerio.load(data);
        let hubCloudLink = null;
        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const domain = getDomain(href);
            if (isHubCloudDomain(domain) && !$(el).text().toLowerCase().includes('login')) {
                hubCloudLink = href;
                return false;
            }
        });
        if (hubCloudLink) { console.log(`         ✅ Found HubCloud`); return hubCloudLink; }
        console.log(`         ❌ No HubCloud found in HubDrive page`);
        return null;
    } catch (e) {
        console.log(`         ❌ HubDrive error: ${e.message}`);
        return null;
    }
}

// ============ GET HBLINKS (exact copy from original) ============
async function getHBLinks(url, qualitySizes = {}) {
    try {
        console.log(`      🔍 Fetching hblinks: ${url}`);
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 30000
        });
        const $ = cheerio.load(data);
        const links = [];

        const pageTitle = $('title').text().trim() || $('h1.entry-title, .entry-title').first().text().trim();
        let defaultQuality = '720p';
        let defaultVariant = '';

        if (/1080p/i.test(pageTitle)) defaultQuality = '1080p';
        else if (/480p/i.test(pageTitle)) defaultQuality = '480p';
        else if (/2160p|4k/i.test(pageTitle)) defaultQuality = '2160p';

        if (/hevc|x265|10bit/i.test(pageTitle)) defaultVariant = 'hevc';
        else if (/x264/i.test(pageTitle)) defaultVariant = 'x264';
        else if (/hq[- ]?rip/i.test(pageTitle)) defaultVariant = 'hqrip';

        if (!defaultVariant && qualitySizes[`${defaultQuality}_x264`] && !qualitySizes[`${defaultQuality}_hevc`]) {
            defaultVariant = 'x264';
        }

        console.log(`         📝 Page title: ${pageTitle.substring(0, 50)}... (${defaultQuality}${defaultVariant ? ' ' + defaultVariant : ''})`);

        // Extract page size
        let pageSize = '';
        let sizeMatch = pageTitle.match(/\[([\d.]+)\s*(GB|MB)\]/i);
        if (sizeMatch && parseFloat(sizeMatch[1]) > 0) {
            pageSize = `${sizeMatch[1]}${sizeMatch[2].toUpperCase()}`;
        }
        if (!pageSize) {
            const bodyText = $('body').text();
            for (const pattern of [/Size[:\s]*([\d.]+)\s*(GB|MB)/i, /File\s*Size[:\s]*([\d.]+)\s*(GB|MB)/i]) {
                const match = bodyText.match(pattern);
                if (match && parseFloat(match[1]) > 0) { pageSize = `${match[1]}${match[2].toUpperCase()}`; break; }
            }
        }
        if (!pageSize) {
            $('a, button').each((i, el) => {
                const text = $(el).text();
                const match = text.match(/([\d.]+)\s*(GB|MB)/i);
                if (match && parseFloat(match[1]) > 0) { pageSize = `${match[1]}${match[2].toUpperCase()}`; return false; }
            });
        }
        console.log(`         📏 Page size: ${pageSize || 'not found'}`);

        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (!href || href === '#' || href.startsWith('javascript:')) return;

            const lowerHref = href.toLowerCase();
            const isHubCloud = lowerHref.includes('hubcloud.');
            const isHubDrive = lowerHref.includes('hubdrive.');
            if (!isHubCloud && !isHubDrive) return;
            if (links.find(l => l.url === href)) return;

            let quality = defaultQuality;
            let variant = defaultVariant;
            const variantKey = variant ? `${quality}_${variant}` : quality;
            let size = '';

            if (qualitySizes[variantKey] && parseSize(qualitySizes[variantKey]) > 0) {
                size = qualitySizes[variantKey];
            } else if (pageSize && parseSize(pageSize) > 0) {
                size = pageSize;
            } else if (qualitySizes[quality] && parseSize(qualitySizes[quality]) > 0) {
                size = qualitySizes[quality];
            }

            const qualityWithSize = (size && parseSize(size) > 0)
                ? `${quality}${variant ? ' ' + variant.toUpperCase() : ''} [${size}]`
                : `${quality}${variant ? ' ' + variant.toUpperCase() : ''}`;

            const domain = isHubCloud ? 'hubcloud' : 'hubdrive';

            links.push({
                quality: qualityWithSize,
                url: href,
                domain: getDomain(href),
                type: domain,
                rawQuality: quality,
                variant: variant,
                size: size,
                sizeBytes: parseSize(size)
            });

            console.log(`         📎 Found ${domain}: ${qualityWithSize} - ${href.substring(0, 50)}...`);
        });

        // Deduplicate - prefer hubcloud over hubdrive
        const deduped = [];
        const seenQualities = new Set();
        for (const link of links) {
            const key = `${link.rawQuality}_${link.variant || 'default'}`;
            if (link.type === 'hubcloud' && !seenQualities.has(key)) { seenQualities.add(key); deduped.push(link); }
        }
        for (const link of links) {
            const key = `${link.rawQuality}_${link.variant || 'default'}`;
            if (link.type === 'hubdrive' && !seenQualities.has(key)) { seenQualities.add(key); deduped.push(link); }
        }

        console.log(`      📦 ${deduped.length} unique HubCloud/HubDrive links found (from ${links.length} total)`);
        return deduped;
    } catch (e) {
        console.log(`      ❌ HBLinks error: ${e.message}`);
        return [];
    }
}

// ============ GET BEST LINK WITH FALLBACK (exact copy from original) ============
async function getBestLinkWithFallback(links) {
    const hc = links.find(l => isHubCloudDomain(l.domain));
    if (hc && getUrl(hc)) {
        console.log(`         ✅ Found HubCloud link`);
        return { link: getUrl(hc), isValid: true };
    }

    const hd = links.find(l => isHubDriveDomain(l.domain));
    if (hd && getUrl(hd)) {
        console.log(`         🔗 Found HubDrive, getting HubCloud...`);
        const hcUrl = await bypassHubDriveForHubCloud(getUrl(hd));
        if (hcUrl && isHubCloudDomain(getDomain(hcUrl))) {
            console.log(`         ✅ Got HubCloud from HubDrive`);
            return { link: hcUrl, isValid: true };
        }
        console.log(`         ✅ Using HubDrive link`);
        return { link: getUrl(hd), isValid: true };
    }

    console.log(`         ❌ No HubCloud/HubDrive link found`);
    return { link: null, isValid: false };
}

// ============ PROCESS QUALITIES (exact copy from original) ============
async function processQualities(links, isHBLinks = false) {
    const result = {}, directLinks = {};

    const validLinks = links.filter(l =>
        (isHubCloudDomain(l.domain) || isHubDriveDomain(l.domain)) && !isHubCDNDomain(l.domain)
    );

    if (validLinks.length === 0) {
        console.log(`      ❌ No HubCloud/HubDrive links available`);
        return { qualities: {}, directLinks: {} };
    }

    const untouchLinks = [], regularLinks = [];
    for (const l of validLinks) {
        const qText = (l.quality || l.rawQuality || 'Download').toLowerCase();
        if (/untouch/i.test(qText) || /untouch/i.test(l.variant || '')) untouchLinks.push(l);
        else regularLinks.push(l);
    }

    const qualityGroups = { '480p': [], '720p': [], '1080p': [], '2160p': [] };
    for (const l of regularLinks) {
        const qText = (l.quality || l.rawQuality || 'Download').toLowerCase();
        let baseQ = null;
        if (qText.includes('480p')) baseQ = '480p';
        else if (qText.includes('720p')) baseQ = '720p';
        else if (qText.includes('1080p')) baseQ = '1080p';
        else if (qText.includes('2160p') || qText.includes('4k')) baseQ = '2160p';

        if (baseQ) {
            let sizeBytes = l.sizeBytes || 0;
            if (!sizeBytes || sizeBytes < 1000) sizeBytes = parseSize(l.quality) || parseSize(l.size) || 0;
            qualityGroups[baseQ].push({ ...l, sizeBytes });
        }
    }

    for (const [baseQ, groupLinks] of Object.entries(qualityGroups)) {
        if (groupLinks.length === 0) continue;

        const uniqueByUrl = [];
        const seenUrls = new Set();
        for (const link of groupLinks) {
            if (!seenUrls.has(link.url)) { seenUrls.add(link.url); uniqueByUrl.push(link); }
        }
        if (uniqueByUrl.length === 0) continue;

        uniqueByUrl.sort((a, b) => (a.sizeBytes || 0) - (b.sizeBytes || 0));

        console.log(`      📊 ${baseQ}: ${uniqueByUrl.length} unique links`);
        for (const link of uniqueByUrl) {
            const sizeMB = link.sizeBytes ? Math.round(link.sizeBytes / 1024 / 1024) : 0;
            console.log(`         - ${link.quality} (${sizeMB}MB)`);
        }

        const smallest = uniqueByUrl[0];
        const largest = uniqueByUrl[uniqueByUrl.length - 1];
        const sizeDiffMB = Math.abs((largest.sizeBytes || 0) - (smallest.sizeBytes || 0)) / 1024 / 1024;
        const hasMultipleDifferentSizes = uniqueByUrl.length > 1 && smallest.url !== largest.url && sizeDiffMB > 100;

        if (hasMultipleDifferentSizes) {
            console.log(`      ✅ ${baseQ} has LOW and HIGH (diff: ${Math.round(sizeDiffMB)}MB)`);

            const { link: linkLow, isValid: validLow } = await getBestLinkWithFallback([smallest]);
            if (linkLow && validLow) { result[`${baseQ}_low`] = { quality: smallest.quality, link: linkLow }; directLinks[`${baseQ}_low`] = true; }
            await delay(300);

            const { link: linkHigh, isValid: validHigh } = await getBestLinkWithFallback([largest]);
            if (linkHigh && validHigh) { result[`${baseQ}_high`] = { quality: largest.quality, link: linkHigh }; directLinks[`${baseQ}_high`] = true; }
            await delay(300);
        } else {
            const { link, isValid } = await getBestLinkWithFallback([smallest]);
            if (link && isValid) { result[baseQ] = { quality: smallest.quality, link }; directLinks[baseQ] = true; }
            await delay(300);
        }
    }

    // UNTOUCH groups
    const untouchGroups = { '480p': [], '720p': [], '1080p': [], '2160p': [] };
    for (const l of untouchLinks) {
        const qText = (l.quality || l.rawQuality || 'Download').toLowerCase();
        let baseQ = null;
        if (qText.includes('480p')) baseQ = '480p';
        else if (qText.includes('720p')) baseQ = '720p';
        else if (qText.includes('1080p')) baseQ = '1080p';
        else if (qText.includes('2160p') || qText.includes('4k')) baseQ = '2160p';
        if (baseQ) untouchGroups[baseQ].push(l);
    }

    for (const [baseQ, groupLinks] of Object.entries(untouchGroups)) {
        if (groupLinks.length === 0) continue;
        const uniqueByUrl = [];
        const seenUrls = new Set();
        for (const link of groupLinks) {
            if (!seenUrls.has(link.url)) { seenUrls.add(link.url); uniqueByUrl.push(link); }
        }
        if (uniqueByUrl.length === 0) continue;
        const { link, isValid } = await getBestLinkWithFallback([uniqueByUrl[0]]);
        if (link && isValid) {
            result[`${baseQ}_untouch`] = { quality: `${baseQ} UNTOUCH`, link, isUntouch: true };
            directLinks[`${baseQ}_untouch`] = true;
        }
        await delay(300);
    }

    // Fallback
    if (Object.keys(result).length === 0 && validLinks.length > 0) {
        const { link, isValid } = await getBestLinkWithFallback(validLinks);
        if (link && isValid) {
            result['Download'] = { quality: validLinks[0]?.quality || 'Download', link };
            directLinks['Download'] = true;
        }
    }

    return { qualities: result, directLinks };
}

// ============ MAIN PROCESS RELEASE (exact copy from original, minus Telegram) ============
async function processRelease(release) {
    console.log(`\n${'═'.repeat(60)}\n🎬 ${release.title}\n${'═'.repeat(60)}`);
    const thumb = release.thumb?.startsWith('http') ? release.thumb : DEFAULT_THUMB;

    try {
        const { data } = await axios.get(release.link, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 30000
        });
        const $ = cheerio.load(data);
        const host = new URL(release.link).hostname;
        const type = detectType($);

        if (type === 'movie') {
            console.log('   🎥 Processing MOVIE');
            const { links, hbLinksUrl, qualitySizes, directHubLinks } = await extractMovieLinks($, host);

            // Collect ALL hblinks URLs
            const hbLinksUrls = [];
            $('a').each((i, el) => {
                const href = $(el).attr('href') || '';
                if ((href.includes('hblinks') || href.includes('4khdhub')) &&
                    !$(el).text().toLowerCase().includes('watch')) {
                    if (!hbLinksUrls.includes(href)) hbLinksUrls.push(href);
                }
            });

            // Process gadgetsweb links
            const gadgetLinks = [];
            $('a[href*="gadgetsweb"]').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                const parentText = $(el).closest('h3, h4, h5, p').text().trim();
                if (!/watch\s*online/i.test(text) && href) {
                    let quality = '720p', size = '', variant = '';
                    const qMatch = (text + ' ' + parentText).match(/(\d{3,4}p)/i);
                    if (qMatch) quality = qMatch[1].toLowerCase();
                    if (/hevc|x265/i.test(text + parentText)) variant = 'hevc';
                    else if (/10bit/i.test(text + parentText)) variant = '10bit';
                    else if (/untouch/i.test(text + parentText)) variant = 'untouch';
                    else if (/x264/i.test(text + parentText)) variant = 'x264';
                    const sMatch = (text + ' ' + parentText).match(/\[?([\d.]+)\s*(GB|MB)\]?/i);
                    if (sMatch) size = `${sMatch[1]}${sMatch[2].toUpperCase()}`;
                    const variantKey = variant ? `${quality}_${variant}` : quality;
                    if (!size && qualitySizes[variantKey]) size = qualitySizes[variantKey];
                    else if (!size && qualitySizes[quality]) size = qualitySizes[quality];
                    gadgetLinks.push({ href, text, quality, size, variant });
                }
            });

            console.log(`   📎 Found ${hbLinksUrls.length} direct hblinks + ${gadgetLinks.length} gadgetsweb links`);

            // Process gadgetsweb → hblinks or direct hub
            for (const gadget of gadgetLinks) {
                try {
                    const bypassedUrl = await bypassGadgets(gadget.href);
                    if (!bypassedUrl) continue;

                    if (bypassedUrl.includes('hblinks') || bypassedUrl.includes('4khdhub')) {
                        const existing = hbLinksUrls.find(item =>
                            (typeof item === 'string' ? item : item.url) === bypassedUrl
                        );
                        if (!existing) {
                            const qKey = gadget.variant ? `${gadget.quality}_${gadget.variant}` : gadget.quality;
                            const sizeFromMain = qualitySizes[qKey] || gadget.size || '';
                            hbLinksUrls.push({ url: bypassedUrl, quality: gadget.quality, size: sizeFromMain, variant: gadget.variant, qualitySizes });
                            console.log(`      ✅ Got hblinks from gadgetsweb: ${gadget.quality}${gadget.variant ? ' ' + gadget.variant : ''}${sizeFromMain ? ' (' + sizeFromMain + ')' : ''}`);
                        }
                    } else if (bypassedUrl.includes('hubcloud') || bypassedUrl.includes('hubdrive')) {
                        const domain = getDomain(bypassedUrl);
                        if (!directHubLinks.find(l => l.url === bypassedUrl)) {
                            const qKey = gadget.variant ? `${gadget.quality}_${gadget.variant}` : gadget.quality;
                            const sizeFromMain = qualitySizes[qKey] || gadget.size || '';
                            let qualityStr = gadget.quality;
                            if (gadget.variant) qualityStr += ` ${gadget.variant.toUpperCase()}`;
                            if (sizeFromMain) qualityStr += ` [${sizeFromMain}]`;
                            directHubLinks.push({ quality: qualityStr, url: bypassedUrl, domain, rawQuality: gadget.quality, variant: gadget.variant, size: sizeFromMain, sizeBytes: parseSize(sizeFromMain) });
                            console.log(`      ✅ Got direct hub from gadgetsweb: ${qualityStr}`);
                        }
                    }
                } catch (e) { console.log(`      ❌ Gadgetsweb bypass failed: ${e.message}`); }
                await delay(300);
            }

            console.log(`   📦 Total ${hbLinksUrls.length} hblinks pages to process`);

            let allHubLinks = [...(directHubLinks || [])];
            console.log(`   📎 Starting with ${allHubLinks.length} direct hub links from main page`);

            // Process hblinks pages
            for (const hbItem of hbLinksUrls) {
                const hbUrl = typeof hbItem === 'string' ? hbItem : hbItem.url;
                const hbQuality = typeof hbItem === 'string' ? null : hbItem.quality;
                const hbVariant = typeof hbItem === 'string' ? null : hbItem.variant;
                const hbSize = typeof hbItem === 'string' ? null : hbItem.size;

                console.log(`   📦 Processing hblinks: ${hbUrl.substring(0, 60)}...`);

                const variantKey = hbVariant ? `${hbQuality}_${hbVariant}` : hbQuality;
                const specificSize = variantKey ? qualitySizes[variantKey] || hbSize : null;
                const modifiedQualitySizes = { ...qualitySizes };
                if (hbQuality && specificSize) modifiedQualitySizes[hbQuality] = specificSize;

                const hbLinks = await getHBLinks(hbUrl, modifiedQualitySizes);

                for (const link of hbLinks) {
                    if (hbVariant && link.rawQuality === hbQuality) {
                        link.variant = hbVariant;
                        link.quality = `${hbQuality} ${hbVariant.toUpperCase()} [${specificSize || link.size}]`;
                        link.size = specificSize || link.size;
                        link.sizeBytes = parseSize(link.size);
                    }
                    if (!allHubLinks.find(l => l.url === link.url)) allHubLinks.push(link);
                }
                await delay(500);
            }

            // Add direct links from main page
            for (const linkData of links) {
                const d = linkData.domain;
                if (d && (d.includes('hubcloud') || d.includes('hubdrive'))) {
                    if (!allHubLinks.find(l => l.url === linkData.link)) {
                        let quality = linkData.quality;
                        const qMatch = quality.match(/(\d{3,4}p)/i);
                        const qKey = qMatch ? qMatch[1].toLowerCase() : '';
                        let variant = '';
                        if (/hevc|x265/i.test(quality)) variant = 'hevc';
                        else if (/10bit/i.test(quality)) variant = '10bit';
                        else if (/x264/i.test(quality)) variant = 'x264';
                        const variantKey = variant ? `${qKey}_${variant}` : qKey;
                        if (qKey && !/\[[\d.]+\s*(GB|MB)\]/i.test(quality)) {
                            const size = qualitySizes[variantKey] || qualitySizes[qKey] || '';
                            if (size) quality = `${quality} [${size}]`;
                        }
                        allHubLinks.push({ quality, url: linkData.link, domain: d, rawQuality: qKey || '720p', variant, sizeBytes: parseSize(quality) });
                        console.log(`   📎 Additional link: ${d} - ${quality}`);
                    }
                }
            }

            console.log(`   📦 Total ${allHubLinks.length} HubCloud/HubDrive links collected`);

            if (allHubLinks.length === 0) {
                console.log('   ⚠️ SKIPPED: No HubCloud/HubDrive links found');
                return null;
            }

            const processedResult = await processQualities(allHubLinks, true);

            if (processedResult && Object.keys(processedResult.qualities).length > 0) {
                // Return in format compatible with our DB save
                return {
                    type: 'movie',
                    title: release.title,
                    thumbnail: thumb,
                    link: release.link,
                    qualities: processedResult.qualities,   // { "720p": { quality, link }, "1080p": {...} }
                    directLinks: processedResult.directLinks
                };
            }

            console.log('   ⚠️ SKIPPED: No valid HubCloud/HubDrive links after processing');
            return null;

        } else {
            // SERIES
            console.log('   📺 Processing SERIES');
            const eps = await extractSeriesEpisodes($);
            if (!eps.length) { console.log('   ⚠️ SKIPPED: No episodes'); return null; }

            const result = {
                type: 'series',
                title: release.title,
                thumbnail: thumb,
                link: release.link,
                episodes: []
            };

            for (const ep of eps) {
                console.log(`\n   📌 Episode ${ep.ep}`);

                if (ep.isDirectStructure) {
                    const validLinks = ep.links.filter(l => {
                        const d = l.domain || '';
                        return d.includes('hubcloud') || d.includes('hubdrive');
                    });

                    if (validLinks.length === 0) {
                        console.log(`      ❌ No HubCloud/HubDrive links for Episode ${ep.ep}`);
                        result.episodes.push({ episode: ep.ep, qualities: {}, directLinks: {}, noLinks: true });
                        continue;
                    }

                    const qualityGroups = {};
                    for (const l of validLinks) {
                        const q = l.quality.replace(/\s+links.*$/i, '').trim();
                        if (!qualityGroups[q]) qualityGroups[q] = [];
                        qualityGroups[q].push(l);
                    }

                    const epQualities = {}, epDirectLinks = {};
                    for (const [quality, qLinks] of Object.entries(qualityGroups)) {
                        console.log(`         🔗 Processing ${quality}...`);
                        const { link, isValid } = await getBestLinkWithFallback(qLinks);
                        if (link && isValid) {
                            epQualities[quality] = { quality, link };
                            epDirectLinks[quality] = true;
                            console.log(`         ✅ Got ${quality}`);
                        }
                        await delay(300);
                    }

                    if (Object.keys(epQualities).length) {
                        result.episodes.push({ episode: ep.ep, qualities: epQualities, directLinks: epDirectLinks });
                        console.log(`      ✅ Episode ${ep.ep} done`);
                    } else {
                        result.episodes.push({ episode: ep.ep, qualities: {}, directLinks: {}, noLinks: true });
                        console.log(`      ❌ Episode ${ep.ep} has no valid links`);
                    }

                } else if (ep.isGadgetStructure) {
                    const bypassedUrl = await bypassGadgets(ep.gadget);
                    if (!bypassedUrl) {
                        result.episodes.push({ episode: ep.ep, qualities: {}, directLinks: {}, noLinks: true });
                        continue;
                    }

                    if (bypassedUrl.includes('hblinks') || bypassedUrl.includes('4khdhub')) {
                        const hbLinks = await getHBLinks(bypassedUrl, {});
                        if (!hbLinks.length) {
                            result.episodes.push({ episode: ep.ep, qualities: {}, directLinks: {}, noLinks: true });
                            continue;
                        }
                        const pr = await processQualities(hbLinks, true);
                        if (Object.keys(pr.qualities).length) {
                            result.episodes.push({ episode: ep.ep, qualities: pr.qualities, directLinks: pr.directLinks });
                        } else {
                            result.episodes.push({ episode: ep.ep, qualities: {}, directLinks: {}, noLinks: true });
                        }
                    } else if (bypassedUrl.includes('hubcloud')) {
                        result.episodes.push({ episode: ep.ep, qualities: { Download: { quality: 'Download', link: bypassedUrl } }, directLinks: { Download: true } });
                    } else if (bypassedUrl.includes('hubdrive')) {
                        const hcUrl = await bypassHubDriveForHubCloud(bypassedUrl);
                        const finalUrl = hcUrl && hcUrl.includes('hubcloud') ? hcUrl : bypassedUrl;
                        result.episodes.push({ episode: ep.ep, qualities: { Download: { quality: 'Download', link: finalUrl } }, directLinks: { Download: true } });
                    } else {
                        result.episodes.push({ episode: ep.ep, qualities: {}, directLinks: {}, noLinks: true });
                    }
                }
                await delay(500);
            }

            result.episodes.sort((a, b) => a.episode - b.episode);

            const episodesWithLinks = result.episodes.filter(ep => Object.keys(ep.qualities).length > 0);
            if (episodesWithLinks.length > 0) {
                console.log(`\n   ✅ Series complete: ${episodesWithLinks.length} episodes with links`);
                return result;
            }

            console.log('   ⚠️ SKIPPED: No episodes with HubCloud/HubDrive links');
            return null;
        }
    } catch (e) {
        console.error(`   ❌ ERROR: ${e.message}`);
        return null;
    }
}

export { getLatestReleases, processRelease };