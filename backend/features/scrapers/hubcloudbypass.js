// hubcloudbypass.js — HubCloud & HubDrive Bypasser
// Matches PHP logic exactly. Uses Accept-Encoding: identity so the server
// sends plain text — no gzip/brotli decompression needed.

import https from 'https';
import http  from 'http';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── HTTP CLIENT ──────────────────────────────────────────────────────────────
// Follows redirects, carries cookies, no compression.

// curlRequest follows redirects and accumulates cookies across all hops.
// The returned response includes `finalCookieString` — the full cookie jar
// at the end of all redirects, not just what the last hop set.
async function curlRequest(url, options = {}) {
    const maxRedirects = options.followLocation !== false ? 10 : 0;
    let currentUrl   = url;
    let redirectCount = 0;
    let lastResponse  = null;

    // Accumulate cookies across every hop
    let cookieJar = parseCookieString(options.cookie || '');

    while (redirectCount <= maxRedirects) {
        const response = await curlRequestSingle(currentUrl, {
            ...options,
            cookie: cookiesToString(cookieJar),
        });
        lastResponse = response;

        if (!response.success) return response;

        // Merge cookies from this hop into the jar
        if (response.headers['set-cookie']) {
            cookieJar = { ...cookieJar, ...extractCookiesFromHeaders(response.headers) };
        }

        if (
            options.followLocation !== false &&
            [301, 302, 303, 307, 308].includes(response.code) &&
            response.headers.location
        ) {
            let location = response.headers.location;
            if (!location.startsWith('http')) {
                const p = new URL(currentUrl);
                location = location.startsWith('/')
                    ? `${p.protocol}//${p.host}${location}`
                    : `${p.protocol}//${p.host}/${location}`;
            }
            currentUrl = location;
            redirectCount++;
            continue;
        }

        response.finalUrl          = currentUrl;
        response.finalCookieString = cookiesToString(cookieJar); // full jar
        return response;
    }

    if (lastResponse) lastResponse.finalCookieString = cookiesToString(cookieJar);
    return lastResponse || { success: false, error: 'Too many redirects' };
}

async function curlRequestSingle(url, options = {}) {
    return new Promise((resolve) => {
        try {
            const parsedUrl = new URL(url);
            const protocol  = parsedUrl.protocol === 'https:' ? https : http;

            const reqOptions = {
                hostname: parsedUrl.hostname,
                port:     parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                path:     parsedUrl.pathname + parsedUrl.search,
                method:   options.method || 'GET',
                headers: {
                    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'identity',   // plain text — no gzip/brotli needed
                    ...(options.headers || {}),
                },
                timeout: options.timeout || 30000,
            };

            if (options.cookie)  reqOptions.headers['Cookie']  = options.cookie;
            if (options.referer) reqOptions.headers['Referer'] = options.referer;
            if (options.origin)  reqOptions.headers['Origin']  = options.origin;

            if (options.postData) {
                reqOptions.headers['Content-Type']   = options.contentType || 'application/x-www-form-urlencoded';
                reqOptions.headers['Content-Length'] = Buffer.byteLength(options.postData);
            }

            const req = protocol.request(reqOptions, (res) => {
                let data = '';
                res.on('data',  chunk => data += chunk);
                res.on('end',   ()    => resolve({
                    success:  true,
                    code:     res.statusCode,
                    headers:  res.headers,
                    body:     data,
                    url,
                    finalUrl: url,
                }));
                res.on('error', e     => resolve({ success: false, error: e.message }));
            });

            req.on('error',   e => resolve({ success: false, error: e.message }));
            req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });

            if (options.postData) req.write(options.postData);
            req.end();
        } catch (e) {
            resolve({ success: false, error: e.message });
        }
    });
}

// ── COOKIE HELPERS ───────────────────────────────────────────────────────────
function extractCookiesFromHeaders(headers) {
    const cookies = {};
    const list = headers['set-cookie'] || [];
    (Array.isArray(list) ? list : [list]).forEach(cookie => {
        if (!cookie) return;
        const parts = cookie.split(';')[0].split('=');
        if (parts.length >= 2) cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
    });
    return cookies;
}

function parseCookieString(str) {
    const cookies = {};
    if (!str) return cookies;
    str.split(';').forEach(part => {
        const [k, ...v] = part.trim().split('=');
        if (k) cookies[k.trim()] = v.join('=').trim();
    });
    return cookies;
}

