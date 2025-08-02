const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class F1VideoFetcher {
    constructor() {
        this.apiKey = process.env.YOUTUBE_API_KEY;
        this.channelId = 'UCB_qr75-ydFVKSF9Dmo6izg'; // Formula 1 official channel
        this.baseUrl = 'https://www.googleapis.com/youtube/v3';
        
        // Specific F1 session types we want to include (with variations)
        this.allowedSessionTypes = [
            'fp1', 'fp2', 'fp3', 'free practice 1', 'free practice 2', 'free practice 3',
            'practice 1', 'practice 2', 'practice 3',
            'qualifying', 'quali', 'sprint', 'race'
        ];
        
        // Keywords that indicate the content we want
        this.includeKeywords = [
            'highlights', 'recap', 'session'
        ];
        
        // Content to exclude
        this.excludeKeywords = [
            'f2', 'formula 2', 'post-race show', 'post race show', 
            'live:', 'preview', 'analysis', 'interview', 'press conference',
            'feature race', 'f3', 'formula 3', 'porsche', 'w series',
            'drivers react', 'driver react', 'react after', 'reaction'
        ];
    }

    async fetchVideos() {
        if (!this.apiKey) {
            throw new Error('YouTube API key not found. Please set YOUTUBE_API_KEY environment variable.');
        }

        try {
            console.log('Fetching latest videos from Formula 1 channel...');
            
            // Get the last 100 videos from the channel to ensure we don't miss recent content
            const response = await axios.get(`${this.baseUrl}/search`, {
                params: {
                    key: this.apiKey,
                    channelId: this.channelId,
                    part: 'snippet',
                    order: 'date',
                    type: 'video',
                    maxResults: 100
                }
            });

            const allVideos = response.data.items;
            console.log(`Found ${allVideos.length} total videos`);

            // Filter for recap videos
            const filteredVideos = this.filterRecapVideos(allVideos);
            console.log(`Filtered to ${filteredVideos.length} recap videos`);

            // Keep only videos from last 3 race weekends (approximately 6 weeks)
            const recentVideos = this.filterRecentVideos(filteredVideos, 42); // 6 weeks
            console.log(`Keeping ${recentVideos.length} videos from last 6 weeks`);

            // Group videos by Grand Prix weekends
            const groupedVideos = this.groupVideosByGrandPrix(recentVideos);
            console.log(`Organized into ${groupedVideos.length} Grand Prix weekends`);

            const videoData = {
                lastUpdated: new Date().toISOString(),
                totalVideos: recentVideos.length,
                grandPrixWeekends: groupedVideos
            };

            // Save to JSON file
            await this.saveVideoData(videoData);
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
            
            // First, exclude unwanted content
            const shouldExclude = this.excludeKeywords.some(keyword => 
                title.includes(keyword) || description.includes(keyword)
            );
            
            if (shouldExclude) {
                return false;
            }
            
            // Check if it's one of our allowed session types
            const hasAllowedSession = this.allowedSessionTypes.some(sessionType => {
                return title.includes(sessionType);
            });
            
            if (!hasAllowedSession) {
                return false;
            }
            
            // More flexible keyword matching - include if it has session type OR include keywords
            const hasIncludeKeyword = this.includeKeywords.some(keyword => 
                title.includes(keyword) || description.includes(keyword)
            );
            
            // For F1 sessions, be more lenient - if it has the session type, likely what we want
            const isF1Session = hasAllowedSession && (
                hasIncludeKeyword || 
                title.includes('grand prix') || 
                title.includes('gp') ||
                title.includes('formula 1') ||
                title.includes('f1')
            );
            
            return isF1Session;
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
                thumbnail: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.default.url
            });
            
            // Update latest date if this video is newer
            if (publishDate > group.latestDate) {
                group.latestDate = publishDate;
            }
        });
        
        // Convert to array and sort by latest date (most recent first)
        const sortedGroups = Array.from(grandPrixGroups.values())
            .sort((a, b) => b.latestDate - a.latestDate);
        
        // Sort videos within each group by session order
        sortedGroups.forEach(group => {
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
        
        return sortedGroups;
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
            return `2025 ${locationMatch[1].trim()} Grand Prix`;
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

    async saveVideoData(data) {
        const outputPath = path.join(process.cwd(), 'videos.json');
        await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
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