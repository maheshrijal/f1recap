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
4. Deploy!

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

## Customization

### Modify Video Filters

Edit `scripts/fetch-videos.js` and update the filtering logic:

```javascript
this.allowedSessionTypes = [
    'fp1', 'fp2', 'qualifying', 'sprint', 'race'
];

this.excludeKeywords = [
    'f2', 'formula 2', 'post-race show', 'drivers react'
];
```

### Change Update Schedule

Edit `.github/workflows/update-videos.yml`:

```yaml
schedule:
  # Currently runs Fri-Mon during race weekends
  # Modify cron expressions to change timing
```

## File Structure

```
├── index.html          # Main website
├── styles.css          # Styling
├── script.js           # Frontend JavaScript
├── videos.json         # Video data (auto-generated)
├── package.json        # Dependencies
├── sitemap.xml         # SEO sitemap
├── robots.txt          # Crawler instructions
├── scripts/
│   └── fetch-videos.js # YouTube API fetcher
└── .github/workflows/
    └── update-videos.yml # GitHub Actions workflow
```

## SEO Features

- ✅ **Optimized meta tags** for search engines
- ✅ **Open Graph tags** for social media sharing
- ✅ **Structured data** (JSON-LD schema)
- ✅ **Dynamic titles** based on current Grand Prix
- ✅ **Mobile-friendly** responsive design
- ✅ **Fast loading** with optimized assets

## Troubleshooting

### No videos showing up?
- Check if GitHub Actions is running successfully
- Verify your YouTube API key is correct
- Check the repository Actions tab for error logs

### API quota exceeded?
- YouTube Data API has daily quotas
- The optimized schedule (race weekends only) helps manage this
- Monitor usage in Google Cloud Console

### Videos not filtering correctly?
- Check the filtering logic in `scripts/fetch-videos.js`
- F1 might change their video naming conventions
- Use manual workflow runs to test changes

## License

MIT License - feel free to modify and use as needed!

---

Built with ❤️ for F1 fans who want quick access to session highlights without scrolling through the entire F1 YouTube channel.