function cookiesToString(cookies) {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ── URL HELPERS ──────────────────────────────────────────────────────────────
function isHubCloudUrl(url)  { return /hubcloud\.[a-z]{2,10}/i.test(url); }
function isHubDriveUrl(url)  { return /hubdrive\.[a-z]{2,10}\/file\/\d+/i.test(url); }
function isPixelDrainUrl(url){ return /pixeldrain\.(dev|com)\/u\/[a-zA-Z0-9]+/i.test(url); }
function is10GbpsUrl(url)    { return url.includes('pixel.hubcdn') || url.includes('pixel.rohitkiskk') || url.includes('10gbps'); }
function fixHubCloudDomain(url){ return url.replace(/hubcloud\.[a-z]{2,10}/i, 'hubcloud.foo'); }
function fixHubDriveDomain(url){ return url.replace(/hubdrive\.[a-z]{2,10}/i, 'hubdrive.space'); }
function extractHubDriveFileId(url){ const m = url.match(/\/file\/(\d+)/); return m ? m[1] : null; }

// ── FSL LINK EXTRACTION (exact PHP match) ───────────────────────────────────
function extractFSLLinks(html) {
    const links = {
        fsl: null, fsl1: null, fsl2: null,
        fsl3: null, fsl4: null, fsl5: null,
        pixel10gbps: null, pixeldrain: null,
    };

    for (const fslId of ['fsl', 'fsl1', 'fsl2', 'fsl3', 'fsl4', 'fsl5']) {
        // Pattern 1: id before href
        let m = html.match(new RegExp(`<a[^>]*\\bid\\s*=\\s*['"]${fslId}['"][^>]*\\bhref\\s*=\\s*['"]([^'"]+)['"]`, 'i'));
        // Pattern 2: href before id
        if (!m) m = html.match(new RegExp(`<a[^>]*\\bhref\\s*=\\s*['"]([^'"]+)['"][^>]*\\bid\\s*=\\s*['"]${fslId}['"]`, 'i'));
        // Pattern 3: button text "Download [FSL Server]"
        if (!m) m = html.match(new RegExp(`<a[^>]*\\bhref\\s*=\\s*['"]([^'"]+)['"][^>]*>.*?Download\\s*\\[\\s*${fslId.toUpperCase()}\\s*Server\\s*\\]`, 'is'));
        // Pattern 4: class contains fslId
        if (!m) m = html.match(new RegExp(`<a[^>]*\\bclass\\s*=\\s*['"][^'"]*\\b${fslId}\\b[^'"]*['"][^>]*\\bhref\\s*=\\s*['"]([^'"]+)['"]`, 'i'));

        if (m) links[fslId] = m[1];
    }

    // 10GBPS
    for (const p of [
        /href\s*=\s*['"]([^'"]*pixel\.hubcdn\.fans[^'"]*)['"]/i,
        /href\s*=\s*['"]([^'"]*pixel\.rohitkiskk[^'"]*)['"]/i,
        /href\s*=\s*['"]([^'"]*10gbps[^'"]*)['"]/i,
        /<a[^>]*\bid\s*=\s*['"](?:pixel|10gbps)['"][^>]*\bhref\s*=\s*['"]([^'"]+)['"]/i,
        /<a[^>]*\bhref\s*=\s*['"]([^'"]+)['"][^>]*\bid\s*=\s*['"](?:pixel|10gbps)['"]/i,
    ]) { const m = html.match(p); if (m) { links.pixel10gbps = m[1]; break; } }

    // PixelDrain
    for (const p of [
        /href\s*=\s*['"]([^'"]*pixeldrain\.com[^'"]*)['"]/i,
        /href\s*=\s*['"]([^'"]*pixeldrain\.dev[^'"]*)['"]/i,
        /<a[^>]*\bid\s*=\s*['"]pixeldrain['"][^>]*\bhref\s*=\s*['"]([^'"]+)['"]/i,
        /<a[^>]*\bhref\s*=\s*['"]([^'"]+)['"][^>]*\bid\s*=\s*['"]pixeldrain['"]/i,
    ]) { const m = html.match(p); if (m) { links.pixeldrain = m[1]; break; } }

    return links;
}

// ── BYPASS PIXELDRAIN ────────────────────────────────────────────────────────
function bypassPixelDrain(url) {
    const m = url.match(/pixeldrain\.(dev|com)\/u\/([a-zA-Z0-9]+)/i);
    if (!m) return { success: false, error: 'Invalid PixelDrain URL' };
    const direct = `https://pixeldrain.com/api/file/${m[2]}?download`;
    return {
        success: true, url: direct, server: 'PixelDrain', type: 'video',
        allLinks: [{ url: direct, server: 'PixelDrain', type: 'video' }],
    };
}

// ── BYPASS 10GBPS ────────────────────────────────────────────────────────────
async function bypass10GbpsPixel(url) {
    let currentUrl = url;

    for (let i = 0; i < 15; i++) {
        const linkMatch = currentUrl.match(/[?&]link=(https?:\/\/[^&\s]+googleusercontent\.com[^&\s]*)/i);
        if (linkMatch) {
            const u = decodeURIComponent(linkMatch[1]);
            return { success: true, url: u, server: '10GBPS', type: 'video', allLinks: [{ url: u, server: '10GBPS', type: 'video' }] };
        }
        if (currentUrl.includes('video-downloads.googleusercontent.com')) {
            return { success: true, url: currentUrl, server: '10GBPS', type: 'video', allLinks: [{ url: currentUrl, server: '10GBPS', type: 'video' }] };
        }

        const response = await curlRequestSingle(currentUrl, { cookie: 'xyt=1' });
        if (!response.success) break;

        if ([301, 302, 303, 307, 308].includes(response.code) && response.headers.location) {
            let location = response.headers.location;
            const lm = location.match(/[?&]link=(https?:\/\/[^&\s]+googleusercontent\.com[^&\s]*)/i);
            if (lm) {
                const u = decodeURIComponent(lm[1]);
                return { success: true, url: u, server: '10GBPS', type: 'video', allLinks: [{ url: u, server: '10GBPS', type: 'video' }] };
            }
            if (location.includes('googleusercontent.com')) {
                return { success: true, url: location, server: '10GBPS', type: 'video', allLinks: [{ url: location, server: '10GBPS', type: 'video' }] };
            }
            if (!location.startsWith('http')) {
                const p = new URL(currentUrl);
                location = `${p.protocol}//${p.host}${location}`;
            }
            currentUrl = location;
            continue;
        }

        if (response.code === 200) {
            const vd = response.body.match(/id\s*=\s*['"]vd['"][^>]*href\s*=\s*['"]([^'"]+)['"]/i)
                    || response.body.match(/href\s*=\s*['"]([^'"]+)['"][^>]*id\s*=\s*['"]vd['"]/i);
            if (vd && vd[1].includes('googleusercontent.com')) {
                return { success: true, url: vd[1], server: '10GBPS', type: 'video', allLinks: [{ url: vd[1], server: '10GBPS', type: 'video' }] };
            }
            const gc = response.body.match(/(https?:\/\/video-downloads\.googleusercontent\.com\/[^\s'"<>]+)/i);
            if (gc) {
                const u = gc[1].replace(/&amp;/g, '&');
                return { success: true, url: u, server: '10GBPS', type: 'video', allLinks: [{ url: u, server: '10GBPS', type: 'video' }] };
            }
        }
        break;
    }

    return { success: false, error: 'Could not extract 10GBPS link' };
}

// ── BYPASS HUBDRIVE ──────────────────────────────────────────────────────────
async function bypassHubDrive(url, maxRetries = 5) {
    url = fixHubDriveDomain(url);
    const fileId = extractHubDriveFileId(url);
    if (!fileId) return { success: false, error: 'Invalid HubDrive URL' };

    const parsed  = new URL(url);
    const baseUrl = `${parsed.protocol}//${parsed.host}`;

    console.log(`      🔗 HubDrive: Getting page...`);
    const response = await curlRequest(url, { referer: 'https://hblinks.dad/', followLocation: true });
    if (!response.success) return { success: false, error: 'Failed to access HubDrive' };

    // Use the full accumulated cookie jar (covers cookies set on redirect hops)
    const cookieStr = response.finalCookieString || cookiesToString(extractCookiesFromHeaders(response.headers));
    await sleep(500);

    const apiUrl = `${baseUrl}/ajax.php?ajax=direct-download`;
    console.log(`      🔗 HubDrive: Calling API...`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const apiRes = await curlRequestSingle(apiUrl, {
            method:   'POST',
            postData: `id=${fileId}`,
            cookie:   cookieStr,
            referer:  url,
            headers: {
                'Content-Type':    'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin':           baseUrl,
                'Accept':           'application/json, text/javascript, */*; q=0.01',
            },
        });

        if (!apiRes.success) {
            if (attempt < maxRetries) { await sleep(2000); continue; }
            return { success: false, error: 'API request failed' };
        }

        try {
            const data = JSON.parse(apiRes.body);

            if (data.code == 200 || data.code == '200') {
                const gdriveUrl = data.data?.gd || '';
                let gdriveFileId = null;

                const fm = gdriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
                        || gdriveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
                if (fm)                                               gdriveFileId = fm[1];
                else if (/^[a-zA-Z0-9_-]+$/.test(gdriveUrl))         gdriveFileId = gdriveUrl;

                if (gdriveFileId) {
                    console.log(`      ✅ HubDrive: Got GDrive ID`);
                    const viewUrl   = `https://drive.google.com/file/d/${gdriveFileId}/view`;
                    const directUrl = `https://drive.google.com/uc?export=download&id=${gdriveFileId}&confirm=t`;
                    return {
                        success:     true,
                        url:         directUrl,
                        server:      'GDrive',
                        type:        'gdrive',
                        gdriveFileId,
                        fileName:    data.data?.n || 'Unknown',
                        allLinks: [
                            { url: directUrl, server: 'GDrive',        type: 'gdrive' },
                            { url: viewUrl,   server: 'GDrive-View',   type: 'gdrive' },
                        ],
                    };
                }
            }

            if ((data.code == 408 || data.code == '408') && attempt < maxRetries) {
                console.log(`      ⏳ HubDrive: Rate limited, retry ${attempt}/${maxRetries}...`);
                await sleep(2000);
                continue;
            }
        } catch (e) {
            console.log(`      ⚠️ HubDrive: Parse error: ${e.message}`);
        }

        if (attempt >= maxRetries) break;
        await sleep(2000);
    }

    return { success: false, error: 'Max retries reached' };
}

// ── BYPASS HUBCLOUD (exact PHP logic) ───────────────────────────────────────
async function bypassHubCloud(originalUrl) {
    const url = fixHubCloudDomain(originalUrl);

    console.log(`      🔗 HubCloud: Getting page...`);
    const response = await curlRequest(url, { cookie: 'xla=s4t', followLocation: true });

    if (!response.success || !response.body) {
        return { success: false, error: `Failed to access HubCloud: ${response.error || 'No response'}` };
    }

    const html     = response.body;
    const finalUrl = response.finalUrl || url;
    const parsed   = new URL(finalUrl);
    const baseUrl  = `${parsed.protocol}//${parsed.host}`;

    console.log(`      📄 HubCloud: Page fetched (${html.length} bytes) from ${finalUrl.substring(0, 60)}`);

    // ── Find generate link (same 4 methods as PHP) ──────────────────────────
    let generateLink = null;

    // Method 1: var url = "..."
    let m = html.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/i);
    if (m) generateLink = m[1];

    // Method 2: id="download"
    if (!generateLink) {
        m = html.match(/<a[^>]+id\s*=\s*['"]download['"][^>]+href\s*=\s*['"]([^'"]+)['"]/i)
         || html.match(/<a[^>]+href\s*=\s*['"]([^'"]+)['"][^>]+id\s*=\s*['"]download['"]/i);
        if (m) generateLink = m[1];
    }

    // Method 3: href with generate/download keyword
    if (!generateLink) {
        m = html.match(/<a[^>]+href\s*=\s*['"]([^'"]*(?:generate|download)[^'"]*)['"]/i);
        if (m) generateLink = m[1];
    }

    // Method 4: /g/ path
    if (!generateLink) {
        m = html.match(/href\s*=\s*['"]([^'"]*\/g\/[^'"]+)['"]/i);
        if (m) generateLink = m[1];
    }

    console.log(`      🔗 HubCloud: Generate link: ${generateLink ? generateLink.substring(0, 80) : 'NOT FOUND'}`);

    if (!generateLink) {
        console.log(`      ⚠️ Page snippet: ${html.substring(0, 500).replace(/\s+/g, ' ')}`);
        return { success: false, error: 'Generate link not found in page' };
    }

    if (!generateLink.startsWith('http')) {
        generateLink = baseUrl + (generateLink.startsWith('/') ? '' : '/') + generateLink;
    }

    console.log(`      🔗 HubCloud: Accessing generate page...`);
    await sleep(500);

    const response2 = await curlRequest(generateLink, {
        cookie:       'xyt=2; xla=s4t',
        referer:      finalUrl,
        followLocation: true,
    });

    if (!response2.success || !response2.body) {
        return { success: false, error: `Failed to access generate page: ${response2.error || 'No response'}` };
    }

    const html2 = response2.body;
    console.log(`      📄 HubCloud: Generate page fetched (${html2.length} bytes)`);

    const links = extractFSLLinks(html2);
    console.log(`      📦 HubCloud: FSL:${!!links.fsl} FSL1:${!!links.fsl1} FSL2:${!!links.fsl2} FSL3:${!!links.fsl3} FSL4:${!!links.fsl4} FSL5:${!!links.fsl5} 10GBPS:${!!links.pixel10gbps} PD:${!!links.pixeldrain}`);

    // ── Collect ALL available links in priority order ────────────────────────
    // Returns primary URL for backward compat + allLinks[] for callers
    // that want to try alternatives.
    const allLinks = [];
    const seen     = new Set();
    const add      = (u, server, type = 'video') => {
        if (u && !seen.has(u)) { seen.add(u); allLinks.push({ url: u, server, type }); }
    };

    // Priority: fsl → fsl1 → fsl2 → fsl3 → fsl4 → fsl5  (same as PHP)
    for (const fslId of ['fsl', 'fsl1', 'fsl2', 'fsl3', 'fsl4', 'fsl5']) {
        if (links[fslId]) {
            console.log(`      ✅ HubCloud: Found ${fslId.toUpperCase()}`);
            add(links[fslId], fslId.toUpperCase());
        }
    }

    // 10GBPS — needs bypass to resolve googleusercontent URL
    if (links.pixel10gbps) {
        console.log(`      🔗 HubCloud: Resolving 10GBPS...`);
        const r = await bypass10GbpsPixel(links.pixel10gbps);
        if (r.success) add(r.url, '10GBPS');
    }

    // PixelDrain
    if (links.pixeldrain) {
        const r = bypassPixelDrain(links.pixeldrain);
        if (r.success) add(r.url, 'PixelDrain');
    }

    // Fallback: any btn-class anchor with "download/server" text (PHP fallback)
    if (allLinks.length === 0) {
        const fb = html2.match(/<a[^>]*class\s*=\s*['"][^'"]*btn[^'"]*['"][^>]*href\s*=\s*['"]([^'"]+)['"][^>]*>.*?(?:download|server).*?<\/a>/is);
        if (fb) {
            console.log(`      ✅ HubCloud: Using fallback button`);
            add(fb[1], 'Direct');
        }
    }

    if (allLinks.length === 0) {
        console.log(`      ⚠️ Generate page snippet: ${html2.substring(0, 500).replace(/\s+/g, ' ')}`);
        return { success: false, error: 'No FSL or download link found in generate page' };
    }

    console.log(`      ✅ HubCloud: ${allLinks.length} link(s) found (primary: ${allLinks[0].server})`);
    return {
        success:  true,
        url:      allLinks[0].url,
        server:   allLinks[0].server,
        type:     allLinks[0].type || 'video',
        allLinks,
    };
}

// ── MAIN ENTRY POINT ─────────────────────────────────────────────────────────
async function bypassHubCloudLink(url) {
    console.log(`   🔓 Bypassing: ${url.substring(0, 60)}...`);
    try {
        if (isHubDriveUrl(url))   { console.log(`   📦 Type: HubDrive`);   return await bypassHubDrive(url); }
        if (isHubCloudUrl(url))   { console.log(`   ☁️  Type: HubCloud`);   return await bypassHubCloud(url); }
        if (isPixelDrainUrl(url)) { console.log(`   📦 Type: PixelDrain`); return bypassPixelDrain(url); }
        if (is10GbpsUrl(url))     { console.log(`   📦 Type: 10GBPS`);     return await bypass10GbpsPixel(url); }

        console.log(`   📦 Type: Direct`);
        return { success: true, url, server: 'Direct', type: 'video', allLinks: [{ url, server: 'Direct', type: 'video' }] };
    } catch (e) {
        console.log(`   ❌ Bypass error: ${e.message}`);
        return { success: false, error: e.message };
    }
}

// ── EXPORTS ──────────────────────────────────────────────────────────────────
export {
    bypassHubCloudLink, bypassHubCloud, bypassHubDrive,
    bypassPixelDrain, bypass10GbpsPixel,
    isHubCloudUrl, isHubDriveUrl, isPixelDrainUrl, is10GbpsUrl,
};

export default bypassHubCloudLink;
