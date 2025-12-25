const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'public', 'data');

function parseIcsDate(value) {
  if (!value) return null;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseIcsCalendar(text) {
  if (!text) return [];
  const events = text.split('BEGIN:VEVENT').slice(1);
  const weekendMap = new Map();

  const getValue = (block, key) => {
    const match = block.match(new RegExp(`${key}:([^\n\r]+)`));
    return match ? match[1].trim() : null;
  };

  events.forEach((block) => {
    const summary = getValue(block, 'SUMMARY');
    const dtStart = getValue(block, 'DTSTART');
    if (!summary || !dtStart) return;

    const date = parseIcsDate(dtStart);
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

function main() {
  const files = fs.readdirSync(dataDir).filter((file) => file.startsWith('f1-calendar_') && file.endsWith('.ics'));

  if (!files.length) {
    console.log('No ICS files found; skipping calendar validation.');
    return;
  }

  let totalWeekends = 0;
  files.forEach((file) => {
    const filePath = path.join(dataDir, file);
    const text = fs.readFileSync(filePath, 'utf8');
    const weekends = parseIcsCalendar(text);
    if (!weekends.length) {
      throw new Error(`No weekends parsed from ${file}`);
    }
    totalWeekends += weekends.length;
    console.log(`${file}: ${weekends.length} weekends`);
  });

  console.log(`Total weekends parsed: ${totalWeekends}`);
}

if (require.main === module) {
  main();
}
