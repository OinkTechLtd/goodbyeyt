/**
 * GoodbyeYT — Frontend App
 * Полноценный SPA клиент, похожий на YouTube 2026
 */

'use strict';

// ============================================================
// STATE
// ============================================================
const State = {
  apiKey: localStorage.getItem('gyt_api_key') || '',
  theme: localStorage.getItem('gyt_theme') || 'dark',
  termsAccepted: localStorage.getItem('gyt_terms') === '1',
  history: JSON.parse(localStorage.getItem('gyt_history') || '[]'),
  currentView: 'home',
  currentQuery: '',
  nextPageToken: null,
  currentVideoId: null,
  skipAmount: 10,
};

// ============================================================
// UTILS
// ============================================================
function $(id) { return document.getElementById(id); }
function qsa(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

function formatViews(n) {
  if (!n) return '';
  const num = parseInt(n);
  if (num >= 1_000_000_000) return (num / 1e9).toFixed(1) + ' млрд просмотров';
  if (num >= 1_000_000) return (num / 1e6).toFixed(1) + ' млн просмотров';
  if (num >= 1_000) return (num / 1e3).toFixed(1) + ' тыс. просмотров';
  return num + ' просмотров';
}

function formatSubs(n) {
  if (!n) return '';
  const num = parseInt(n);
  if (num >= 1_000_000) return (num / 1e6).toFixed(1) + ' млн подписчиков';
  if (num >= 1_000) return (num / 1e3).toFixed(0) + ' тыс. подписчиков';
  return num + ' подписчиков';
}

function formatNum(n) {
  if (!n) return '0';
  const num = parseInt(n);
  if (num >= 1_000_000) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
}

function timeAgo(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин. назад';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч. назад';
  if (diff < 2592000) return Math.floor(diff / 86400) + ' дн. назад';
  if (diff < 31536000) return Math.floor(diff / 2592000) + ' мес. назад';
  return Math.floor(diff / 31536000) + ' лет назад';
}

function formatSeconds(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showView(name) {
  qsa('.view').forEach(v => v.classList.add('hidden'));
  const view = $(`view-${name}`);
  if (view) view.classList.remove('hidden');
  State.currentView = name;
  qsa('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === name);
  });
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  State.theme = t;
  localStorage.setItem('gyt_theme', t);
  const sel = $('theme-select');
  if (sel) sel.value = t;
}

// ============================================================
// API
// ============================================================
async function api(path, params = {}) {
  const url = new URL('/api' + path, location.origin);
  Object.entries(params).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: { 'x-youtube-api-key': State.apiKey }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка API');
  return data;
}

// ============================================================
// TERMS / ONBOARDING
// ============================================================
let tabsVisited = new Set();

function initTerms() {
  if (State.termsAccepted && State.apiKey) return startApp();
  if (!State.termsAccepted) return showTerms();
  if (!State.apiKey) return showApiSetup();
}

function showTerms() {
  $('terms-overlay').classList.remove('hidden');
  selectTermsTab('terms');

  qsa('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectTermsTab(btn.dataset.tab);
    });
  });

  $('open-terms-tab').addEventListener('click', () => selectTermsTab('terms'));
  $('open-privacy-tab').addEventListener('click', () => selectTermsTab('privacy'));

  $('terms-read-checkbox').addEventListener('change', checkTermsReady);

  $('accept-terms-btn').addEventListener('click', () => {
    const cb = $('terms-read-checkbox');
    if (!cb.checked) return;
    if (tabsVisited.size < 3) {
      $('read-warning').classList.remove('hidden');
      return;
    }
    localStorage.setItem('gyt_terms', '1');
    State.termsAccepted = true;
    $('terms-overlay').classList.add('hidden');
    if (!State.apiKey) showApiSetup();
    else startApp();
  });
}

