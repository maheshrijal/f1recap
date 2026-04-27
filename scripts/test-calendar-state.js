const assert = require('node:assert/strict');

const {
    buildHomepageSections,
    classifyWeekend,
    findMatchingVideoWeekend,
    grandPrixNamesMatch,
    orderWeekendsByStart,
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

const homepageWithCompletedOnly = buildHomepageSections({
    completedWeekends: [australiaWeekend]
});
assert.equal(
    homepageWithCompletedOnly.showRaceSection,
    true,
    'Homepage should still render race cards after a race weekend ends'
);
assert.equal(
    homepageWithCompletedOnly.showOffSeasonState,
    false,
    'Completed highlights should suppress the pre-season empty state'
);
assert.equal(
    homepageWithCompletedOnly.visibleWeekends[0]?.name,
    'Australian Grand Prix',
    'Completed weekend should remain visible on the homepage'
);
assert.equal(
    homepageWithCompletedOnly.nextWeekend,
    null,
    'Completed-only homepage should not report a next weekend'
);

const preSeasonHomepage = buildHomepageSections();
assert.equal(preSeasonHomepage.showRaceSection, false, 'Pre-season should not render race cards without races');
assert.equal(preSeasonHomepage.showOffSeasonState, true, 'Pre-season should show the off-season state');

const inSeasonHomepage = buildHomepageSections({
    currentWeekends: [australiaWeekend],
    upcomingWeekends: [chinaWeekend]
});
assert.equal(inSeasonHomepage.showRaceSection, true, 'In-season should render race cards');
assert.equal(inSeasonHomepage.showOffSeasonState, false, 'In-season should hide the off-season state');
assert.equal(
    inSeasonHomepage.nextWeekend?.name,
    'Australian Grand Prix',
    'A live weekend should be the auto-scroll target'
);

const seasonCompleteHomepage = buildHomepageSections({
    completedWeekends: [chinaWeekend, australiaWeekend]
});
assert.equal(seasonCompleteHomepage.showRaceSection, true, 'Post-season should keep completed highlights visible');
assert.equal(seasonCompleteHomepage.showOffSeasonState, false, 'Post-season should not fall back to the pre-season state');
assert.deepEqual(
    seasonCompleteHomepage.visibleWeekends.map((weekend) => weekend.name),
    ['Australian Grand Prix', 'Chinese Grand Prix'],
    'Homepage should preserve season order for completed races'
);

const orderedCompleted = orderWeekendsByStart([chinaWeekend, australiaWeekend], 'asc');
assert.deepEqual(
    orderedCompleted.map((weekend) => weekend.name),
    ['Australian Grand Prix', 'Chinese Grand Prix'],
    'Completed weekends should preserve calendar order on the homepage'
);

console.log('calendar-state regression checks passed');
