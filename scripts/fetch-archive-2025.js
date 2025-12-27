const fs = require('fs').promises;
const path = require('path');
const { YouTubeClient } = require('./youtube-client');

class F1ArchiveFetcher {
    constructor() {
        this.apiKey = process.env.YOUTUBE_API_KEY;
        this.channelId = 'UCB_qr75-ydFVKSF9Dmo6izg';
        this.year = '2025';
        this.requestDelayMs = parseInt(process.env.YT_REQUEST_DELAY_MS || '0', 10);
        this.maxPages = parseInt(process.env.YT_MAX_PAGES || process.env.YT_PAGE_CAP || '500', 10);
        this.windowStartDays = parseInt(process.env.YT_WINDOW_START_DAYS || '-1', 10);
        this.windowEndDays = parseInt(process.env.YT_WINDOW_END_DAYS || '3', 10);
        this.missingOnly = process.env.FETCH_MISSING_ONLY === 'true';
        this.dataDir = path.join(process.cwd(), 'public', 'data');
        
        this.allowedSessionTypes = [
            'fp1', 'fp2', 'fp3', 'free practice 1', 'free practice 2', 'free practice 3',
            'practice 1', 'practice 2', 'practice 3',
            'qualifying', 'quali', 'sprint', 'race'
        ];
        
        this.includeKeywords = [
            'highlights', 'recap', 'session',
            'full race', 'full replay', 'full qualifying', 'extended highlights'
        ];
        
        this.excludeKeywords = [
            'f2', 'formula 2', 'post-race show', 'post race show',
            'live:', 'preview', 'analysis', 'interview', 'press conference',
            'feature race', 'f3', 'formula 3', 'porsche', 'w series',
            'drivers react', 'driver react', 'react after', 'reaction',
            'esports', 'indycar', 'nascar', 'wrc', 'dtm', 'motogp',
            'team radio', 'top 10', 'best moments', 'radio rewinds', 'funniest',
            'kids', 'challenge', 'hot laps', 'simulator', 'sim', 'gaming'
        ];
    }

    async fetchArchive() {
        if (!this.apiKey) {
            throw new Error('YouTube API key not found. Please set YOUTUBE_API_KEY environment variable.');
        }

        try {
            console.log(`📦 Fetching ALL 2025 F1 archive videos (uploads playlist scan)...`);

            const yt = new YouTubeClient({
                apiKey: this.apiKey,
                requestDelayMs: this.requestDelayMs
            });

            const allVideos = await this.fetchUploadsForYear(yt, parseInt(this.year, 10));
            const preservedGroups = [];
            let existingData = null;
            const archivePath = path.join(this.dataDir, 'videos-2025.json');

            if (this.missingOnly) {
                try {
                    const raw = await fs.readFile(archivePath, 'utf8');
                    existingData = JSON.parse(raw);
                    console.log(`ℹ️  Missing-only mode: preserving ${existingData.grandPrixWeekends?.length || 0} existing weekends`);
                    preservedGroups.push(
                        ...(existingData.grandPrixWeekends || []).filter(
                            (g) => g?.name && Array.isArray(g.videos) && g.videos.length > 0
                        )
                    );
                } catch (_) {
                    console.log('ℹ️  Missing-only mode: no existing public/data/videos-2025.json found, fetching all');
                }
            }

            // Global de-dupe by videoId
            const uniqueMap = new Map();
            allVideos.forEach(v => {
                const id = v.id?.videoId;
                if (!id) return;
                if (!uniqueMap.has(id)) {
                    uniqueMap.set(id, v);
                }
            });
            const uniqueVideos = Array.from(uniqueMap.values());
            
            const usage = yt.getUsageSummary();
            console.log(`\n📊 Total uploads scanned (year-bounded): ${allVideos.length}`);
            console.log(`🧹 Unique videos after de-dupe: ${uniqueVideos.length}`);
            console.log(`🔌 YouTube API calls: ${usage.apiCalls}`);
            
            const filteredVideos = this.filterRecapVideos(uniqueVideos);
            console.log(`📋 Filtered to recap videos: ${filteredVideos.length}`);

            const calendar = await this.loadCalendarYear(parseInt(this.year, 10));
            this.maybeDebugWeekend(uniqueVideos, calendar);
            const groupedVideos = this.groupVideosByCalendarWindow(filteredVideos, calendar);
            const rawById = this.buildVideoRecordIndex(uniqueVideos);
            const withManual = await this.mergeManualVideos(groupedVideos, rawById, yt);
            const mergedGroups = this.mergePreservedGroups(withManual, preservedGroups, {
                preferPreserved: this.missingOnly
            });
            console.log(`📅 Organized into ${mergedGroups.length} Grand Prix weekends`);

            this.logMissingExpectedSessions(mergedGroups, calendar);

            const totalVideos = mergedGroups.reduce(
                (sum, gp) => sum + (Array.isArray(gp?.videos) ? gp.videos.length : 0),
                0
            );
            
            const videoData = {
                lastUpdated: new Date().toISOString(),
                totalVideos,
                grandPrixWeekends: mergedGroups,
                year: '2025'
            };
            
            await this.saveVideoData(videoData, 'videos-2025.json');
            console.log('\n✅ 2025 archive data saved to public/data/videos-2025.json!');
            
            return videoData;
            
        } catch (error) {
            console.error('❌ Error fetching archive:', error.message);
            throw error;
        }
    }

