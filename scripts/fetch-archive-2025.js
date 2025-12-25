const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class F1ArchiveFetcher {
    constructor() {
        this.apiKey = process.env.YOUTUBE_API_KEY;
        this.channelId = 'UCB_qr75-ydFVKSF9Dmo6izg';
        this.baseUrl = 'https://www.googleapis.com/youtube/v3';
        this.year = '2025';
        this.pageCap = parseInt(process.env.YT_PAGE_CAP || '5', 10);
        this.gpDelayMs = parseInt(process.env.YT_GP_DELAY_MS || '400', 10);
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
        
        this.grandPrix2025 = [
            'Australian Grand Prix',
            'Chinese Grand Prix',
            'Japanese Grand Prix',
            'Bahrain Grand Prix',
            'Saudi Arabian Grand Prix',
            'Miami Grand Prix',
            'Emilia Romagna Grand Prix',
            'Monaco Grand Prix',
            'Spanish Grand Prix',
            'Canadian Grand Prix',
            'Austrian Grand Prix',
            'British Grand Prix',
            'Belgian Grand Prix',
            'Hungarian Grand Prix',
            'Dutch Grand Prix',
            'Italian Grand Prix',
            'Azerbaijan Grand Prix',
            'Singapore Grand Prix',
            'United States Grand Prix',
            'Mexico City Grand Prix',
            'Brazilian Grand Prix',
            'Las Vegas Grand Prix',
            'Qatar Grand Prix',
            'Abu Dhabi Grand Prix'
        ];
    }

    async fetchArchive() {
        if (!this.apiKey) {
            throw new Error('YouTube API key not found. Please set YOUTUBE_API_KEY environment variable.');
        }

        try {
            console.log(`📦 Fetching ALL 2025 F1 archive videos...`);
            
            const allVideos = [];
            const preservedGroups = [];
            let existingData = null;
            const archivePath = path.join(this.dataDir, 'videos-2025.json');

            if (this.missingOnly) {
                try {
                    const raw = await fs.readFile(archivePath, 'utf8');
                    existingData = JSON.parse(raw);
                    console.log(`ℹ️  Missing-only mode: preserving ${existingData.grandPrixWeekends?.length || 0} existing weekends`);
                } catch (_) {
                    console.log('ℹ️  Missing-only mode: no existing public/data/videos-2025.json found, fetching all');
                }
            }

            for (const gpName of this.grandPrix2025) {
                const fullName = `2025 ${gpName}`;

                if (this.missingOnly && existingData?.grandPrixWeekends) {
                    const existingGp = existingData.grandPrixWeekends.find(g => g.name === fullName && Array.isArray(g.videos) && g.videos.length > 0);
                    if (existingGp) {
                        preservedGroups.push(existingGp);
                        console.log(`↪️  Skipping fetch for ${fullName} (already has ${existingGp.videos.length} videos)`);
                        continue;
                    }
                }

                console.log(`🏎️  Fetching videos for: ${fullName} (pages up to ${this.pageCap})`);
                const gpVideos = await this.fetchGrandPrixVideos(gpName);
                allVideos.push(...gpVideos);
                console.log(`   ✓ Found ${gpVideos.length} videos for ${gpName}`);

                if (this.gpDelayMs > 0) {
                    await this.sleep(this.gpDelayMs);
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
            
            console.log(`\n📊 Total videos fetched: ${allVideos.length}`);
            console.log(`🧹 Unique videos after de-dupe: ${uniqueVideos.length}`);
            
            const filteredVideos = this.filterRecapVideos(uniqueVideos);
            console.log(`📋 Filtered to recap videos: ${filteredVideos.length}`);
            
            const groupedVideos = this.groupVideosByGrandPrix(filteredVideos);
            const mergedGroups = this.mergePreservedGroups(groupedVideos, preservedGroups);
            console.log(`📅 Organized into ${mergedGroups.length} Grand Prix weekends`);
            
            const videoData = {
                lastUpdated: new Date().toISOString(),
                totalVideos: filteredVideos.length,
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

    async fetchGrandPrixVideos(gpName) {
        const searchQuery = `2025 ${gpName} Grand Prix F1 highlights`;
        const all = [];
        let pageToken = null;
        let page = 1;
        try {
            do {
                const response = await axios.get(`${this.baseUrl}/search`, {
                    params: {
                        key: this.apiKey,
                        q: searchQuery,
                        channelId: this.channelId,
                        part: 'snippet',
                        order: 'date',
                        type: 'video',
                        maxResults: 50,
                        pageToken
                    }
                });
                const items = response.data.items || [];
                all.push(...items);
                pageToken = response.data.nextPageToken || null;
                page += 1;
                // Safety cap: don't fetch more than configured pages per GP
            } while (pageToken && page <= this.pageCap);
        } catch (error) {
            console.warn(`   ⚠️  Failed to fetch ${gpName}: ${error.message}`);
        }
        return all;
    }

    filterRecapVideos(videos) {
        return videos.filter(video => {
            const title = video.snippet.title.toLowerCase();
            const description = video.snippet.description.toLowerCase();
            const videoType = this.getVideoTypeFromTitle(title);
            
            const shouldExclude = this.excludeKeywords.some(keyword =>
                title.includes(keyword) || description.includes(keyword)
            );
            
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

    groupVideosByGrandPrix(videos) {
        const grandPrixGroups = new Map();
        const canonicalList = this.grandPrix2025.map(name => `2025 ${name}`);
        
        videos.forEach(video => {
            const title = video.snippet.title;
            const grandPrixName = this.extractGrandPrixName(title, canonicalList);
            const publishDate = new Date(video.snippet.publishedAt);
            
            if (!grandPrixGroups.has(grandPrixName)) {
                grandPrixGroups.set(grandPrixName, {
                    name: grandPrixName,
                    videos: [],
                    latestDate: publishDate
                });
            }
            
            const group = grandPrixGroups.get(grandPrixName);
            group.videos.push({
                videoId: video.id.videoId,
                title: video.snippet.title,
                description: video.snippet.description,
                publishedAt: video.snippet.publishedAt,
                thumbnail: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.default.url
            });
            
            if (publishDate > group.latestDate) {
                group.latestDate = publishDate;
            }
        });
        
        const sortedGroups = Array.from(grandPrixGroups.values())
            .sort((a, b) => Date.parse(a.startDate || a.latestDate) - Date.parse(b.startDate || b.latestDate));
        
        sortedGroups.forEach(group => {
            const hasSprint = group.videos.some(video =>
                this.getVideoTypeFromTitle(video.title) === 'sprint'
            );
            
            group.videos.sort((a, b) => {
                const aType = this.getVideoTypeFromTitle(a.title);
                const bType = this.getVideoTypeFromTitle(b.title);
                
                const orderMap = {
                    'fp1': 10,
                    'fp2': 20,
                    'fp3': 30,
                    'qualifying': 40,
                    'sprint-qualifying': 50,
                    'sprint': 60,
                    'race-qualifying': 70,
                    'race': 80,
                    'other': 99
                };
                
                const aOrder = orderMap[aType] || 99;
                const bOrder = orderMap[bType] || 99;
                
                if (aOrder !== bOrder) {
                    return aOrder - bOrder;
                }
                
                return new Date(b.publishedAt) - new Date(a.publishedAt);
            });
        });
        
        return sortedGroups;
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

    mergePreservedGroups(fetchedGroups = [], preserved = []) {
        if (!Array.isArray(preserved) || preserved.length === 0) {
            return fetchedGroups;
        }
        const byName = new Map((fetchedGroups || []).map(g => [g.name, g]));
        preserved.forEach(gp => {
            if (!byName.has(gp.name)) {
                byName.set(gp.name, gp);
            }
        });
        return Array.from(byName.values()).sort((a, b) => {
            const da = Date.parse(a.latestDate || a.startDate || 0);
            const db = Date.parse(b.latestDate || b.startDate || 0);
            return da - db;
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getVideoTypeFromTitle(title) {
        const titleLower = title.toLowerCase();
        
        if (titleLower.includes('fp1')) {
            return 'fp1';
        } else if (titleLower.includes('fp2')) {
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
