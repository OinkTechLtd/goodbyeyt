/**
 * GoodbyeYT — API Routes
 * Поиск и информация о видео через YouTube Data API + Piped для стриминга
 */

const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const { getStreams, getInstancesStatus } = require('../utils/instanceManager');

const router = express.Router();
const cache = new NodeCache({ stdTTL: 60 }); // 1 минута кеш

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

function getApiKey(req) {
  return req.headers['x-youtube-api-key'] || req.query.apiKey || process.env.YOUTUBE_API_KEY;
}

// Поиск видео
router.get('/search', async (req, res) => {
  try {
    const { q, pageToken, maxResults = 24, order = 'relevance', duration, publishedAfter, regionCode = 'RU' } = req.query;
    const apiKey = getApiKey(req);

    if (!apiKey) {
      return res.status(400).json({ error: 'YouTube API ключ не указан' });
    }
    if (!q) {
      return res.status(400).json({ error: 'Поисковый запрос не указан' });
    }

    const cacheKey = `search:${q}:${pageToken}:${maxResults}:${order}:${duration}:${publishedAfter}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const params = {
      part: 'snippet',
      q,
      type: 'video',
      maxResults: Math.min(parseInt(maxResults), 50),
      order,
      regionCode,
      key: apiKey,
    };
    if (pageToken) params.pageToken = pageToken;
    if (duration) params.videoDuration = duration; // short / medium / long
    if (publishedAfter) params.publishedAfter = publishedAfter;

    const searchResp = await axios.get(`${YT_API_BASE}/search`, { params });
    const videoIds = searchResp.data.items.map(i => i.id.videoId).join(',');

    // Получаем детали видео (просмотры, длительность)
    const detailsResp = await axios.get(`${YT_API_BASE}/videos`, {
      params: {
        part: 'snippet,contentDetails,statistics',
        id: videoIds,
        key: apiKey,
      }
    });

    const result = {
      nextPageToken: searchResp.data.nextPageToken,
      prevPageToken: searchResp.data.prevPageToken,
      totalResults: searchResp.data.pageInfo?.totalResults,
      items: detailsResp.data.items.map(formatVideo),
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    handleYtError(err, res);
  }
});

// Информация о видео
router.get('/video/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const apiKey = getApiKey(req);

    if (!apiKey) return res.status(400).json({ error: 'YouTube API ключ не указан' });

    const cacheKey = `video:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const videoResp = await axios.get(`${YT_API_BASE}/videos`, {
      params: { part: 'snippet,contentDetails,statistics', id, key: apiKey }
    });

    if (!videoResp.data.items?.length) {
      return res.status(404).json({ error: 'Видео не найдено' });
    }

    const video = formatVideo(videoResp.data.items[0]);

    // Получаем стрим-данные через Piped (перебирает все инстансы)
    const pipedResult = await getStreams(id).catch(() => null);
    if (pipedResult) {
      video.streams = processPipedStreams(pipedResult.data);
      video.subtitles = pipedResult.data.subtitles || [];
      const pipedRelated = (pipedResult.data.relatedStreams || []).slice(0, 12).map(formatPipedRelated);
      if (pipedRelated.length > 0) {
        video.relatedStreams = pipedRelated;
      }
    }

    // Похожие видео через YouTube API (fallback или дополнение)
    if (!video.relatedStreams?.length) {
      try {
        const relatedSearch = await axios.get(`${YT_API_BASE}/search`, {
          params: {
            part: 'snippet',
            type: 'video',
            relatedToVideoId: id,
            maxResults: 12,
            key: apiKey,
          }
        });
        const relatedIds = (relatedSearch.data.items || []).map(i => i.id.videoId).filter(Boolean).join(',');
        if (relatedIds) {
          const relatedDetails = await axios.get(`${YT_API_BASE}/videos`, {
            params: { part: 'snippet,contentDetails,statistics', id: relatedIds, key: apiKey }
          });
          video.relatedStreams = (relatedDetails.data.items || []).map(formatVideo);
        }
      } catch (e) {
        console.log(`Похожие видео через YouTube API недоступны: ${e.message}`);
      }
    }

    cache.set(cacheKey, video, 120);
    res.json(video);
  } catch (err) {
    handleYtError(err, res);
  }
});

// Комментарии
router.get('/comments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { pageToken } = req.query;
    const apiKey = getApiKey(req);

    if (!apiKey) return res.status(400).json({ error: 'YouTube API ключ не указан' });

    const params = {
      part: 'snippet',
      videoId: id,
      maxResults: 20,
      order: 'relevance',
      key: apiKey,
    };
    if (pageToken) params.pageToken = pageToken;

    const resp = await axios.get(`${YT_API_BASE}/commentThreads`, { params });

    res.json({
      nextPageToken: resp.data.nextPageToken,
      items: resp.data.items.map(c => ({
        id: c.id,
        text: c.snippet.topLevelComment.snippet.textDisplay,
        authorName: c.snippet.topLevelComment.snippet.authorDisplayName,
        authorAvatar: c.snippet.topLevelComment.snippet.authorProfileImageUrl,
        likeCount: c.snippet.topLevelComment.snippet.likeCount,
        publishedAt: c.snippet.topLevelComment.snippet.publishedAt,
        replyCount: c.snippet.totalReplyCount,
      }))
    });
  } catch (err) {
    handleYtError(err, res);
  }
});

