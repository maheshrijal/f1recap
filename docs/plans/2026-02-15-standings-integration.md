# 2026 Championship Standings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Drivers and Constructors standings to homepage using build-time Jolpica fetch and existing update workflow.

**Architecture:** Fetch standings in CI/local scripts, write normalized static JSON to `public/data/standings2026.json`, render via homepage JS with tabbed table UI and resilient fallbacks. Reuse `update-videos` workflow so videos and standings update together.

**Tech Stack:** Node.js scripts, static HTML/CSS/vanilla JS, GitHub Actions.

---

### Task 1: Add standings fetch script (TDD-lite contract checks)

**Files:**
- Create: `scripts/fetch-standings-2026.js`
- Create: `public/data/standings2026.json` (placeholder/initial output)

**Step 1: Write a failing contract check script in the fetch file first**
- Add validation function that throws if normalized output is missing keys: `season`, `updatedAt`, `seasonStarted`, `drivers`, `constructors`.

**Step 2: Run script to verify current failure path is explicit**
Run: `node scripts/fetch-standings-2026.js`
Expected: explicit error (before implementation complete), not silent pass.

**Step 3: Implement minimal fetch + normalize for both endpoints**
- Fetch driver and constructor standings from Jolpica.
- Normalize to a single JSON shape.
- Detect pre-season empty response and set `seasonStarted=false`.

**Step 4: Add non-destructive write guard**
- On fetch/parse failure, do not overwrite existing `public/data/standings2026.json`.
- Print exact error context and exit non-zero.

**Step 5: Run and verify output**
Run: `node scripts/fetch-standings-2026.js`
Expected: `public/data/standings2026.json` written/updated with valid schema.

**Step 6: Commit**
```bash
git add scripts/fetch-standings-2026.js public/data/standings2026.json
git commit -m "feat: add 2026 standings fetch pipeline"
```

### Task 2: Wire script into npm scripts and workflow

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/update-videos.yml`

**Step 1: Add npm command**
- Add `fetch-standings` script: `node scripts/fetch-standings-2026.js`.

**Step 2: Run npm script locally**
Run: `npm run fetch-standings`
Expected: standings file generated without syntax/runtime errors.

**Step 3: Update workflow run steps**
- Add `npm run fetch-standings` after `npm run fetch`.
- Ensure `TARGET_YEAR=2026` is available for consistency.

**Step 4: Update workflow commit staging**
- Include `public/data/standings2026.json` in `git add` line.

**Step 5: Extend workflow summary output**
- Print seasonStarted and row counts for drivers/constructors.

**Step 6: Commit**
```bash
git add package.json .github/workflows/update-videos.yml
git commit -m "ci: update video workflow to include standings sync"
```

### Task 3: Add standings section markup

**Files:**
- Modify: `public/index.html`

**Step 1: Add standings container section**
- Add `#championshipStandings` section below season progress.
- Include tab buttons and table shell.

**Step 2: Add empty/loading placeholders in markup**
- Loading state text.
- Empty state text for pre-season.
- Attribution line for Jolpica license.

**Step 3: Verify static HTML integrity**
Run: `npm run dev`
Expected: page loads with no console/DOM errors and section visible.

**Step 4: Commit**
```bash
git add public/index.html
git commit -m "feat: add homepage standings section structure"
```

### Task 4: Implement standings rendering logic

**Files:**
- Modify: `public/assets/js/calendar.js`

**Step 1: Add standings state fields in class init**
- Add refs for standings section/tabs/table/meta/empty-state.

**Step 2: Add `loadStandings()` method**
- Fetch `data/standings2026.json` with `no-cache`.
- Parse safe defaults when file missing/invalid.

**Step 3: Add render methods**
- `renderStandings()`
- `renderDriverRows()`
- `renderConstructorRows()`
- tab toggle handlers.

**Step 4: Add resilient fallback behavior**
- Show unavailable/empty message when no rows.
- Keep calendar render path unaffected on failures.

**Step 5: Integrate into existing init/refresh lifecycle**
- Include standings load in initial and refresh flows.

**Step 6: Verify in browser**
Run: `npm run dev`
Expected: tabs switch correctly; empty-state shown pre-season; no regressions in calendar/videos.

**Step 7: Commit**
```bash
git add public/assets/js/calendar.js
git commit -m "feat: render championship standings on homepage"
```

### Task 5: Style standings UI

**Files:**
- Modify: `public/assets/styles.css`

**Step 1: Add styles for standings section**
- Card shell, tabs, table, responsive overflow.

**Step 2: Add state styles**
- loading/empty/unavailable/meta/attribution.

**Step 3: Mobile verification**
Run: `npm run dev`
Expected: standings table remains readable on small screens.

**Step 4: Commit**
```bash
git add public/assets/styles.css
git commit -m "style: add responsive championship standings styles"
```

### Task 6: Final verification and docs

**Files:**
- Modify: `README.md` (if features section should mention standings)

**Step 1: End-to-end local validation**
Run:
```bash
npm run fetch-standings
npm run validate-calendar
npm run dev
```
Expected:
- standings JSON valid
- calendar validation passes
- homepage renders standings + existing features

**Step 2: Workflow dry-check (manual review)**
- Validate workflow YAML syntax and staging paths.
- Confirm summary includes standings stats.

**Step 3: Update README feature list**
- Add championship standings bullet if desired.

**Step 4: Commit**
```bash
git add README.md public/data/standings2026.json
git commit -m "docs: document standings feature and verification"
```
