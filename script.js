class F1VideoTracker {
    constructor() {
        this.videoContainer = document.getElementById('videoContainer');
        this.loading = document.getElementById('loading');
        this.error = document.getElementById('error');
        this.lastUpdated = document.getElementById('lastUpdated');
        this.latestGrandPrixWeekends = [];

        this.init();
    }

    async init() {
        try {
            await this.loadVideos();
        } catch (error) {
            console.error('Failed to load videos:', error);
            this.showError();
        }
    }

    async loadVideos() {
        const fetchStartedAt = this.getHighResolutionTime();
        let response;

        try {
            response = await fetch('videos.json', { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`Failed to fetch videos (${response.status})`);
            }

            const data = await response.json();
            const grandPrixWeekends = Array.isArray(data.grandPrixWeekends) ? data.grandPrixWeekends : [];
            this.latestGrandPrixWeekends = grandPrixWeekends;

            this.displayGrandPrixWeekends(grandPrixWeekends);
            this.updateLastUpdated(data.lastUpdated);

            this.captureAnalytics('videos_fetch_completed', {
                duration_ms: this.getRequestDuration(fetchStartedAt),
                status: response.status,
                weekend_count: grandPrixWeekends.length,
                video_count: this.countTotalVideos(grandPrixWeekends),
                last_updated: data.lastUpdated || null
            });
        } catch (error) {
            this.captureAnalytics('videos_fetch_failed', {
                duration_ms: this.getRequestDuration(fetchStartedAt),
                status: response ? response.status : null,
                status_text: response ? response.statusText : null,
                message: error.message,
                error_name: error.name
            });
            console.error('Error loading videos:', error);
            this.showError();
        }
    }

    displayGrandPrixWeekends(grandPrixWeekends) {
        if (!this.videoContainer) {
            return;
        }

        this.loading.style.display = 'none';
        this.error.style.display = 'none';
        this.videoContainer.style.display = 'block';

        const safeWeekends = Array.isArray(grandPrixWeekends) ? grandPrixWeekends : [];
        const visibleWeekends = safeWeekends.slice(0, 3);

        if (visibleWeekends.length === 0) {
            this.videoContainer.innerHTML = '<p style="color: white; text-align: center;">No Grand Prix weekends found.</p>';
            this.captureAnalytics('videos_empty_state_seen');
            return;
        }

        this.videoContainer.innerHTML = visibleWeekends
            .map((grandPrix, index) => this.createGrandPrixSection(grandPrix, index))
            .join('');

        this.latestGrandPrixWeekends = visibleWeekends;
        this.attachVideoAnalyticsHandlers(visibleWeekends);

        this.captureAnalytics('videos_loaded', {
            weekend_count: visibleWeekends.length,
            video_count: this.countTotalVideos(visibleWeekends),
            current_weekend: visibleWeekends[0] ? visibleWeekends[0].name : null,
            latest_published_at: this.getLatestPublishedAt(visibleWeekends)
        });
    }

    createGrandPrixSection(grandPrix = {}, index = 0) {
        const latestDate = this.getWeekendLatestDate(grandPrix);
        const recency = this.getWeekendRecency(latestDate);
        const videos = Array.isArray(grandPrix.videos) ? grandPrix.videos : [];
        const videoCountLabel = videos.length === 1 ? 'video' : 'videos';
        const statusBadge = recency === 'current'
            ? '<span class="status-badge current">Current Weekend</span>'
            : recency === 'recent'
                ? '<span class="status-badge recent">Last Weekend</span>'
                : '<span class="status-badge past">Earlier Weekend</span>';

        return `
            <div class="grandprix-section ${recency === 'current' ? 'current-weekend' : ''}">
                <div class="grandprix-header">
                    <h2 class="grandprix-title">${this.escapeHtml(grandPrix.name || '')}</h2>
                    ${statusBadge}
                    <div class="video-count">${videos.length} ${videoCountLabel}</div>
                </div>
                <div class="grandprix-videos">
                    ${videos.map(video => this.createVideoCard(video, grandPrix, recency === 'current')).join('')}
                </div>
            </div>
        `;
    }

    createVideoCard(video = {}, grandPrix = {}, isCurrentWeekend = false) {
        const videoType = this.getVideoType(video.title || '');
        const formattedDate = this.formatDate(video.publishedAt);
        const videoUrl = this.getVideoUrl(video.videoId);
        const analyticsAttributes = this.buildVideoDataAttributes({
            videoId: video.videoId,
            videoUrl,
            grandPrixName: grandPrix.name,
            videoTitle: video.title,
            sessionType: videoType,
            publishedAt: video.publishedAt,
            isCurrentWeekend
        });
        const sessionClass = videoType.toLowerCase().replace(/\s+/g, '-');

        return `
            <div class="video-card">
                <div class="video-thumbnail-container"
                    role="button"
                    tabindex="0"
                    aria-label="Play ${this.escapeAttribute(video.title || 'video')}"
                    data-analytics-role="thumbnail"${analyticsAttributes}>
                    <div class="video-thumbnail" style="background-image: url('${this.escapeAttribute(video.thumbnail || '')}')">
                        <div class="play-overlay">
                            <div class="play-button">▶</div>
                        </div>
                    </div>
                </div>
                <div class="video-info">
                    <h3 class="video-title">${this.escapeHtml(video.title || '')}</h3>
                    <div class="video-date">${formattedDate}</div>
                    <div class="video-actions">
                        <span class="video-type ${sessionClass}">${videoType}</span>
                        <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="watch-button" data-analytics-role="watch-button"${analyticsAttributes}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                            </svg>
                            WATCH
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    getVideoType(title) {
        const titleLower = title.toLowerCase();

        if (titleLower.includes('fp1')) {
            return 'FP1';
        } else if (titleLower.includes('fp2')) {
            return 'FP2';
        } else if (titleLower.includes('sprint') && (titleLower.includes('qualifying') || titleLower.includes('quali'))) {
            return 'Sprint Quali';
        } else if (titleLower.includes('sprint')) {
            return 'Sprint';
        } else if (titleLower.includes('race') && (titleLower.includes('qualifying') || titleLower.includes('quali'))) {
            return 'Race Quali';
        } else if (titleLower.includes('qualifying') || titleLower.includes('quali')) {
            return 'Qualifying';
        } else if (titleLower.includes('race') && !titleLower.includes('practice')) {
            return 'Race';
        }

        return 'Other';
    }

    formatDate(dateString) {
        if (!dateString) {
            return 'Date unavailable';
        }

        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) {
            return 'Date unavailable';
        }

        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    updateLastUpdated(timestamp) {
        if (timestamp && this.lastUpdated) {
            const date = new Date(timestamp);
            if (!Number.isNaN(date.getTime())) {
                this.lastUpdated.textContent = date.toLocaleString();
                this.updatePageTitle();
            }
        }
    }

    updatePageTitle() {
        const currentSection = document.querySelector('.grandprix-section.current-weekend') ||
            document.querySelector('.grandprix-section');

        if (!currentSection) {
            return;
        }

        const weekendName = currentSection.querySelector('.grandprix-title').textContent;
        const titlePrefix = currentSection.classList.contains('current-weekend')
            ? weekendName
            : `${weekendName} (Most Recent)`;

        document.title = `${titlePrefix} Highlights - F1 Video Hub`;

        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
            metaDesc.content = `Watch the latest ${weekendName} highlights including FP1, FP2, Qualifying, Sprint, and Race sessions. Updated every 30 minutes.`;
        }
    }

    attachVideoAnalyticsHandlers(grandPrixWeekends) {
        if (!this.videoContainer) {
            return;
        }

        const metadataById = this.buildVideoMetadataMap(grandPrixWeekends);
        const thumbnailNodes = this.videoContainer.querySelectorAll('[data-analytics-role="thumbnail"]');
        thumbnailNodes.forEach(thumbnail => {
            thumbnail.addEventListener('click', () => {
                const videoId = thumbnail.getAttribute('data-video-id');
                const videoUrl = thumbnail.getAttribute('data-video-url');
                const payload = Object.assign({}, metadataById.get(videoId), { interaction_type: 'thumbnail' });
                this.captureAnalytics('video_thumbnail_opened', payload);
                this.openVideo(videoUrl);
            });

            thumbnail.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    thumbnail.click();
                }
            });
        });

        const watchButtons = this.videoContainer.querySelectorAll('[data-analytics-role="watch-button"]');
        watchButtons.forEach(button => {
            button.addEventListener('click', () => {
                const videoId = button.getAttribute('data-video-id');
                const payload = Object.assign({}, metadataById.get(videoId), { interaction_type: 'watch_button' });
                this.captureAnalytics('video_watch_clicked', payload);
            });
        });
    }

    buildVideoMetadataMap(grandPrixWeekends) {
        const map = new Map();
        const safeWeekends = Array.isArray(grandPrixWeekends) ? grandPrixWeekends : [];

        safeWeekends.forEach((grandPrix, index) => {
            const videos = Array.isArray(grandPrix.videos) ? grandPrix.videos : [];
            videos.forEach(video => {
                if (!video || !video.videoId) {
                    return;
                }
                map.set(video.videoId, {
                    video_id: video.videoId,
                    video_title: video.title,
                    grand_prix: grandPrix.name,
                    session_type: this.getVideoType(video.title || ''),
                    published_at: video.publishedAt,
                    is_current_weekend: index === 0,
                    weekend_index: index,
                    video_url: this.getVideoUrl(video.videoId)
                });
            });
        });

        return map;
    }

    buildVideoDataAttributes(meta) {
        const attributeEntries = [
            ['data-video-id', meta.videoId],
            ['data-video-url', meta.videoUrl],
            ['data-grand-prix', meta.grandPrixName],
            ['data-video-title', meta.videoTitle],
            ['data-session-type', meta.sessionType],
            ['data-published-at', meta.publishedAt],
            ['data-is-current', typeof meta.isCurrentWeekend === 'boolean' ? String(meta.isCurrentWeekend) : null]
        ];

        const attributes = attributeEntries
            .filter(([, value]) => value !== undefined && value !== null && value !== '')
            .map(([name, value]) => `${name}="${this.escapeAttribute(value)}"`);

        return attributes.length ? ` ${attributes.join(' ')}` : '';
    }

    getVideoUrl(videoId) {
        if (!videoId) {
            return '';
        }
        return `https://youtube.com/watch?v=${videoId}`;
    }

    openVideo(videoUrl) {
        if (!videoUrl) {
            return;
        }
        const newWindow = window.open(videoUrl, '_blank', 'noopener');
        if (newWindow) {
            newWindow.opener = null;
        }
    }

    getLatestPublishedAt(grandPrixWeekends) {
        const safeWeekends = Array.isArray(grandPrixWeekends) ? grandPrixWeekends : [];
        let latestTimestamp = null;

        safeWeekends.forEach(grandPrix => {
            const videos = Array.isArray(grandPrix.videos) ? grandPrix.videos : [];
            videos.forEach(video => {
                if (!video || !video.publishedAt) {
                    return;
                }
                const time = Date.parse(video.publishedAt);
                if (!Number.isNaN(time) && (latestTimestamp === null || time > latestTimestamp)) {
                    latestTimestamp = time;
                }
            });
        });

        return latestTimestamp ? new Date(latestTimestamp).toISOString() : null;
    }

    getWeekendLatestDate(grandPrix = {}) {
        if (grandPrix.latestDate) {
            return grandPrix.latestDate;
        }

        const videos = Array.isArray(grandPrix.videos) ? grandPrix.videos : [];
        const timestamps = videos
            .map(video => Date.parse(video.publishedAt))
            .filter(time => !Number.isNaN(time));

        if (timestamps.length === 0) {
            return null;
        }

        return new Date(Math.max(...timestamps)).toISOString();
    }

    getWeekendRecency(latestDateString) {
        if (!latestDateString) {
            return 'past';
        }

        const latestDate = new Date(latestDateString);
        if (Number.isNaN(latestDate.getTime())) {
            return 'past';
        }

        const now = new Date();
        const diffDays = (now - latestDate) / (1000 * 60 * 60 * 24);

        if (diffDays <= 4) {
            return 'current';
        }
        if (diffDays <= 11) {
            return 'recent';
        }
        return 'past';
    }

    countTotalVideos(grandPrixWeekends) {
        return (Array.isArray(grandPrixWeekends) ? grandPrixWeekends : []).reduce((total, grandPrix) => {
            const videos = Array.isArray(grandPrix.videos) ? grandPrix.videos : [];
            return total + videos.length;
        }, 0);
    }

    getHighResolutionTime() {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    }

    getRequestDuration(startTime) {
        const endTime = this.getHighResolutionTime();
        return Math.max(0, Math.round(endTime - startTime));
    }

    captureAnalytics(eventName, properties = {}) {
        if (!window.posthog || typeof window.posthog.capture !== 'function') {
            return;
        }

        try {
            window.posthog.capture(eventName, properties);
        } catch (error) {
            console.debug('PostHog capture failed:', error);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeAttribute(value) {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    showError() {
        if (this.loading) {
            this.loading.style.display = 'none';
        }
        if (this.videoContainer) {
            this.videoContainer.style.display = 'none';
        }
        if (this.error) {
            this.error.style.display = 'block';
        }
        this.captureAnalytics('videos_error_displayed', { displayed_at: new Date().toISOString() });
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new F1VideoTracker();
});