function selectTermsTab(tab) {
  tabsVisited.add(tab);
  qsa('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  qsa('.tab-content').forEach(c => c.classList.add('hidden'));
  $(`tab-${tab}`).classList.remove('hidden');
  checkTermsReady();
}

function checkTermsReady() {
  const allVisited = tabsVisited.size >= 3;
  const checked = $('terms-read-checkbox').checked;
  $('accept-terms-btn').disabled = !(checked && allVisited);
  if (tabsVisited.size >= 3) $('read-warning').classList.add('hidden');
}

// ============================================================
// API KEY SETUP
// ============================================================
let currentStep = 1;
const TOTAL_STEPS = 4;

function showApiSetup() {
  $('apikey-overlay').classList.remove('hidden');
  goToStep(1);

  qsa('.next-step').forEach(btn => {
    btn.addEventListener('click', () => goToStep(currentStep + 1));
  });
  qsa('.prev-step').forEach(btn => {
    btn.addEventListener('click', () => goToStep(currentStep - 1));
  });
  qsa('.tutorial-tab').forEach(tab => {
    tab.addEventListener('click', () => goToStep(parseInt(tab.dataset.step)));
  });

  $('validate-key-btn').addEventListener('click', validateApiKey);
  $('api-key-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') validateApiKey();
  });
  $('save-key-btn').addEventListener('click', saveApiKey);
}

function goToStep(n) {
  n = Math.max(1, Math.min(TOTAL_STEPS, n));
  currentStep = n;
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const s = $(`step-${i}`);
    if (s) s.classList.toggle('hidden', i !== n);
  }
  qsa('.tutorial-tab').forEach(t => {
    t.classList.toggle('active', parseInt(t.dataset.step) === n);
  });
}

async function validateApiKey() {
  const key = $('api-key-input').value.trim();
  if (!key) return;

  const btn = $('validate-key-btn');
  const status = $('key-status');
  btn.textContent = '...';
  btn.disabled = true;
  status.className = 'key-status hidden';

  try {
    const res = await fetch('/api/validate-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key })
    });
    const data = await res.json();
    if (data.valid) {
      status.textContent = '✅ Ключ рабочий! Можно продолжить.';
      status.className = 'key-status success';
      $('save-key-btn').disabled = false;
    } else {
      status.textContent = '❌ ' + (data.error || 'Неверный ключ');
      status.className = 'key-status error';
    }
  } catch {
    status.textContent = '❌ Ошибка проверки. Попробуйте ещё раз.';
    status.className = 'key-status error';
  } finally {
    status.classList.remove('hidden');
    btn.textContent = 'Проверить';
    btn.disabled = false;
  }
}

function saveApiKey() {
  const key = $('api-key-input').value.trim();
  if (!key) return;
  State.apiKey = key;
  localStorage.setItem('gyt_api_key', key);
  $('apikey-overlay').classList.add('hidden');
  toast('API ключ сохранён!', 'success');
  startApp();
}

// ============================================================
// APP START
// ============================================================
function startApp() {
  applyTheme(State.theme);
  initHeader();
  initSidebar();
  initSettings();
  loadHome();
  checkInstanceStatus();
}

// ============================================================
// HOME
// ============================================================
let homeLoaded = false;

async function loadHome() {
  if (homeLoaded) return;
  homeLoaded = true;
  showView('home');
  await loadTrending();
}

async function loadTrending(category) {
  const grid = $('video-grid');
  State.nextPageToken = null;
  grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Загружаем видео...</p></div>';

  try {
    const data = await api('/trending', { regionCode: 'US', ...(category ? { categoryId: category } : {}) });
    renderVideoGrid(grid, data.items, false);
    $('load-more-btn').classList.add('hidden');
  } catch (err) {
    grid.innerHTML = `<div class="loading-state"><p>⚠️ ${err.message}</p><p style="font-size:13px;color:var(--text3)">Убедитесь, что API ключ верный</p></div>`;
  }
}

// ============================================================
// SEARCH
// ============================================================
async function doSearch(q, append = false) {
  if (!q.trim()) return;
  State.currentQuery = q;
  showView('home');

  const grid = $('video-grid');
  if (!append) {
    State.nextPageToken = null;
    grid.innerHTML = renderSkeletons(12);
  }

  try {
    const params = { q, maxResults: 24 };
    if (State.nextPageToken) params.pageToken = State.nextPageToken;

    const data = await api('/search', params);
    State.nextPageToken = data.nextPageToken;

    renderVideoGrid(grid, data.items, append);

    const btn = $('load-more-btn');
    if (data.nextPageToken) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
  } catch (err) {
    if (!append) {
      grid.innerHTML = `<div class="loading-state"><p>⚠️ ${err.message}</p></div>`;
    }
    toast(err.message, 'error');
  }
}