    toSearchLikeVideo({ videoId, title, description, publishedAt, thumbnails }) {
        return {
            id: { videoId },
            snippet: {
                title: title || '',
                description: description || '',
                publishedAt,
                thumbnails: thumbnails || {}
            }
        };
    }

    async fetchUploadsForYear(yt, year) {
        const start = Date.parse(`${year}-01-01T00:00:00.000Z`);
        const end = Date.parse(`${year + 1}-01-01T00:00:00.000Z`);

        const uploadsPlaylistId = await yt.getUploadsPlaylistId(this.channelId);
        const collected = [];

        let pageToken = null;
        let pages = 0;
        let stop = false;

        while (!stop && pages < this.maxPages) {
            const page = await yt.listPlaylistItems({ playlistId: uploadsPlaylistId, pageToken, maxResults: 50 });
            pages += 1;

            for (const item of page.items) {
                const videoId = item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId;
                const publishedAt = item?.contentDetails?.videoPublishedAt || item?.snippet?.publishedAt;

                if (!videoId || !publishedAt) continue;

                const ts = Date.parse(publishedAt);
                if (Number.isNaN(ts)) continue;

                if (ts < start) {
                    stop = true;
                    break;
                }

                if (ts >= end) {
                    // Future year (e.g. running this script in 2026); skip but keep scanning.
                    continue;
                }

                collected.push(
                    this.toSearchLikeVideo({
                        videoId,
                        title: item?.snippet?.title,
                        description: item?.snippet?.description,
                        publishedAt: new Date(ts).toISOString(),
                        thumbnails: item?.snippet?.thumbnails
                    })
                );
            }

            pageToken = page.nextPageToken;
            if (!pageToken) break;
        }

        if (pages >= this.maxPages) {
            console.warn(`⚠️  Reached YT_MAX_PAGES=${this.maxPages} while scanning uploads; results may be incomplete.`);
        }

        return collected;
    }

    filterRecapVideos(videos) {
        return videos.filter(video => {
            const title = video.snippet.title.toLowerCase();
            const description = video.snippet.description.toLowerCase();
            const videoType = this.getVideoTypeFromTitle(title);
            
            // Avoid false negatives: F1 descriptions sometimes mention other series (F2/F3/etc).
            // We only apply excludes to the title, which is far more indicative.
            const shouldExclude = this.excludeKeywords.some(keyword => title.includes(keyword));
            
            if (shouldExclude) {
                return false;
            }
            
            if (videoType === 'other') {
                return false;
            }
            
            const hasIncludeKeyword = this.includeKeywords.some(keyword =>
                title.includes(keyword) || description.includes(keyword)
            );
            
            const isF1Context = ['grand prix', 'gp', 'formula 1', 'f1'].some(keyword =>
                title.includes(keyword) || description.includes(keyword)
            );
            
            return hasIncludeKeyword && isF1Context;
        });
    }

