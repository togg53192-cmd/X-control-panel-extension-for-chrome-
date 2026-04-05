// ================================================
// X Control Panel — Content Script v4
// ================================================

(function () {
  'use strict';

  let settings = null;
  let customStyleEl, userCSSEl, themeStyleEl, cssThemeEl, fontSizeEl, sidebarHideEl, grokBlockEl, volumeStyleEl, suggestedHideEl;
  const tweetDecisions = new WeakMap();

  // ==================== INDEXEDDB MEDIA GALLERY ====================
  const DB_NAME = 'xcp-media-gallery';
  const DB_VERSION = 1;
  let mediaDB = null;

  function openMediaDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('media')) {
          const store = db.createObjectStore('media', { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
      };
      req.onsuccess = (e) => { mediaDB = e.target.result; resolve(mediaDB); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function saveMedia(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const tx = mediaDB.transaction('media', 'readwrite');
        const store = tx.objectStore('media');
        const item = {
          name: file.name, type: file.type, size: file.size,
          data: reader.result, timestamp: Date.now()
        };
        const req = store.add(item);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      };
      reader.readAsDataURL(file);
    });
  }

  function getAllMedia() {
    return new Promise((resolve, reject) => {
      const tx = mediaDB.transaction('media', 'readonly');
      const store = tx.objectStore('media');
      const req = store.index('timestamp').openCursor(null, 'prev');
      const items = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { items.push(cursor.value); cursor.continue(); }
        else resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function deleteMedia(id) {
    return new Promise((resolve, reject) => {
      const tx = mediaDB.transaction('media', 'readwrite');
      const store = tx.objectStore('media');
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function getMediaById(id) {
    return new Promise((resolve, reject) => {
      const tx = mediaDB.transaction('media', 'readonly');
      const store = tx.objectStore('media');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ==================== INIT ====================
  init();

  async function init() {
    settings = await getSettings();
    if (!settings) return;

    await openMediaDB();
    injectStyleElements();
    applyAll();
    observeTimeline();
    checkTimedMutes();
    setupTcoBypass();
    setupCustomFeedTab();

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'SETTINGS_UPDATED') {
        const oldFeedEnabled = settings?.customFeed?.enabled;
        const oldFeedSlots = JSON.stringify(settings?.customFeed?.slots || []);
        settings = msg.settings;
        const newFeedSlots = JSON.stringify(settings?.customFeed?.slots || []);
        if (oldFeedSlots !== newFeedSlots || oldFeedEnabled !== settings?.customFeed?.enabled) {
          resetCustomFeed();
        }
        applyAll();
        setupTcoBypass();
      }
      if (msg.type === 'RUN_SCRIPT') {
        sendResponse(executeUserScript(msg.script));
        return true;
      }
      if (msg.type === 'GALLERY_GET_ALL') {
        getAllMedia().then(items => {
          sendResponse(items.map(i => ({ id: i.id, name: i.name, type: i.type, size: i.size, timestamp: i.timestamp, data: i.data })));
        }).catch(e => sendResponse({ error: e.message }));
        return true;
      }
      if (msg.type === 'GALLERY_SAVE') {
        const tx = mediaDB.transaction('media', 'readwrite');
        const store = tx.objectStore('media');
        const item = { name: msg.fileData.name, type: msg.fileData.type, size: msg.fileData.size, data: msg.fileData.dataUrl, timestamp: Date.now() };
        const req = store.add(item);
        req.onsuccess = () => sendResponse({ id: req.result });
        req.onerror = () => sendResponse({ error: 'Failed to save' });
        return true;
      }
      if (msg.type === 'GALLERY_DELETE') {
        deleteMedia(msg.id).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ error: e.message }));
        return true;
      }
      if (msg.type === 'GALLERY_COPY_TO_CLIPBOARD') {
        getMediaById(msg.id).then(async (item) => {
          if (!item) { sendResponse({ error: 'Not found' }); return; }
          try {
            const resp = await fetch(item.data);
            const blob = await resp.blob();
            await navigator.clipboard.write([new ClipboardItem({ [item.type]: blob })]);
            sendResponse({ ok: true });
          } catch (e) { sendResponse({ error: e.message }); }
        });
        return true;
      }
      if (msg.type === 'CHECK_WATCHED_USERS') {
        checkWatchedUsers(msg.users);
      }
    });

    sendLog('info', 'X Control Panel v3.0.0 content script loaded');
  }

  function getSettings() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, res => resolve(res));
    });
  }

  function sendLog(level, message) {
    try { chrome.runtime.sendMessage({ type: 'LOG_OUTPUT', level, message }); } catch (e) {}
  }

  // ==================== STYLE ELEMENTS ====================
  function injectStyleElements() {
    const create = (id) => { const el = document.createElement('style'); el.id = id; document.head.appendChild(el); return el; };
    customStyleEl = create('xcp-custom-css');
    userCSSEl = create('xcp-user-css');
    themeStyleEl = create('xcp-theme-css');
    cssThemeEl = create('xcp-full-theme-css');
    fontSizeEl = create('xcp-fontsize-css');
    sidebarHideEl = create('xcp-sidebar-hide');
    grokBlockEl = create('xcp-grok-block');
    volumeStyleEl = create('xcp-volume-css');
    suggestedHideEl = create('xcp-suggested-hide');
  }

  // ==================== APPLY ALL ====================
  function applyAll() {
    if (!settings) return;
    const body = document.body;

    if (!settings.enabled) {
      body.className = body.className.replace(/\bxcp-[\w-]+\b/g, '').trim();
      [customStyleEl, userCSSEl, themeStyleEl, cssThemeEl, fontSizeEl, sidebarHideEl, grokBlockEl, volumeStyleEl, suggestedHideEl]
        .forEach(el => { if (el) el.textContent = ''; });
      document.querySelectorAll('.xcp-hidden-tweet').forEach(el => el.classList.remove('xcp-hidden-tweet'));
      document.querySelectorAll('.xcp-dislike-btn').forEach(el => el.remove());
      removeCustomFeedOverlay();
      removeDraggableHandles();
      return;
    }

    toggleClass(body, 'xcp-compact', settings.compactMode);
    toggleClass(body, 'xcp-hide-promoted', settings.hidePromoted);
    toggleClass(body, 'xcp-hide-who-to-follow', settings.hideWhoToFollow);
    toggleClass(body, 'xcp-hide-topics', settings.hideTopicsToFollow);
    toggleClass(body, 'xcp-smooth-animations', settings.customEffects?.smoothAnimations);
    toggleClass(body, 'xcp-glow', settings.customEffects?.glowEffects);
    toggleClass(body, 'xcp-rainbow-likes', settings.customEffects?.rainbowLikes);
    toggleClass(body, 'xcp-smooth-scroll', settings.smoothScroll);

    body.className = body.className.replace(/\bxcp-hover-[\w-]+\b/g, '').trim();
    if (settings.hoverEffect && settings.hoverEffect !== 'none') body.classList.add(`xcp-hover-${settings.hoverEffect}`);

    applyFontSize();
    applyTheme();
    applyCSSTheme();
    applyUserCSS();
    applySidebarHides();
    applyGrokBlocking();
    applyCustomVolume();
    applyHideSuggested();
    document.documentElement.style.setProperty('--xcp-accent', settings.accentColor || '#7b61ff');
    processTweets();
    if (settings.customFeed?.enabled) applyCustomFeed();
  }

  function applyFontSize() {
    const s = settings.fontSize || 100;
    fontSizeEl.textContent = s !== 100 ? `[data-testid="tweetText"] { font-size: ${s}% !important; }` : '';
  }

  function applyTheme() {
    const t = {
      cyberpunk: `:root { --xcp-accent: ${settings.accentColor || '#7b61ff'}; }`,
      midnight: `body { background-color: #0f1729 !important; } [data-testid="primaryColumn"] { background: rgba(15,23,41,0.95) !important; } [data-testid="sidebarColumn"] { background: rgba(15,23,41,0.9) !important; }`,
      sakura: `:root { --xcp-accent: #ff6b9d; } body { background-color: #1a0a12 !important; } [data-testid="primaryColumn"] { background: rgba(26,10,18,0.95) !important; } a[role="link"]:not([data-testid="tweetPhoto"] *) { color: #ff6b9d !important; }`,
      forest: `:root { --xcp-accent: #2ecc71; } body { background-color: #0a1a0a !important; } [data-testid="primaryColumn"] { background: rgba(10,26,10,0.95) !important; } a[role="link"]:not([data-testid="tweetPhoto"] *) { color: #2ecc71 !important; }`,
      sunset: `:root { --xcp-accent: #ff6b35; } body { background-color: #1a0f05 !important; } [data-testid="primaryColumn"] { background: rgba(26,15,5,0.95) !important; } a[role="link"]:not([data-testid="tweetPhoto"] *) { color: #ff6b35 !important; }`,
      monochrome: `:root { --xcp-accent: #888; } body > *:not([data-testid="tweetPhoto"]):not([data-testid="videoPlayer"]) { filter: saturate(0) !important; } [data-testid="tweetPhoto"], [data-testid="tweetPhoto"] img, [data-testid="videoPlayer"], video { filter: none !important; }`
    };
    let css = t[settings.theme] || t.cyberpunk;
    const o = (settings.bgOpacity || 100) / 100;
    if (o < 1) css += `[data-testid="primaryColumn"], [data-testid="sidebarColumn"], header[role="banner"] { opacity: ${o} !important; }`;
    themeStyleEl.textContent = css;
  }

  // ==================== FULL CSS THEMES (with media protection) ====================
  function applyCSSTheme() {
    const name = settings.cssTheme || 'none';
    if (name === 'custom' && settings.customThemeCSS) {
      cssThemeEl.textContent = settings.customThemeCSS + MEDIA_PROTECTION_CSS;
      return;
    }
    const themes = getBuiltinCSSThemes();
    const themeCSS = themes[name] || '';
    cssThemeEl.textContent = themeCSS ? themeCSS + MEDIA_PROTECTION_CSS : '';
  }

  const MEDIA_PROTECTION_CSS = `
/* XCP Media Protection — appended to every theme */
[data-testid="tweetPhoto"] img, [data-testid="tweetPhoto"] video,
[data-testid="videoPlayer"] video, [data-testid="videoPlayer"] img,
article[data-testid="tweet"] img[src*="pbs.twimg.com/media"],
article[data-testid="tweet"] video,
[data-testid="card.wrapper"] img {
  filter: none !important; opacity: 1 !important; mix-blend-mode: normal !important;
  visibility: visible !important; background: transparent !important;
  border: none !important; box-shadow: none !important;
}
[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="card.wrapper"] {
  filter: none !important; opacity: 1 !important; background: transparent !important;
}
`;

  function getBuiltinCSSThemes() {
    return {
      hellokitty: `
body, #react-root { background: #fff0f5 !important; }
[data-testid="primaryColumn"] { background: linear-gradient(180deg, #fff0f5 0%, #ffe4e9 50%, #fff0f5 100%) !important; border-color: #ffb6c1 !important; }
[data-testid="sidebarColumn"] { background: #fff5f7 !important; }
[data-testid="tweetText"] { color: #d63384 !important; }
article[data-testid="tweet"] { background: #fff8fa !important; border: 1px solid #ffb6c1 !important; border-radius: 16px !important; box-shadow: 0 2px 8px rgba(255,105,180,0.1) !important; }
article[data-testid="tweet"]:hover { background: #fff0f3 !important; box-shadow: 0 4px 16px rgba(255,105,180,0.2) !important; }
a[role="link"]:not([data-testid="tweetPhoto"] a) { color: #ff69b4 !important; }
nav[role="navigation"] a { color: #d63384 !important; }
nav[role="navigation"] a:hover { background: rgba(255,105,180,0.1) !important; }
header[role="banner"] { background: #fff0f5 !important; border-color: #ffb6c1 !important; }
[data-testid="tweetButtonInline"], [data-testid="SideNav_NewTweet_Button"] { background: #ff69b4 !important; }
::-webkit-scrollbar-thumb { background: #ffb6c1 !important; }
::-webkit-scrollbar-track { background: #fff0f5 !important; }
[data-testid="like"] svg, [data-testid="unlike"] svg { color: #ff1493 !important; }
[data-testid="retweet"] svg { color: #ff69b4 !important; }
[data-testid="reply"] svg { color: #db7093 !important; }
[data-testid="Tweet-User-Avatar"] img { border: 2px solid #ff69b4 !important; border-radius: 50% !important; }
[role="tablist"] [role="tab"][aria-selected="true"] { border-bottom-color: #ff69b4 !important; }
[data-testid="User-Name"] span { color: #c2185b !important; }`,

      anime: `
body, #react-root { background: #0d0221 !important; }
[data-testid="primaryColumn"] { background: linear-gradient(180deg, #0d0221 0%, #150734 50%, #0d0221 100%) !important; border-color: #7c4dff !important; }
[data-testid="sidebarColumn"] { background: #120428 !important; }
article[data-testid="tweet"] { background: rgba(13,2,33,0.8) !important; border: 1px solid rgba(124,77,255,0.3) !important; border-radius: 12px !important; box-shadow: 0 0 15px rgba(124,77,255,0.1) !important; }
article[data-testid="tweet"]:hover { border-color: rgba(224,64,251,0.5) !important; box-shadow: 0 0 25px rgba(224,64,251,0.2) !important; }
[data-testid="tweetText"] { color: #e0d4ff !important; }
a[role="link"]:not([data-testid="tweetPhoto"] a) { color: #e040fb !important; }
[data-testid="like"] svg { color: #ff4081 !important; }
[data-testid="retweet"] svg { color: #18ffff !important; }
[data-testid="reply"] svg { color: #7c4dff !important; }
header[role="banner"] { background: #0d0221 !important; }
nav[role="navigation"] a { color: #b388ff !important; }
nav[role="navigation"] a:hover { background: rgba(124,77,255,0.15) !important; }
[data-testid="Tweet-User-Avatar"] img { border: 2px solid #e040fb !important; box-shadow: 0 0 10px rgba(224,64,251,0.3) !important; }
::-webkit-scrollbar-thumb { background: #7c4dff !important; } ::-webkit-scrollbar-track { background: #0d0221 !important; }`,

      retrowave: `
body, #react-root { background: #1a0a2e !important; background-image: linear-gradient(0deg, rgba(255,0,110,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,0,110,0.03) 1px, transparent 1px) !important; background-size: 40px 40px !important; }
[data-testid="primaryColumn"] { background: rgba(26,10,46,0.9) !important; border-color: #ff006e !important; }
article[data-testid="tweet"] { background: rgba(26,10,46,0.7) !important; border: 1px solid rgba(255,0,110,0.2) !important; border-bottom: 2px solid rgba(131,56,236,0.3) !important; }
article[data-testid="tweet"]:hover { background: rgba(46,16,80,0.8) !important; box-shadow: 0 0 30px rgba(255,0,110,0.15) !important; }
[data-testid="tweetText"] { color: #ffd4e5 !important; }
a[role="link"]:not([data-testid="tweetPhoto"] a) { color: #ff006e !important; }
[data-testid="like"] svg { color: #ff006e !important; } [data-testid="retweet"] svg { color: #8338ec !important; } [data-testid="reply"] svg { color: #3a86ff !important; }
header[role="banner"] { background: #1a0a2e !important; border-color: #ff006e !important; }
nav[role="navigation"] a { color: #ff70a6 !important; }
[data-testid="Tweet-User-Avatar"] img { border: 2px solid #ff006e !important; }
::-webkit-scrollbar-thumb { background: linear-gradient(#ff006e, #8338ec) !important; }`,

      terminal: `
body, #react-root { background: #001100 !important; }
[data-testid="primaryColumn"] { background: #001100 !important; border-color: #00ff41 !important; }
[data-testid="sidebarColumn"] { background: #001800 !important; }
article[data-testid="tweet"] { background: rgba(0,17,0,0.9) !important; border: 1px solid rgba(0,255,65,0.2) !important; }
article[data-testid="tweet"]:hover { border-color: rgba(0,255,65,0.5) !important; box-shadow: 0 0 10px rgba(0,255,65,0.1) !important; }
[data-testid="tweetText"] { color: #00ff41 !important; font-family: 'Courier New', monospace !important; text-shadow: 0 0 5px rgba(0,255,65,0.3) !important; }
a[role="link"]:not([data-testid="tweetPhoto"] a) { color: #00cc33 !important; }
[data-testid="like"] svg, [data-testid="unlike"] svg { color: #00ff41 !important; } [data-testid="retweet"] svg { color: #00cc33 !important; } [data-testid="reply"] svg { color: #009926 !important; }
header[role="banner"] { background: #001100 !important; }
nav[role="navigation"] a { color: #00ff41 !important; }
[data-testid="Tweet-User-Avatar"] img { border: 1px solid #00ff41 !important; border-radius: 2px !important; }
::-webkit-scrollbar-thumb { background: #00ff41 !important; } ::-webkit-scrollbar-track { background: #001100 !important; }
body::after { content: ''; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 3px); pointer-events: none; z-index: 99999; }`,

      pastelgoth: `
body, #react-root { background: #1a0f1e !important; }
[data-testid="primaryColumn"] { background: linear-gradient(180deg, #1a0f1e 0%, #231526 50%, #1a0f1e 100%) !important; border-color: #b19cd9 !important; }
article[data-testid="tweet"] { background: rgba(26,15,30,0.8) !important; border: 1px solid rgba(177,156,217,0.2) !important; border-radius: 12px !important; }
article[data-testid="tweet"]:hover { border-color: rgba(255,105,180,0.4) !important; box-shadow: 0 0 20px rgba(177,156,217,0.15) !important; }
[data-testid="tweetText"] { color: #e8d5f5 !important; }
a[role="link"]:not([data-testid="tweetPhoto"] a) { color: #b19cd9 !important; }
[data-testid="like"] svg { color: #ff69b4 !important; } [data-testid="retweet"] svg { color: #b19cd9 !important; } [data-testid="reply"] svg { color: #77dd77 !important; }
header[role="banner"] { background: #1a0f1e !important; }
nav[role="navigation"] a { color: #b19cd9 !important; } nav[role="navigation"] a:hover { background: rgba(177,156,217,0.1) !important; }
[data-testid="Tweet-User-Avatar"] img { border: 2px solid #b19cd9 !important; }
::-webkit-scrollbar-thumb { background: #b19cd9 !important; } ::-webkit-scrollbar-track { background: #1a0f1e !important; }`,

      none: ''
    };
  }

  function applyUserCSS() {
    const css = settings.customCSS || '';
    try {
      userCSSEl.textContent = css;
      if (css.trim()) sendLog('css', `Custom CSS injected (${css.length} chars)`);
    } catch (e) { sendLog('error', `CSS injection error: ${e.message}`); }
  }

  function applySidebarHides() {
    let css = '';
    if (settings.hideCreatorStudio) css += `a[href="/i/flow/creator-studio"], a[data-testid="AppTabBar_CreatorStudio"], nav a[aria-label*="Creator"], a[href*="creator"] { display: none !important; }\n`;
    if (settings.hidePremium) css += `a[href="/i/premium_sign_up"], a[href*="premium"], a[data-testid="premium"], nav a[aria-label*="Premium"], a[href="/i/verified-choose"], aside[aria-label*="Premium"], aside[aria-label*="Subscribe"] { display: none !important; }\n`;
    if (settings.hideGrok) css += `a[href="/i/grok"], a[data-testid="AppTabBar_Grok"], nav a[aria-label*="Grok"] { display: none !important; }\n`;
    if (settings.hideMessages) css += `a[href="/messages"], a[data-testid="AppTabBar_DirectMessage"], nav a[aria-label*="Direct Messages"], nav a[aria-label*="Messages"] { display: none !important; }\n`;
    sidebarHideEl.textContent = css;
  }

  function applyGrokBlocking() {
    let css = '';
    if (settings.blockGrokTweets) css += `[data-testid="cellInnerDiv"]:has(a[href="/i/grok"]) { display: none !important; }\n`;
    if (settings.blockGrokSummaries) css += `[data-testid="grok_entry_point"] { display: none !important; } div[aria-label*="Grok"] { display: none !important; } div:has(> div > a[href="/i/grok"]):not(nav):not(header) { display: none !important; }\n`;
    grokBlockEl.textContent = css;
  }

  // ==================== HIDE SUGGESTED CONTENT (FIXED) ====================
  function applyHideSuggested() {
    let css = '';
    if (settings.hideWhoToFollow || settings.hideSuggestedContent) {
      css += `
/* Hide "Who to follow" section */
[data-testid="cellInnerDiv"]:has(> div > div > div > div[role="button"][data-testid="UserCell"]) { display: none !important; }
[data-testid="cellInnerDiv"]:has(div[data-testid="UserCell"]):not(:has(article[data-testid="tweet"])) { display: none !important; }
/* "Who to follow" heading cells */
[data-testid="cellInnerDiv"]:has(> div > div > span):not(:has(article)):not(:has([data-testid="tweetText"])) ~ [data-testid="cellInnerDiv"]:has([data-testid="UserCell"]) { display: none !important; }
/* Show more link for suggestions */
[data-testid="cellInnerDiv"]:has(a[href="/i/connect_people"]) { display: none !important; }
`;
    }
    if (settings.hideTopicsToFollow || settings.hideSuggestedContent) {
      css += `
/* Hide "Topics to follow" */
[data-testid="cellInnerDiv"]:has(a[href*="/i/topics"]) { display: none !important; }
[data-testid="cellInnerDiv"]:has(div[data-testid="topic"]) { display: none !important; }
/* Sidebar trends */
[data-testid="sidebarColumn"] [aria-label="Timeline: Trending now"] { display: none !important; }
[data-testid="trend"] { display: none !important; }
`;
    }
    if (settings.hideSuggestedContent) {
      css += `
/* Hide any "Suggested" / "You might like" / "Based on your..." sections */
[data-testid="cellInnerDiv"]:has(> div > div > div:first-child > span):not(:has(article)):not(:has([data-testid="tweetText"])):not(:has(time)) { display: none !important; }
/* "Discover more" section */
[data-testid="cellInnerDiv"]:has(a[href="/i/connect_people"]) { display: none !important; }
[data-testid="cellInnerDiv"]:has(a[href="/i/topics"]) { display: none !important; }
`;
    }
    suggestedHideEl.textContent = css;
  }

  // ==================== CUSTOM VOLUME ====================
  function applyCustomVolume() {
    if (!settings.customVolume?.enabled) {
      volumeStyleEl.textContent = '';
      return;
    }
    // We can't override the volume slider with CSS, we do it with JS
    applyVolumeToVideos();
  }

  function applyVolumeToVideos() {
    if (!settings.customVolume?.enabled) return;
    const level = (settings.customVolume.level || 100) / 100;
    document.querySelectorAll('video').forEach(video => {
      if (video.dataset.xcpVolumeApplied === String(level)) return;
      video.dataset.xcpVolumeApplied = String(level);
      video.volume = Math.min(1, level); // Browser caps at 1.0

      // For "louder than max" — use Web Audio API gain
      if (level > 1 && !video.dataset.xcpGainApplied) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const source = ctx.createMediaElementSource(video);
          const gain = ctx.createGain();
          gain.gain.value = level; // Can go above 1.0 for amplification
          source.connect(gain);
          gain.connect(ctx.destination);
          video.dataset.xcpGainApplied = 'true';
          video.dataset.xcpGainNode = ''; // Just mark it
          video._xcpGain = gain;
          video._xcpAudioCtx = ctx;
          sendLog('info', `Volume amplified to ${Math.round(level * 100)}%`);
        } catch (e) {
          sendLog('warn', `Volume amplification failed: ${e.message}`);
        }
      } else if (video._xcpGain && level <= 1) {
        video._xcpGain.gain.value = level;
      } else if (video._xcpGain) {
        video._xcpGain.gain.value = level;
      }
    });

    // Inject custom volume slider on videos
    injectVolumeSliders();
  }

  function injectVolumeSliders() {
    if (!settings.customVolume?.enabled) return;
    document.querySelectorAll('[data-testid="videoPlayer"]').forEach(player => {
      if (player.querySelector('.xcp-volume-slider')) return;
      const slider = document.createElement('div');
      slider.className = 'xcp-volume-slider';
      slider.innerHTML = `
        <div class="xcp-vol-label">🔊 <span class="xcp-vol-val">${settings.customVolume.level || 100}%</span></div>
        <input type="range" class="xcp-vol-range" min="0" max="300" value="${settings.customVolume.level || 100}">
      `;
      slider.style.cssText = 'position:absolute;bottom:40px;right:8px;z-index:10;background:rgba(0,0,0,0.8);padding:6px 10px;border-radius:8px;display:none;flex-direction:column;gap:4px;';
      player.style.position = 'relative';
      player.appendChild(slider);

      const range = slider.querySelector('.xcp-vol-range');
      const valLabel = slider.querySelector('.xcp-vol-val');
      range.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        valLabel.textContent = val + '%';
        settings.customVolume.level = val;
        // Apply to videos in this player
        const video = player.querySelector('video');
        if (video) {
          video.volume = Math.min(1, val / 100);
          if (video._xcpGain) video._xcpGain.gain.value = val / 100;
          video.dataset.xcpVolumeApplied = String(val / 100);
        }
        saveSettings();
      });

      // Show on hover
      player.addEventListener('mouseenter', () => { slider.style.display = 'flex'; });
      player.addEventListener('mouseleave', () => { slider.style.display = 'none'; });
    });
  }

  // ==================== T.CO LINK BYPASS ====================
  let tcoObserver = null;

  function setupTcoBypass() {
    if (settings.bypassTcoLinks) {
      replaceTcoLinks();
      if (!tcoObserver) {
        tcoObserver = new MutationObserver(() => {
          if (settings.bypassTcoLinks) replaceTcoLinks();
        });
        tcoObserver.observe(document.body, { childList: true, subtree: true });
      }
    } else if (tcoObserver) {
      tcoObserver.disconnect();
      tcoObserver = null;
    }
  }

  function replaceTcoLinks() {
    // Twitter shows the real URL as the link text but wraps it in t.co
    document.querySelectorAll('a[href*="t.co"]').forEach(link => {
      if (link.dataset.xcpBypassed) return;
      const href = link.getAttribute('href');
      if (!href || !href.includes('t.co')) return;

      // The link text usually contains the real URL
      const spans = link.querySelectorAll('span');
      let realUrl = '';
      spans.forEach(span => {
        const text = span.textContent.trim();
        if (text.match(/^https?:\/\//)) realUrl = text;
        else if (text.match(/^[\w][\w.-]+\.\w{2,}/)) realUrl = 'https://' + text;
      });

      // Also check the link's title attribute
      if (!realUrl && link.title && link.title.match(/^https?:\/\//)) {
        realUrl = link.title;
      }

      // Try data-expanded-url attribute
      if (!realUrl) {
        const expanded = link.getAttribute('data-expanded-url');
        if (expanded) realUrl = expanded;
      }

      if (realUrl) {
        link.setAttribute('href', realUrl);
        link.dataset.xcpBypassed = 'true';
        link.title = realUrl;
      }
    });
  }

  // ==================== DRAGGABLE TWEETS/VIDEOS ====================
  function removeDraggableHandles() {
    document.querySelectorAll('.xcp-drag-handle, .xcp-drag-reset').forEach(el => el.remove());
    document.querySelectorAll('[data-xcp-draggable]').forEach(el => {
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.zIndex = '';
      el.style.transform = '';
      delete el.dataset.xcpDraggable;
    });
  }

  function injectDragHandles(tweet) {
    if (!settings.draggableTweets) return;
    if (tweet.querySelector('.xcp-drag-handle')) return;

    const handle = document.createElement('div');
    handle.className = 'xcp-drag-handle';
    handle.innerHTML = '⠿';
    handle.title = 'Drag to move';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'xcp-drag-reset';
    resetBtn.innerHTML = '✕';
    resetBtn.title = 'Reset position';
    resetBtn.style.display = 'none';

    tweet.style.position = 'relative';
    tweet.appendChild(handle);
    tweet.appendChild(resetBtn);

    let isDragging = false, startX, startY, origX, origY;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      const rect = tweet.getBoundingClientRect();

      // On first drag, switch to fixed positioning
      if (!tweet.dataset.xcpDraggable) {
        tweet.dataset.xcpDraggable = 'true';
        tweet.style.position = 'fixed';
        tweet.style.left = rect.left + 'px';
        tweet.style.top = rect.top + 'px';
        tweet.style.width = rect.width + 'px';
        tweet.style.zIndex = '100000';
        tweet.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)';
        resetBtn.style.display = 'flex';
      }

      startX = e.clientX;
      startY = e.clientY;
      origX = parseInt(tweet.style.left);
      origY = parseInt(tweet.style.top);
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      tweet.style.left = (origX + dx) + 'px';
      tweet.style.top = (origY + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = '';
      }
    });

    resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      tweet.style.position = 'relative';
      tweet.style.left = '';
      tweet.style.top = '';
      tweet.style.width = '';
      tweet.style.zIndex = '';
      tweet.style.boxShadow = '';
      delete tweet.dataset.xcpDraggable;
      resetBtn.style.display = 'none';
    });
  }

  // ==================== TWEET NOTIFICATIONS ====================
  const notifiedTweets = new Set(); // Track tweet IDs we've already notified about

  function checkWatchedUsers(watchedUsers) {
    if (!watchedUsers?.length) return;
    const watchedSet = new Set(watchedUsers.map(u => u.toLowerCase()));

    document.querySelectorAll('article[data-testid="tweet"]').forEach(tweet => {
      const username = extractUsername(tweet);
      if (!username || !watchedSet.has(username)) return;

      // Get a unique ID for this tweet
      const tweetLink = tweet.querySelector('a[href*="/status/"]');
      const tweetId = tweetLink?.getAttribute('href') || '';
      if (!tweetId || notifiedTweets.has(tweetId)) return;

      notifiedTweets.add(tweetId);

      // Get tweet text preview
      const textEl = tweet.querySelector('[data-testid="tweetText"]');
      const text = textEl?.textContent?.slice(0, 100) || '';

      chrome.runtime.sendMessage({
        type: 'NOTIFY_NEW_TWEET',
        username: username,
        text: text,
        url: tweetId
      });

      sendLog('action', `Notification: @${username} posted`);
    });
  }

  function executeUserScript(script) {
    try {
      const fn = new Function('document', 'window', `"use strict"; try { ${script}; return { result: 'Script executed successfully' }; } catch(e) { return { error: e.message }; }`);
      const result = fn(document, window);
      if (result?.error) sendLog('error', `Script error: ${result.error}`);
      else sendLog('script', `Script executed: ${result?.result || 'OK'}`);
      return result;
    } catch (e) { sendLog('error', `Script compile error: ${e.message}`); return { error: e.message }; }
  }

  // ==================== TIMED MUTES ====================
  function checkTimedMutes() {
    if (!settings.timedMutes) return;
    const now = Date.now();
    let changed = false;
    for (const [user, expires] of Object.entries(settings.timedMutes)) {
      if (now >= expires) { delete settings.timedMutes[user]; changed = true; }
    }
    if (changed) saveSettings();
  }

  function isTimedMuted(username) {
    if (!settings.timedMutes || !settings.timedMutes[username]) return false;
    if (Date.now() >= settings.timedMutes[username]) {
      delete settings.timedMutes[username];
      return false;
    }
    return true;
  }

  // ==================== TWEET PROCESSING ====================
  function processTweets() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    const userList = settings.userList || {};
    const autoMuted = settings.autoMuted || [];
    tweets.forEach(tweet => processSingleTweet(tweet, userList, autoMuted));

    // Apply volume to new videos
    if (settings.customVolume?.enabled) applyVolumeToVideos();
  }

  function processSingleTweet(tweet, userList, autoMuted) {
    applyIconReplacements(tweet);
    if (settings.enableDislike !== false) injectDislikeButton(tweet);
    if (settings.draggableTweets) injectDragHandles(tweet);

    const username = extractUsername(tweet);
    if (!username) return;

    // Grok blocking
    if (settings.blockGrokTweets && (username === 'grok' || username === 'xai')) {
      const cell = tweet.closest('[data-testid="cellInnerDiv"]') || tweet;
      cell.classList.add('xcp-hidden-tweet');
      return;
    }

    // Timed mutes
    if (isTimedMuted(username)) {
      const cell = tweet.closest('[data-testid="cellInnerDiv"]') || tweet;
      cell.classList.add('xcp-hidden-tweet');
      return;
    }

    // Auto-muted
    if (autoMuted.includes(username)) {
      const cell = tweet.closest('[data-testid="cellInnerDiv"]') || tweet;
      cell.classList.add('xcp-hidden-tweet');
      return;
    }

    // User list filtering
    if (username in userList) {
      const vis = userList[username];
      const cell = tweet.closest('[data-testid="cellInnerDiv"]') || tweet;
      if (vis === 0) { cell.classList.add('xcp-hidden-tweet'); return; }
      if (vis >= 1) { cell.classList.remove('xcp-hidden-tweet'); return; }
      if (tweetDecisions.has(tweet)) {
        cell.classList.toggle('xcp-hidden-tweet', tweetDecisions.get(tweet));
      } else {
        const hide = Math.random() > vis;
        tweetDecisions.set(tweet, hide);
        cell.classList.toggle('xcp-hidden-tweet', hide);
      }
    }
  }

  function extractUsername(tweet) {
    const links = tweet.querySelectorAll('a[role="link"][href^="/"]');
    for (const link of links) {
      const m = link.getAttribute('href').match(/^\/([A-Za-z0-9_]{1,15})$/);
      if (m) {
        const n = m[1].toLowerCase();
        if (!['home','explore','search','notifications','messages','settings','compose','i','tos','privacy','lists'].includes(n)) return n;
      }
    }
    return null;
  }

  // ==================== ICON REPLACEMENTS (FIXED) ====================
  function applyIconReplacements(tweet) {
    const icons = settings.iconReplacements || {};
    const map = {
      like: '[data-testid="like"], [data-testid="unlike"]',
      retweet: '[data-testid="retweet"], [data-testid="unretweet"]',
      reply: '[data-testid="reply"]',
      share: '[data-testid="share"]',
      bookmark: '[data-testid="bookmark"], [data-testid="removeBookmark"]'
    };

    for (const [key, selector] of Object.entries(map)) {
      if (!icons[key]) continue;
      tweet.querySelectorAll(selector).forEach(el => {
        if (el.dataset.xcpIconApplied) return;
        el.dataset.xcpIconApplied = 'true';

        const svgs = el.querySelectorAll('svg');
        svgs.forEach(svg => { svg.style.display = 'none'; });

        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'xcp-emoji-icon';
        emojiSpan.textContent = icons[key];
        emojiSpan.style.cssText = 'font-size:16px;line-height:1;display:inline-flex;align-items:center;justify-content:center;min-width:20px;min-height:20px;';

        const firstChild = el.querySelector('div') || el.firstChild;
        if (firstChild) {
          firstChild.parentNode.insertBefore(emojiSpan, firstChild);
        }
      });
    }

    if (icons.verified) {
      tweet.querySelectorAll('[data-testid="icon-verified"]').forEach(el => {
        if (el.dataset.xcpIconApplied) return;
        el.dataset.xcpIconApplied = 'true';
        el.querySelectorAll('svg').forEach(svg => { svg.style.display = 'none'; });
        const span = document.createElement('span');
        span.textContent = icons.verified;
        span.style.cssText = 'font-size:16px;';
        el.prepend(span);
      });
    }
  }

  // ==================== DISLIKE BUTTON ====================
  function injectDislikeButton(tweet) {
    if (tweet.querySelector('.xcp-dislike-btn')) return;
    const username = extractUsername(tweet);
    if (!username) return;
    const actionBar = tweet.querySelector('[role="group"]');
    if (!actionBar) return;

    const btn = document.createElement('button');
    btn.className = 'xcp-dislike-btn';
    btn.title = `Dislike @${username}`;
    btn.innerHTML = '<span class="xcp-dislike-icon">👎</span>';
    btn.dataset.username = username;
    if (tweet.dataset.xcpDisliked === 'true') btn.classList.add('xcp-disliked');

    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); handleDislike(username, tweet, btn); });
    actionBar.appendChild(btn);
  }

  function handleDislike(username, tweet, btn) {
    if (!settings.dislikeData) settings.dislikeData = {};
    if (!settings.dislikeData[username]) settings.dislikeData[username] = { likes: 0, dislikes: 0 };

    if (tweet.dataset.xcpDisliked === 'true') {
      settings.dislikeData[username].dislikes = Math.max(0, settings.dislikeData[username].dislikes - 1);
      tweet.dataset.xcpDisliked = 'false';
      btn.classList.remove('xcp-disliked');
    } else {
      settings.dislikeData[username].dislikes++;
      tweet.dataset.xcpDisliked = 'true';
      btn.classList.add('xcp-disliked');
    }

    trackNativeLikes(tweet, username);
    checkAutoMute(username);
    saveSettings();
    try { chrome.runtime.sendMessage({ type: 'DISLIKE_UPDATED', dislikeData: settings.dislikeData, autoMuted: settings.autoMuted }); } catch (e) {}
  }

  function trackNativeLikes(tweet, username) {
    const likeBtn = tweet.querySelector('[data-testid="like"]');
    if (likeBtn && !likeBtn.dataset.xcpTracked) {
      likeBtn.dataset.xcpTracked = 'true';
      likeBtn.addEventListener('click', () => {
        if (!settings.dislikeData) settings.dislikeData = {};
        if (!settings.dislikeData[username]) settings.dislikeData[username] = { likes: 0, dislikes: 0 };
        settings.dislikeData[username].likes++;
        saveSettings();
        try { chrome.runtime.sendMessage({ type: 'DISLIKE_UPDATED', dislikeData: settings.dislikeData, autoMuted: settings.autoMuted }); } catch (e) {}
      });
    }
  }

  function checkAutoMute(username) {
    const data = settings.dislikeData[username];
    if (!data) return;
    const total = data.likes + data.dislikes;
    if (!settings.autoMuted) settings.autoMuted = [];
    if (total >= (settings.minInteractions || 10)) {
      const pct = (data.dislikes / total) * 100;
      if (pct >= (settings.dislikeRatio || 60) && !settings.autoMuted.includes(username)) {
        settings.autoMuted.push(username);
        sendLog('warn', `@${username} auto-muted! (${pct.toFixed(0)}% dislikes)`);
      }
    }
  }

  // ==================== PARTICLES ====================
  document.addEventListener('click', (e) => {
    if (!settings?.enabled || !settings?.customEffects?.particlesOnLike) return;
    const likeBtn = e.target.closest('[data-testid="like"]');
    if (!likeBtn) return;
    const r = likeBtn.getBoundingClientRect();
    const emoji = settings.iconReplacements?.like || '❤️';
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('span');
      p.className = 'xcp-particle';
      p.textContent = emoji;
      const a = (Math.PI * 2 * i) / 8, d = 20 + Math.random() * 30;
      Object.assign(p.style, { left: `${r.left + r.width/2}px`, top: `${r.top}px`, position: 'fixed' });
      p.style.setProperty('--xcp-px', `${Math.cos(a)*d}px`);
      p.style.setProperty('--xcp-py', `${Math.sin(a)*d}px`);
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 900);
    }
  });

  // ==================== CUSTOM FEED TAB ====================
  let feedTabInjected = false;

  function setupCustomFeedTab() {
    if (feedTabInjected) return;
    // Watch for the tab bar to appear
    const checkInterval = setInterval(() => {
      if (!settings?.customFeed?.enabled) return;
      const tabBar = document.querySelector('[role="tablist"]');
      if (tabBar && !tabBar.querySelector('[data-xcp-feed-tab]')) {
        injectFeedTab(tabBar);
        feedTabInjected = true;
        clearInterval(checkInterval);
      }
    }, 1000);

    // Also clear after 30s to avoid leaking
    setTimeout(() => clearInterval(checkInterval), 30000);
  }

  function injectFeedTab(tabBar) {
    // Find the existing tabs (For you, Following)
    const tabs = tabBar.querySelectorAll('[role="tab"]');
    if (!tabs.length) return;

    // Clone the last tab to match the styling
    const lastTab = tabs[tabs.length - 1];
    const feedTab = lastTab.cloneNode(true);

    // Update the tab content
    const textSpan = feedTab.querySelector('span > span') || feedTab.querySelector('span');
    if (textSpan) textSpan.textContent = 'Custom Feed';

    feedTab.setAttribute('aria-selected', 'false');
    feedTab.setAttribute('data-xcp-feed-tab', 'true');
    feedTab.removeAttribute('id');

    // Remove the active/selected styling
    const indicator = feedTab.querySelector('div[style*="background"]') || feedTab.querySelector('[class*="indicator"]');
    if (indicator) indicator.style.display = 'none';

    tabBar.appendChild(feedTab);

    // State tracking
    let feedTabActive = false;

    feedTab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      feedTabActive = !feedTabActive;

      if (feedTabActive) {
        // Deselect other tabs visually
        tabs.forEach(t => {
          t.setAttribute('aria-selected', 'false');
          const ind = t.querySelector('div:last-child');
          if (ind && ind.style) ind.style.backgroundColor = 'transparent';
        });
        feedTab.setAttribute('aria-selected', 'true');

        // Activate custom feed — hide non-feed tweets
        activateCustomFeedFilter();
        sendLog('action', 'Custom Feed tab activated');
      } else {
        feedTab.setAttribute('aria-selected', 'false');
        deactivateCustomFeedFilter();
        sendLog('action', 'Custom Feed tab deactivated');
      }
    });
  }

  function activateCustomFeedFilter() {
    const feedUsers = new Set();
    const slots = settings.customFeed?.slots || [];
    slots.forEach(s => feedUsers.add(s.username.toLowerCase().replace(/^@/, '')));

    if (!feedUsers.size) return;

    // Mark the feed as active
    document.body.dataset.xcpFeedActive = 'true';

    // Hide all tweets not from feed users
    document.querySelectorAll('article[data-testid="tweet"]').forEach(tweet => {
      const username = extractUsername(tweet);
      const cell = tweet.closest('[data-testid="cellInnerDiv"]') || tweet;
      if (username && !feedUsers.has(username)) {
        cell.classList.add('xcp-feed-filtered');
      } else {
        cell.classList.remove('xcp-feed-filtered');
      }
    });
  }

  function deactivateCustomFeedFilter() {
    delete document.body.dataset.xcpFeedActive;
    document.querySelectorAll('.xcp-feed-filtered').forEach(el => {
      el.classList.remove('xcp-feed-filtered');
    });
  }

  // ==================== CUSTOM FEED (OLD OVERLAY METHOD - REMOVED) ====================
  function applyCustomFeed() {
    if (!settings.customFeed?.enabled) return;
    // Now using tab-based filtering instead of overlay
    // Re-inject the tab if needed
    const tabBar = document.querySelector('[role="tablist"]');
    if (tabBar && !tabBar.querySelector('[data-xcp-feed-tab]')) {
      injectFeedTab(tabBar);
      feedTabInjected = true;
    }

    // If feed tab is currently active, re-apply filter
    if (document.body.dataset.xcpFeedActive === 'true') {
      activateCustomFeedFilter();
    }
  }

  function removeCustomFeedOverlay() {
    deactivateCustomFeedFilter();
    const feedTab = document.querySelector('[data-xcp-feed-tab]');
    if (feedTab) feedTab.remove();
    feedTabInjected = false;
  }

  function resetCustomFeed() {
    removeCustomFeedOverlay();
  }

  // ==================== MUTATION OBSERVER ====================
  function observeTimeline() {
    new MutationObserver((mutations) => {
      if (!settings?.enabled) return;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE &&
              (node.querySelector?.('article[data-testid="tweet"]') || node.matches?.('article[data-testid="tweet"]'))) {
            processTweets();
            if (settings.customFeed?.enabled) applyCustomFeed();
            // Re-filter if custom feed tab is active
            if (document.body.dataset.xcpFeedActive === 'true') activateCustomFeedFilter();
            return;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function toggleClass(el, cls, cond) { el.classList.toggle(cls, !!cond); }
  function saveSettings() { chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }); }
})();
