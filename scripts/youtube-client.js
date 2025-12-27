const axios = require('axios');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPrimaryGoogleApiReason(err) {
  const errors = err?.response?.data?.error?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return errors[0]?.reason || null;
}

function getGoogleApiMessage(err) {
  return err?.response?.data?.error?.message || err?.message || 'Unknown error';
}

class YouTubeClient {
  constructor({
    apiKey,
    baseUrl = 'https://www.googleapis.com/youtube/v3',
    requestDelayMs = 0,
    timeoutMs = 30000,
    maxResponseBytes = 5 * 1024 * 1024,
    maxRetries = 5,
    retryBaseDelayMs = 500,
  }) {
    if (!apiKey) {
      throw new Error('YouTube API key not found. Please set YOUTUBE_API_KEY environment variable.');
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.requestDelayMs = requestDelayMs;
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
    this.maxRetries = maxRetries;
    this.retryBaseDelayMs = retryBaseDelayMs;

    this.callCount = 0;
    this.endpointCounts = new Map();
  }

  recordCall(endpoint) {
    this.callCount += 1;
    this.endpointCounts.set(endpoint, (this.endpointCounts.get(endpoint) || 0) + 1);
  }

  getUsageSummary() {
    const byEndpoint = Array.from(this.endpointCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([endpoint, count]) => ({ endpoint, count }));

    return {
      apiCalls: this.callCount,
      byEndpoint,
    };
  }

  isQuotaExhausted(err) {
    const reason = getPrimaryGoogleApiReason(err);
    return reason === 'quotaExceeded' || reason === 'dailyLimitExceeded';
  }

  isRetryable(err) {
    const status = err?.response?.status;
    const reason = getPrimaryGoogleApiReason(err);

    // Retry common transient states.
    if (!status) return true; // network / timeout
    if (status >= 500) return true;
    if (status === 429) return true;

    // Some 403s are transient QPS/user-rate limits; quota exhaustion isn't.
    if (status === 403) {
      if (this.isQuotaExhausted(err)) return false;
      return reason === 'userRateLimitExceeded' || reason === 'rateLimitExceeded';
    }

    return false;
  }

  async request(endpoint, params, { attempt = 0 } = {}) {
    if (this.requestDelayMs > 0) {
      await sleep(this.requestDelayMs);
    }

    this.recordCall(endpoint);

    try {
      const res = await axios.get(`${this.baseUrl}/${endpoint}`, {
        params: { key: this.apiKey, ...params },
        timeout: this.timeoutMs,
        maxContentLength: this.maxResponseBytes,
        maxBodyLength: this.maxResponseBytes,
      });
      return res.data;
    } catch (err) {
      if (this.isQuotaExhausted(err)) {
        const reason = getPrimaryGoogleApiReason(err);
        throw new Error(`YouTube API quota exhausted (${reason}): ${getGoogleApiMessage(err)}`);
      }

      if (attempt >= this.maxRetries || !this.isRetryable(err)) {
        const status = err?.response?.status;
        const reason = getPrimaryGoogleApiReason(err);
        const extra = [status ? `status=${status}` : null, reason ? `reason=${reason}` : null]
          .filter(Boolean)
          .join(', ');
        throw new Error(`YouTube API request failed${extra ? ` (${extra})` : ''}: ${getGoogleApiMessage(err)}`);
      }

      const backoff = this.retryBaseDelayMs * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 250);
      await sleep(backoff + jitter);
      return this.request(endpoint, params, { attempt: attempt + 1 });
    }
  }

  async getUploadsPlaylistId(channelId) {
    const data = await this.request('channels', {
      part: 'contentDetails',
      id: channelId,
      fields: 'items(contentDetails/relatedPlaylists/uploads)',
      maxResults: 1,
    });

    const uploads = data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) {
      throw new Error(`Failed to resolve uploads playlist for channelId=${channelId}`);
    }
    return uploads;
  }

  async listPlaylistItems({ playlistId, pageToken = null, maxResults = 50 }) {
    const data = await this.request('playlistItems', {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults,
      pageToken: pageToken || undefined,
      fields:
        'nextPageToken,items(snippet(title,description,thumbnails,resourceId/videoId),contentDetails(videoId,videoPublishedAt))',
    });

    return {
      items: Array.isArray(data?.items) ? data.items : [],
      nextPageToken: data?.nextPageToken || null,
    };
  }

  async listVideosByIds(videoIds) {
    const ids = (videoIds || []).filter(Boolean);
    if (ids.length === 0) return [];
    if (ids.length > 50) {
      throw new Error(`videos.list supports up to 50 ids per call; got ${ids.length}`);
    }

    const data = await this.request('videos', {
      part: 'snippet',
      id: ids.join(','),
      fields: 'items(id,snippet(title,description,publishedAt,thumbnails))',
      maxResults: 50,
    });

    return Array.isArray(data?.items) ? data.items : [];
  }
}

module.exports = { YouTubeClient };