    sortVideosInGroup(videos = []) {
        const orderMap = {
            fp1: 10,
            fp2: 20,
            fp3: 30,
            qualifying: 40,
            'sprint-qualifying': 50,
            sprint: 60,
            'race-qualifying': 70,
            race: 80,
            other: 99
        };

        videos.sort((a, b) => {
            const aType = this.getVideoTypeFromTitle(a.title);
            const bType = this.getVideoTypeFromTitle(b.title);

            const aOrder = orderMap[aType] ?? 99;
            const bOrder = orderMap[bType] ?? 99;
            if (aOrder !== bOrder) return aOrder - bOrder;

            return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
        });
    }

    buildVideoRecordIndex(videos = []) {
        const map = new Map();
        for (const v of videos) {
            const videoId = v?.id?.videoId;
            if (!videoId || map.has(videoId)) continue;
            map.set(videoId, {
                videoId,
                title: v?.snippet?.title || '',
                description: v?.snippet?.description || '',
                publishedAt: v?.snippet?.publishedAt || null,
                thumbnail: v?.snippet?.thumbnails?.high?.url || v?.snippet?.thumbnails?.default?.url || ''
            });
        }
        return map;
    }

    normalizeWeekendName(name, year) {
        const raw = String(name || '').trim();
        if (!raw) return null;
        if (raw.startsWith(`${year} `)) return raw;
        return `${year} ${raw}`;
    }

    async loadManualArchive(year) {
        const manualPath = path.join(this.dataDir, `archive-${year}-manual.json`);
        try {
            const raw = await fs.readFile(manualPath, 'utf8');
            const parsed = JSON.parse(raw);
            const weekends = Array.isArray(parsed) ? parsed : parsed?.grandPrixWeekends;
            if (!Array.isArray(weekends)) return [];

            return weekends
                .map((w) => {
                    const fullName = this.normalizeWeekendName(w?.name, year);
                    if (!fullName) return null;
                    const videos = Array.isArray(w?.videos) ? w.videos : [];
                    return { name: fullName, videos };
                })
                .filter(Boolean);
        } catch (err) {
            // Manual file is optional.
            return [];
        }
    }

    async mergeManualVideos(groups, rawById, yt) {
        const year = parseInt(this.year, 10);
        const manual = await this.loadManualArchive(year);
        if (!manual.length) return groups;

        const byName = new Map((groups || []).map((g) => [g.name, g]));

        // Track ids that need enrichment via videos.list
        const toFetch = new Map(); // weekendName -> Set(videoId)

        for (const w of manual) {
            const group = byName.get(w.name);
            if (!group) {
                console.warn(`⚠️  Manual archive weekend not found in calendar: ${w.name}`);
                continue;
            }

            const seen = new Set((group.videos || []).map((v) => v.videoId));
            const ensureFetchedSet = () => {
                if (!toFetch.has(w.name)) toFetch.set(w.name, new Set());
                return toFetch.get(w.name);
            };

            for (const entry of w.videos || []) {
                const videoId = typeof entry === 'string' ? entry : entry?.videoId;
                if (!videoId || seen.has(videoId)) continue;

                if (typeof entry === 'object' && entry?.title && entry?.publishedAt) {
                    group.videos.push({
                        videoId,
                        title: entry.title,
                        description: entry.description || '',
                        publishedAt: entry.publishedAt,
                        thumbnail: entry.thumbnail || ''
                    });
                    seen.add(videoId);
                    continue;
                }

                const fromScan = rawById?.get(videoId);
                if (fromScan?.title && fromScan?.publishedAt) {
                    group.videos.push({
                        videoId,
                        title: fromScan.title,
                        description: fromScan.description || '',
                        publishedAt: fromScan.publishedAt,
                        thumbnail: fromScan.thumbnail || ''
                    });
                    seen.add(videoId);
                    continue;
                }

                ensureFetchedSet().add(videoId);
            }
        }

        // Enrich any unresolved manual ids via videos.list (batched).
        for (const [weekendName, idsSet] of toFetch.entries()) {
            const ids = Array.from(idsSet);
            for (let i = 0; i < ids.length; i += 50) {
                const batch = ids.slice(i, i + 50);
                const items = await yt.listVideosByIds(batch);

                const group = byName.get(weekendName);
                if (!group) continue;
                const seen = new Set((group.videos || []).map((v) => v.videoId));

                for (const item of items) {
                    const videoId = item?.id;
                    if (!videoId || seen.has(videoId)) continue;
                    const sn = item?.snippet;
                    group.videos.push({
                        videoId,
                        title: sn?.title || '',
                        description: sn?.description || '',
                        publishedAt: sn?.publishedAt || null,
                        thumbnail: sn?.thumbnails?.high?.url || sn?.thumbnails?.default?.url || ''
                    });
                    seen.add(videoId);
                }
            }
        }

        // Recompute latestDate for any group touched by manual merge.
        for (const g of byName.values()) {
            this.sortVideosInGroup(g.videos || []);
            const latest = (g.videos || [])
                .map((v) => Date.parse(v.publishedAt))
                .filter((t) => !Number.isNaN(t))
                .sort((a, b) => b - a)[0];
            g.latestDate = latest ? new Date(latest).toISOString() : g.latestDate;
        }

        return groups;
    }