function renderSkeletons(n) {
  return Array(n).fill(0).map(() => `
    <div class="video-card">
      <div class="skeleton skeleton-thumb"></div>
      <div class="card-info">
        <div class="skeleton" style="width:36px;height:36px;border-radius:50%;flex-shrink:0"></div>
        <div style="flex:1">
          <div class="skeleton skeleton-line w80"></div>
          <div class="skeleton skeleton-line w60"></div>
        </div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// VIDEO GRID
// ============================================================
function renderVideoGrid(container, items, append) {
  if (!append) container.innerHTML = '';
  if (!items?.length) {
    container.innerHTML = '<div class="loading-state"><div class="empty-icon">🔍</div><p>Ничего не найдено</p></div>';
    return;
  }
  items.forEach(v => {
    const card = createVideoCard(v);
    container.appendChild(card);
  });
}

function createVideoCard(v) {
  const div = document.createElement('div');
  div.className = 'video-card';
  div.innerHTML = `
    <div class="thumb-wrap">
      <img class="thumb-img" src="${v.thumbnail || ''}" alt="${escHtml(v.title)}" loading="lazy" />
      <span class="thumb-duration">${v.duration || ''}</span>
    </div>
    <div class="card-info">
      <div class="card-avatar">📺</div>
      <div class="card-text">
        <div class="card-title">${escHtml(v.title)}</div>
        <div class="card-channel">${escHtml(v.channelTitle || '')}</div>
        <div class="card-meta">${formatNum(v.viewCount)} просм. · ${timeAgo(v.publishedAt)}</div>
      </div>
    </div>
  `;
  div.addEventListener('click', () => openVideo(v.id));
  return div;
}

// ============================================================
// VIDEO PLAYER
// ============================================================
let videoData = null;
let hlsInstance = null;
let commentPageToken = null;

async function openVideo(id) {
  showView('player');
  State.currentVideoId = id;
  window.scrollTo(0, 0);

  // Reset player
  const video = $('main-video');
  video.pause();
  video.src = '';
  $('video-title').textContent = 'Загрузка...';
  $('video-stats').textContent = '';
  $('video-description').textContent = '';
  $('channel-name').textContent = '';
  $('channel-subs').textContent = '';
  $('related-list').innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  $('comments-list').innerHTML = '';
  $('load-more-comments').classList.add('hidden');
  $('player-spinner').classList.remove('hidden');

  // Add to history
  addToHistory(id);

  try {
    videoData = await api(`/video/${id}`);
    renderVideoInfo(videoData);
    await initPlayer(videoData);
    loadComments(id);
  } catch (err) {
    toast('Ошибка загрузки видео: ' + err.message, 'error');
    $('video-title').textContent = 'Ошибка загрузки';
    $('player-spinner').classList.add('hidden');
  }
}

function renderVideoInfo(v) {
  $('video-title').textContent = v.title;
  $('video-stats').textContent = `${formatViews(v.viewCount)} · ${timeAgo(v.publishedAt)}`;
  $('like-count').textContent = formatNum(v.likeCount);
  $('channel-name').textContent = v.channelTitle;
  $('channel-subs').textContent = v.channelId ? '' : '';
  $('video-description').textContent = v.description || '';
  $('video-description').classList.remove('expanded');
  $('expand-desc').textContent = 'Ещё';

  // Channel avatar
  $('channel-row').onclick = () => {};

  // Related
  renderRelated(v.relatedStreams);
}

async function initPlayer(v) {
  const video = $('main-video');

  // Build quality options
  const qualitySelect = $('quality-select');
  qualitySelect.innerHTML = '<option value="auto">Авто (HLS)</option>';

  let streams = v.streams;
  let embedFallback = null;

  // If no streams yet, fetch via /stream/sources (перебирает все инстансы)
  if (!streams) {
    try {
      const res = await fetch(`/stream/sources/${v.id}`);
      const data = await res.json();
      if (res.ok && !data.fallback) {
        streams = data;
        // Похожие видео из Piped (если ещё не загружены через API)
        if (data.relatedStreams?.length && !v.relatedStreams?.length) {
          v.relatedStreams = data.relatedStreams;
          renderRelated(v.relatedStreams);
        }
      } else if (data.fallback === 'embed') {
        embedFallback = data.embedUrl || `https://www.youtube-nocookie.com/embed/${v.id}`;
      }
    } catch {
      embedFallback = `https://www.youtube-nocookie.com/embed/${v.id}`;
    }
  }

  if (streams?.hls) {
    // HLS stream via hls.js or native
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      if (hlsInstance) { hlsInstance.destroy(); }
      hlsInstance = new Hls({ enableWorker: false });
      hlsInstance.loadSource(streams.hls);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        $('player-spinner').classList.add('hidden');

        // Quality levels from HLS
        hlsInstance.levels.forEach((lvl, i) => {
          const opt = document.createElement('option');
          opt.value = i;
          opt.textContent = `${lvl.height}p`;
          qualitySelect.appendChild(opt);
        });
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streams.hls;
      video.play().catch(() => {});
      $('player-spinner').classList.add('hidden');
    }
  } else if (streams?.videoStreams?.length) {
    // Direct streams
    const videoStreams = streams.videoStreams.filter(s => !s.videoOnly);
    if (!videoStreams.length && streams.videoStreams.length) {
      video.src = streams.videoStreams[0].url;
    } else {
      video.src = videoStreams[0]?.url || streams.videoStreams[0].url;
    }

    videoStreams.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = s.quality || `Поток ${i+1}`;
      if (i === 0) opt.selected = true;
      qualitySelect.appendChild(opt);
    });

    qualitySelect.onchange = () => {
      const idx = parseInt(qualitySelect.value);
      if (!isNaN(idx) && videoStreams[idx]) {
        const currentTime = video.currentTime;
        const playing = !video.paused;
        video.src = videoStreams[idx].url;
        video.currentTime = currentTime;
        if (playing) video.play();
      }
    };

    video.play().catch(() => {});
    $('player-spinner').classList.add('hidden');
  } else {
    // Fallback: YouTube embed (работает всегда)
    $('player-spinner').classList.add('hidden');
    const url = embedFallback || `https://www.youtube-nocookie.com/embed/${v.id}`;
    showEmbedFallback(url);
  }
}

