/**
 * GoodbyeYT — Instance Manager v2
 * Управляет пулом Piped + Invidious + Cobalt инстансов
 * Автоматически переключается при сбое, перебирает все до успеха
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const NodeCache = require('node-cache');

const INSTANCES_FILE = path.join(__dirname, '../../data/instances.json');
const TIMEOUT = 8000;
const cache = new NodeCache({ stdTTL: 180 }); // 3 минуты

let state = {
  piped: [],
  invidious: [],
  cobalt: [],
  pipedIdx: 0,
  invidiousIdx: 0,
  cobaltIdx: 0,
  updatedAt: null,
};

// Встроенный bootstrap — гарантирует работу даже без instances.json
const HARDCODED = {
  piped: [
    { url: 'https://piped.video/api',                   latency: 500 },
    { url: 'https://pipedapi.kavin.rocks',              latency: 600 },
    { url: 'https://api.piped.projectsegfau.lt',        latency: 700 },
    { url: 'https://api.piped.private.coffee',          latency: 800 },
    { url: 'https://piped-api.garudalinux.org',         latency: 900 },
    { url: 'https://pipedapi.adminforge.de',            latency: 1000 },
    { url: 'https://piped-api.privacy.com.de',          latency: 1100 },
  ],
  invidious: [
    { url: 'https://yewtu.be',                          latency: 500 },
    { url: 'https://inv.riverside.rocks',               latency: 600 },
    { url: 'https://invidious.privacydev.net',          latency: 700 },
    { url: 'https://invidious.tiekoetter.com',          latency: 800 },
    { url: 'https://invidious.adminforge.de',           latency: 900 },
    { url: 'https://inv.bp.projectsegfau.lt',           latency: 1000 },
    { url: 'https://invidious.namazso.eu',              latency: 1100 },
  ],
  cobalt: [],
};

function loadInstances() {
  let saved = { piped: [], invidious: [], cobalt: [] };
  try {
    if (fs.existsSync(INSTANCES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(INSTANCES_FILE, 'utf8'));
      saved = parsed;
      state.updatedAt = parsed.updatedAt;
    }
  } catch (e) {
    console.error('Ошибка загрузки instances.json:', e.message);
  }

  // Объединяем сохранённые + hardcoded (сохранённые идут первыми — они свежее проверены)
  const merge = (saved, hard) => {
    const urls = new Set((saved || []).map(i => i.url));
    return [...(saved || []), ...hard.filter(i => !urls.has(i.url))];
  };

  state.piped     = merge(saved.piped,     HARDCODED.piped);
  state.invidious = merge(saved.invidious, HARDCODED.invidious);
  state.cobalt    = merge(saved.cobalt,    HARDCODED.cobalt);
  state.pipedIdx = 0;
  state.invidiousIdx = 0;
  state.cobaltIdx = 0;

  console.log(`📡 Загружено: Piped=${state.piped.length}, Invidious=${state.invidious.length}, Cobalt=${state.cobalt.length}`);
  return state;
}

// ──────────────────────────────────────────────
// Получение стримов: Piped → Invidious → embed
// ──────────────────────────────────────────────

/**
 * Пробует получить стримы через Piped. Перебирает все инстансы.
 */
async function getStreamsFromPiped(videoId) {
  const list = state.piped;
  if (!list.length) return null;

  for (let i = 0; i < list.length; i++) {
    const idx = (state.pipedIdx + i) % list.length;
    const inst = list[idx];
    try {
      const r = await axios.get(`${inst.url}/streams/${videoId}`, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': 'GoodbyeYT/2.0' },
      });
      if (r.data && (r.data.videoStreams?.length || r.data.hls || r.data.audioStreams?.length)) {
        state.pipedIdx = idx;
        cache.set('best_piped', inst.url);
        console.log(`✅ Piped стримы от: ${inst.url}`);
        return { data: r.data, instanceUrl: inst.url, source: 'piped' };
      }
    } catch (e) {
      console.log(`⚠️  Piped ${inst.url}: ${e.message}`);
    }
  }
  return null;
}

/**
 * Пробует получить стримы через Invidious API.
 * GET /api/v1/videos/{id} → возвращает formatStreams + adaptiveFormats
 */
