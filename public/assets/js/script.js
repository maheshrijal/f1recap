class F1VideoTracker {
    constructor() {
        this.videoContainer = document.getElementById('videoContainer');
        this.loading = document.getElementById('loading');
        this.error = document.getElementById('error');
        this.lastUpdated = document.getElementById('lastUpdated');
        this.hero = document.getElementById('hero');
        this.upcoming = document.getElementById('upcoming');
        this.drawer = document.getElementById('videoDrawer');
        this.drawerContent = document.getElementById('drawerContent');
        this.latestGrandPrixWeekends = [];
        this.calendarWeekends = [];
        this.userTimeZone = this.getUserTimeZone();

        this.init();
    }

    async init() {
        try {
            await this.loadCalendar();
            await this.loadVideos();
        } catch (error) {
            console.error('Failed to load videos:', error);
            this.showError();
        }
    }

    async loadCalendar() {
        const icsUrl = 'data/f1-calendar_2026.ics';
        try {
            const icsResponse = await fetch(icsUrl, { cache: 'no-cache' });
            if (icsResponse.ok) {
                const text = await icsResponse.text();
                this.calendarWeekends = this.parseIcsCalendar(text);
                if (this.calendarWeekends.length) {
                    return;
                }
            }
        } catch (error) {
            console.debug('ICS calendar load failed, trying JSON fallback:', error);
        }

        try {
            const response = await fetch('data/calendar2026.json', { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`Failed to fetch calendar (${response.status})`);
            }
            const data = await response.json();
            this.calendarWeekends = Array.isArray(data) ? data : [];
        } catch (error) {
            console.debug('Calendar JSON load failed, continuing without:', error);
            this.calendarWeekends = [];
        }
    }

    async loadVideos() {
        const fetchStartedAt = this.getHighResolutionTime();
        let response;

        try {
            response = await fetch('data/videos.json', { cache: 'no-cache' });
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

        if (this.loading) {
            this.loading.style.display = 'none';
        }
        if (this.error) {
            this.error.style.display = 'none';
        }
        this.videoContainer.style.display = 'block';

        const safeWeekends = Array.isArray(grandPrixWeekends) ? grandPrixWeekends : [];
        const weekendsWithSortedVideos = safeWeekends.map(weekend => this.withSortedVideos(weekend));
        const visibleWeekends = weekendsWithSortedVideos.slice(0, 3);

        this.renderHero(visibleWeekends[0]);
        const upcomingFromCalendar = this.getUpcomingFromCalendar();
        const upcomingFromVideos = this.getUpcomingWeekend(weekendsWithSortedVideos);
        this.renderUpcoming(upcomingFromCalendar || upcomingFromVideos || null);

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
        this.attachDrawerHandlers();
        this.injectVideoStructuredData(visibleWeekends);

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
                <div class="session-timeline" role="list" aria-label="${this.escapeAttribute(grandPrix.name || '')} sessions">
                    ${videos.map(video => this.createTimelineChip(video, grandPrix, recency === 'current')).join('')}
                </div>
                <div class="grandprix-videos">
                    ${videos.map(video => this.createVideoCard(video, grandPrix, recency === 'current')).join('')}
                </div>
            </div>
        `;
    }

    renderHero(grandPrix = {}) {
        if (!this.hero) return;
        if (!grandPrix || !grandPrix.name) {
            this.hero.innerHTML = '';
            return;
        }

        const latestDate = this.getWeekendLatestDate(grandPrix);
        const formattedDate = latestDate ? this.formatDate(latestDate) : 'Date TBC';
        const videos = Array.isArray(grandPrix.videos) ? grandPrix.videos : [];
        const sessions = videos.map(v => this.getVideoType(v.title || '')).join(' • ');

        this.hero.innerHTML = `
            <div class="hero-card">
                <div class="hero-meta">
                    <p class="hero-kicker">Current Weekend</p>
                    <h2 class="hero-title">${this.escapeHtml(grandPrix.name || '')}</h2>
                    <p class="hero-date">Latest update: ${formattedDate}</p>
                    <p class="hero-sessions">${this.escapeHtml(sessions)}</p>
                </div>
                <div class="hero-flag">🏁</div>
            </div>
        `;
    }

    renderUpcoming(weekend = null) {
        if (!this.upcoming) return;
        const earliestDate = weekend ? this.getWeekendEarliestDate(weekend) : null;
        const formattedDate = earliestDate ? this.formatDate(earliestDate) : 'Date to be announced';
        const rawSessions = (weekend && Array.isArray(weekend.videos) ? weekend.videos : weekend && Array.isArray(weekend.sessions) ? weekend.sessions : []);
        const sessionLabels = rawSessions.map(v => this.getVideoType(v.title || v)).filter(Boolean);
        const sessions = sessionLabels.join(' • ');
        const hasSprint = sessionLabels.some(label => label.toLowerCase().includes('sprint'));

        this.upcoming.style.display = 'block';
        this.upcoming.innerHTML = `
            <div class="hero-card upcoming-card">
                <div class="hero-meta">
                    <p class="hero-kicker">Upcoming Weekend</p>
                    <h2 class="hero-title">${this.escapeHtml(weekend && weekend.name ? weekend.name : 'Next Grand Prix')}</h2>
                    <p class="hero-date">${weekend ? 'Starts:' : 'Schedule:'} ${formattedDate}</p>
                    <p class="hero-sessions">${this.escapeHtml(sessions || 'Sessions TBC')}</p>
                    ${hasSprint ? '<span class="sprint-chip">Sprint Weekend</span>' : ''}
                </div>
                <div class="hero-flag">⏩</div>
            </div>
        `;
    }

    getUpcomingWeekend(weekends = []) {
        const now = Date.now();
        const list = Array.isArray(weekends) ? weekends : [];
        const futureWeekends = list
            .map(w => ({ weekend: w, time: Date.parse(this.getWeekendEarliestDate(w) || this.getWeekendLatestDate(w) || w.latestDate || w.startDate || '') }))
            .filter(item => !Number.isNaN(item.time) && item.time > now)
            .sort((a, b) => a.time - b.time);

        if (futureWeekends.length) {
            return futureWeekends[0].weekend;
        }

        if (list.length > 1) {
            return list[1];
        }

        return null;
    }

    getUpcomingFromCalendar() {
        const now = Date.now();
        const calendar = Array.isArray(this.calendarWeekends) ? this.calendarWeekends : [];
        const future = calendar
            .map(item => ({
                weekend: {
                    name: item.name,
                    startDate: item.startDate,
                    earliestDate: item.startDate,
                    latestDate: item.startDate,
                    sessions: item.sessions || []
                },
                time: Date.parse(item.startDate)
            }))
            .filter(item => !Number.isNaN(item.time) && item.time > now)
            .sort((a, b) => a.time - b.time);

        return future.length ? future[0].weekend : null;
    }

    getWeekendEarliestDate(grandPrix = {}) {
        const candidate = grandPrix.startDate || grandPrix.earliestDate;
        if (candidate) return candidate;

        const videos = Array.isArray(grandPrix.videos) ? grandPrix.videos : [];
        const sessions = Array.isArray(grandPrix.sessions) ? grandPrix.sessions : [];
        const timestamps = [...videos.map(v => Date.parse(v.publishedAt)), ...sessions.map(s => Date.parse(s.publishedAt || s.startDate))]
            .filter(time => !Number.isNaN(time));

        if (!timestamps.length) return null;
        return new Date(Math.min(...timestamps)).toISOString();
    }

    parseIcsCalendar(text) {
        if (!text) return [];
        const events = text.split('BEGIN:VEVENT').slice(1);
        const weekendMap = new Map();

        const getValue = (block, key) => {
            const match = block.match(new RegExp(`${key}:([^\n\r]+)`));
            return match ? match[1].trim() : null;
        };

        events.forEach(block => {
            const summary = getValue(block, 'SUMMARY');
            const dtStart = getValue(block, 'DTSTART');
            if (!summary || !dtStart) return;

            const date = this.parseIcsDate(dtStart);
            if (!date) return;

            const sessionMatch = summary.match(/F1:\s*(.+?)\s*\(/i);
            const gpMatch = summary.match(/\((.+)\)/);
            const sessionTitle = sessionMatch ? sessionMatch[1].trim() : 'Session';
            const gpName = gpMatch ? gpMatch[1].trim() : 'Grand Prix';

            const existing = weekendMap.get(gpName) || { name: gpName, startDate: date.toISOString(), sessions: [] };
            existing.sessions.push({ title: sessionTitle, publishedAt: date.toISOString() });

            const existingStart = Date.parse(existing.startDate);
            if (!existing.startDate || Number.isNaN(existingStart) || existingStart > date.getTime()) {
                existing.startDate = date.toISOString();
            }

            weekendMap.set(gpName, existing);
        });

        return Array.from(weekendMap.values()).sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));
    }

    parseIcsDate(value) {
        if (!value) return null;
        // Handles formats like 20250314T013000Z -> 2025-03-14T01:30:00Z
        const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
        if (!match) return null;
        const [, y, mo, d, h, mi, s] = match;
        const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
        const date = new Date(iso);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    createTimelineChip(video = {}, grandPrix = {}, isCurrentWeekend = false) {
        const sessionType = this.getVideoType(video.title || '');
        const sessionClass = sessionType.toLowerCase().replace(/\s+/g, '-');
        const formattedDate = this.formatDate(video.publishedAt);
        const analyticsAttributes = this.buildVideoDataAttributes({
            videoId: video.videoId,
            videoUrl: this.getVideoUrl(video.videoId),
            grandPrixName: grandPrix.name,
            videoTitle: video.title,
            sessionType,
            publishedAt: video.publishedAt,
            isCurrentWeekend
        });

        return `
            <button class="timeline-chip ${sessionClass}" type="button" data-analytics-role="timeline-chip" ${analyticsAttributes}>
                <span class="chip-label">${sessionType}</span>
                <span class="chip-date">${formattedDate}</span>
            </button>
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
        } else if (titleLower.includes('fp3')) {
            return 'FP3';
        } else if (titleLower.includes('sprint') && (titleLower.includes('qualifying') || titleLower.includes('quali'))) {
            return 'Sprint Quali';
        } else if (titleLower.includes('shootout')) {
            return 'Sprint Quali';
        } else if (titleLower.includes('sprint')) {
            return 'Sprint';
        } else if (titleLower.includes('race') && (titleLower.includes('qualifying') || titleLower.includes('quali'))) {
            return 'Race Quali';
        } else if (titleLower.includes('qualifying') || titleLower.includes('quali')) {
            return 'Qualifying';
        } else if ((titleLower.includes('race') || titleLower.includes('grand prix')) && !titleLower.includes('practice')) {
            return 'Race';
        }

        return 'Other';
    }

    getSessionPriority(sessionType) {
        const order = {
            'FP1': 10,
            'FP2': 20,
            'FP3': 30,
            // Grand Prix qualifying should precede sprint sessions
            'Qualifying': 40,
            'Sprint Quali': 50,
            'Sprint': 60,
            'Race Quali': 70,
            'Race': 80,
            'Other': 90
        };

        return order[sessionType] || 99;
    }

    getSortedVideos(grandPrix = {}) {
        const videos = Array.isArray(grandPrix.videos) ? [...grandPrix.videos] : [];

        return videos.sort((a, b) => {
            const sessionPriorityDiff = this.getSessionPriority(this.getVideoType(a.title || '')) -
                this.getSessionPriority(this.getVideoType(b.title || ''));

            if (sessionPriorityDiff !== 0) {
                return sessionPriorityDiff;
            }

            const dateA = Date.parse(a.publishedAt);
            const dateB = Date.parse(b.publishedAt);
            const dateAValid = !Number.isNaN(dateA);
            const dateBValid = !Number.isNaN(dateB);

            if (dateAValid && dateBValid && dateA !== dateB) {
                return dateA - dateB;
            }

            if (dateAValid !== dateBValid) {
                return dateAValid ? -1 : 1;
            }

            return (a.title || '').localeCompare(b.title || '');
        });
    }

    withSortedVideos(grandPrix = {}) {
        return Object.assign({}, grandPrix, { videos: this.getSortedVideos(grandPrix) });
    }

    formatDate(dateString) {
        if (!dateString) {
            return 'Date unavailable';
        }

        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) {
            return 'Date unavailable';
        }

        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };
        if (this.userTimeZone) {
            options.timeZone = this.userTimeZone;
        }

        return date.toLocaleDateString('en-US', options);
    }

    getUserTimeZone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (_) {
            return null;
        }
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
                const meta = metadataById.get(videoId);
                const payload = Object.assign({}, meta, { interaction_type: 'thumbnail' });
                this.captureAnalytics('video_thumbnail_opened', payload);
                if (videoUrl) {
                    this.openVideo(videoUrl);
                }
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

        const timelineChips = this.videoContainer.querySelectorAll('[data-analytics-role="timeline-chip"]');
        timelineChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const videoId = chip.getAttribute('data-video-id');
                const videoMeta = metadataById.get(videoId);
                if (videoMeta) {
                    this.captureAnalytics('timeline_chip_opened', Object.assign({}, videoMeta, { interaction_type: 'timeline_chip' }));
                    this.openDrawer(videoMeta);
                }
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

    injectVideoStructuredData(weekends = []) {
        try {
            const existing = document.getElementById('videoSchema');
            if (existing && existing.parentNode) {
                existing.parentNode.removeChild(existing);
            }

            const videos = [];
            weekends.forEach(weekend => {
                const gpName = weekend.name || '';
                const gpVideos = Array.isArray(weekend.videos) ? weekend.videos : [];
                gpVideos.forEach(video => {
                    if (!video || !video.videoId) return;
                    videos.push({
                        '@context': 'https://schema.org',
                        '@type': 'VideoObject',
                        'name': video.title || gpName || 'F1 video highlight',
                        'description': video.description || gpName,
                        'thumbnailUrl': video.thumbnail || undefined,
                        'uploadDate': video.publishedAt || undefined,
                        'url': this.getVideoUrl(video.videoId),
                        'inLanguage': 'en',
                        'genre': 'Sports',
                        'isFamilyFriendly': true
                    });
                });
            });

            if (videos.length === 0) {
                return;
            }

            const script = document.createElement('script');
            script.type = 'application/ld+json';
            script.id = 'videoSchema';
            script.textContent = JSON.stringify(videos);
            document.head.appendChild(script);
        } catch (e) {
            console.debug('schema generation failed', e);
        }
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

    openDrawer(videoMeta = {}) {
        if (!this.drawer || !this.drawerContent) {
            return;
        }

        const { video_id: videoId, video_title: title, grand_prix: grandPrix, session_type: sessionType, published_at: publishedAt, video_url: videoUrl } = videoMeta;
        const formattedDate = this.formatDate(publishedAt);

        const thumbnail = this.findThumbnail(videoId);

        this.drawerContent.innerHTML = `
            <div class="drawer-media" style="background-image:url('${this.escapeAttribute(thumbnail || '')}')"></div>
            <div class="drawer-meta">
                <p class="drawer-session">${this.escapeHtml(sessionType || '')}</p>
                <h3 class="drawer-title">${this.escapeHtml(title || '')}</h3>
                <p class="drawer-date">${formattedDate}</p>
                <p class="drawer-gp">${this.escapeHtml(grandPrix || '')}</p>
                <div class="drawer-actions">
                    <a class="watch-button" href="${this.escapeAttribute(videoUrl || '')}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>
                    <button class="secondary-button" type="button" data-drawer-close>Close</button>
                </div>
            </div>
        `;

        this.drawer.setAttribute('aria-hidden', 'false');
        this.drawer.classList.add('open');

        const closeBtn = this.drawer.querySelector('[data-drawer-close]');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeDrawer(), { once: true });
        }
    }

    closeDrawer() {
        if (!this.drawer) return;
        this.drawer.setAttribute('aria-hidden', 'true');
        this.drawer.classList.remove('open');
    }

    attachDrawerHandlers() {
        if (!this.drawer) return;
        const backdrop = this.drawer.querySelector('.drawer-backdrop');
        const closeBtn = this.drawer.querySelector('.drawer-close');

        if (backdrop) {
            backdrop.addEventListener('click', () => this.closeDrawer());
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeDrawer());
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeDrawer();
            }
        });
    }

    findThumbnail(videoId) {
        for (const gp of this.latestGrandPrixWeekends) {
            const videos = Array.isArray(gp.videos) ? gp.videos : [];
            const match = videos.find(v => v.videoId === videoId);
            if (match && match.thumbnail) {
                return match.thumbnail;
            }
        }
        return '';
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

function setTheme(theme) {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    document.body.classList.add('theme-transition');
    setTimeout(() => document.body.classList.remove('theme-transition'), 320);
    try {
        localStorage.setItem('theme', theme);
    } catch (_) {
        /* ignore storage errors */
    }

    const toggle = document.getElementById('themeToggle');
    if (toggle) {
        const icon = toggle.querySelector('.theme-toggle-icon');
        const label = toggle.querySelector('.theme-toggle-label');
        const isDark = theme === 'dark';
        if (icon) {
            icon.textContent = isDark ? '🌙' : '☀️';
        }
        if (label) {
            label.textContent = isDark ? 'Dark' : 'Light';
        }
        toggle.classList.toggle('is-dark', isDark);
    }
}

function initThemeToggle() {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    let savedTheme = null;

    try {
        savedTheme = localStorage.getItem('theme');
    } catch (_) {
        savedTheme = null;
    }

    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(initialTheme);

    const toggle = document.getElementById('themeToggle');
    if (toggle) {
        toggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'light';
            setTheme(current === 'dark' ? 'light' : 'dark');
        });
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();

    // Only boot the video tracker on pages that actually render videos
    const hasVideoContainer = document.getElementById('videoContainer');
    if (hasVideoContainer) {
        new F1VideoTracker();
    }

    const tzNote = document.getElementById('tzNote');
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const label = tz ? tz : 'unknown';
    if (tzNote) {
        tzNote.textContent = `All session times are shown in your local timezone (${label}).`;
    }
});
