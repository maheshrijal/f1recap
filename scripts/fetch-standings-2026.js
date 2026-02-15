const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const TARGET_YEAR = String(parseInt(process.env.TARGET_YEAR || '2026', 10));
const BASE_URL = process.env.STANDINGS_API_BASE || 'https://api.jolpi.ca/ergast/f1';
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'data', `standings${TARGET_YEAR}.json`);
const MAX_RETRIES = Math.max(1, parseInt(process.env.STANDINGS_MAX_RETRIES || '3', 10));
const RETRY_DELAY_MS = Math.max(0, parseInt(process.env.STANDINGS_RETRY_DELAY_MS || '1500', 10));

function toNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function normalizeDriverStandings(list = []) {
    return list.map((entry) => {
        const given = entry?.Driver?.givenName || '';
        const family = entry?.Driver?.familyName || '';
        const driverName = `${given} ${family}`.trim() || entry?.Driver?.driverId || 'Unknown Driver';
        const constructorName = entry?.Constructors?.[0]?.name || 'Unknown Team';

        return {
            position: toNumber(entry?.position),
            driverCode: entry?.Driver?.code || '',
            driverName,
            constructorName,
            points: toNumber(entry?.points),
            wins: toNumber(entry?.wins)
        };
    });
}

function normalizeConstructorStandings(list = []) {
    return list.map((entry) => ({
        position: toNumber(entry?.position),
        constructorName: entry?.Constructor?.name || 'Unknown Team',
        points: toNumber(entry?.points),
        wins: toNumber(entry?.wins)
    }));
}

function validateOutputShape(payload) {
    const requiredKeys = ['season', 'round', 'updatedAt', 'seasonStarted', 'source', 'drivers', 'constructors'];
    for (const key of requiredKeys) {
        if (!(key in payload)) {
            throw new Error(`Invalid standings payload: missing key \"${key}\"`);
        }
    }
    if (!Array.isArray(payload.drivers) || !Array.isArray(payload.constructors)) {
        throw new Error('Invalid standings payload: drivers/constructors must be arrays');
    }
}

function makeDefaultPayload() {
    return {
        season: TARGET_YEAR,
        round: null,
        updatedAt: new Date().toISOString(),
        seasonStarted: false,
        source: 'jolpica',
        drivers: [],
        constructors: []
    };
}

async function fetchJson(url) {
    const response = await axios.get(url, {
        timeout: 15000,
        headers: {
            'User-Agent': 'f1-recaps-standings-fetcher/1.0'
        }
    });
    return response.data;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url) {
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
        try {
            return await fetchJson(url);
        } catch (error) {
            lastError = error;
            const canRetry = attempt < MAX_RETRIES;
            console.warn(`Attempt ${attempt}/${MAX_RETRIES} failed for ${url}: ${error.message}`);
            if (canRetry) {
                await sleep(RETRY_DELAY_MS * attempt);
            }
        }
    }

    throw lastError || new Error(`Failed to fetch ${url}`);
}

function extractStandingsList(payload, key) {
    const table = payload?.MRData?.StandingsTable;
    const firstList = table?.StandingsLists?.[0] || null;
    const rows = firstList?.[key] || [];

    return {
        season: String(table?.season || TARGET_YEAR),
        round: firstList?.round || table?.round || null,
        rows: Array.isArray(rows) ? rows : []
    };
}

async function writePayload(payload) {
    const tempFile = `${OUTPUT_FILE}.tmp`;
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    await fs.writeFile(tempFile, json, 'utf8');
    await fs.rename(tempFile, OUTPUT_FILE);
}

async function main() {
    const driverUrl = `${BASE_URL}/${TARGET_YEAR}/driverstandings.json`;
    const constructorUrl = `${BASE_URL}/${TARGET_YEAR}/constructorstandings.json`;

    console.log(`Fetching ${TARGET_YEAR} driver standings from ${driverUrl}`);
    console.log(`Fetching ${TARGET_YEAR} constructor standings from ${constructorUrl}`);

    try {
        const [driverPayload, constructorPayload] = await Promise.all([
            fetchJsonWithRetry(driverUrl),
            fetchJsonWithRetry(constructorUrl)
        ]);

        const driversRaw = extractStandingsList(driverPayload, 'DriverStandings');
        const constructorsRaw = extractStandingsList(constructorPayload, 'ConstructorStandings');

        const drivers = normalizeDriverStandings(driversRaw.rows);
        const constructors = normalizeConstructorStandings(constructorsRaw.rows);

        const payload = {
            season: driversRaw.season || constructorsRaw.season || TARGET_YEAR,
            round: driversRaw.round || constructorsRaw.round || null,
            updatedAt: new Date().toISOString(),
            seasonStarted: drivers.length > 0 || constructors.length > 0,
            source: 'jolpica',
            drivers,
            constructors
        };

        validateOutputShape(payload);
        await writePayload(payload);

        console.log(`Saved standings to ${OUTPUT_FILE}`);
        console.log(`seasonStarted=${payload.seasonStarted} drivers=${payload.drivers.length} constructors=${payload.constructors.length}`);
    } catch (error) {
        const fallback = makeDefaultPayload();
        console.error('Failed to fetch standings:', error.message);
        console.error('Existing standings file was preserved.');

        // If no file exists yet, write a safe default payload so frontend still has a schema.
        try {
            await fs.access(OUTPUT_FILE);
        } catch (_) {
            await writePayload(fallback);
            console.log(`Wrote default standings payload to ${OUTPUT_FILE}`);
        }

        try {
            await fs.access(OUTPUT_FILE);
            console.warn('Using existing standings file; continuing without failing the workflow.');
            return;
        } catch (_) {
            process.exitCode = 1;
        }
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    makeDefaultPayload,
    validateOutputShape,
    extractStandingsList,
    normalizeDriverStandings,
    normalizeConstructorStandings
};