    async loadCalendarYear(year) {
        const calendarPath = path.join(this.dataDir, `calendar${year}.json`);
        try {
            const raw = await fs.readFile(calendarPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                throw new Error('Calendar JSON is not an array');
            }
            return parsed
                .map((entry) => ({
                    name: entry?.name,
                    startDate: entry?.startDate
                }))
                .filter((e) => typeof e.name === 'string' && typeof e.startDate === 'string');
        } catch (err) {
            throw new Error(`Failed to load calendar for ${year} at ${calendarPath}: ${err.message}`);
        }
    }

    buildWeekendWindows(calendarEntries, year) {
        const oneDayMs = 24 * 60 * 60 * 1000;
        return calendarEntries.map((entry) => {
            const start = Date.parse(entry.startDate);
            const windowStart = start + this.windowStartDays * oneDayMs;
            const windowEnd = start + this.windowEndDays * oneDayMs;
            return {
                name: `${year} ${entry.name}`,
                start,
                windowStart,
                windowEnd
            };
        });
    }

    expectedTypeForSessionName(sessionName) {
        const t = String(sessionName || '').toLowerCase();
        if (t === 'fp1') return 'fp1';
        if (t === 'fp2') return 'fp2';
        if (t === 'fp3') return 'fp3';
        if (t === 'sprint qualifying') return 'sprint-qualifying';
        if (t === 'sprint') return 'sprint';
        if (t === 'qualifying') return 'qualifying';
        if (t === 'grand prix') return 'race';
        return null;
    }

    logMissingExpectedSessions(groups, calendarEntries) {
        const year = parseInt(this.year, 10);
        const byName = new Map((groups || []).map((g) => [g.name, g]));

        const missing = [];
        for (const entry of calendarEntries || []) {
            const weekendName = `${year} ${entry.name}`;
            const group = byName.get(weekendName);
            if (!group) continue;

            const expected = (entry.sessions || [])
                .map((s) => this.expectedTypeForSessionName(s))
                .filter(Boolean);

            const present = new Set((group.videos || []).map((v) => this.getVideoTypeFromTitle(v.title)));

            const missingTypes = expected.filter((t) => !present.has(t));
            if (missingTypes.length) {
                missing.push({ weekendName, missingTypes });
            }
        }

        if (missing.length) {
            console.warn(`⚠️  Missing expected session videos for ${missing.length} weekend(s). If these videos exist but were uploaded late, re-run with a wider window (e.g. YT_WINDOW_END_DAYS=5).`);
            missing.forEach((m) => console.warn(`   - ${m.weekendName}: missing ${m.missingTypes.join(', ')}`));
            console.warn(`ℹ️  To debug a specific weekend, run with YT_DEBUG_WEEKEND=\"Spanish Grand Prix\" to print all uploads in-window and why they were filtered.`);
        }
    }

