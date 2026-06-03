#!/usr/bin/env node
/**
 * GoodbyeYT — Instance Updater
 * Поисковой робот: находит рабочие Piped, Invidious и Cobalt инстансы
 * Запускается через GitHub Actions каждые 6 часов
 *
 * Источники списков:
 *   Piped    → https://piped-instances.kavin.rocks/          (JSON)
 *   Invidious → https://api.invidious.io/instances.json       (JSON)
 *   Cobalt   → https://instances.cobalt.tools/instances.json  (JSON)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const INSTANCES_FILE = path.join(__dirname, '../../data/instances.json');
const TIMEOUT = 8000;
const CONCURRENT = 10; // сколько инстансов проверяем одновременно

// ──────────────────────────────────────────────
// Bootstrap — используются если официальный список недоступен
// ──────────────────────────────────────────────
const BOOTSTRAP = {
  piped: [
    'https://piped.video/api',
    'https://pipedapi.kavin.rocks',
    'https://api.piped.projectsegfau.lt',
    'https://api.piped.private.coffee',
    'https://piped-api.garudalinux.org',
    'https://pipedapi.adminforge.de',
    'https://piped-api.privacy.com.de',
    'https://pipedapi.darkness.services',
    'https://piped.lunar.icu/api',
    'https://piped-api.hostux.net',
    'https://piped-api.codespanish.com',
    'https://pipedapi.leptons.xyz',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.moomoo.me',
    'https://piped.ggtyler.dev/api',
    'https://piped.syncapod.com/api',
  ],
  invidious: [
    'https://invidious.snopyta.org',
    'https://yewtu.be',
    'https://inv.riverside.rocks',
    'https://invidious.kavin.rocks',
    'https://invidious.tiekoetter.com',
    'https://invidious.adminforge.de',
    'https://vid.puffyan.us',
    'https://invidious.privacydev.net',
    'https://inv.bp.projectsegfau.lt',
    'https://invidious.slipfox.xyz',
    'https://invidious.namazso.eu',
    'https://invidious.flokinet.to',
    'https://iv.melmac.space',
    'https://invidious.esmailelbob.xyz',
    'https://invidious.projectsegfau.lt',
    'https://yt.artemislena.eu',
    'https://invidious.lunar.icu',
    'https://invidious.privacyredirect.com',
    'https://invidious.fdn.fr',
    'https://tube.cadence.moe',
  ],
  cobalt: [
    'https://co.wuk.sh',
    'https://cobalt.catgirl.land',
    'https://cobalt-api.ayo.tf',
    'https://coapi.erzberger.dev',
  ],
};

// ──────────────────────────────────────────────
// Параллельный обход массива с ограничением concurrency
// ──────────────────────────────────────────────
async function pMap(arr, fn, concurrency = CONCURRENT) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < arr.length) {
      const idx = i++;
      results[idx] = await fn(arr[idx]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, arr.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ──────────────────────────────────────────────
// Проверка Piped: /healthcheck → /trending?region=US
// ──────────────────────────────────────────────
async function checkPiped(url) {
  const start = Date.now();
  // попытка 1 — /healthcheck
  try {
    const r = await axios.get(`${url}/healthcheck`, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'GoodbyeYT-Bot/2.0' },
    });
    if (r.status === 200) return { url, latency: Date.now() - start, type: 'piped' };
  } catch {}
  // попытка 2 — /trending (некоторые инстансы не имеют /healthcheck)
  try {
    const r = await axios.get(`${url}/trending?region=US`, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'GoodbyeYT-Bot/2.0' },
    });
    if (r.status === 200 && Array.isArray(r.data)) {
      return { url, latency: Date.now() - start, type: 'piped' };
    }
  } catch {}
  return null;
}

// ──────────────────────────────────────────────
// Проверка Invidious: /api/v1/stats
// ──────────────────────────────────────────────
async function checkInvidious(url) {
  const start = Date.now();
  try {
    const r = await axios.get(`${url}/api/v1/stats`, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'GoodbyeYT-Bot/2.0' },
    });
    if (r.status === 200 && r.data) {
      // Проверяем что это реально Invidious (есть поле software или version)
      if (r.data.software || r.data.version || r.data.openRegistrations !== undefined) {
        return { url, latency: Date.now() - start, type: 'invidious' };
      }
    }
  } catch {}
  // Запасной endpoint — просто главная страница API
  try {
    const r = await axios.get(`${url}/api/v1/trending`, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'GoodbyeYT-Bot/2.0' },
    });
    if (r.status === 200 && Array.isArray(r.data)) {
      return { url, latency: Date.now() - start, type: 'invidious' };
    }
  } catch {}
  return null;
}

// ──────────────────────────────────────────────
// Проверка Cobalt: /api/serverInfo
// ──────────────────────────────────────────────
async function checkCobalt(url) {
  const start = Date.now();
  try {
    const r = await axios.get(`${url}/api/serverInfo`, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'GoodbyeYT-Bot/2.0' },
    });
    if (r.status === 200 && r.data) {
      return { url, latency: Date.now() - start, type: 'cobalt' };
    }
  } catch {}
  return null;
}

// ──────────────────────────────────────────────
// Получение официального списка Piped
// ──────────────────────────────────────────────
async function fetchPipedList() {
  try {
    const r = await axios.get('https://piped-instances.kavin.rocks/', {
      timeout: 12000,
      headers: { Accept: 'application/json', 'User-Agent': 'GoodbyeYT-Bot/2.0' },
    });
    if (Array.isArray(r.data)) {
      const urls = r.data
        .filter(i => i.api_url)
        .map(i => i.api_url.replace(/\/$/, ''));
      console.log(`  📋 Piped официальный список: ${urls.length} инстансов`);
      return urls;
    }
  } catch (e) {
    console.log(`  ⚠️  Piped список недоступен: ${e.message}`);
  }
  return [];
}

// ──────────────────────────────────────────────
// Получение официального списка Invidious
// https://api.invidious.io/instances.json
// Формат: [[name, {uri, api, type, ...}], ...]
// ──────────────────────────────────────────────
async function fetchInvidiousList() {
  try {
    const r = await axios.get('https://api.invidious.io/instances.json', {
      timeout: 12000,
      headers: { 'User-Agent': 'GoodbyeYT-Bot/2.0' },
    });
    if (Array.isArray(r.data)) {
      const urls = r.data
        .filter(([, info]) => info && info.api === true && info.uri)
        .map(([, info]) => info.uri.replace(/\/$/, ''));
      console.log(`  📋 Invidious официальный список: ${urls.length} инстансов`);
      return urls;
    }
  } catch (e) {
    console.log(`  ⚠️  Invidious список недоступен: ${e.message}`);
  }
  return [];
}

// ──────────────────────────────────────────────
// Получение официального списка Cobalt
// ──────────────────────────────────────────────
async function fetchCobaltList() {
  try {
    const r = await axios.get('https://instances.cobalt.tools/instances.json', {
      timeout: 12000,
      headers: { 'User-Agent': 'GoodbyeYT-Bot/2.0' },
    });
    if (Array.isArray(r.data)) {
      const urls = r.data
        .filter(i => i.api && i.api.url)
        .map(i => i.api.url.replace(/\/$/, ''));
      console.log(`  📋 Cobalt официальный список: ${urls.length} инстансов`);
      return urls;
    }
  } catch (e) {
    console.log(`  ⚠️  Cobalt список недоступен: ${e.message}`);
  }
  return [];
}

// ──────────────────────────────────────────────
// Главная функция
// ──────────────────────────────────────────────
async function updateInstances() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   GoodbyeYT Instance Updater v2.0        ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`📅 ${new Date().toISOString()}\n`);

  // 1. Загружаем официальные списки
  console.log('📡 Загружаем официальные списки инстансов...');
  const [officialPiped, officialInvidious, officialCobalt] = await Promise.all([
    fetchPipedList(),
    fetchInvidiousList(),
    fetchCobaltList(),
  ]);

  // 2. Объединяем с bootstrap (дедупликация)
  const allPiped     = [...new Set([...officialPiped,     ...BOOTSTRAP.piped])];
  const allInvidious = [...new Set([...officialInvidious, ...BOOTSTRAP.invidious])];
  const allCobalt    = [...new Set([...officialCobalt,    ...BOOTSTRAP.cobalt])];

  console.log(`\n📊 Для проверки:`);
  console.log(`   Piped:     ${allPiped.length}`);
  console.log(`   Invidious: ${allInvidious.length}`);
  console.log(`   Cobalt:    ${allCobalt.length}\n`);

  // 3. Параллельная проверка (с ограничением concurrency)
  console.log('⚡ Проверяем Piped...');
  const pipedResults = (await pMap(allPiped, checkPiped)).filter(Boolean)
    .sort((a, b) => a.latency - b.latency);
  console.log(`   ✅ Рабочих: ${pipedResults.length}/${allPiped.length}`);

  console.log('⚡ Проверяем Invidious...');
  const invidiousResults = (await pMap(allInvidious, checkInvidious)).filter(Boolean)
    .sort((a, b) => a.latency - b.latency);
  console.log(`   ✅ Рабочих: ${invidiousResults.length}/${allInvidious.length}`);

  console.log('⚡ Проверяем Cobalt...');
  const cobaltResults = (await pMap(allCobalt, checkCobalt)).filter(Boolean)
    .sort((a, b) => a.latency - b.latency);
  console.log(`   ✅ Рабочих: ${cobaltResults.length}/${allCobalt.length}`);

  // 4. Сохраняем
  const dataDir = path.dirname(INSTANCES_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const result = {
    updatedAt: new Date().toISOString(),
    piped: pipedResults.map(i => ({ url: i.url, latency: i.latency })),
    invidious: invidiousResults.map(i => ({ url: i.url, latency: i.latency })),
    cobalt: cobaltResults.map(i => ({ url: i.url, latency: i.latency })),
    stats: {
      pipedTotal: allPiped.length,       pipedWorking: pipedResults.length,
      invidiousTotal: allInvidious.length, invidiousWorking: invidiousResults.length,
      cobaltTotal: allCobalt.length,     cobaltWorking: cobaltResults.length,
    },
  };

  fs.writeFileSync(INSTANCES_FILE, JSON.stringify(result, null, 2));

  console.log('\n💾 Сохранено в', INSTANCES_FILE);
  console.log('\n📊 Топ-5 Piped по скорости:');
  pipedResults.slice(0, 5).forEach((i, n) =>
    console.log(`  ${n + 1}. ${i.url}  (${i.latency}ms)`)
  );
  console.log('\n📊 Топ-5 Invidious по скорости:');
  invidiousResults.slice(0, 5).forEach((i, n) =>
    console.log(`  ${n + 1}. ${i.url}  (${i.latency}ms)`)
  );

  if (pipedResults.length === 0 && invidiousResults.length === 0) {
    console.error('\n❌ КРИТИЧНО: Нет ни одного рабочего инстанса!');
    process.exit(1);
  }

  console.log('\n✨ Обновление завершено!');
  return result;
}

if (require.main === module) {
  updateInstances().catch(err => {
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  });
}

module.exports = { updateInstances, checkPiped, checkInvidious, checkCobalt };
