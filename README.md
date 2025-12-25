# F1 Recap 🏎️

A static website that automatically tracks and displays Formula 1 YouTube videos, focusing on Practice, Sprint, and Race recaps. Updates every 30 minutes during race weekends via GitHub Actions.

## 🌐 Live Site

**[f1recap.pages.dev](https://f1recap.pages.dev)**

## Features

- 🎯 **Smart Filtering**: Only shows Practice, Sprint, and Race recap videos
- ⏰ **Auto Updates**: GitHub Actions fetches new videos during F1 race weekends
- 📱 **Responsive Design**: Works great on desktop and mobile
- 🎬 **Direct YouTube Access**: One-click to watch videos
- 📅 **Weekend Organization**: Videos grouped by Grand Prix weekends
- 🏁 **Session Ordering**: FP1 → FP2 → Qualifying → Race (or Sprint format)
- 📊 **Built-in Analytics**: PostHog events plus Web Vitals capture for performance insights

## How It Works

1. **GitHub Actions** runs during F1 race weekends (Fri-Mon)
2. **fetch-videos.js** queries YouTube Data API for latest F1 channel videos
3. **Smart filtering** identifies Practice/Sprint/Race recaps using keywords
4. **videos.json** is updated with the latest video data organized by Grand Prix
5. **Static website** loads and displays the videos with clean interface

## Project Structure

- `public/`
  - `index.html` (home + 2026 calendar)
  - `archive-2025.html`, `calendar-2025.html`, `about.html`, `disclosure.html`
  - `assets/styles.css`, `assets/js/{calendar.js,script.js}`, `assets/images/og-image.*`
  - `data/` — `f1-calendar_20xx.ics`, `calendar20xx.json`, `videos.json`, `videos-2025.json`
- `scripts/` — data fetchers (`fetch-videos.js`, `fetch-archive-2025.js`)
- `functions/` — serverless handler for PostHog config
- `README.md`, `package.json`

## Data Fetch Scripts

- Current season (latest weekends): `npm run fetch`
- Full 2025 archive: `npm run fetch-archive`
- Current season output files:
  - `public/data/videos.json` (latest N weekends for homepage)
  - `public/data/videos-<year>.json` (full-season archive, merged across runs)

Environment toggles for `scripts/fetch-archive-2025.js`:
- `YT_PAGE_CAP` (default 5): max pages per GP (YouTube pagination)
- `YT_GP_DELAY_MS` (default 400): delay between GP fetches (helps avoid 403/rate limits)
- `FETCH_MISSING_ONLY` (default false): if true, keeps existing `videos-2025.json` GP data and fetches only missing ones

## Setup

### 1. Get YouTube API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the YouTube Data API v3
4. Create credentials (API Key)
5. Copy your API key

### 2. Configure GitHub Repository

1. Fork/clone this repository
2. Go to Settings → Secrets and variables → Actions
3. Add a new secret:
   - Name: `YOUTUBE_API_KEY`
   - Value: Your YouTube API key

### 3. Deploy to Cloudflare Pages

1. Connect your GitHub repository to Cloudflare Pages
2. Set build command: `npm run build`
3. Set output directory: `public`
4. Add environment variables in the Pages project settings:
   - `YOUTUBE_API_KEY` (secret)
   - `PUBLIC_POSTHOG_KEY` (public)
   - `PUBLIC_POSTHOG_HOST` (public, e.g. `https://app.posthog.com`)
   - *(Optional but recommended)* `PUBLIC_RUNTIME_ENV` to label deployments (e.g. `production`, `preview`)
5. Deploy!
> **Tip:** Set the public PostHog variables for both Preview and Production environments so the runtime function can serve them to the browser. The handler lives at `functions/posthog-config.js` and responds to `/posthog-config`.

### 4. Local Development

```bash
# Install dependencies
npm install

# Fetch videos (requires YOUTUBE_API_KEY environment variable)
export YOUTUBE_API_KEY="your-api-key-here"
npm run fetch

# Start local server
npm run dev
# Visit http://localhost:8000
```

## License

[MIT License](./LICENSE)

---