    maybeDebugWeekend(uniqueVideos, calendarEntries) {
        const debug = process.env.YT_DEBUG_WEEKEND;
        if (!debug) return;

        const year = parseInt(this.year, 10);
        const target = String(debug).toLowerCase().replace(/\s+/g, ' ').trim();
        const entry = (calendarEntries || []).find((e) => String(e.name || '').toLowerCase() === target);
        if (!entry) {
            console.warn(`⚠️  YT_DEBUG_WEEKEND: weekend not found in calendar: ${debug}`);
            return;
        }

        const oneDayMs = 24 * 60 * 60 * 1000;
        const start = Date.parse(entry.startDate);
        const windowStart = start + this.windowStartDays * oneDayMs;
        const windowEnd = start + this.windowEndDays * oneDayMs;

        const inWindow = (uniqueVideos || []).filter((v) => {
            const ts = Date.parse(v?.snippet?.publishedAt);
            return !Number.isNaN(ts) && ts >= windowStart && ts <= windowEnd;
        });

        const filteredOut = [];
        const kept = [];

        for (const v of inWindow) {
            const title = String(v?.snippet?.title || '');
            const titleLower = title.toLowerCase();
            const descriptionLower = String(v?.snippet?.description || '').toLowerCase();
            const videoType = this.getVideoTypeFromTitle(titleLower);

            const shouldExclude = this.excludeKeywords.some((k) => titleLower.includes(k));
            const hasIncludeKeyword = this.includeKeywords.some((k) => titleLower.includes(k) || descriptionLower.includes(k));
            const isF1Context = ['grand prix', 'gp', 'formula 1', 'f1'].some((k) => titleLower.includes(k) || descriptionLower.includes(k));

            const reasons = [];
            if (shouldExclude) reasons.push('excludeKeyword(title)');
            if (videoType === 'other') reasons.push('unknownSessionType');
            if (!hasIncludeKeyword) reasons.push('noIncludeKeyword');
            if (!isF1Context) reasons.push('noF1Context');

            const record = {
                videoId: v?.id?.videoId,
                publishedAt: v?.snippet?.publishedAt,
                title
            };

            if (reasons.length) {
                filteredOut.push({ ...record, reasons });
            } else {
                kept.push(record);
            }
        }

        console.log(`\n🔎 Debug weekend: 2025 ${entry.name}`);
        console.log(`Window: ${new Date(windowStart).toISOString()} .. ${new Date(windowEnd).toISOString()}`);
        console.log(`Uploads in window: ${inWindow.length}`);
        console.log(`Would keep after filters: ${kept.length}`);
        console.log(`Filtered out: ${filteredOut.length}`);

        const show = (arr, label) => {
            console.log(`\n${label}:`);
            arr
                .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt))
                .forEach((r) => {
                    const extra = r.reasons ? ` [${r.reasons.join(', ')}]` : '';
                    console.log(`- ${r.publishedAt} ${r.videoId} :: ${r.title}${extra}`);
                });
        };

        show(kept, 'Kept');
        show(filteredOut, 'Filtered out (with reasons)');
        console.log('');
    }

    groupVideosByCalendarWindow(videos, calendarEntries) {
        const year = parseInt(this.year, 10);
        const weekends = this.buildWeekendWindows(calendarEntries, year);
        const byName = new Map();

        weekends.forEach((w) => {
            byName.set(w.name, {
                name: w.name,
                videos: [],
                latestDate: null
            });
        });

        const seenByWeekend = new Map(weekends.map((w) => [w.name, new Set()]));

        for (const video of videos) {
            const publishedAt = video?.snippet?.publishedAt;
            const ts = Date.parse(publishedAt);
            if (Number.isNaN(ts)) continue;

            const weekend = weekends.find((w) => ts >= w.windowStart && ts <= w.windowEnd);
            if (!weekend) continue;

            const group = byName.get(weekend.name);
            if (!group) continue;

            const videoId = video?.id?.videoId;
            if (!videoId) continue;

            const seen = seenByWeekend.get(weekend.name);
            if (seen && seen.has(videoId)) continue;
            if (seen) seen.add(videoId);

            const record = {
                videoId,
                title: video?.snippet?.title || '',
                description: video?.snippet?.description || '',
                publishedAt,
                thumbnail: video?.snippet?.thumbnails?.high?.url || video?.snippet?.thumbnails?.default?.url || ''
            };

            group.videos.push(record);

            const prev = group.latestDate ? Date.parse(group.latestDate) : null;
            if (!prev || ts > prev) {
                group.latestDate = new Date(ts).toISOString();
            }
        }

        for (const group of byName.values()) {
            this.sortVideosInGroup(group.videos || []);
        }

        // Preserve calendar order.
        return weekends.map((w) => byName.get(w.name));
    }

    extractGrandPrixName(title, canonicalList = []) {
        const patterns = [
            /(\d{4})\s+([A-Za-z\s]+)\s+Grand Prix/i,
            /([A-Za-z\s]+)\s+Grand Prix.*(\d{4})/i,
            /(\d{4})\s+([A-Za-z\s]+)\s+GP/i,
            /([A-Za-z\s]+)\s+GP.*(\d{4})/i
        ];
        
        for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match) {
                const year = match[1].match(/\d{4}/) ? match[1] : match[2];
                const location = match[1].match(/\d{4}/) ? match[2] : match[1];
                const candidate = `${year} ${location.trim()} Grand Prix`;
                return this.resolveCanonical(candidate, canonicalList);
            }
        }
        
        const locationMatch = title.match(/([A-Za-z\s]+)\s+(Grand Prix|GP)/i);
        if (locationMatch) {
            const candidate = `2025 ${locationMatch[1].trim()} Grand Prix`;
            return this.resolveCanonical(candidate, canonicalList);
        }
        
        return 'Unknown Grand Prix';
    }

    resolveCanonical(candidate, canonicalList) {
        const normalized = candidate.toLowerCase().replace(/\s+/g, ' ').trim();
        const direct = canonicalList.find(c => c.toLowerCase() === normalized);
        if (direct) return direct;

        const location = normalized.replace(/^2025\s+/, '').replace(/\s+grand prix$/, '').trim();
        const match = canonicalList.find(c => {
            const loc = c.toLowerCase().replace(/^2025\s+/, '').replace(/\s+grand prix$/, '').trim();
            return loc === location || loc.includes(location) || location.includes(loc);
        });
        return match || candidate;
    }

    mergePreservedGroups(fetchedGroups = [], preserved = [], { preferPreserved = false } = {}) {
        if (!Array.isArray(preserved) || preserved.length === 0) {
            return fetchedGroups;
        }

        const byName = new Map((fetchedGroups || []).map((g) => [g.name, g]));

        for (const gp of preserved) {
            if (!gp?.name) continue;

            const existing = byName.get(gp.name);
            const preservedHasVideos = Array.isArray(gp.videos) && gp.videos.length > 0;

            if (!existing) {
                byName.set(gp.name, gp);
                continue;
            }

            if (preferPreserved && preservedHasVideos) {
                byName.set(gp.name, gp);
            }
        }

        // Preserve incoming order where possible (calendar order).
        return (fetchedGroups || []).map((g) => byName.get(g.name) || g);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getVideoTypeFromTitle(title) {
        const titleLower = title.toLowerCase();
        
        if (
            titleLower.includes('fp1') ||
            titleLower.includes('practice 1') ||
            titleLower.includes('free practice 1')
        ) {
            return 'fp1';
        } else if (
            titleLower.includes('fp2') ||
            titleLower.includes('practice 2') ||
            titleLower.includes('free practice 2')
        ) {
            return 'fp2';
        } else if (titleLower.includes('fp3') || titleLower.includes('practice 3') || titleLower.includes('free practice 3')) {
            return 'fp3';
        } else if (titleLower.includes('sprint') && (titleLower.includes('qualifying') || titleLower.includes('quali'))) {
            return 'sprint-qualifying';
        } else if (titleLower.includes('sprint')) {
            return 'sprint';
        } else if (titleLower.includes('race') && (titleLower.includes('qualifying') || titleLower.includes('quali'))) {
            return 'race-qualifying';
        } else if (titleLower.includes('qualifying') || titleLower.includes('quali')) {
            return 'qualifying';
        } else if (titleLower.includes('race') && !titleLower.includes('practice')) {
            return 'race';
        }
        
        return 'other';
    }

    async saveVideoData(data, filename) {
        await fs.mkdir(this.dataDir, { recursive: true });
        const outputPath = path.join(this.dataDir, filename);
        await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
    }
}

async function main() {
    try {
        const fetcher = new F1ArchiveFetcher();
        await fetcher.fetchArchive();
        console.log('\n✅ Successfully created 2025 F1 archive!');
    } catch (error) {
        console.error('\n❌ Failed to fetch archive:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = F1ArchiveFetcher;