function showEmbedFallback(embedUrl) {
  const video = $('main-video');
  const wrapper = video.parentElement;

  // Скрываем <video> и показываем iframe
  video.style.display = 'none';
  let iframe = wrapper.querySelector('.embed-iframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.className = 'embed-iframe';
    iframe.style.cssText = 'width:100%;height:100%;border:0;position:absolute;top:0;left:0;';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.allowFullscreen = true;
    wrapper.appendChild(iframe);
  }
  iframe.src = embedUrl;
  iframe.style.display = 'block';
}

function renderRelated(relatedStreams) {
  const related = $('related-list');
  if (!related) return;
  related.innerHTML = '';
  if (relatedStreams?.length) {
    relatedStreams.forEach(r => {
      const card = document.createElement('div');
      card.className = 'related-card';
      card.innerHTML = `
        <div class="related-thumb">
          <img src="${r.thumbnail || ''}" alt="${escHtml(r.title)}" loading="lazy" />
          <span class="thumb-duration">${r.duration || ''}</span>
        </div>
        <div class="related-info">
          <div class="related-title">${escHtml(r.title)}</div>
          <div class="related-channel">${escHtml(r.channelTitle || '')}</div>
          <div class="related-meta">${formatNum(r.viewCount)} просм.</div>
        </div>
      `;
      card.addEventListener('click', () => openVideo(r.id));
      related.appendChild(card);
    });
  }
}

