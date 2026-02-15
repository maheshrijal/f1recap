# 2026 Championship Standings Integration Design

## Goal
Add Drivers and Constructors championship standings to the website using build-time data fetch, integrated into the existing update workflow.

## Scope
- Add 2026 standings data ingest at build/update time.
- Render standings on homepage with Drivers/Constructors tabs.
- Reuse existing `update-videos` GitHub Action.
- Keep site resilient during pre-season and API failures.

Out of scope:
- Live client-side API calls.
- Paid/commercial data providers.
- Historical multi-season standings UI.

## Constraints
- Project is hobby/non-commercial, compatible with Jolpica non-commercial terms.
- Keep static-site architecture (data in `public/data/*.json`).
- Do not break calendar/video rendering if standings are missing.

## Data Source
Primary source: Jolpica Ergast-compatible API.
- `https://api.jolpi.ca/ergast/f1/2026/driverstandings.json`
- `https://api.jolpi.ca/ergast/f1/2026/constructorstandings.json`

Observed pre-season behavior (2026-02-15): `total: "0"`, empty standings lists.

## Architecture
1. New build script fetches driver + constructor standings.
2. Script normalizes payload and writes one static artifact:
   - `public/data/standings2026.json`
3. Homepage JS fetches this local artifact and renders standings section.
4. Existing GitHub Action runs standings fetch in same job as video fetch and commits both data updates together.

## Output Contract
`public/data/standings2026.json`

```json
{
  "season": "2026",
  "round": null,
  "updatedAt": "2026-02-15T00:00:00.000Z",
  "seasonStarted": false,
  "source": "jolpica",
  "drivers": [
    {
      "position": 1,
      "driverCode": "VER",
      "driverName": "Max Verstappen",
      "constructorName": "Red Bull",
      "points": 0,
      "wins": 0
    }
  ],
  "constructors": [
    {
      "position": 1,
      "constructorName": "Red Bull",
      "points": 0,
      "wins": 0
    }
  ]
}
```

Notes:
- Pre-season: `seasonStarted=false`, `drivers=[]`, `constructors=[]`, `round=null`.
- In-season: `seasonStarted=true`, arrays populated, `round` reflects latest standings round.

## UI Design
New homepage section below season progress.

- Title: `Championship Standings`
- Tabs: `Drivers` / `Constructors`
- Drivers columns: `Pos`, `Driver`, `Team`, `Pts`, `Wins`
- Constructors columns: `Pos`, `Team`, `Pts`, `Wins`
- Meta line: `After Round X • Updated <local time>`
- Empty state: `2026 standings will appear after Round 1.`
- Attribution line: `Data: Jolpica F1 API (CC BY-NC-SA 4.0)`

## Failure Handling
- Fetch script must be non-destructive:
  - If API fails or payload invalid, keep previously committed `standings2026.json` unchanged.
  - Exit non-zero so workflow logs show failure context.
- Frontend fallback:
  - If JSON missing/unreadable, hide table, show lightweight unavailable message.
  - Do not block rest of page.

## Workflow Integration
Update `.github/workflows/update-videos.yml`:
- Add `npm run fetch-standings` after `npm run fetch`.
- Stage `public/data/standings2026.json` with existing video files.
- Keep single commit per run.
- Extend summary with standings counts and season state.

## Verification Strategy
- Local script smoke:
  - `npm run fetch-standings`
  - verify JSON schema and fields.
- Frontend smoke:
  - `npm run dev`, open homepage, confirm tabs render and empty-state works pre-season.
- CI/workflow:
  - manual `workflow_dispatch` run and verify commit contains standings file updates when data changes.

## Rollout
Phase 1:
- Ship standings section + build fetch + workflow integration.

Phase 2 (optional):
- Add dedicated `standings.html` route and deeper drill-down.
- Add delta indicators (`+/- position`) once prior-round cache exists.

## Decision Log
- Chosen: build-time fetch.
- Rejected: client-side direct API fetch (rate-limit/user-facing reliability risk).
- Rejected for v1: edge proxy cache layer (extra infra complexity).
