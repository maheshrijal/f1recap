const fs = require('fs');
const path = require('path');

function loadCalendar() {
  const jsonPath = path.join(__dirname, '..', 'public', 'data', 'calendar2026.json');
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
    console.warn(`race-calendar-2026: failed to load calendar2026.json: ${err.message}`);
    return [];
  }
}

module.exports = loadCalendar();

