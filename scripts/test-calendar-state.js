const assert = require('node:assert/strict');

const {
    classifyWeekend,
    findMatchingVideoWeekend,
    grandPrixNamesMatch,
    sessionMatchesVideo
} = require('../public/assets/js/calendar-state.js');

const australiaWeekend = {
    name: 'Australian Grand Prix',
    startDate: '2026-03-06T01:30:00.000Z',
    sessions: [
        { title: 'FP1', publishedAt: '2026-03-06T01:30:00.000Z' },
        { title: 'FP2', publishedAt: '2026-03-06T05:00:00.000Z' },
        { title: 'FP3', publishedAt: '2026-03-07T01:30:00.000Z' },
        { title: 'Qualifying', publishedAt: '2026-03-07T05:00:00.000Z' },
        { title: 'Grand Prix', publishedAt: '2026-03-08T04:00:00.000Z' }
    ]
};

const chinaWeekend = {
    name: 'Chinese Grand Prix',
    startDate: '2026-03-13T03:30:00.000Z',
    sessions: [
        { title: 'FP1', publishedAt: '2026-03-13T03:30:00.000Z' }
    ]
};

const australiaVideos = {
    name: '2026 Australian Grand Prix',
    videos: [
        { videoId: 'ffRQyOpjydY', title: 'FP1 Highlights | 2026 Australian Grand Prix' },
        { videoId: 'PCSlAcvQjyo', title: 'FP2 Highlights | 2026 Australian Grand Prix' }
    ]
};

assert.equal(grandPrixNamesMatch('Australian Grand Prix', '2026 Australian Grand Prix', '2026'), true);
assert.equal(sessionMatchesVideo('FP1', 'FP1 Highlights | 2026 Australian Grand Prix'), true);
assert.equal(sessionMatchesVideo('Grand Prix', 'FP1 Highlights | 2026 Australian Grand Prix'), false);
assert.equal(
    findMatchingVideoWeekend(australiaWeekend, [australiaVideos], '2026')?.name,
    '2026 Australian Grand Prix'
);

const fridayDuringWeekend = Date.parse('2026-03-06T08:45:01.027Z');
assert.equal(
    classifyWeekend(australiaWeekend, australiaVideos, fridayDuringWeekend).status,
    'current',
    'Australian GP should remain current during Friday running'
);

assert.equal(
    classifyWeekend(chinaWeekend, null, fridayDuringWeekend).status,
    'upcoming',
    'Chinese GP should stay upcoming before its first session'
);

const mondayAfterRace = Date.parse('2026-03-09T12:30:00.000Z');
assert.equal(
    classifyWeekend(australiaWeekend, australiaVideos, mondayAfterRace).status,
    'completed',
    'Australian GP should move to completed after the weekend grace period'
);

console.log('calendar-state regression checks passed');