// ============================================================
// PLAYER CONTROLS
// ============================================================
function initPlayerControls() {
  const video = $('main-video');
  const wrapper = document.querySelector('.player-wrapper');
  const progressBar = $('progress-bar');
  const progressPlayed = $('progress-played');
  const progressBuffered = $('progress-buffered');
  const progressThumb = $('progress-thumb');
  const timeDisplay = $('time-display');

  // Show controls on hover
  let hideTimer;
  wrapper?.addEventListener('mousemove', () => {
    wrapper.classList.add('show-controls');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => wrapper.classList.remove('show-controls'), 3000);
  });
  wrapper?.addEventListener('mouseleave', () => {
    clearTimeout(hideTimer);
    wrapper.classList.remove('show-controls');
  });

  // Click to play/pause
  $('player-click-zone')?.addEventListener('click', () => {
    if (video.paused) video.play();
    else video.pause();
  });

  // Play/Pause button
  $('play-pause-btn')?.addEventListener('click', () => {
    if (video.paused) video.play();
    else video.pause();
  });

  video.addEventListener('play', () => {
    document.querySelector('.icon-play')?.classList.add('hidden');
    document.querySelector('.icon-pause')?.classList.remove('hidden');
  });
  video.addEventListener('pause', () => {
    document.querySelector('.icon-play')?.classList.remove('hidden');
    document.querySelector('.icon-pause')?.classList.add('hidden');
  });

  // Skip buttons
  $('prev-10-btn')?.addEventListener('click', () => { video.currentTime -= State.skipAmount; });
  $('next-10-btn')?.addEventListener('click', () => { video.currentTime += State.skipAmount; });

  // Skip amount select
  $('skip-amount-select')?.addEventListener('change', (e) => {
    State.skipAmount = parseInt(e.target.value);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ($('view-player').classList.contains('hidden')) return;
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    switch(e.key) {
      case ' ': e.preventDefault(); video.paused ? video.play() : video.pause(); break;
      case 'ArrowLeft': video.currentTime -= State.skipAmount; break;
      case 'ArrowRight': video.currentTime += State.skipAmount; break;
      case 'ArrowUp': e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); break;
      case 'ArrowDown': e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); break;
      case 'm': case 'M': video.muted = !video.muted; break;
      case 'f': case 'F': toggleFullscreen(); break;
    }
  });

  // Progress bar
  let dragging = false;
  function updateProgress(e) {
    const rect = progressBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (video.duration) video.currentTime = pct * video.duration;
  }
  progressBar?.addEventListener('mousedown', (e) => { dragging = true; updateProgress(e); });
  document.addEventListener('mousemove', (e) => { if (dragging) updateProgress(e); });
  document.addEventListener('mouseup', () => { dragging = false; });

  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    if (progressPlayed) progressPlayed.style.width = pct + '%';
    if (progressThumb) progressThumb.style.left = pct + '%';
    if (timeDisplay) timeDisplay.textContent = `${formatSeconds(video.currentTime)} / ${formatSeconds(video.duration)}`;
  });

  video.addEventListener('progress', () => {
    if (video.buffered.length && video.duration) {
      const pct = (video.buffered.end(video.buffered.length - 1) / video.duration) * 100;
      if (progressBuffered) progressBuffered.style.width = pct + '%';
    }
  });

  video.addEventListener('waiting', () => { $('player-spinner')?.classList.remove('hidden'); });
  video.addEventListener('canplay', () => { $('player-spinner')?.classList.add('hidden'); });

  // Volume
  const volSlider = $('volume-slider');
  const muteBtn = $('mute-btn');
  volSlider?.addEventListener('input', () => { video.volume = parseFloat(volSlider.value); video.muted = false; });
  muteBtn?.addEventListener('click', () => {
    video.muted = !video.muted;
    document.querySelector('.icon-vol')?.classList.toggle('hidden', video.muted);
    document.querySelector('.icon-mute')?.classList.toggle('hidden', !video.muted);
  });

  // Speed
  $('speed-select')?.addEventListener('change', (e) => { video.playbackRate = parseFloat(e.target.value); });

  // Quality (HLS)
  $('quality-select')?.addEventListener('change', (e) => {
    if (hlsInstance) {
      hlsInstance.currentLevel = parseInt(e.target.value) || -1;
    }
  });

  // Fullscreen
  $('fullscreen-btn')?.addEventListener('click', toggleFullscreen);

  document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    document.querySelector('.icon-fs-enter')?.classList.toggle('hidden', isFs);
    document.querySelector('.icon-fs-exit')?.classList.toggle('hidden', !isFs);
  });
}

function toggleFullscreen() {
  const wrapper = document.querySelector('.player-wrapper');
  if (!document.fullscreenElement) wrapper?.requestFullscreen();
  else document.exitFullscreen();
}

