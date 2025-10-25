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

## How It Works

1. **GitHub Actions** runs during F1 race weekends (Fri-Mon)
2. **fetch-videos.js** queries YouTube Data API for latest F1 channel videos
3. **Smart filtering** identifies Practice/Sprint/Race recaps using keywords
4. **videos.json** is updated with the latest video data organized by Grand Prix
5. **Static website** loads and displays the videos with clean interface

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
3. Set output directory: `/` (root)
4. Add environment variables in the Pages project settings:
   - `YOUTUBE_API_KEY` (secret)
   - `PUBLIC_POSTHOG_KEY` (public)
   - `PUBLIC_POSTHOG_HOST` (public, e.g. `https://app.posthog.com`)
5. Deploy!

### 4. Local Development

```bash
# Install dependencies
npm install

# Fetch videos (requires YOUTUBE_API_KEY environment variable)
export YOUTUBE_API_KEY="your-api-key-here"
npm run fetch
node scripts/generate-posthog-config.js  # optional, only needed if you want PostHog locally (reverts afterwards to avoid committing secrets)

# Start local server
npm run dev
# Visit http://localhost:8000
```

> **Note:** `posthog-config.js` is tracked with a blank key so the file always exists in production. If you generate a local config with real keys, run `git checkout -- posthog-config.js` before committing to avoid leaking credentials.

## License

[MIT License](./LICENSE)

---
