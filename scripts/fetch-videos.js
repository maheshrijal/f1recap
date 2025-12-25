const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class F1VideoFetcher {
    constructor() {
        this.apiKey = process.env.YOUTUBE_API_KEY;
        this.channelId = 'UCB_qr75-ydFVKSF9Dmo6izg'; // Formula 1 official channel
        this.baseUrl = 'https://www.googleapis.com/youtube/v3';
        this.targetYear = parseInt(process.env.TARGET_YEAR || new Date().getUTCFullYear(), 10);
        this.latestWindow = parseInt(process.env.LATEST_WINDOW || '3', 10); // homepage recency window
        this.maxResults = parseInt(process.env.MAX_RESULTS || '150', 10);   // total videos to pull from search
        this.pageCap = Math.max(1, Math.ceil(this.maxResults / 50));        // 50 per page; cap via maxResults
        
        // Specific F1 session types we want to include (with variations)
        this.allowedSessionTypes = [
            'fp1', 'fp2', 'fp3', 'free practice 1', 'free practice 2', 'free practice 3',
            'practice 1', 'practice 2', 'practice 3',
            'qualifying', 'quali', 'sprint', 'race'
        ];
        
        // Keywords that indicate the content we want
        this.includeKeywords = [
            'highlights', 'recap', 'session',
            'full race', 'full replay', 'full qualifying', 'extended highlights'
        ];
        
        // Content to exclude
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

    async fetchRecentVideos() {
        const perPage = 50;
        const maxPages = this.pageCap;
        let pageToken = null;
        let page = 1;
        const items = [];

        do {
            const response = await axios.get(`${this.baseUrl}/search`, {
                params: {
                    key: this.apiKey,
                    channelId: this.channelId,
                    part: 'snippet',
                    order: 'date',
                    type: 'video',
                    maxResults: perPage,
                    pageToken
                }
            });

            const fetched = (response.data.items || []).filter(
                (item) => item.id?.videoId && item.snippet
            );
            items.push(...fetched);

            pageToken = response.data.nextPageToken || null;
            page += 1;
        } while (pageToken && page <= maxPages && items.length < this.maxResults);

        return items.slice(0, this.maxResults);
    }

    async fetchVideos() {
        if (!this.apiKey) {
            throw new Error('YouTube API key not found. Please set YOUTUBE_API_KEY environment variable.');
        }

        try {
            console.log('Fetching latest videos from Formula 1 channel...');
            
            const allVideos = await this.fetchRecentVideos();
            console.log(`Found ${allVideos.length} total videos from recent feed`);

            // Filter for recap videos
            const filteredVideos = this.filterRecapVideos(allVideos);
            console.log(`Filtered to ${filteredVideos.length} recap videos`);

            // Keep only the most recent N filtered videos based on configured maxResults
            const boundedVideos = filteredVideos.slice(0, this.maxResults);
            console.log(`Considering ${boundedVideos.length} newest filtered videos (max ${this.maxResults})`);

            // Group videos by Grand Prix weekends (full set from the bounded list)
            const fullGrouped = this.groupVideosByGrandPrix(boundedVideos);
            console.log(`Organized into ${fullGrouped.length} Grand Prix weekends (full grouped set)`);

            // Current feed: limit to latest N weekends for the homepage
            const groupedVideos = fullGrouped.slice(0, this.latestWindow);
            console.log(`Trimmed to ${groupedVideos.length} weekends for current feed (latest ${this.latestWindow})`);

            const visibleVideos = groupedVideos.reduce((total, gp) => total + gp.videos.length, 0);

            if (groupedVideos.length === 0) {
                console.warn('No race weekends detected from API response. Preserving existing videos.json to avoid wiping the site.');
                await this.preserveExistingData();
                return;
            }

            const videoData = {
                lastUpdated: new Date().toISOString(),
                totalVideos: visibleVideos,
                grandPrixWeekends: groupedVideos
            };

            // Build/merge full-season archive for target year
            const archiveData = await this.buildArchive(fullGrouped);

            // Save both current and archive outputs
            await this.saveVideoData(videoData, archiveData);
            console.log('Video data saved successfully!');
            
            return videoData;

        } catch (error) {
            console.error('Error fetching videos:', error.message);
            throw error;
        }
    }

    filterRecapVideos(videos) {
        return videos.filter(video => {
            const title = video.snippet.title.toLowerCase();
            const description = video.snippet.description.toLowerCase();
            const videoType = this.getVideoTypeFromTitle(title);
            
            // First, exclude unwanted content
            const shouldExclude = this.excludeKeywords.some(keyword => 
                title.includes(keyword) || description.includes(keyword)
            );
            
            if (shouldExclude) {
                return false;
            }
            
            // Only keep known F1 session types
            if (videoType === 'other') {
                return false;
            }
            
            // More flexible keyword matching - include if it has session type OR include keywords
            const hasIncludeKeyword = this.includeKeywords.some(keyword => 
                title.includes(keyword) || description.includes(keyword)
            );

            const isF1Context = ['grand prix', 'gp', 'formula 1', 'f1'].some(keyword =>
                title.includes(keyword) || description.includes(keyword)
            );

            return hasIncludeKeyword && isF1Context;
        });
    }

    filterRecentVideos(videos, daysBack) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysBack);
        
        return videos.filter(video => {
            const publishDate = new Date(video.snippet.publishedAt);
            return publishDate >= cutoffDate;
        });
    }

    groupVideosByGrandPrix(videos) {
        // Extract Grand Prix name from video titles
        const grandPrixGroups = new Map();
        
        videos.forEach(video => {
            const grandPrixName = this.extractGrandPrixName(video.snippet.title);
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
                thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url || ''
            });
            
            // Update latest date if this video is newer
            if (publishDate > group.latestDate) {
                group.latestDate = publishDate;
            }
        });
        
        // Convert to array and sort by latest date (most recent first)
        const sortedGroups = Array.from(grandPrixGroups.values())
            .sort((a, b) => b.latestDate - a.latestDate);
        
        // Filter to the target year only
        const yearStr = String(this.targetYear);
        const filteredByYear = sortedGroups.filter(gp => gp.name.includes(yearStr));
        
        // Sort videos within each group by session order
        filteredByYear.forEach(group => {
            // Check if this weekend has sprint
            const hasSprint = group.videos.some(video => 
                this.getVideoTypeFromTitle(video.title) === 'sprint'
            );
            
            group.videos.sort((a, b) => {
                const aType = this.getVideoTypeFromTitle(a.title);
                const bType = this.getVideoTypeFromTitle(b.title);
                
                // Define session order based on whether sprint weekend or not
                let sessionOrder;
                if (hasSprint) {
                    // Sprint weekend: FP1 -> Sprint -> Sprint Quali -> Race -> Race Quali
                    sessionOrder = { 
                        'fp1': 0, 
                        'sprint': 1, 
                        'sprint-qualifying': 2, 
                        'race': 3, 
                        'race-qualifying': 4,
                        'fp2': 5,
                        'qualifying': 6
                    };
                } else {
                    // Regular weekend: FP1 -> FP2 -> Qualifying -> Race
                    sessionOrder = { 
                        'fp1': 0, 
                        'fp2': 1, 
                        'qualifying': 2, 
                        'race': 3 
                    };
                }
                
                const aOrder = sessionOrder[aType] !== undefined ? sessionOrder[aType] : 999;
                const bOrder = sessionOrder[bType] !== undefined ? sessionOrder[bType] : 999;
                
                if (aOrder !== bOrder) {
                    return aOrder - bOrder;
                }
                
                // If same type, sort by date (newer first)
                return new Date(b.publishedAt) - new Date(a.publishedAt);
            });
        });
        
        return filteredByYear;
    }
    
    extractGrandPrixName(title) {
        // Common Grand Prix name patterns
        const patterns = [
            /(\d{4})\s+([A-Za-z\s]+)\s+Grand Prix/i,
            /([A-Za-z\s]+)\s+Grand Prix.*(\d{4})/i,
            /(\d{4})\s+([A-Za-z\s]+)\s+GP/i,
            /([A-Za-z\s]+)\s+GP.*(\d{4})/i
        ];
        
        for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match) {
                // Extract year and location
                const year = match[1].match(/\d{4}/) ? match[1] : match[2];
                const location = match[1].match(/\d{4}/) ? match[2] : match[1];
                return `${year} ${location.trim()} Grand Prix`;
            }
        }
        
        // Fallback: try to extract just the location
        const locationMatch = title.match(/([A-Za-z\s]+)\s+(Grand Prix|GP)/i);
        if (locationMatch) {
            return `${this.targetYear} ${locationMatch[1].trim()} Grand Prix`;
        }
        
        // Ultimate fallback
        return 'Unknown Grand Prix';
    }
    
    getVideoTypeFromTitle(title) {
        const titleLower = title.toLowerCase();
        
        // Check for specific session types
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

    async saveVideoData(currentData, archiveData) {
        const publicDataDir = path.join(process.cwd(), 'public', 'data');
        const publicCurrent = path.join(publicDataDir, 'videos.json');
        const publicArchive = path.join(publicDataDir, `videos-${this.targetYear}.json`);

        // Persist to served locations for the site
        await fs.mkdir(publicDataDir, { recursive: true });
        await fs.writeFile(publicCurrent, JSON.stringify(currentData, null, 2));
        await fs.writeFile(publicArchive, JSON.stringify(archiveData, null, 2));
    }

    async preserveExistingData() {
        const outputPath = path.join(process.cwd(), 'public', 'data', 'videos.json');
        const archivePath = path.join(process.cwd(), 'public', 'data', `videos-${this.targetYear}.json`);
        const publicDataDir = path.join(process.cwd(), 'public', 'data');
        const publicCurrent = path.join(publicDataDir, 'videos.json');
        const publicArchive = path.join(publicDataDir, `videos-${this.targetYear}.json`);
        try {
            const current = await fs.readFile(outputPath, 'utf8');
            console.log('Kept existing videos.json unchanged.');
            // Write back to ensure timestamp on artifact, but keep content
            await fs.writeFile(outputPath, current);
            await fs.mkdir(publicDataDir, { recursive: true });
            await fs.writeFile(publicCurrent, current);
            if (await this.fileExists(archivePath)) {
                const arch = await fs.readFile(archivePath, 'utf8');
                await fs.writeFile(archivePath, arch);
                await fs.writeFile(publicArchive, arch);
            }
        } catch (err) {
            console.warn('No existing videos.json to preserve; leaving empty.');
        }
    }

    async buildArchive(fullGrouped) {
        const publicDataDir = path.join(process.cwd(), 'public', 'data');
        const publicArchive = path.join(publicDataDir, `videos-${this.targetYear}.json`);
        let existing = { lastUpdated: null, totalVideos: 0, grandPrixWeekends: [] };

        if (await this.fileExists(publicArchive)) {
            try {
                existing = JSON.parse(await fs.readFile(publicArchive, 'utf8'));
            } catch (e) {
                console.warn('Existing archive unreadable, rebuilding from scratch');
            }
        }

        const merged = this.mergeArchives(existing.grandPrixWeekends || [], fullGrouped || []);
        const totalVideos = merged.reduce((sum, gp) => sum + (gp.videos?.length || 0), 0);

        return {
            lastUpdated: new Date().toISOString(),
            totalVideos,
            grandPrixWeekends: merged
        };
    }

    mergeArchives(existing, incoming) {
        const byName = new Map();

        const addGp = (gp) => {
            if (!gp || !gp.name) return;
            const key = gp.name;
            const base = byName.get(key) || { name: gp.name, videos: [], latestDate: null };

            const seen = new Set(base.videos.map(v => v.videoId));
            (gp.videos || []).forEach(v => {
                if (v && v.videoId && !seen.has(v.videoId)) {
                    seen.add(v.videoId);
                    base.videos.push(v);
                }
            });

            // Recompute latestDate
            const latest = base.videos
                .map(v => Date.parse(v.publishedAt))
                .filter(t => !Number.isNaN(t))
                .sort((a, b) => b - a)[0];
            if (latest) {
                base.latestDate = new Date(latest).toISOString();
            }

            byName.set(key, base);
        };

        existing.forEach(addGp);
        incoming.forEach(addGp);

        return Array.from(byName.values()).sort((a, b) => {
            const da = Date.parse(a.latestDate || 0);
            const db = Date.parse(b.latestDate || 0);
            return db - da;
        });
    }

    async fileExists(p) {
        try {
            await fs.access(p);
            return true;
        } catch {
            return false;
        }
    }
}

// Run the fetcher
async function main() {
    try {
        const fetcher = new F1VideoFetcher();
        await fetcher.fetchVideos();
        console.log('✅ Successfully updated F1 video data');
    } catch (error) {
        console.error('❌ Failed to fetch videos:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = F1VideoFetcher;
