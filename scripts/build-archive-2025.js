/**
 * Build a complete `videos-2025.json` for the archive.
 *
 * How it works
 * 1) Reads the season calendar from public/data/calendar2025.json.
 * 2) Reads optional manual data from public/data/archive-2025-manual.json (add videoIds there).
 * 3) Produces public/data/videos-2025.json with every 2025 weekend, preserving any manual videos.
 *
 * Usage:
 *   node scripts/build-archive-2025.js
 *
 * After running, commit the updated videos-2025.json.
 */

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'public', 'data');
const calendarPath = path.join(dataDir, 'calendar2025.json');
const manualPath = path.join(dataDir, 'archive-2025-manual.json');
const outputPath = path.join(dataDir, 'videos-2025.json');

function readJson(filePath, fallback) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch (error) {
        return fallback;
    }
}

function normalizeName(name = '') {
    return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function computeLatestDate(videos = []) {
    const dates = videos
        .map(v => Date.parse(v.publishedAt))
        .filter(d => !Number.isNaN(d));
    if (!dates.length) return null;
    return new Date(Math.max(...dates)).toISOString();
}

function buildArchive() {
    const calendar = readJson(calendarPath, []);
    const manual = readJson(manualPath, { grandPrixWeekends: [] });
    const manualMap = new Map(
        (manual.grandPrixWeekends || []).map(item => [normalizeName(item.name), item])
    );

    const grandPrixWeekends = calendar.map(entry => {
        const manualData = manualMap.get(normalizeName(entry.name)) || {};
        const videos = Array.isArray(manualData.videos) ? manualData.videos : [];
        const name = manualData.name
            ? `2025 ${manualData.name}`
            : `2025 ${entry.name}`;

        return {
            name,
            videos,
            latestDate: computeLatestDate(videos)
        };
    });

    const totalVideos = grandPrixWeekends.reduce(
        (sum, gp) => sum + (Array.isArray(gp.videos) ? gp.videos.length : 0),
        0
    );

    const output = {
        lastUpdated: new Date().toISOString(),
        totalVideos,
        grandPrixWeekends
    };

    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log(`Wrote ${grandPrixWeekends.length} weekends to videos-2025.json`);
    console.log(`Total videos: ${totalVideos}`);
}

buildArchive();