// Trending / Главная
router.get('/trending', async (req, res) => {
  try {
    const { regionCode = 'US', categoryId } = req.query;
    const apiKey = getApiKey(req);

    if (!apiKey) return res.status(400).json({ error: 'YouTube API ключ не указан' });

    const cacheKey = `trending:${regionCode}:${categoryId}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const params = {
      part: 'snippet,contentDetails,statistics',
      chart: 'mostPopular',
      regionCode,
      maxResults: 24,
      key: apiKey,
    };
    if (categoryId) params.videoCategoryId = categoryId;

    const resp = await axios.get(`${YT_API_BASE}/videos`, { params });
    const result = { items: resp.data.items.map(formatVideo) };

    cache.set(cacheKey, result, 300);
    res.json(result);
  } catch (err) {
    handleYtError(err, res);
  }
});

// Канал
router.get('/channel/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { pageToken } = req.query;
    const apiKey = getApiKey(req);

    if (!apiKey) return res.status(400).json({ error: 'YouTube API ключ не указан' });

    const [channelResp, searchResp] = await Promise.all([
      axios.get(`${YT_API_BASE}/channels`, {
        params: { part: 'snippet,statistics,brandingSettings', id, key: apiKey }
      }),
      axios.get(`${YT_API_BASE}/search`, {
        params: {
          part: 'snippet', channelId: id, type: 'video',
          order: 'date', maxResults: 24, key: apiKey,
          ...(pageToken ? { pageToken } : {})
        }
      })
    ]);

    if (!channelResp.data.items?.length) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    const ch = channelResp.data.items[0];
    const videoIds = searchResp.data.items.map(i => i.id.videoId).filter(Boolean).join(',');

    let videos = [];
    if (videoIds) {
      const detailsResp = await axios.get(`${YT_API_BASE}/videos`, {
        params: { part: 'snippet,contentDetails,statistics', id: videoIds, key: apiKey }
      });
      videos = detailsResp.data.items.map(formatVideo);
    }

    res.json({
      channel: {
        id: ch.id,
        title: ch.snippet.title,
        description: ch.snippet.description,
        thumbnail: ch.snippet.thumbnails?.high?.url,
        banner: ch.brandingSettings?.image?.bannerExternalUrl,
        subscribers: ch.statistics?.subscriberCount,
        videoCount: ch.statistics?.videoCount,
        viewCount: ch.statistics?.viewCount,
      },
      nextPageToken: searchResp.data.nextPageToken,
      videos,
    });
  } catch (err) {
    handleYtError(err, res);
  }
});

// Статус инстансов
router.get('/instances/status', (req, res) => {
  res.json(getInstancesStatus());
});

// Валидация API ключа
router.post('/validate-key', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ valid: false, error: 'Ключ не указан' });

    await axios.get(`${YT_API_BASE}/videos`, {
      params: { part: 'snippet', chart: 'mostPopular', maxResults: 1, key: apiKey }
    });
    res.json({ valid: true });
  } catch (err) {
    const msg = err.response?.data?.error?.message || 'Неверный API ключ';
    res.json({ valid: false, error: msg });
  }
});

// ---- Helpers ----

function formatVideo(v) {
  const dur = v.contentDetails?.duration || 'PT0S';
  return {
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description,
    thumbnail: v.snippet.thumbnails?.maxres?.url || v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url,
    channelId: v.snippet.channelId,
    channelTitle: v.snippet.channelTitle,
    publishedAt: v.snippet.publishedAt,
    duration: parseDuration(dur),
    durationRaw: dur,
    viewCount: v.statistics?.viewCount,
    likeCount: v.statistics?.likeCount,
    commentCount: v.statistics?.commentCount,
    tags: v.snippet.tags || [],
    categoryId: v.snippet.categoryId,
  };
}

function parseDuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '0:00';
  const h = parseInt(match[1] || 0);
  const m = parseInt(match[2] || 0);
  const s = parseInt(match[3] || 0);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function processPipedStreams(data) {
  const streams = { video: [], audio: [], hls: null };

  if (data.hls) streams.hls = data.hls;

  (data.videoStreams || []).forEach(s => {
    streams.video.push({
      url: s.url,
      quality: s.quality,
      fps: s.fps,
      codec: s.codec,
      mimeType: s.mimeType,
      videoOnly: s.videoOnly,
    });
  });

  (data.audioStreams || []).forEach(s => {
    streams.audio.push({
      url: s.url,
      quality: s.quality,
      bitrate: s.bitrate,
      mimeType: s.mimeType,
    });
  });

  return streams;
}

function formatPipedRelated(v) {
  return {
    id: v.url?.replace('/watch?v=', '') || v.id,
    title: v.title,
    thumbnail: v.thumbnail,
    channelTitle: v.uploaderName,
    duration: typeof v.duration === 'number'
      ? `${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, '0')}`
      : v.duration,
    viewCount: v.views,
  };
}

function handleYtError(err, res) {
  const ytErr = err.response?.data?.error;
  if (ytErr) {
    const status = err.response.status;
    if (ytErr.code === 403 && ytErr.errors?.[0]?.reason === 'quotaExceeded') {
      return res.status(429).json({ error: 'Превышена квота YouTube API. Подождите или смените ключ.' });
    }
    if (status === 400) {
      return res.status(400).json({ error: 'Неверный API ключ или параметры запроса' });
    }
    return res.status(status).json({ error: ytErr.message || 'Ошибка YouTube API' });
  }
  console.error('API Error:', err.message);
  res.status(500).json({ error: 'Ошибка сервера. Проверьте соединение.' });
}

module.exports = router;
