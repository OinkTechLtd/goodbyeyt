/**
 * GoodbyeYT — Stream Proxy v2
 * Piped → Invidious → YouTube embed
 */

const express = require('express');
const axios = require('axios');
const { getStreams } = require('../utils/instanceManager');

const router = express.Router();

// Прокси для видео/аудио потоков (обход блокировок)
router.get('/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL не указан' });

  try {
    const decoded = decodeURIComponent(url);
    const allowed = ['googlevideo.com', 'youtube.com', 'ytimg.com', 'piped', 'pipedapi', 'invidious', 'yewtu.be'];
    if (!allowed.some(d => decoded.includes(d))) {
      return res.status(403).json({ error: 'Домен не разрешён' });
    }

    const range = req.headers.range;
    const upstream = await axios({
      method: 'GET',
      url: decoded,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GoodbyeYT/2.0)',
        ...(range ? { Range: range } : {}),
      },
      responseType: 'stream',
      timeout: 30000,
    });

    res.status(range ? 206 : upstream.status);
    res.set('Content-Type', upstream.headers['content-type'] || 'video/mp4');
    res.set('Accept-Ranges', 'bytes');
    if (upstream.headers['content-length']) res.set('Content-Length', upstream.headers['content-length']);
    if (upstream.headers['content-range']) res.set('Content-Range', upstream.headers['content-range']);
    upstream.data.pipe(res);
  } catch (err) {
    console.error('Stream proxy error:', err.message);
    if (!res.headersSent) res.status(502).json({ error: 'Не удалось загрузить поток' });
  }
});

// Получить стримы: Piped → Invidious → embed fallback
router.get('/sources/:videoId', async (req, res) => {
  const { videoId } = req.params;

  try {
    const result = await getStreams(videoId);

    if (!result) {
      return res.status(503).json({
        error: 'Все источники временно недоступны',
        fallback: 'embed',
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`,
        source: 'none',
      });
    }

    const d = result.data;
    res.json({
      source: result.source,       // 'piped' | 'invidious'
      instanceUrl: result.instanceUrl,
      hls: d.hls || null,
      dash: d.dash || null,
      liveStream: d.liveStream || false,
      videoStreams: (d.videoStreams || []).map(s => ({
        url: s.url,
        quality: s.quality,
        fps: s.fps,
        mimeType: s.mimeType,
        videoOnly: s.videoOnly,
        codec: s.codec,
      })),
      audioStreams: (d.audioStreams || []).map(s => ({
        url: s.url,
        quality: s.quality,
        bitrate: s.bitrate,
        mimeType: s.mimeType,
      })),
      subtitles: d.subtitles || [],
      relatedStreams: d.relatedStreams || [],
    });
  } catch (err) {
    console.error(`Stream sources error for ${videoId}:`, err.message);
    res.status(502).json({
      error: 'Ошибка получения источников',
      fallback: 'embed',
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`,
      source: 'none',
    });
  }
});

module.exports = router;
