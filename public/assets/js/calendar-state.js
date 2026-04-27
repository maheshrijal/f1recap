(function (globalScope) {
    const CURRENT_WEEKEND_GRACE_MS = 6 * 60 * 60 * 1000;

    function parseTimestamp(value) {
        const timestamp = Date.parse(value || '');
        return Number.isNaN(timestamp) ? null : timestamp;
    }

    function getSessionTimestamp(session, fallbackDate) {
        if (session && typeof session === 'object') {
            return parseTimestamp(session.publishedAt || session.startDate || fallbackDate);
        }
        return parseTimestamp(fallbackDate);
    }

    function normalizeGrandPrixName(name, year) {
        let normalized = String(name || '');
        if (!normalized) return '';

        if (typeof normalized.normalize === 'function') {
            normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }

        normalized = normalized.toLowerCase();

        if (year) {
            normalized = normalized.replace(new RegExp(`\\b${year}\\b`, 'g'), ' ');
        }

        return normalized
            .replace(/\bformula\s*1\b/g, ' ')
            .replace(/\bgrand\s+prix\b/g, ' ')
            .replace(/\bgp\b/g, ' ')
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function grandPrixNamesMatch(left, right, year) {
        const leftName = normalizeGrandPrixName(left, year);
        const rightName = normalizeGrandPrixName(right, year);

        if (!leftName || !rightName) return false;
        if (leftName === rightName) return true;
        if (leftName.includes(rightName) || rightName.includes(leftName)) return true;

        const leftTokens = leftName.split(' ');
        const rightTokens = rightName.split(' ');
        const smaller = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
        const larger = new Set(leftTokens.length <= rightTokens.length ? rightTokens : leftTokens);

        return smaller.length > 0 && smaller.every(token => larger.has(token));
    }

    function getCanonicalSessionType(title) {
        const normalizedTitle = String(title || '').toLowerCase();

        if (normalizedTitle.includes('fp1')) return 'fp1';
        if (normalizedTitle.includes('fp2')) return 'fp2';
        if (normalizedTitle.includes('fp3')) return 'fp3';
        if (normalizedTitle.includes('shootout')) return 'sprint-qualifying';
        if (normalizedTitle.includes('sprint') && (normalizedTitle.includes('qualifying') || normalizedTitle.includes('quali'))) {
            return 'sprint-qualifying';
        }
        if (normalizedTitle.includes('sprint') && !normalizedTitle.includes('quali')) return 'sprint';
        if (normalizedTitle.includes('qualifying') || normalizedTitle.includes('quali')) return 'qualifying';
        if (normalizedTitle.includes('race')) return 'race';
        if (normalizedTitle.includes('grand prix') && !normalizedTitle.includes('practice')) return 'race';

        return 'other';
    }

    function sessionMatchesVideo(sessionTitle, videoTitle) {
        const sessionType = getCanonicalSessionType(sessionTitle);
        const videoType = getCanonicalSessionType(videoTitle);
        return sessionType !== 'other' && sessionType === videoType;
    }

    function findMatchingVideoWeekend(calendarWeekend, videoWeekends, year) {
        const safeVideoWeekends = Array.isArray(videoWeekends) ? videoWeekends : [];
        return safeVideoWeekends.find((videoWeekend) => (
            grandPrixNamesMatch(calendarWeekend?.name, videoWeekend?.name, year)
        )) || null;
    }

    function getWeekendBounds(weekend, graceMs = CURRENT_WEEKEND_GRACE_MS) {
        const safeWeekend = weekend && typeof weekend === 'object' ? weekend : {};
        const safeSessions = Array.isArray(safeWeekend.sessions) ? safeWeekend.sessions : [];
        const sessionTimestamps = safeSessions
            .map((session) => getSessionTimestamp(session, safeWeekend.startDate))
            .filter((timestamp) => Number.isFinite(timestamp));

        const fallbackStart = parseTimestamp(safeWeekend.startDate);
        const startMs = sessionTimestamps.length ? Math.min(...sessionTimestamps) : fallbackStart;
        const lastSessionMs = sessionTimestamps.length ? Math.max(...sessionTimestamps) : fallbackStart;
        const endMs = Number.isFinite(lastSessionMs) ? lastSessionMs + graceMs : null;

        return { startMs, lastSessionMs, endMs };
    }

    function classifyWeekend(calendarWeekend, matchingVideos, now = Date.now(), graceMs = CURRENT_WEEKEND_GRACE_MS) {
        const { startMs, lastSessionMs, endMs } = getWeekendBounds(calendarWeekend, graceMs);
        const hasVideos = Boolean(matchingVideos && Array.isArray(matchingVideos.videos) && matchingVideos.videos.length > 0);

        let status = 'upcoming';
        if (Number.isFinite(startMs) && now < startMs) {
            status = 'upcoming';
        } else if (Number.isFinite(endMs) && now <= endMs) {
            status = 'current';
        } else if (Number.isFinite(startMs) && now >= startMs) {
            status = 'completed';
        }

        return { status, hasVideos, startMs, lastSessionMs, endMs };
    }

    function orderWeekendsByStart(weekends, direction = 'asc') {
        const multiplier = direction === 'desc' ? -1 : 1;
        return (Array.isArray(weekends) ? weekends : [])
            .slice()
            .sort((left, right) => {
                const leftTime = parseTimestamp(left?.startDate) ?? 0;
                const rightTime = parseTimestamp(right?.startDate) ?? 0;
                return (leftTime - rightTime) * multiplier;
            });
    }

    function buildHomepageSections({ year = '', currentWeekends = [], upcomingWeekends = [], completedWeekends = [] } = {}) {
        const orderedCompleted = orderWeekendsByStart(completedWeekends, 'asc');
        const orderedCurrent = orderWeekendsByStart(currentWeekends, 'asc');
        const orderedUpcoming = orderWeekendsByStart(upcomingWeekends, 'asc');
        const visibleWeekends = [...orderedCompleted, ...orderedCurrent, ...orderedUpcoming];
        const nextWeekend = orderedCurrent[0] || orderedUpcoming[0] || null;
        const hasWeekends = visibleWeekends.length > 0;

        return {
            visibleWeekends,
            nextWeekend,
            showRaceSection: hasWeekends,
            showOffSeasonState: !hasWeekends,
            isSeasonComplete: !nextWeekend && orderedCompleted.length > 0,
            sectionTitle: year ? `${year} Grand Prix` : 'Grand Prix'
        };
    }

    const api = {
        buildHomepageSections,
        CURRENT_WEEKEND_GRACE_MS,
        classifyWeekend,
        findMatchingVideoWeekend,
        getCanonicalSessionType,
        getWeekendBounds,
        grandPrixNamesMatch,
        normalizeGrandPrixName,
        orderWeekendsByStart,
        parseTimestamp,
        sessionMatchesVideo
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    globalScope.F1CalendarState = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
