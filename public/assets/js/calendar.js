const script = document.currentScript;
const scriptYear = script?.dataset?.year || '2025';
const scriptIcsFile = script?.dataset?.icsFile || `f1-calendar_${scriptYear}.ics`;
const scriptView = script?.dataset?.view || 'timeline';
const scriptSource = script?.dataset?.source || 'current';

const addDataPrefix = (file) => {
    if (!file) return file;
    if (/^(https?:)?\/\//.test(file)) return file;
    if (file.startsWith('data/')) return file;
    return `data/${file}`;
};

// Country flag mapping
const GP_FLAGS = {
    'Australian': '🇦🇺',
    'Chinese': '🇨🇳',
    'Japanese': '🇯🇵',
    'Bahrain': '🇧🇭',
    'Saudi Arabian': '🇸🇦',
    'Miami': '🇺🇸',
    'Emilia Romagna': '🇮🇹',
    'Monaco': '🇲🇨',
    'Spanish': '🇪🇸',
    'Canadian': '🇨🇦',
    'Austrian': '🇦🇹',
    'British': '🇬🇧',
    'Belgian': '🇧🇪',
    'Hungarian': '🇭🇺',
    'Dutch': '🇳🇱',
    'Italian': '🇮🇹',
    'Azerbaijan': '🇦🇿',
    'Singapore': '🇸🇬',
    'United States': '🇺🇸',
    'Mexico City': '🇲🇽',
    'São Paulo': '🇧🇷',
    'Las Vegas': '🇺🇸',
    'Qatar': '🇶🇦',
    'Abu Dhabi': '🇦🇪'
};

class F1Calendar {
    constructor() {
        this.year = scriptYear;
        this.icsFile = addDataPrefix(scriptIcsFile);
        this.viewMode = scriptView;
        this.dataSource = scriptSource;

        this.timelineContainer = document.getElementById('calendarTimeline');
        this.loading = document.getElementById('calendarLoading');
        this.error = document.getElementById('calendarError');
        this.calendarContainer = document.getElementById('calendarContainer');
        this.lastUpdated = document.getElementById('lastUpdated');
        this.loadMoreSpinner = document.getElementById('loadMoreSpinner');

        // Unified view elements
        this.upcomingSection = document.getElementById('upcomingSchedule');
        this.upcomingCards = document.getElementById('upcomingGPCards');
        this.offSeasonState = document.getElementById('offSeasonState');
        this.sidebarCalendar = document.getElementById('sidebarCalendar');
        this.seasonProgress = document.getElementById('seasonProgress');

        this.calendarWeekends = [];
        this.videoWeekends = [];
        this.mergedWeekends = [];
        this.completedGPs = [];
        this.upcomingGPs = [];
        this.displayedCount = 0;
        this.itemsPerPage = 6;
        this.userTimeZone = this.getUserTimeZone();
        this.hasMore = true;
        this.isLoading = false;
        this.countdownInterval = null;
        this.drawerInitialized = false;
        this.drawerThumbs = new WeakSet();
        this.refreshInterval = null;
        this._lastRefresh = 0;
        this.visibilityHandler = null;
        this.beforeUnloadHandler = () => this.destroy();
        this.init();
    }

    async init() {
        try {
            await Promise.all([this.loadCalendar(), this.loadVideos()]);
            this.mergeAndSort();

            if (this.viewMode === 'unified') {
                this.renderUnifiedView();
                this.renderSidebarCalendar();
                this.renderSeasonProgress();
                this.hideLoading();
                this.setupDrawer();
            } else if (this.viewMode === 'list') {
                this.renderListView();
                this.setupCountdown();
                this.hideLoading();
            } else {
                // For archive, render all items at once (no lazy loading)
                // so users can use Ctrl+F to search
                if (this.dataSource === 'archive') {
                    this.renderAllItems();
                    this.setupArchiveControls();
                } else {
                    this.setupInfiniteScroll();
                    this.renderBatch();
                }
                this.hideLoading();
                this.setupDrawer();
            }

            this.captureAnalytics('calendar_loaded', {
                year: this.year,
                view: this.viewMode,
                source: this.dataSource,
                total_weekends: this.mergedWeekends.length
            });

            this.startAutoRefresh();

            // Initialize Notifications
            if (typeof NotificationManager !== 'undefined') {
                this.notificationManager = new NotificationManager(this);
            }

            // Cleanup on page unload
            window.addEventListener('beforeunload', this.beforeUnloadHandler);
        } catch (error) {
            console.error('Failed to load calendar:', error);
            this.showError();
            this.captureAnalytics('calendar_error', { year: this.year, error: error.message });
        }
    }

    startAutoRefresh() {
        // Clear any existing interval
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.visibilityHandler = null;
        }

        // Use current time as baseline so quick tab switches do not force an immediate refresh.
        this._lastRefresh = Date.now();

        // Refresh data every 30 minutes
        this.refreshInterval = setInterval(() => this.refreshData(), 30 * 60 * 1000);

        // Refresh when tab becomes visible after 5+ mins
        this.visibilityHandler = () => {
            if (document.visibilityState === 'visible') {
                const lastCheck = this._lastRefresh || 0;
                if (Date.now() - lastCheck > 5 * 60 * 1000) {
                    this.refreshData();
                }
            }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    async refreshData() {
        if (this.isLoading) return;

        this.isLoading = true;
        this._lastRefresh = Date.now();

        try {
            await Promise.all([this.loadCalendar(), this.loadVideos()]);
            this.mergeAndSort();

            if (this.viewMode === 'unified') {
                this.renderUnifiedView();
                this.renderSidebarCalendar();
                this.renderSeasonProgress();
                this.setupDrawer();
            } else if (this.viewMode === 'list') {
                this.renderListView();
                this.setupCountdown();
            } else {
                if (this.timelineContainer) {
                    this.timelineContainer.innerHTML = '';
                }
                this.renderAllItems();
                this.setupDrawer();
            }
        } catch (e) {
            console.warn('Silent refresh failed:', e);
        } finally {
            this.isLoading = false;
        }
    }

    async loadPreviousYearCalendar() {
        // No longer needed - homepage only shows upcoming races
        this.previousYearWeekends = [];
    }

    setupArchiveControls() {
        const toggleAllBtn = document.getElementById('toggleAllBtn');

        if (toggleAllBtn) {
            toggleAllBtn.addEventListener('click', () => {
                const details = this.timelineContainer.querySelectorAll('details.timeline-details');
                const isExpanded = toggleAllBtn.dataset.expanded === 'true';
                const expandIcon = toggleAllBtn.querySelector('.expand-icon');
                const collapseIcon = toggleAllBtn.querySelector('.collapse-icon');
                const label = toggleAllBtn.querySelector('.toggle-label');

                if (isExpanded) {
                    // Collapse all
                    details.forEach(d => d.open = false);
                    toggleAllBtn.dataset.expanded = 'false';
                    expandIcon.style.display = '';
                    collapseIcon.style.display = 'none';
                    label.textContent = 'Expand All';
                    this.captureAnalytics('archive_collapse_all', { count: details.length });
                } else {
                    // Expand all
                    details.forEach(d => d.open = true);
                    toggleAllBtn.dataset.expanded = 'true';
                    expandIcon.style.display = 'none';
                    collapseIcon.style.display = '';
                    label.textContent = 'Collapse All';
                    this.captureAnalytics('archive_expand_all', { count: details.length });
                }
            });
        }
    }

    async loadCalendar() {
        // Prefer ICS; fall back to static JSON calendar if ICS is unavailable or empty
        const fallbacks = [
            async () => {
                const icsResponse = await fetch(this.icsFile, { cache: 'no-cache' });
                if (!icsResponse.ok) {
                    throw new Error(`Failed to fetch ICS (${icsResponse.status})`);
                }
                const text = await icsResponse.text();
                const weekends = this.parseIcsCalendar(text);
                if (!weekends.length) {
                    throw new Error('No weekends found in ICS calendar');
                }
                this.calendarWeekends = weekends;
            },
            async () => {
                const jsonFile = addDataPrefix(`calendar${this.year}.json`);
                const res = await fetch(jsonFile, { cache: 'no-cache' });
                if (!res.ok) {
                    throw new Error(`Failed to fetch JSON calendar (${res.status})`);
                }
                const data = await res.json();
                if (!Array.isArray(data) || !data.length) {
                    throw new Error('Calendar JSON empty');
                }
                // Normalize shape to match ICS parser output
                this.calendarWeekends = data.map(item => ({
                    name: item.name,
                    startDate: item.startDate,
                    sessions: (item.sessions || []).map(session => (
                        typeof session === 'string'
                            ? { title: session, publishedAt: item.startDate }
                            : session
                    ))
                }));
            }
        ];

        let lastError = null;
        for (const attempt of fallbacks) {
            try {
                await attempt();
                return;
            } catch (err) {
                lastError = err;
                console.debug('Calendar load attempt failed:', err.message);
            }
        }

        throw lastError || new Error('Unable to load calendar');
    }

    async loadVideos() {
        const sources = this.dataSource === 'archive'
            ? [`videos-${this.year}.json`, 'videos.json']
            : ['videos.json'];

        for (const source of sources) {
            try {
                const response = await fetch(addDataPrefix(source), { cache: 'no-cache' });
                if (!response.ok) {
                    continue;
                }

                const data = await response.json();
                const grandPrixWeekends = Array.isArray(data.grandPrixWeekends) ? data.grandPrixWeekends : [];

                const filtered = grandPrixWeekends.filter(weekend => this.isWeekendForYear(weekend));
                this.videoWeekends = this.dedupeWeekendVideos(filtered);

                if (data.lastUpdated) {
                    this.updateLastUpdated(data.lastUpdated);
                }

                return;
            } catch (error) {
                console.debug(`Videos load failed for ${source}:`, error);
            }
        }

        this.videoWeekends = [];
    }

    parseIcsCalendar(text) {
        if (!text) return [];
        const events = text.split('BEGIN:VEVENT').slice(1);
        const weekendMap = new Map();

        const getValue = (block, key) => {
            const match = block.match(new RegExp(`${key}:([^\\n\\r]+)`));
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
        const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
        if (!match) return null;
        const [, y, mo, d, h, mi, s] = match;
        const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
        const date = new Date(iso);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    mergeAndSort() {
        const now = Date.now();
        const upcomingGps = [];
        const completedGps = [];

        this.calendarWeekends.forEach(calendarGP => {
            const matchingVideos = this.videoWeekends.find(v =>
                v.name.replace(`${this.year} `, '').includes(calendarGP.name.replace(' Grand Prix', '')) ||
                calendarGP.name.replace(' Grand Prix', '').includes(v.name.replace(`${this.year} `, ''))
            );

            const startTime = Date.parse(calendarGP.startDate);
            const isFuture = startTime > now;
            const hasVideos = matchingVideos && matchingVideos.videos && matchingVideos.videos.length > 0;

            // Match videos to sessions
            const sessionsWithVideos = (calendarGP.sessions || []).map(session => {
                const sessionTitle = typeof session === 'string' ? session : session.title;
                const sessionDate = typeof session === 'string' ? calendarGP.startDate : session.publishedAt;

                // Find matching video for this session
                let matchedVideo = null;
                if (matchingVideos && matchingVideos.videos) {
                    matchedVideo = matchingVideos.videos.find(v => {
                        const videoTitle = (v.title || '').toLowerCase();
                        const sessionLower = sessionTitle.toLowerCase();

                        if (sessionLower.includes('fp1') && videoTitle.includes('fp1')) return true;
                        if (sessionLower.includes('fp2') && videoTitle.includes('fp2')) return true;
                        if (sessionLower.includes('fp3') && videoTitle.includes('fp3')) return true;
                        if (sessionLower.includes('sprint qualifying') && (videoTitle.includes('sprint qualifying') || videoTitle.includes('sprint quali'))) return true;
                        if (sessionLower.includes('sprint') && !sessionLower.includes('quali') && videoTitle.includes('sprint') && !videoTitle.includes('quali')) return true;
                        if (sessionLower.includes('qualifying') && !sessionLower.includes('sprint') && videoTitle.includes('qualifying') && !videoTitle.includes('sprint')) return true;
                        if ((sessionLower.includes('grand prix') || sessionLower.includes('race')) && (videoTitle.includes('race') || (videoTitle.includes('grand prix') && !videoTitle.includes('qualifying')))) return true;

                        return false;
                    });
                }

                return {
                    title: sessionTitle,
                    publishedAt: sessionDate,
                    video: matchedVideo
                };
            });

            const merged = {
                name: calendarGP.name,
                startDate: calendarGP.startDate,
                sessions: sessionsWithVideos,
                videos: matchingVideos?.videos || [],
                isCompleted: hasVideos,
                upcoming: isFuture || !hasVideos
            };

            if (isFuture) {
                upcomingGps.push(merged);
            } else {
                completedGps.push(merged);
            }
        });

        // Sort completed (most recent first) and upcoming (soonest first)
        completedGps.sort((a, b) => Date.parse(b.startDate) - Date.parse(a.startDate));
        upcomingGps.sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));

        // Store separately for unified view
        this.completedGPs = completedGps;
        this.upcomingGPs = upcomingGps;

        // Combined list for other views
        this.mergedWeekends = [...completedGps, ...upcomingGps.slice(0, 1)];
        this.hasMore = this.mergedWeekends.length > this.itemsPerPage;
    }

    renderListView() {
        if (!this.timelineContainer) return;

        const sortedGPs = [...this.calendarWeekends].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));
        const html = sortedGPs.map(gp => this.createListItem(gp)).join('');

        this.timelineContainer.innerHTML = html;
        this.timelineContainer.classList.add('calendar-list-view');
    }

    createListItem(gp) {
        const now = Date.now();
        const gpDate = new Date(gp.startDate);
        const isUpcoming = gpDate.getTime() > now;

        const sessionsHtml = (gp.sessions || []).map(session => {
            const sessionDate = new Date(session.publishedAt);
            const isSessionUpcoming = sessionDate.getTime() > now;
            const sessionStatusClass = isSessionUpcoming ? 'upcoming' : 'completed';
            const sessionIcon = isSessionUpcoming ? '⏱' : '✓';
            const sessionType = this.escapeHtml(this.getSessionTypeLabel(session.title));

            return `
                <div class="sidebar-session-item ${sessionStatusClass}">
                    <span class="sidebar-session-status">${sessionIcon}</span>
                    <span class="sidebar-session-name">${sessionType}</span>
                    <span class="sidebar-session-time">${this.formatDate(session.publishedAt)}</span>
                </div>
            `;
        }).join('');

        const formattedDates = `${this.formatShortDate(gp.startDate)} - ${this.formatEndDate(gp.startDate)}`;
        const hasSprint = gp.sessions && gp.sessions.some(s => s.title.toLowerCase().includes('sprint'));
        const sprintTag = hasSprint ? '<span class="calendar-list-sprint-tag">Sprint Weekend</span>' : '';

        return `
            <div class="calendar-list-item ${isUpcoming ? 'upcoming' : 'completed'}">
                <h3 class="calendar-list-title">${this.escapeHtml(gp.name)}</h3>
                <div class="calendar-list-meta">
                    <span class="calendar-list-location">📍 ${this.escapeHtml(gp.name.replace(' Grand Prix', ''))}</span>
                    ${sprintTag}
                    <span class="calendar-list-dates">${formattedDates}</span>
                </div>
                <div class="calendar-list-sessions">
                    ${sessionsHtml}
                </div>
            </div>
        `;
    }

    // ============================================
    // UNIFIED VIEW METHODS
    // ============================================

    renderUnifiedView() {
        const hasUpcoming = this.upcomingGPs.length > 0;

        // If no upcoming races, show off-season state
        if (!hasUpcoming) {
            if (this.offSeasonState) {
                this.offSeasonState.style.display = 'block';
            }
            return;
        }

        // Render upcoming GPs
        if (hasUpcoming && this.upcomingSection && this.upcomingCards) {
            // Mark the first upcoming as "next"
            this.upcomingGPs.forEach((gp, index) => {
                const type = index === 0 ? 'next' : 'upcoming';
                const card = this.createUnifiedGPCard(gp, type);
                this.upcomingCards.appendChild(card);
            });
            this.upcomingSection.style.display = 'block';
        }

        // Set up hero with next race countdown
        this.setupUnifiedHero();
    }

    createUnifiedGPCard(gp, status) {
        const div = document.createElement('div');
        const statusClass = status === 'next' ? 'next-up' : status;
        div.className = `gp-card ${statusClass}`;
        div.id = this.createGPId(gp.name);

        const flag = this.getGPFlag(gp.name);
        const dates = this.formatGPDateRange(gp.startDate);
        const location = gp.name.replace(' Grand Prix', '');
        const hasSprint = gp.sessions.some(s => s.title.toLowerCase().includes('sprint'));
        const videoCount = gp.videos.length;

        // Status badge text
        let badgeText = '';
        let badgeClass = '';
        if (status === 'next') {
            badgeText = 'Next Up';
            badgeClass = 'next';
        } else if (status === 'completed') {
            badgeText = 'Completed';
            badgeClass = 'completed';
        } else {
            badgeText = 'Upcoming';
            badgeClass = 'upcoming';
        }

        // Create session strip HTML
        const sessionStripHtml = this.createSessionStrip(gp);

        div.innerHTML = `
            <div class="gp-card-header">
                <div class="gp-card-info">
                    <h3 class="gp-card-name">
                        <span class="gp-card-flag">${flag}</span>
                        ${this.escapeHtml(gp.name)}
                    </h3>
                    <div class="gp-card-meta">
                        <span class="gp-card-dates">${dates}</span>
                        <span class="gp-card-location">📍 ${this.escapeHtml(location)}</span>
                        ${hasSprint ? '<span class="sprint-badge">🏃 Sprint</span>' : ''}
                    </div>
                </div>
                <div class="gp-card-badges">
                    ${videoCount > 0 ? `<span class="gp-video-count">🎬 ${videoCount}</span>` : ''}
                    <span class="gp-status-badge ${badgeClass}">${badgeText}</span>
                </div>
            </div>
            <div class="session-strip">
                ${sessionStripHtml}
            </div>
            <div class="inline-video-expand" aria-hidden="true"></div>
        `;

        return div;
    }

    createSessionStrip(gp) {
        const now = Date.now();

        return gp.sessions.map(session => {
            const sessionTitle = typeof session.title === 'string' ? session.title : 'Session';
            const sessionType = this.getSessionTypeLabel(sessionTitle);
            const sessionClass = sessionType.toLowerCase().replace(/\s+/g, '-');
            const sessionDate = new Date(session.publishedAt);
            const isUpcoming = sessionDate.getTime() > now;
            const hasVideo = session.video && session.video.videoId;

            // Determine icon
            let icon = '⏱';
            if (hasVideo) {
                icon = '▶️';
            } else if (!isUpcoming) {
                icon = '📅';
            }

            // Format time
            const timeStr = isUpcoming ? this.formatSessionTime(session.publishedAt) : this.formatShortDateTime(session.publishedAt);

            // Build classes
            const classes = ['session-chip', sessionClass];
            if (hasVideo) classes.push('has-video');
            if (isUpcoming) classes.push('upcoming');

            // Data attributes for drawer
            const dataAttrs = hasVideo ? `
                data-video-id="${session.video.videoId}"
                data-video-url="${this.getVideoUrl(session.video.videoId)}"
                data-grand-prix="${this.escapeAttribute(gp.name)}"
                data-video-title="${this.escapeAttribute(session.video.title)}"
                data-session-type="${sessionType}"
                data-thumbnail="${this.escapeAttribute(session.video.thumbnail || '')}"
                role="button"
                tabindex="0"
            ` : '';

            return `
                <div class="${classes.join(' ')}" ${dataAttrs}>
                    <span class="session-chip-label">${sessionType}</span>
                    <span class="session-chip-icon">${icon}</span>
                    <span class="session-chip-time">${timeStr}</span>
                </div>
            `;
        }).join('');
    }

    setupUnifiedHero() {
        const heroSection = document.getElementById('hero');
        if (!heroSection) return;

        const nextGP = this.upcomingGPs[0];
        if (!nextGP) {
            // No upcoming races - show season complete or off-season
            heroSection.innerHTML = `
                <div class="hero-card hero-centered">
                    <div class="hero-flag">🏆</div>
                    <div class="hero-meta">
                        <p class="hero-kicker">${this.year} Season</p>
                        <h2 class="hero-title">Season Complete!</h2>
                        <p class="hero-date">Check out the 2025 archive for all highlights</p>
                    </div>
                </div>
            `;
            return;
        }

        const flag = this.getGPFlag(nextGP.name);
        const hasSprint = nextGP.sessions.some(s => s.title.toLowerCase().includes('sprint'));
        const sprintBadge = hasSprint ? '<span class="sprint-chip">🏃 Sprint Weekend</span>' : '';

        heroSection.innerHTML = `
            <div class="hero-card hero-centered upcoming-card">
                <div class="hero-flag">🏁</div>
                <div class="hero-meta">
                    <p class="hero-kicker">Next Race</p>
                    <h2 class="hero-title">${flag} ${this.escapeHtml(nextGP.name)}</h2>
                    <p class="hero-date">${this.formatGPDateRange(nextGP.startDate)}</p>
                    <div class="hero-countdown" id="heroCountdown">Loading countdown...</div>
                    ${sprintBadge}
                </div>
            </div>
        `;

        // Start countdown
        this.startHeroCountdown(nextGP);
    }

    startHeroCountdown(gp) {
        const countdownEl = document.getElementById('heroCountdown');
        if (!countdownEl) return;

        const updateCountdown = () => {
            const now = Date.now();
            const nextSession = gp.sessions.find(s => Date.parse(s.publishedAt) > now);

            if (!nextSession) {
                countdownEl.innerHTML = '<span class="countdown-live">🔴 Race Weekend!</span>';
                clearInterval(this.countdownInterval);
                return;
            }

            const targetTime = Date.parse(nextSession.publishedAt);
            const diff = targetTime - now;

            if (diff <= 0) {
                countdownEl.innerHTML = '<span class="countdown-live">🔴 Live Now!</span>';
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            let countdownHtml = '<div class="countdown-units">';
            if (days > 0) countdownHtml += `<span class="countdown-unit"><strong>${days}</strong>d</span>`;
            countdownHtml += `<span class="countdown-unit"><strong>${hours}</strong>h</span>`;
            countdownHtml += `<span class="countdown-unit"><strong>${minutes}</strong>m</span>`;
            countdownHtml += `<span class="countdown-unit"><strong>${seconds}</strong>s</span>`;
            countdownHtml += '</div>';

            if (nextSession) {
                countdownHtml += `<span class="countdown-session">until ${this.getSessionTypeLabel(nextSession.title)}</span>`;
            }

            countdownEl.innerHTML = countdownHtml;
        };

        updateCountdown();
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        this.countdownInterval = setInterval(updateCountdown, 1000);
    }

    renderSidebarCalendar() {
        if (!this.sidebarCalendar) return;

        const now = Date.now();
        const allGPs = [...this.calendarWeekends].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));

        let foundNext = false;
        const html = allGPs.map((gp, index) => {
            const gpTime = Date.parse(gp.startDate);
            const isPast = gpTime < now;
            const isNext = !isPast && !foundNext;
            if (isNext) foundNext = true;

            const statusClass = isPast ? 'completed' : (isNext ? 'next' : 'upcoming');
            const statusIcon = isPast ? '✓' : (isNext ? '→' : '○');
            const shortName = gp.name.replace(' Grand Prix', '');
            const dateStr = this.formatCompactDate(gp.startDate);
            const gpId = this.createGPId(gp.name);

            return `
                <a href="#${gpId}" class="sidebar-calendar-item ${statusClass}" data-gp-id="${gpId}">
                    <span class="sidebar-cal-status">${statusIcon}</span>
                    <span class="sidebar-cal-name">${this.escapeHtml(shortName)}</span>
                    <span class="sidebar-cal-date">${dateStr}</span>
                </a>
            `;
        }).join('');

        this.sidebarCalendar.innerHTML = html;

        // Add click handlers for smooth scroll
        this.sidebarCalendar.querySelectorAll('.sidebar-calendar-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const gpId = item.getAttribute('data-gp-id');
                const targetEl = document.getElementById(gpId);
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Briefly highlight the card
                    targetEl.classList.add('highlight');
                    setTimeout(() => targetEl.classList.remove('highlight'), 1500);
                }
            });
        });
    }

    renderSeasonProgress() {
        if (!this.seasonProgress) return;

        const total = this.calendarWeekends.length;
        const completed = this.completedGPs.filter(gp => gp.videos.length > 0).length;

        if (total === 0) return;

        const percentage = Math.round((completed / total) * 100);

        const progressFill = document.getElementById('progressFill');
        const progressMarker = document.getElementById('progressMarker');
        const progressLabel = document.getElementById('progressLabel');

        if (progressFill) progressFill.style.width = `${percentage}%`;
        if (progressMarker) progressMarker.style.left = `${percentage}%`;
        if (progressLabel) progressLabel.textContent = `Race ${completed} of ${total} • ${percentage}% complete`;

        this.seasonProgress.style.display = 'block';
    }

    // Helper methods for unified view
    getGPFlag(gpName) {
        for (const [key, flag] of Object.entries(GP_FLAGS)) {
            if (gpName.includes(key)) return flag;
        }
        return '🏎️';
    }

    formatGPDateRange(startDate) {
        const start = new Date(startDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 2);

        const options = { month: 'short', day: 'numeric', timeZone: this.userTimeZone };
        const startStr = start.toLocaleDateString('en-US', options);
        const endStr = end.toLocaleDateString('en-US', { day: 'numeric', timeZone: this.userTimeZone });
        const year = start.toLocaleDateString('en-US', { year: 'numeric', timeZone: this.userTimeZone });

        return `${startStr}-${endStr}, ${year}`;
    }

    formatSessionTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return '';

        const dayOptions = { weekday: 'short', timeZone: this.userTimeZone };
        const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: this.userTimeZone };

        const day = date.toLocaleDateString('en-US', dayOptions);
        const time = date.toLocaleTimeString('en-US', timeOptions);

        return `${day} ${time}`;
    }

    formatShortDateTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return '';

        const options = { month: 'short', day: 'numeric', timeZone: this.userTimeZone };
        return date.toLocaleDateString('en-US', options);
    }

    formatCompactDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return '';

        const options = { month: 'short', day: 'numeric', timeZone: this.userTimeZone };
        return date.toLocaleDateString('en-US', options);
    }

    createGPId(gpName) {
        return 'gp-' + gpName.toLowerCase()
            .replace(' grand prix', '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    // ============================================
    // END UNIFIED VIEW METHODS
    // ============================================

    getSessionTypeLabel(title) {
        const titleLower = title.toLowerCase();
        if (titleLower.includes('fp1')) return 'FP1';
        if (titleLower.includes('fp2')) return 'FP2';
        if (titleLower.includes('fp3')) return 'FP3';
        if (titleLower.includes('sprint') && titleLower.includes('qualifying')) return 'Sprint Quali';
        if (titleLower.includes('sprint')) return 'Sprint';
        if (titleLower.includes('qualifying')) return 'Qualifying';
        if (titleLower.includes('race')) return 'Race';
        return title;
    }

    isWeekendForYear(weekend = {}) {
        const name = weekend.name || '';
        return name.includes(this.year);
    }

    dedupeWeekendVideos(weekends = []) {
        return (Array.isArray(weekends) ? weekends : []).map(weekend => {
            const seen = new Set();
            const videos = (weekend.videos || []).filter(video => {
                if (!video || !video.videoId) return false;
                if (seen.has(video.videoId)) return false;
                seen.add(video.videoId);
                return true;
            });
            return Object.assign({}, weekend, { videos });
        });
    }

    setupCountdown() {
        if (!this.timelineContainer) return;

        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        const existingCountdown = this.timelineContainer.querySelector('.countdown-section');
        if (existingCountdown) {
            existingCountdown.remove();
        }

        const nextSession = this.getNextSession();
        if (!nextSession) return;

        const countdownContainer = document.createElement('div');
        countdownContainer.className = 'countdown-section';
        countdownContainer.innerHTML = this.createCountdownHtml(nextSession);

        this.timelineContainer.insertBefore(countdownContainer, this.timelineContainer.firstChild);

        this.updateCountdownDisplay(nextSession);
        this.countdownInterval = setInterval(() => {
            this.updateCountdownDisplay(nextSession);
        }, 1000);

        this.captureAnalytics('countdown_started', {
            year: this.year,
            session_name: nextSession.title,
            session_time: nextSession.publishedAt
        });
    }

    getNextSession() {
        const now = Date.now();
        const allSessions = [];

        this.calendarWeekends.forEach(gp => {
            (gp.sessions || []).forEach(session => {
                const sessionDate = Date.parse(session.publishedAt);
                if (sessionDate > now && !Number.isNaN(sessionDate)) {
                    allSessions.push({
                        ...session,
                        gpName: gp.name
                    });
                }
            });
        });

        allSessions.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));

        return allSessions[0] || null;
    }

    createCountdownHtml(session) {
        const sessionType = this.escapeHtml(this.getSessionTypeLabel(session.title));
        return `
            <div class="countdown-card">
                <p class="countdown-kicker">2026 Season</p>
                <p class="countdown-label">Next Session</p>
                <div class="countdown-timer" id="countdownTimer">Loading...</div>
                <p class="countdown-session-name">
                    <span class="session-type">${sessionType}</span> • ${this.escapeHtml(session.gpName)}
                </p>
            </div>
        `;
    }

    updateCountdownDisplay(session) {
        const timerEl = document.getElementById('countdownTimer');
        if (!timerEl) return;

        const now = Date.now();
        const sessionTime = Date.parse(session.publishedAt);
        const diff = sessionTime - now;

        if (diff <= 0) {
            timerEl.innerHTML = 'NOW';
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        let timerHtml = '';
        if (days > 0) {
            timerHtml += `${days}d `;
        }
        if (hours > 0 || days > 0) {
            timerHtml += `${hours}h `;
        }
        if (minutes > 0 || hours > 0 || days > 0) {
            timerHtml += `${minutes}m `;
        }
        timerHtml += `${seconds}s`;

        timerEl.textContent = timerHtml;

        const urgency = days < 1 ? 'urgent' : days < 7 ? 'warning' : 'safe';
        timerEl.className = `countdown-timer ${urgency}`;
    }

    renderAllItems() {
        if (!this.timelineContainer) return;

        this.mergedWeekends.forEach(weekend => {
            const item = this.createTimelineItem(weekend);
            this.timelineContainer.appendChild(item);
        });

        this.displayedCount = this.mergedWeekends.length;
        this.hasMore = false;
    }

    renderBatch() {
        if (!this.timelineContainer || this.isLoading || !this.hasMore) return;

        this.isLoading = true;
        if (this.loadMoreSpinner) {
            this.loadMoreSpinner.style.display = 'block';
        }

        setTimeout(() => {
            const batch = this.mergedWeekends.slice(this.displayedCount, this.displayedCount + this.itemsPerPage);
            batch.forEach(weekend => {
                const item = this.createTimelineItem(weekend);
                this.timelineContainer.appendChild(item);
            });

            this.displayedCount += batch.length;
            this.hasMore = this.displayedCount < this.mergedWeekends.length;
            this.isLoading = false;

            if (this.loadMoreSpinner) {
                this.loadMoreSpinner.style.display = 'none';
            }

            this.setupDrawer();

            this.captureAnalytics('calendar_batch_rendered', {
                year: this.year,
                displayed_count: this.displayedCount,
                batch_size: batch.length
            });
        }, 300);
    }

    createTimelineItem(weekend) {
        const div = document.createElement('div');
        const isCompleted = !weekend.upcoming;
        div.className = `timeline-item ${isCompleted ? 'completed' : 'upcoming'}`;

        const date = this.formatDate(weekend.startDate);
        const badgeClass = isCompleted ? 'completed' : 'upcoming';
        const badgeText = isCompleted ? 'Completed' : 'Coming Soon';
        const videoCount = isCompleted && weekend.videos.length > 0 ? weekend.videos.length : 0;

        const videosHtml = isCompleted && weekend.videos.length > 0
            ? weekend.videos.map(video => this.createVideoCard(video, weekend)).join('')
            : '<div class="timeline-no-videos"><div class="timeline-no-videos-icon">🎥</div><p>Highlights coming soon</p></div>';

        // Use collapsible details/summary for archive view
        if (this.dataSource === 'archive') {
            div.innerHTML = `
                <details class="timeline-details">
                    <summary class="timeline-header timeline-summary">
                        <span class="timeline-summary-content">
                            <h3 class="timeline-title">${this.escapeHtml(weekend.name)}</h3>
                            <span class="timeline-date">${date}</span>
                            <span class="timeline-badge ${badgeClass}">${badgeText}</span>
                            ${videoCount > 0 ? `<span class="timeline-video-count">${videoCount} video${videoCount !== 1 ? 's' : ''}</span>` : ''}
                        </span>
                        <span class="timeline-chevron" aria-hidden="true"></span>
                    </summary>
                    <div class="timeline-content">
                        <div class="timeline-videos">
                            ${videosHtml}
                        </div>
                    </div>
                </details>
            `;
        } else {
            div.innerHTML = `
                <div class="timeline-header">
                    <h3 class="timeline-title">${this.escapeHtml(weekend.name)}</h3>
                    <span class="timeline-date">${date}</span>
                    <span class="timeline-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="timeline-content">
                    <div class="timeline-videos">
                        ${videosHtml}
                    </div>
                </div>
            `;
        }

        return div;
    }

    createVideoCard(video, weekend) {
        const videoType = this.getVideoType(video.title || '');
        const formattedDate = this.formatDate(video.publishedAt);
        const videoUrl = this.getVideoUrl(video.videoId);
        const sessionClass = videoType.toLowerCase().replace(/\s+/g, '-');

        return `
            <div class="video-card">
                <div class="video-thumbnail-container drawer-trigger"
                    role="button"
                    tabindex="0"
                    aria-label="Play ${this.escapeAttribute(video.title || 'video')}"
                    data-video-id="${video.videoId}"
                    data-video-url="${this.escapeAttribute(videoUrl)}"
                    data-grand-prix="${this.escapeAttribute(weekend.name)}"
                    data-video-title="${this.escapeAttribute(video.title)}"
                    data-session-type="${videoType}">
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
                        <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="watch-button">
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

        if (titleLower.includes('fp1')) return 'FP1';
        if (titleLower.includes('fp2')) return 'FP2';
        if (titleLower.includes('fp3')) return 'FP3';
        if (titleLower.includes('sprint') && (titleLower.includes('qualifying') || titleLower.includes('quali'))) return 'Sprint Quali';
        if (titleLower.includes('shootout')) return 'Sprint Quali';
        if (titleLower.includes('sprint')) return 'Sprint';
        if (titleLower.includes('race') && (titleLower.includes('qualifying') || titleLower.includes('quali'))) return 'Race Quali';
        if (titleLower.includes('qualifying') || titleLower.includes('quali')) return 'Qualifying';
        if ((titleLower.includes('race') || titleLower.includes('grand prix')) && !titleLower.includes('practice')) return 'Race';

        return 'Other';
    }

    formatDate(dateString) {
        if (!dateString) return 'Date unavailable';

        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return 'Date unavailable';

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

    formatShortDate(dateString) {
        if (!dateString) return 'Date';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return 'Date';

        const options = { year: 'numeric', month: 'short', day: 'numeric', timeZone: this.userTimeZone };
        return date.toLocaleDateString('en-US', options);
    }

    formatEndDate(startDate) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + 2);
        const options = { month: 'short', day: 'numeric', timeZone: this.userTimeZone };
        return date.toLocaleDateString('en-US', options);
    }

    getUserTimeZone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (_) {
            return null;
        }
    }

    getVideoUrl(videoId) {
        if (!videoId) return '';
        return `https://youtube.com/watch?v=${videoId}`;
    }

    updateLastUpdated(timestamp) {
        if (!this.lastUpdated || !timestamp) return;
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return;

        const options = {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };
        if (this.userTimeZone) {
            options.timeZone = this.userTimeZone;
        }

        const formatted = new Intl.DateTimeFormat('en-GB', options).format(date);
        this.lastUpdated.textContent = `Updated: ${formatted}`;
    }

    hideLoading() {
        if (this.loading) {
            this.loading.style.display = 'none';
        }
        if (this.calendarContainer) {
            this.calendarContainer.style.display = 'block';
        }
    }

    showError() {
        if (this.loading) {
            this.loading.style.display = 'none';
        }
        if (this.error) {
            this.error.style.display = 'block';
        }
    }

    setupInfiniteScroll() {
        if (!this.timelineContainer) return;

        const trigger = document.querySelector('.load-more-trigger');
        if (!trigger) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && this.hasMore && !this.isLoading) {
                    this.renderBatch();
                }
            });
        }, {
            rootMargin: '100px',
            threshold: 0.1
        });

        observer.observe(trigger);
    }

    setupDrawer() {
        const drawer = document.getElementById('videoDrawer');
        const drawerContent = document.getElementById('drawerContent');

        if (!drawer || !drawerContent) return;

        // Handle traditional drawer triggers
        const thumbnails = this.timelineContainer?.querySelectorAll('.drawer-trigger');
        if (thumbnails) {
            thumbnails.forEach(thumbnail => {
                if (this.drawerThumbs.has(thumbnail)) {
                    return;
                }
                this.drawerThumbs.add(thumbnail);
                thumbnail.addEventListener('click', () => this.openDrawer(thumbnail, drawer, drawerContent));
                thumbnail.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        thumbnail.click();
                    }
                });
            });
        }

        // Handle session chips in unified view - inline expansion
        const sessionChips = document.querySelectorAll('.session-chip.has-video');
        sessionChips.forEach(chip => {
            if (this.drawerThumbs.has(chip)) {
                return;
            }
            this.drawerThumbs.add(chip);
            chip.addEventListener('click', () => this.expandInlineVideo(chip));
            chip.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    chip.click();
                }
            });
        });

        if (this.drawerInitialized) {
            return;
        }
        this.drawerInitialized = true;

        const closeDrawer = () => {
            drawer.setAttribute('aria-hidden', 'true');
            drawer.classList.remove('open');
        };

        const backdrop = drawer.querySelector('.drawer-backdrop');
        const closeBtn = drawer.querySelector('.drawer-close');

        if (backdrop) {
            backdrop.addEventListener('click', () => closeDrawer());
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', () => closeDrawer());
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeDrawer();
            }
        });
    }

    openDrawer(thumbnail, drawer, drawerContent) {
        const videoId = thumbnail.getAttribute('data-video-id');
        const videoUrl = thumbnail.getAttribute('data-video-url') || '';
        const grandPrix = thumbnail.getAttribute('data-grand-prix') || '';
        const videoTitle = thumbnail.getAttribute('data-video-title') || '';
        const sessionType = thumbnail.getAttribute('data-session-type') || '';

        const thumbnailEl = thumbnail.querySelector('.video-thumbnail');
        const thumbnailBg = thumbnailEl ? thumbnailEl.style.backgroundImage : '';
        const thumbnailUrl = thumbnailBg.replace(/^url\(['"]?(.+?)['"]?\)$/, '$1');
        const safeThumb = thumbnailUrl && /^https?:\/\//i.test(thumbnailUrl) ? thumbnailUrl : '';

        const publishedDateEl = thumbnail.parentElement.querySelector('.video-date');
        const publishedDate = publishedDateEl ? publishedDateEl.textContent : '';

        drawerContent.innerHTML = '';

        const media = document.createElement('div');
        media.className = 'drawer-media';
        if (safeThumb) {
            media.style.backgroundImage = `url('${safeThumb}')`;
        }

        const meta = document.createElement('div');
        meta.className = 'drawer-meta';

        const sessionP = document.createElement('p');
        sessionP.className = 'drawer-session';
        sessionP.textContent = sessionType;

        const titleH3 = document.createElement('h3');
        titleH3.className = 'drawer-title';
        titleH3.textContent = videoTitle;

        const dateP = document.createElement('p');
        dateP.className = 'drawer-date';
        dateP.textContent = publishedDate;

        const gpP = document.createElement('p');
        gpP.className = 'drawer-gp';
        gpP.textContent = grandPrix;

        const actions = document.createElement('div');
        actions.className = 'drawer-actions';

        const watchLink = document.createElement('a');
        watchLink.className = 'watch-button';
        watchLink.href = videoUrl;
        watchLink.target = '_blank';
        watchLink.rel = 'noopener noreferrer';
        watchLink.textContent = 'Watch on YouTube';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'secondary-button';
        closeBtn.type = 'button';
        closeBtn.setAttribute('data-drawer-close', '');
        closeBtn.textContent = 'Close';

        actions.appendChild(watchLink);
        actions.appendChild(closeBtn);

        meta.appendChild(sessionP);
        meta.appendChild(titleH3);
        meta.appendChild(dateP);
        meta.appendChild(gpP);
        meta.appendChild(actions);

        drawerContent.appendChild(media);
        drawerContent.appendChild(meta);

        drawer.setAttribute('aria-hidden', 'false');
        drawer.classList.add('open');

        closeBtn.addEventListener('click', () => {
            drawer.setAttribute('aria-hidden', 'true');
            drawer.classList.remove('open');
        }, { once: true });

        this.captureAnalytics('calendar_video_drawer_opened', {
            year: this.year,
            video_id: videoId,
            grand_prix: grandPrix
        });
    }

    expandInlineVideo(chip) {
        const videoId = chip.getAttribute('data-video-id');
        const videoUrl = chip.getAttribute('data-video-url') || '';
        const grandPrix = chip.getAttribute('data-grand-prix') || '';
        const videoTitle = chip.getAttribute('data-video-title') || '';
        const sessionType = chip.getAttribute('data-session-type') || '';
        const thumbnailUrl = chip.getAttribute('data-thumbnail') || '';

        // Find the parent GP card
        const gpCard = chip.closest('.gp-card');
        if (!gpCard) return;

        const expandContainer = gpCard.querySelector('.inline-video-expand');
        if (!expandContainer) return;

        // If clicking the same chip, collapse
        const isOpen = expandContainer.classList.contains('show');
        const currentVideoId = expandContainer.getAttribute('data-current-video');

        if (isOpen && currentVideoId === videoId) {
            // Collapse
            expandContainer.classList.remove('show');
            expandContainer.setAttribute('aria-hidden', 'true');
            chip.classList.remove('active');
            setTimeout(() => {
                expandContainer.innerHTML = '';
            }, 300);
            return;
        }

        // Close any other open expands on the page
        document.querySelectorAll('.inline-video-expand.show').forEach(el => {
            el.classList.remove('show');
            el.setAttribute('aria-hidden', 'true');
            setTimeout(() => { el.innerHTML = ''; }, 300);
        });
        document.querySelectorAll('.session-chip.active').forEach(c => c.classList.remove('active'));

        // Mark this chip as active
        chip.classList.add('active');
        expandContainer.setAttribute('data-current-video', videoId);

        // Build the inline video content
        expandContainer.innerHTML = `
            <div class="inline-video-content">
                <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="inline-video-thumb" style="background-image: url('${thumbnailUrl}')">
                    <div class="play-overlay">
                        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                            <circle cx="32" cy="32" r="32" fill="rgba(0,0,0,0.7)"/>
                            <path d="M26 20L46 32L26 44V20Z" fill="white"/>
                        </svg>
                    </div>
                </a>
                <div class="inline-video-info">
                    <span class="inline-video-session">${sessionType}</span>
                    <h4 class="inline-video-title">${this.escapeHtml(videoTitle)}</h4>
                    <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="inline-watch-btn">
                        ▶ Watch on YouTube
                    </a>
                </div>
            </div>
        `;

        // Show with animation
        expandContainer.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => {
            expandContainer.classList.add('show');
        });

        this.captureAnalytics('inline_video_expanded', {
            year: this.year,
            video_id: videoId,
            session_type: sessionType,
            grand_prix: grandPrix
        });
    }

    openChipDrawer(chip, drawer, drawerContent) {
        const videoId = chip.getAttribute('data-video-id');
        const videoUrl = chip.getAttribute('data-video-url') || '';
        const grandPrix = chip.getAttribute('data-grand-prix') || '';
        const videoTitle = chip.getAttribute('data-video-title') || '';
        const sessionType = chip.getAttribute('data-session-type') || '';
        const thumbnailUrl = chip.getAttribute('data-thumbnail') || '';

        drawerContent.innerHTML = '';

        const media = document.createElement('div');
        media.className = 'drawer-media';
        if (thumbnailUrl) {
            media.style.backgroundImage = `url('${thumbnailUrl}')`;
        }

        const meta = document.createElement('div');
        meta.className = 'drawer-meta';

        const sessionP = document.createElement('p');
        sessionP.className = 'drawer-session';
        sessionP.textContent = sessionType;

        const titleH3 = document.createElement('h3');
        titleH3.className = 'drawer-title';
        titleH3.textContent = videoTitle;

        const gpP = document.createElement('p');
        gpP.className = 'drawer-gp';
        gpP.textContent = grandPrix;

        const actions = document.createElement('div');
        actions.className = 'drawer-actions';

        const watchLink = document.createElement('a');
        watchLink.className = 'watch-button';
        watchLink.href = videoUrl;
        watchLink.target = '_blank';
        watchLink.rel = 'noopener noreferrer';
        watchLink.textContent = 'Watch on YouTube';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'secondary-button';
        closeBtn.type = 'button';
        closeBtn.textContent = 'Close';

        actions.appendChild(watchLink);
        actions.appendChild(closeBtn);

        meta.appendChild(sessionP);
        meta.appendChild(titleH3);
        meta.appendChild(gpP);
        meta.appendChild(actions);

        drawerContent.appendChild(media);
        drawerContent.appendChild(meta);

        drawer.setAttribute('aria-hidden', 'false');
        drawer.classList.add('open');

        closeBtn.addEventListener('click', () => {
            drawer.setAttribute('aria-hidden', 'true');
            drawer.classList.remove('open');
        }, { once: true });

        this.captureAnalytics('unified_video_chip_clicked', {
            year: this.year,
            video_id: videoId,
            session_type: sessionType,
            grand_prix: grandPrix
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeAttribute(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    destroy() {
        // Clear all intervals
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        // Remove event listeners
        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.visibilityHandler = null;
        }
        if (this.beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        }

        // Clean up notification manager
        if (this.notificationManager && typeof this.notificationManager.destroy === 'function') {
            this.notificationManager.destroy();
            this.notificationManager = null;
        }
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
}

document.addEventListener('DOMContentLoaded', () => {
    new F1Calendar();
});
