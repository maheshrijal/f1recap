const fs = require('fs');
const path = require('path');

const defaultYear = new Date().getUTCFullYear();
const targetYear = parseInt(process.env.TARGET_YEAR || `${defaultYear}`, 10);

function loadCalendar(year) {
  const modulePath = path.join(__dirname, `race-calendar-${year}.js`);
  if (fs.existsSync(modulePath)) {
    return require(modulePath);
  }

  const jsonPath = path.join(__dirname, '..', 'public', 'data', `calendar${year}.json`);
  if (fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, 'utf8');
      const entries = JSON.parse(raw);
      return entries
        .map((entry) => {
          const times = [];
          if (entry.startDate) {
            times.push(new Date(entry.startDate).toISOString());
          }
          (entry.sessions || []).forEach((s) => {
            if (s.publishedAt) times.push(new Date(s.publishedAt).toISOString());
          });
          if (!times.length) return null;
          times.sort();
          const start = times[0];
          const end = times[times.length - 1];
          return { name: entry.name || 'Grand Prix', start, end };
        })
        .filter(Boolean);
    } catch (err) {
      console.warn(`Failed to load calendar${year}.json: ${err.message}`);
    }
  }

  console.warn(`No calendar found for ${year}; falling back to 2025 list`);
  return require('./race-calendar-2025');
}

const calendar = loadCalendar(targetYear);

function toDateOnly(value) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function withinWindow(today, weekend) {
  const start = toDateOnly(weekend.start);
  const end = toDateOnly(weekend.end);

  // fetch window: start minus 1 day (Thursday) through Monday (+1 day)
  const windowStart = new Date(start);
  windowStart.setUTCDate(windowStart.getUTCDate() - 1);

  const windowEnd = new Date(end);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);

  return today >= windowStart && today <= windowEnd;
}

function nextWeekend(afterDate) {
  const sorted = calendar
    .map((w) => ({ ...w, startDate: toDateOnly(w.start) }))
    .sort((a, b) => a.startDate - b.startDate);

  return sorted.find((w) => w.startDate >= afterDate) || null;
}

function main() {
  const forceRun = process.env.FORCE_RUN === 'true';
  const manual = process.env.MANUAL_RUN === 'true';
  const today = toDateOnly(new Date());

  let shouldRun = forceRun || manual;
  let reason = manual ? 'manual dispatch' : forceRun ? 'FORCE_RUN=true' : 'off-week';
  let activeWeekend = null;

  if (!shouldRun) {
    activeWeekend = calendar.find((w) => withinWindow(today, w));
    if (activeWeekend) {
      shouldRun = true;
      reason = `within window for ${activeWeekend.name}`;
    }
  }

  const next = nextWeekend(today);
  if (!shouldRun && next) {
    reason = `off-week; next weekend ${next.name} starts ${next.start}`;
  }

  const outLines = [`run=${shouldRun}`, `reason=${reason}`];
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, outLines.join('\n') + '\n');
  }

  console.log(`should_run=${shouldRun}`);
  console.log(`reason=${reason}`);
  if (activeWeekend) {
    console.log(`window: ${activeWeekend.start} to ${activeWeekend.end} (±1 day)`);
  } else if (next) {
    console.log(`next: ${next.name} starting ${next.start}`);
  }

  // Always exit 0 so the workflow can read the output
}

if (require.main === module) {
  main();
}

module.exports = main;
