# F1 Recap 🏎️

A fast, static hub for Formula 1 highlights with a 2026 session calendar and a complete 2025 archive.

## Live Site

f1recap.pages.dev

## Overview

- Current season sessions shown in your local timezone
- Countdown to the next session
- 2025 archive with every session highlight
- .ics calendar download for 2026

## Development

```bash
npm install

# Fetch latest data (requires YOUTUBE_API_KEY)
export YOUTUBE_API_KEY="your-api-key-here"
npm run fetch

# Start local server
npm run dev
```

## Deploy

- Build: `npm run build`
- Output: `public`

## License

MIT
