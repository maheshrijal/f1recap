# F1 Video Tracker 🏎️

A static website that automatically tracks and displays Formula 1 YouTube videos, focusing on Practice, Sprint, and Race recaps. Updates every 30 minutes via GitHub Actions.

## Features

- 🎯 **Smart Filtering**: Only shows Practice, Sprint, and Race recap videos
- ⏰ **Auto Updates**: GitHub Actions fetches new videos every 30 minutes
- 📱 **Responsive Design**: Works great on desktop and mobile
- 🎬 **Embedded Videos**: Watch directly without leaving the site
- 📅 **Recent Content**: Shows videos from the last 3 race weekends

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

### 3. Enable GitHub Pages

1. Go to Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main` / `(root)`
4. Save

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

## How It Works

1. **GitHub Actions** runs every 30 minutes
2. **fetch-videos.js** queries YouTube Data API for latest F1 channel videos
3. **Smart filtering** identifies Practice/Sprint/Race recaps using keywords
4. **videos.json** is updated with the latest video data
5. **Static website** loads and displays the videos with embedded players

## Customization

### Modify Video Filters

Edit `scripts/fetch-videos.js` and update the `targetKeywords` array:

```javascript
this.targetKeywords = [
    'practice recap',
    'fp1 recap',
    'fp2 recap', 
    'fp3 recap',
    'sprint recap',
    'race recap',
    // Add your own keywords
];
```

### Change Update Frequency

Edit `.github/workflows/update-videos.yml` and modify the cron schedule:

```yaml
schedule:
  # Every 15 minutes: '*/15 * * * *'
  # Every hour: '0 * * * *'
  # Every 30 minutes: '*/30 * * * *'
  - cron: '*/30 * * * *'
```

### Adjust Time Range

In `scripts/fetch-videos.js`, modify the days parameter:

```javascript
// Keep videos from last 6 weeks (42 days)
const recentVideos = this.filterRecentVideos(filteredVideos, 42);
```

## File Structure

```
├── index.html          # Main website
├── styles.css          # Styling
├── script.js           # Frontend JavaScript
├── videos.json         # Video data (auto-generated)
├── package.json        # Dependencies
├── scripts/
│   └── fetch-videos.js # YouTube API fetcher
└── .github/workflows/
    └── update-videos.yml # GitHub Actions workflow
```

## Troubleshooting

### No videos showing up?
- Check if GitHub Actions is running successfully
- Verify your YouTube API key is correct
- Check the repository Actions tab for error logs

### API quota exceeded?
- YouTube Data API has daily quotas
- Consider reducing update frequency
- Monitor usage in Google Cloud Console

### Videos not filtering correctly?
- Check the `targetKeywords` array in `fetch-videos.js`
- F1 might change their video naming conventions

## License

MIT License - feel free to modify and use as needed!# f1tracker
