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
        
        this.calendarWeekends = [];
        this.videoWeekends = [];
        this.mergedWeekends = [];
        this.displayedCount = 0;
        this.itemsPerPage = 6;
        this.userTimeZone = this.getUserTimeZone();
        this.hasMore = true;
        this.isLoading = false;
        this.countdownInterval = null;
        this.drawerInitialized = false;
        this.drawerThumbs = new WeakSet();
        
        this.init();
    }
    
    async init() {
        try {
            await Promise.all([this.loadCalendar(), this.loadVideos()]);
            this.mergeAndSort();
            
            if (this.viewMode === 'list') {
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
        } catch (error) {
            console.error('Failed to load calendar:', error);
            this.showError();
            this.captureAnalytics('calendar_error', { year: this.year, error: error.message });
        }
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
            
            const merged = {
                name: calendarGP.name,
                startDate: calendarGP.startDate,
                sessions: calendarGP.sessions || [],
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
        
        completedGps.sort((a, b) => Date.parse(b.startDate) - Date.parse(a.startDate));
        upcomingGps.sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));
        
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
        
        const thumbnails = this.timelineContainer?.querySelectorAll('.drawer-trigger');
        if (!thumbnails) return;
        
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