// ============================================================
// COMMENTS
// ============================================================
async function loadComments(id, append = false) {
  const list = $('comments-list');
  if (!append) { list.innerHTML = ''; commentPageToken = null; }

  try {
    const params = {};
    if (commentPageToken) params.pageToken = commentPageToken;
    const data = await api(`/comments/${id}`, params);
    commentPageToken = data.nextPageToken;

    data.items.forEach(c => {
      const div = document.createElement('div');
      div.className = 'comment-item';
      div.innerHTML = `
        <div class="comment-avatar">
          ${c.authorAvatar ? `<img src="${c.authorAvatar}" loading="lazy" />` : '💬'}
        </div>
        <div class="comment-body">
          <div class="comment-author">${escHtml(c.authorName)}</div>
          <div class="comment-text">${escHtml(c.text)}</div>
          <div class="comment-meta">👍 ${formatNum(c.likeCount)} · ${timeAgo(c.publishedAt)}${c.replyCount > 0 ? ` · ${c.replyCount} ответов` : ''}</div>
        </div>
      `;
      list.appendChild(div);
    });

    $('comments-count').textContent = 'Комментарии';
    const loadMoreBtn = $('load-more-comments');
    if (data.nextPageToken) loadMoreBtn.classList.remove('hidden');
    else loadMoreBtn.classList.add('hidden');
  } catch {
    // Комментарии могут быть отключены
    $('comments-section').style.display = 'none';
  }
}

// ============================================================
// TRENDING VIEW
// ============================================================
async function loadTrendingView() {
  showView('trending');
  const grid = $('trending-grid');
  grid.innerHTML = renderSkeletons(12);
  try {
    const data = await api('/trending', { regionCode: 'US' });
    renderVideoGrid(grid, data.items, false);
  } catch (err) {
    grid.innerHTML = `<div class="loading-state"><p>⚠️ ${err.message}</p></div>`;
  }
}

// ============================================================
// HISTORY
// ============================================================
function addToHistory(id) {
  State.history = State.history.filter(h => h.id !== id);
  State.history.unshift({ id, timestamp: Date.now() });
  State.history = State.history.slice(0, 50);
  localStorage.setItem('gyt_history', JSON.stringify(State.history));
}

async function loadHistoryView() {
  showView('history');
  const grid = $('history-grid');
  grid.innerHTML = '';

  if (!State.history.length) {
    $('history-empty').classList.remove('hidden');
    return;
  }
  $('history-empty').classList.add('hidden');

  grid.innerHTML = renderSkeletons(Math.min(State.history.length, 12));

  // Fetch details for history items
  const ids = State.history.slice(0, 24).map(h => h.id).join(',');
  try {
    // Use search approach — fetch each
    const items = [];
    for (const h of State.history.slice(0, 12)) {
      try {
        const v = await api(`/video/${h.id}`);
        items.push(v);
      } catch {}
    }
    renderVideoGrid(grid, items, false);
  } catch {
    grid.innerHTML = '<div class="loading-state"><p>Не удалось загрузить историю</p></div>';
  }
}

// ============================================================
// INSTANCE STATUS
// ============================================================
async function checkInstanceStatus() {
  try {
    const data = await fetch('/api/instances/status').then(r => r.json());
    const dot = document.querySelector('.instance-indicator .dot');
    const indicator = $('instance-indicator');

    if (data.piped.total > 0) {
      dot.className = 'dot';
      indicator.title = `Piped: ${data.piped.total} инстансов | Cobalt: ${data.cobalt.total} инстансов`;
      $('instances-status-text').textContent = `Piped: ${data.piped.total} | Cobalt: ${data.cobalt.total}`;
    } else {
      dot.className = 'dot warn';
    }
  } catch {}
}