async function getStreamsFromInvidious(videoId) {
  const list = state.invidious;
  if (!list.length) return null;

  for (let i = 0; i < list.length; i++) {
    const idx = (state.invidiousIdx + i) % list.length;
    const inst = list[idx];
    try {
      const r = await axios.get(`${inst.url}/api/v1/videos/${videoId}`, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': 'GoodbyeYT/2.0' },
        params: { fields: 'videoStreams,adaptiveFormats,hlsUrl,recommendedVideos,captions' },
      });
      const d = r.data;
      if (!d) continue;

      // Нормализуем в формат, совместимый с Piped
      const videoStreams = [];
      const audioStreams = [];

      // adaptiveFormats — отдельные видео и аудио дорожки (лучшее качество)
      for (const f of d.adaptiveFormats || []) {
        if (f.type?.startsWith('video/')) {
          videoStreams.push({
            url: f.url,
            quality: f.qualityLabel || f.quality,
            fps: f.fps,
            mimeType: f.type,
            videoOnly: true,
            codec: f.encoding,
          });
        } else if (f.type?.startsWith('audio/')) {
          audioStreams.push({
            url: f.url,
            quality: f.audioQuality || 'medium',
            bitrate: f.bitrate,
            mimeType: f.type,
          });
        }
      }

      // formatStreams — комбинированные видео+аудио (для простого воспроизведения)
      const combined = (d.videoStreams || d.formatStreams || []).map(f => ({
        url: f.url,
        quality: f.qualityLabel || f.quality,
        fps: f.fps,
        mimeType: f.type,
        videoOnly: false,
        codec: f.encoding,
      }));
      videoStreams.push(...combined);

      if (videoStreams.length === 0 && !d.hlsUrl) continue;

      state.invidiousIdx = idx;
      cache.set('best_invidious', inst.url);
      console.log(`✅ Invidious стримы от: ${inst.url}`);

      // Похожие видео из Invidious
      const relatedStreams = (d.recommendedVideos || []).slice(0, 12).map(v => ({
        id: v.videoId,
        title: v.title,
        thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
        channelTitle: v.author,
        duration: v.lengthSeconds
          ? `${Math.floor(v.lengthSeconds / 60)}:${String(v.lengthSeconds % 60).padStart(2, '0')}`
          : '',
        viewCount: v.viewCount,
      }));

      return {
        data: {
          hls: d.hlsUrl || null,
          videoStreams,
          audioStreams,
          subtitles: (d.captions || []).map(c => ({ url: c.url, label: c.label, languageCode: c.languageCode })),
          relatedStreams,
        },
        instanceUrl: inst.url,
        source: 'invidious',
      };
    } catch (e) {
      console.log(`⚠️  Invidious ${inst.url}: ${e.message}`);
    }
  }
  return null;
}

/**
 * Главная функция получения стримов.
 * Порядок: Piped → Invidious → null (клиент покажет embed)
 */
async function getStreams(videoId) {
  if (!state.piped.length && !state.invidious.length) loadInstances();

  const piped = await getStreamsFromPiped(videoId);
  if (piped) return piped;

  console.log(`🔄 Piped не дал стримы для ${videoId}, пробуем Invidious...`);
  const invidious = await getStreamsFromInvidious(videoId);
  if (invidious) return invidious;

  console.log(`❌ Все источники недоступны для ${videoId}`);
  return null;
}

// ──────────────────────────────────────────────
// Cobalt (скачивание)
// ──────────────────────────────────────────────
async function getBestCobaltInstance() {
  const cached = cache.get('best_cobalt');
  if (cached) return cached;
  for (let i = 0; i < state.cobalt.length; i++) {
    const idx = (state.cobaltIdx + i) % state.cobalt.length;
    const inst = state.cobalt[idx];
    try {
      await axios.get(`${inst.url}/api/serverInfo`, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': 'GoodbyeYT/2.0' },
      });
      state.cobaltIdx = idx;
      cache.set('best_cobalt', inst.url, 180);
      return inst.url;
    } catch {}
  }
  return null;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function getInstancesStatus() {
  return {
    updatedAt: state.updatedAt,
    piped:     { total: state.piped.length,     current: state.piped[state.pipedIdx]?.url },
    invidious: { total: state.invidious.length, current: state.invidious[state.invidiousIdx]?.url },
    cobalt:    { total: state.cobalt.length,    current: state.cobalt[state.cobaltIdx]?.url },
  };
}

function invalidateCache() {
  cache.flushAll();
  state.pipedIdx = 0;
  state.invidiousIdx = 0;
  state.cobaltIdx = 0;
}

// Загружаем при старте модуля
loadInstances();

module.exports = {
  loadInstances,
  getStreams,
  getStreamsFromPiped,
  getStreamsFromInvidious,
  getBestCobaltInstance,
  getInstancesStatus,
  invalidateCache,
};
