# F1 Recap 🏎️

A fast, elegant hub for Formula 1 race highlights. View the full season calendar, watch session recaps, and never miss a race weekend.

## ✨ Features

- **Unified Calendar View** — Full season at a glance with GP cards showing all sessions
- **Inline Video Expansion** — Single-click to expand and watch highlights directly
- **Live Countdown** — Timer to the next session in your local timezone
- **Season Progress** — Visual indicator of completed vs remaining races
- **Quick Navigation** — Sidebar calendar for jumping to any GP
- **Dark Mode** — Easy on the eyes for late-night race watching
- **2025 Archive** — Complete archive of all 2025 session highlights
- **Open Source** — MIT licensed, contributions welcome!

## 🌐 Live Site

**[f1recap.pages.dev](https://f1recap.pages.dev)**

## 🛠️ Development

```bash
npm install

# Fetch latest videos (requires YOUTUBE_API_KEY)
export YOUTUBE_API_KEY="your-api-key-here"
npm run fetch

# Start local server
npm run dev
```

## 📦 Deploy

- Build: `npm run build`
- Output: `public/`
- Hosted on Cloudflare Pages

## 🗂️ Project Structure

```
public/
├── index.html          # Homepage with unified calendar
├── archive-2025.html   # 2025 season archive
├── calendar-2025.html  # Dedicated calendar page
├── assets/
│   ├── styles.css      # All styling
│   └── js/
│       ├── calendar.js # Calendar & video logic
│       └── components.js # Header/footer
└── data/
    ├── videos.json     # Current season videos
    ├── videos-2025.json # 2025 archive
    └── f1-calendar_2026.ics
```

## 📄 License

MIT