// ============================================================
// HEADER
// ============================================================
function initHeader() {
  // Search
  const input = $('search-input');
  const btn = $('search-btn');

  function triggerSearch() {
    const q = input.value.trim();
    if (q) doSearch(q);
  }

  btn.addEventListener('click', triggerSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') triggerSearch(); });

  // Voice search
  $('voice-btn')?.addEventListener('click', () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast('Голосовой поиск не поддерживается в этом браузере', 'error');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'ru-RU';
    rec.start();
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      input.value = text;
      doSearch(text);
    };
    rec.onerror = () => toast('Ошибка голосового поиска', 'error');
  });

  // Logo / home
  $('home-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    State.currentQuery = '';
    input.value = '';
    homeLoaded = false;
    loadHome();
  });

  // Chips
  qsa('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      qsa('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const q = chip.dataset.q;
      if (!q) {
        homeLoaded = false;
        loadHome();
      } else {
        doSearch(q);
      }
    });
  });

  // Load more
  $('load-more-btn')?.addEventListener('click', () => {
    doSearch(State.currentQuery, true);
  });

  // Settings button
  $('settings-btn')?.addEventListener('click', () => {
    $('settings-backdrop').classList.remove('hidden');
    checkInstanceStatus();
  });

  // Description expand
  $('expand-desc')?.addEventListener('click', () => {
    const desc = $('video-description');
    const expanded = desc.classList.toggle('expanded');
    $('expand-desc').textContent = expanded ? 'Скрыть' : 'Ещё';
  });

  // Comments load more
  $('load-more-comments')?.addEventListener('click', () => {
    if (State.currentVideoId) loadComments(State.currentVideoId, true);
  });

  // Share button
  $('share-btn')?.addEventListener('click', () => {
    const url = `https://youtube.com/watch?v=${State.currentVideoId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => toast('Ссылка скопирована!', 'success'));
    }
  });
}

// ============================================================
// SIDEBAR
// ============================================================
function initSidebar() {
  const sidebar = $('sidebar');

  $('sidebar-toggle')?.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('open');
    } else {
      document.body.classList.toggle('sidebar-mini');
    }
  });

  $('nav-home')?.addEventListener('click', (e) => {
    e.preventDefault();
    homeLoaded = false;
    loadHome();
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
  });

  $('nav-trending')?.addEventListener('click', (e) => {
    e.preventDefault();
    loadTrendingView();
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
  });

  $('nav-history')?.addEventListener('click', (e) => {
    e.preventDefault();
    loadHistoryView();
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
  });

  $('nav-instances')?.addEventListener('click', (e) => {
    e.preventDefault();
    $('settings-backdrop').classList.remove('hidden');
    checkInstanceStatus();
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
  });

  $('nav-about')?.addEventListener('click', (e) => {
    e.preventDefault();
    showView('about');
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
  });

  // Close sidebar on outside click (mobile)
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 &&
        sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        !$('sidebar-toggle').contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
}

// ============================================================
// SETTINGS
// ============================================================
function initSettings() {
  $('close-settings')?.addEventListener('click', () => {
    $('settings-backdrop').classList.add('hidden');
  });

  $('settings-backdrop')?.addEventListener('click', (e) => {
    if (e.target === $('settings-backdrop')) $('settings-backdrop').classList.add('hidden');
  });

  $('theme-select')?.addEventListener('change', (e) => { applyTheme(e.target.value); });

  $('change-key-settings')?.addEventListener('click', () => {
    $('settings-backdrop').classList.add('hidden');
    $('apikey-overlay').classList.remove('hidden');
    goToStep(4);
  });

  $('clear-history-btn')?.addEventListener('click', () => {
    if (confirm('Очистить историю просмотров?')) {
      State.history = [];
      localStorage.removeItem('gyt_history');
      toast('История очищена', 'success');
    }
  });

  $('reset-all-btn')?.addEventListener('click', () => {
    if (confirm('Сбросить все данные? Это удалит API ключ и настройки.')) {
      localStorage.clear();
      location.reload();
    }
  });

  // About page buttons
  $('show-terms-again')?.addEventListener('click', () => {
    tabsVisited.clear();
    $('terms-overlay').classList.remove('hidden');
    selectTermsTab('terms');
  });

  $('change-api-key')?.addEventListener('click', () => {
    $('apikey-overlay').classList.remove('hidden');
    goToStep(4);
  });

  // Apply saved theme
  $('theme-select').value = State.theme;
}

// ============================================================
// HELPERS
// ============================================================
function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(State.theme);
  initPlayerControls();
  initTerms();
});
