(function () {
    const YEAR = '2026';
    const CALENDAR_URL = 'data/calendar2026.json';
    const VIDEOS_URL = 'data/videos.json';
    const state = window.F1CalendarState;
    const els = {};
    let countdownTimer = null;
    let season = [];
    let timeZone = 'UTC';

    const byId = (id) => document.getElementById(id);
    const text = (id, value) => { const el = byId(id); if (el) el.textContent = value; };
    const escapeHtml = (value) => {
        const div = document.createElement('div');
        div.textContent = String(value ?? '');
        return div.innerHTML;
    };
    const escapeAttribute = (value) => escapeHtml(value).replace(/"/g, '&quot;');

    function capture(eventName, properties = {}) {
        try {
            if (window.posthog?.capture) window.posthog.capture(eventName, properties);
        } catch (_) {
            // Analytics is non-blocking.
        }
    }

    function getSessionType(title = '') {
        if (state?.getCanonicalSessionType) {
            const canonical = state.getCanonicalSessionType(title);
            const labels = {
                fp1: 'FP1', fp2: 'FP2', fp3: 'FP3', sprint: 'Sprint',
                'sprint-qualifying': 'Sprint Quali', qualifying: 'Qualifying', race: 'Race'
            };
            return labels[canonical] || 'Session';
        }
        return title;
    }

    function shortRaceName(name = '') {
        return name.replace(/\s+Grand Prix$/i, '');
    }

    function splitRaceName(name = '') {
        const shortName = shortRaceName(name);
        return `${escapeHtml(shortName)} <span>Grand Prix</span>`;
    }

    function raceCode(name = '') {
        const codes = {
            Australian: 'AUS / MEL', Chinese: 'CHN / SHA', Japanese: 'JPN / SUZ',
            Bahrain: 'BHR / SAK', 'Saudi Arabian': 'KSA / JED', Miami: 'USA / MIA',
            Canadian: 'CAN / MTL', Monaco: 'MCO / MON', 'Barcelona-Catalunya': 'ESP / BCN',
            Austrian: 'AUT / SPI', British: 'GBR / SIL', Belgian: 'BEL / SPA',
            Hungarian: 'HUN / BUD', Dutch: 'NLD / ZAN', Italian: 'ITA / MNZ',
            Spanish: 'ESP / MAD', Azerbaijan: 'AZE / BAK', Singapore: 'SGP / SIN',
            'United States': 'USA / AUS', 'Mexico City': 'MEX / MEX', 'São Paulo': 'BRA / SAO',
            'Las Vegas': 'USA / LAS', Qatar: 'QAT / LUS', 'Abu Dhabi': 'UAE / YAS'
        };
        const key = Object.keys(codes).find((candidate) => name.includes(candidate));
        return key ? codes[key] : 'F1 / GP';
    }

    function formatDate(value, options) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Date TBC';
        return new Intl.DateTimeFormat('en', { timeZone, ...options }).format(date);
    }

    function dateRange(race) {
        const sessions = race.sessions || [];
        const start = sessions[0]?.publishedAt || race.startDate;
        const end = sessions[sessions.length - 1]?.publishedAt || race.startDate;
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 'Date TBC';
        const startMonth = formatDate(start, { month: 'short' });
        const endMonth = formatDate(end, { month: 'short' });
        const startYear = formatDate(start, { year: 'numeric' });
        const endYear = formatDate(end, { year: 'numeric' });
        const startDay = formatDate(start, { day: 'numeric' });
        const endDay = formatDate(end, { day: 'numeric' });
        if (startMonth === endMonth && startYear === endYear) {
            return `${startMonth} ${startDay}–${endDay}, ${endYear}`;
        }
        const startLabel = formatDate(start, { month: 'short', day: 'numeric', year: 'numeric' });
        const endLabel = formatDate(end, { month: 'short', day: 'numeric', year: 'numeric' });
        return `${startLabel}–${endLabel}`;
    }

    function sessionDateTime(value) {
        return formatDate(value, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function videoMatchesRace(race, videos) {
        if (state?.findMatchingVideoWeekend) return state.findMatchingVideoWeekend(race, videos, YEAR);
        return videos.find((weekend) => weekend.name.includes(shortRaceName(race.name))) || null;
    }

    function classifyRace(race, matchingVideos, now) {
        if (state?.classifyWeekend) return state.classifyWeekend(race, matchingVideos, now).status;
        return Date.parse(race.startDate) > now ? 'upcoming' : 'completed';
    }

    function mergeSeason(calendar, videos) {
        const now = Date.now();
        return calendar.map((race, index) => {
            const match = videoMatchesRace(race, videos);
            return {
                ...race,
                round: index + 1,
                videos: match?.videos || [],
                status: classifyRace(race, match, now)
            };
        });
    }

    function activeVideoIndex(videos) {
        const preferred = ['race', 'sprint', 'qualifying'];
        for (const type of preferred) {
            const index = videos.findIndex((video) => getSessionType(video.title).toLowerCase() === type);
            if (index >= 0) return index;
        }
        return 0;
    }

    function selectVideo(video, button) {
        document.querySelectorAll('#highlightTabs [role="tab"]').forEach((tab) => {
            const selected = tab === button;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
        });
        text('highlightTitle', video.title || 'Official Formula 1 highlight');
        text('highlightMeta', `${getSessionType(video.title)} · ${formatDate(video.publishedAt, { month: 'short', day: 'numeric' })}`);
        const link = byId('highlightLink');
        link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
        link.setAttribute('aria-label', `Watch ${getSessionType(video.title)} highlights on YouTube`);
        byId('highlightPanel').setAttribute('aria-labelledby', button.id);
        capture('pitwall_highlight_selected', { session_type: getSessionType(video.title) });
    }

    function renderPrevious(race) {
        byId('previousRaceTitle').innerHTML = splitRaceName(race.name);
        text('previousRound', `Round ${race.round}`);
        text('previousCode', raceCode(race.name));
        text('previousDates', dateRange(race));
        const videos = race.videos || [];
        text('highlightCount', `${String(videos.length).padStart(2, '0')} key highlight${videos.length === 1 ? '' : 's'}`);
        text('previousStatus', videos.length ? 'Recap available' : 'Weekend complete');

        const tabs = byId('highlightTabs');
        tabs.innerHTML = '';
        const panel = byId('highlightPanel');
        if (!videos.length) {
            panel.innerHTML = '<div><p class="highlight-label">Highlights pending</p><p class="highlight-title">Official videos will appear here when available.</p></div>';
            return;
        }

        const ordered = videos.slice().sort((a, b) => {
            const order = { Race: 0, Sprint: 1, Qualifying: 2, 'Sprint Quali': 3, FP1: 4, FP2: 5, FP3: 6 };
            return (order[getSessionType(a.title)] ?? 9) - (order[getSessionType(b.title)] ?? 9);
        });
        const selectedIndex = activeVideoIndex(ordered);
        ordered.forEach((video, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.id = `highlight-tab-${index}`;
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', String(index === selectedIndex));
            button.tabIndex = index === selectedIndex ? 0 : -1;
            button.textContent = getSessionType(video.title);
            button.addEventListener('click', () => selectVideo(video, button));
            button.addEventListener('keydown', (event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const buttons = Array.from(tabs.querySelectorAll('[role="tab"]'));
                const current = buttons.indexOf(button);
                let next = current;
                if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
                if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
                if (event.key === 'Home') next = 0;
                if (event.key === 'End') next = buttons.length - 1;
                buttons[next].click();
                buttons[next].focus();
            });
            tabs.appendChild(button);
        });
        selectVideo(ordered[selectedIndex], tabs.children[selectedIndex]);
    }

    function renderUpcoming(race) {
        byId('nextRaceTitle').innerHTML = splitRaceName(race.name);
        text('nextRound', `Round ${race.round}`);
        text('nextRaceDate', `${dateRange(race)} · ${shortRaceName(race.name)}`);
        const now = Date.now();
        const nextSession = race.sessions.find((session) => Date.parse(session.publishedAt) > now) || null;
        const list = byId('nextSchedule');
        list.innerHTML = race.sessions.map((session) => {
            const upcoming = nextSession && session.publishedAt === nextSession.publishedAt;
            return `<li class="${upcoming ? 'is-next' : ''}">
                <span class="day">${escapeHtml(formatDate(session.publishedAt, { weekday: 'short', day: 'numeric' }))}</span>
                <span class="session">${escapeHtml(getSessionType(session.title))}</span>
                <time datetime="${escapeAttribute(session.publishedAt)}">${escapeHtml(formatDate(session.publishedAt, { hour: '2-digit', minute: '2-digit' }))}</time>
            </li>`;
        }).join('');
        startCountdown(race);
    }

    function startCountdown(race) {
        if (countdownTimer) window.clearInterval(countdownTimer);
        const update = () => {
            const now = Date.now();
            const nextSession = race.sessions.find((session) => Date.parse(session.publishedAt) > now);
            if (!nextSession) {
                byId('countdown').innerHTML = '<span class="live-now">Weekend live</span>';
                text('countdownSession', 'Race control');
                return;
            }
            text('countdownSession', `Until ${getSessionType(nextSession.title)}`);
            const difference = Date.parse(nextSession.publishedAt) - now;
            const days = Math.floor(difference / 86400000);
            const hours = Math.floor((difference % 86400000) / 3600000);
            const minutes = Math.floor((difference % 3600000) / 60000);
            const seconds = Math.floor((difference % 60000) / 1000);
            const units = days > 0
                ? [[days, 'D'], [hours, 'H'], [minutes, 'M']]
                : [[hours, 'H'], [minutes, 'M'], [seconds, 'S']];
            byId('countdown').innerHTML = units.map(([value, label]) =>
                `<span>${String(value).padStart(2, '0')}</span><small>${label}</small>`
            ).join('');
            byId('countdown').setAttribute('aria-label', `${days} days, ${hours} hours, ${minutes} minutes until ${getSessionType(nextSession.title)}`);
        };
        update();
        countdownTimer = window.setInterval(update, 1000);
    }

    function renderFollowing(races) {
        byId('followingRaceCards').innerHTML = races.map((race) =>
            `<a class="next-race" href="#race-${race.round}">
                <span class="date">${escapeHtml(dateRange(race))} · R${race.round}</span>
                <strong>${escapeHtml(shortRaceName(race.name))} GP</strong>
            </a>`
        ).join('');
        byId('followingRaces').hidden = races.length === 0;
    }

    function renderCalendar(nextRace) {
        byId('calendarList').innerHTML = season.map((race) => {
            const status = race === nextRace ? 'next' : race.status;
            const action = state?.getCalendarRaceAction
                ? state.getCalendarRaceAction(race, race === nextRace)
                : { href: status === 'next' ? '#raceDashboard' : null, label: status === 'next' ? 'Next up' : 'Upcoming', description: 'race information' };
            const content = `
                <span class="race-number">R${String(race.round).padStart(2, '0')}</span>
                <span><h3>${escapeHtml(shortRaceName(race.name))}</h3><p>${escapeHtml(dateRange(race))}</p></span>
                <span class="race-state">${escapeHtml(action.label)}</span>`;
            if (!action.href) {
                return `<div class="calendar-race is-${status} is-static" id="race-${race.round}">${content}</div>`;
            }

            const ariaLabel = `${race.name}, round ${race.round}, ${action.description}`;
            const externalAttributes = action.external ? ' target="_blank" rel="noopener noreferrer"' : '';
            return `<a class="calendar-race is-${status}" id="race-${race.round}" href="${escapeAttribute(action.href)}" aria-label="${escapeAttribute(ariaLabel)}"${externalAttributes}>${content}</a>`;
        }).join('');
        byId('season-calendar').hidden = false;
    }

    function renderProgress(nextRace) {
        const completed = season.filter((race) => race.status === 'completed').length;
        const current = season.filter((race) => race.status === 'current').length;
        const progress = completed + current;
        const percentage = season.length ? Math.round((progress / season.length) * 100) : 0;
        text('progressValue', `${progress} / ${season.length}`);
        text('championshipDistance', `${percentage}% complete`);
        byId('progressFill').style.width = `${percentage}%`;
        byId('seasonProgress').setAttribute('aria-label', `Season progress: ${progress} of ${season.length} rounds`);
        byId('headerSeason').querySelector('strong').textContent = `${progress} / ${season.length}`;
        byId('headerSeason').setAttribute('aria-label', `Season progress: ${progress} of ${season.length} rounds`);
        if (nextRace) text('feedStatus', `Season feed synced · R${nextRace.round} queued`);
    }

    function renderLastUpdated(value) {
        if (!value) return;
        text('lastUpdated', `Feed updated ${formatDate(value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
    }

    async function load() {
        byId('loadingPanel').hidden = false;
        byId('errorPanel').hidden = true;
        byId('raceDashboard').hidden = true;
        try {
            const [calendarResponse, videoResponse] = await Promise.all([
                fetch(CALENDAR_URL, { cache: 'no-cache' }),
                fetch(VIDEOS_URL, { cache: 'no-cache' })
            ]);
            if (!calendarResponse.ok || !videoResponse.ok) throw new Error('Season feed unavailable');
            const [calendar, videoData] = await Promise.all([calendarResponse.json(), videoResponse.json()]);
            season = mergeSeason(Array.isArray(calendar) ? calendar : [], videoData.grandPrixWeekends || []);
            if (!season.length) throw new Error('Season feed empty');

            const completed = season.filter((race) => race.status === 'completed');
            const current = season.filter((race) => race.status === 'current');
            const upcoming = season.filter((race) => race.status === 'upcoming');
            const previous = [...completed].reverse().find((race) => race.videos.length) || completed.at(-1) || current[0] || season[0];
            const nextRace = current[0] || upcoming[0] || null;

            renderPrevious(previous);
            if (nextRace) {
                renderUpcoming(nextRace);
                const following = season.filter((race) => race.round > nextRace.round).slice(0, 2);
                renderFollowing(following);
            } else {
                byId('nextRaceTitle').innerHTML = '<span>Season Complete</span>';
                text('nextRaceDate', 'Every 2026 recap is ready below.');
                text('countdownSession', 'Final flag');
                byId('countdown').innerHTML = '<span class="live-now">24 / 24</span>';
                byId('nextSchedule').innerHTML = '';
            }
            renderProgress(nextRace);
            renderCalendar(nextRace);
            renderLastUpdated(videoData.lastUpdated);
            byId('loadingPanel').hidden = true;
            byId('raceDashboard').hidden = false;
            text('timezoneLabel', timeZone);
            byId('liveStatus').textContent = `Loaded ${previous.name} recap and ${nextRace ? `${nextRace.name} schedule` : 'the complete season'}.`;
            capture('pitwall_home_loaded', { previous_race: previous.name, next_race: nextRace?.name || null });
        } catch (error) {
            console.error('Pit Wall home failed to load:', error);
            byId('loadingPanel').hidden = true;
            byId('errorPanel').hidden = false;
            text('feedStatus', 'Season feed offline');
            capture('pitwall_home_failed', { message: error.message });
        }
    }

    function setupNavigation() {
        const button = document.querySelector('.menu-button');
        const nav = byId('primary-navigation');
        button.addEventListener('click', () => {
            const open = button.getAttribute('aria-expanded') === 'true';
            button.setAttribute('aria-expanded', String(!open));
            button.setAttribute('aria-label', open ? 'Open navigation' : 'Close navigation');
            nav.classList.toggle('open', !open);
        });
        nav.addEventListener('click', () => {
            button.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-label', 'Open navigation');
            nav.classList.remove('open');
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && nav.classList.contains('open')) {
                button.click();
                button.focus();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        try {
            timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        } catch (_) {
            timeZone = 'UTC';
        }
        setupNavigation();
        byId('retryButton').addEventListener('click', load);
        load();
    });

    window.addEventListener('beforeunload', () => {
        if (countdownTimer) window.clearInterval(countdownTimer);
    });
})();
