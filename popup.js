// ================================================
// X Control Panel — Popup Controller v4
// ================================================

const CSS_SNIPPETS = {
  'hide-metrics': `[data-testid="reply"] span, [data-testid="retweet"] span, [data-testid="like"] span { display: none !important; }`,
  'round-avatars': `[data-testid="Tweet-User-Avatar"] img { border-radius: 50% !important; }`,
  'square-avatars': `[data-testid="Tweet-User-Avatar"] img { border-radius: 4px !important; }`,
  'full-width': `[data-testid="primaryColumn"] { max-width: 100% !important; } main[role="main"] > div > div > div { max-width: 100% !important; }`,
  'hide-sidebar': `[data-testid="sidebarColumn"] { display: none !important; }`,
  'dim-images': `[data-testid="tweetPhoto"] img { opacity: 0.4; transition: opacity 0.3s; } [data-testid="tweetPhoto"] img:hover { opacity: 1; }`,
  'hide-trends': `[aria-label="Timeline: Trending now"] { display: none !important; } [data-testid="trend"] { display: none !important; }`,
  'neon-borders': `[data-testid="tweet"] { border: 1px solid rgba(123,97,255,0.3) !important; box-shadow: 0 0 10px rgba(123,97,255,0.1) !important; } [data-testid="tweet"]:hover { box-shadow: 0 0 20px rgba(123,97,255,0.3) !important; }`
};

const ICON_PRESETS = {
  default: { like:'', retweet:'', reply:'', share:'', bookmark:'', verified:'' },
  cats: { like:'🐱', retweet:'😺', reply:'🐾', share:'😻', bookmark:'🐈', verified:'😸' },
  hellokitty: { like:'🎀', retweet:'🌸', reply:'💕', share:'🩷', bookmark:'🎀', verified:'🌟' },
  pixel: { like:'♥', retweet:'↻', reply:'▶', share:'⬆', bookmark:'★', verified:'◆' },
  emoji: { like:'💖', retweet:'🔄', reply:'💬', share:'🚀', bookmark:'📌', verified:'✨' },
  minimal: { like:'○', retweet:'◇', reply:'□', share:'△', bookmark:'▪', verified:'●' },
  space: { like:'🌟', retweet:'🪐', reply:'🛸', share:'🚀', bookmark:'⭐', verified:'🌙' },
  nature: { like:'🌸', retweet:'🍃', reply:'🌊', share:'🌻', bookmark:'🌿', verified:'🦋' }
};

let settings = {};

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bindTabs();
  bindControls();
  renderUserList();
  renderDislikeStats();
  renderAutoMutedList();
  renderRecentShares();
  renderTimedMutes();
  renderFeedSlots();
  renderNotifyUsers();
  loadGallery();
  applySettingsToUI();
  refreshShareLink();
  logOutput('info', 'Panel opened');
});

async function loadSettings() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, res => { settings = res || getDefaults(); resolve(); });
  });
}

function getDefaults() {
  return {
    enabled: true, customCSS: '', customScript: '', customThemeCSS: '', cssTheme: 'none',
    iconReplacements: {}, userList: {}, theme: 'cyberpunk', accentColor: '#7b61ff', bgOpacity: 100,
    hidePromoted: true, hideWhoToFollow: false, hideTopicsToFollow: false, compactMode: false,
    hideCreatorStudio: false, hidePremium: false, hideGrok: false, hideMessages: false,
    blockGrokTweets: false, blockGrokSummaries: false, fontSize: 100,
    customEffects: { rainbowLikes: false, smoothAnimations: true, glowEffects: false, particlesOnLike: false },
    hoverEffect: 'lift', smoothScroll: true, presetIcons: 'default',
    enableDislike: true, minInteractions: 10, dislikeRatio: 60, dislikeData: {}, autoMuted: [],
    timedMutes: {}, recentShares: [],
    customFeed: { enabled: false, slots: [] },
    bypassTcoLinks: false,
    customVolume: { enabled: false, level: 100 },
    tweetNotifications: {},
    draggableTweets: false,
    hideSuggestedContent: false
  };
}

async function saveSettings() { chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }); }

// ==================== OUTPUT LOG ====================
function logOutput(level, message) {
  const con = document.getElementById('outputConsole');
  if (!con) return;
  const time = new Date().toTimeString().slice(0,8);
  const tagMap = { info:'tag-info', warn:'tag-warn', error:'tag-error', css:'tag-css', script:'tag-script', action:'tag-action', feed:'tag-action' };
  const tagLabel = { info:'INFO', warn:'WARN', error:'ERROR', css:'CSS', script:'JS', action:'ACT', feed:'FEED' };
  const line = document.createElement('div');
  line.className = `output-line ${level}`;
  line.dataset.level = level;
  line.innerHTML = `<span class="output-time">${time}</span><span class="output-tag ${tagMap[level]||'tag-info'}">${tagLabel[level]||level}</span><span class="output-msg">${esc(message)}</span>`;
  con.appendChild(line);
  if (document.getElementById('autoScroll')?.checked) con.scrollTop = con.scrollHeight;
  updateOutputCounts();
  applyOutputFilter();
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function updateOutputCounts() {
  let i=0,w=0,e=0;
  document.querySelectorAll('#outputConsole .output-line').forEach(l => {
    const v = l.dataset.level;
    if (v==='error') e++; else if (v==='warn') w++; else i++;
  });
  const el = (id,v) => { const x=document.getElementById(id); if(x) x.textContent=v; };
  el('outputInfoCount', `${i} info`); el('outputWarnCount', `${w} warnings`); el('outputErrorCount', `${e} errors`);
}

function applyOutputFilter() {
  const f = document.getElementById('outputFilter')?.value || 'all';
  document.querySelectorAll('#outputConsole .output-line').forEach(l => { l.style.display = f==='all' || l.dataset.level===f ? '' : 'none'; });
}

// ==================== TABS ====================
function bindTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      if (tab.dataset.tab === 'share') refreshShareLink();
      if (tab.dataset.tab === 'gallery') loadGallery();
      if (tab.dataset.tab === 'timedmute') renderTimedMutes();
    });
  });
}

// ==================== APPLY SETTINGS TO UI ====================
function applySettingsToUI() {
  document.getElementById('masterToggle').checked = settings.enabled;
  document.querySelector('.panel').classList.toggle('disabled', !settings.enabled);

  ['hidePromoted','hideWhoToFollow','hideTopicsToFollow','compactMode','hideCreatorStudio','hidePremium','hideGrok','hideMessages','blockGrokTweets','blockGrokSummaries'].forEach(id => {
    const el = document.getElementById(id); if(el) el.checked = !!settings[id];
  });

  document.getElementById('fontSize').value = settings.fontSize || 100;
  document.getElementById('fontSizeLabel').textContent = `${settings.fontSize||100}%`;

  document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === settings.theme));
  document.querySelectorAll('.css-theme-btn').forEach(b => b.classList.toggle('active', b.dataset.csstheme === settings.cssTheme));

  document.getElementById('accentColor').value = settings.accentColor || '#7b61ff';
  document.getElementById('accentHex').textContent = settings.accentColor || '#7b61ff';
  document.getElementById('bgOpacity').value = settings.bgOpacity || 100;
  document.getElementById('bgOpacityLabel').textContent = `${settings.bgOpacity||100}%`;

  document.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === settings.presetIcons));
  const icons = settings.iconReplacements || {};
  ['Like','Retweet','Reply','Share','Bookmark','Verified'].forEach(k => {
    const el = document.getElementById('icon'+k); if(el) el.value = icons[k.toLowerCase()] || '';
  });

  const fx = settings.customEffects || {};
  ['rainbowLikes','smoothAnimations','glowEffects','particlesOnLike'].forEach(id => { const el=document.getElementById(id); if(el) el.checked=!!fx[id]; });
  document.getElementById('hoverEffect').value = settings.hoverEffect || 'lift';
  document.getElementById('smoothScroll').checked = settings.smoothScroll !== false;

  document.getElementById('customCSS').value = settings.customCSS || '';
  document.getElementById('customScript').value = settings.customScript || '';
  document.getElementById('customThemeCSS').value = settings.customThemeCSS || '';

  document.getElementById('enableDislike').checked = settings.enableDislike !== false;
  document.getElementById('minInteractions').value = settings.minInteractions || 10;
  document.getElementById('dislikeRatio').value = settings.dislikeRatio || 60;
  document.getElementById('dislikeRatioDesc').textContent = `Mute at ${settings.dislikeRatio||60}%+`;

  document.getElementById('customFeedEnabled').checked = settings.customFeed?.enabled || false;

  // New settings
  document.getElementById('bypassTcoLinks').checked = !!settings.bypassTcoLinks;
  document.getElementById('customVolumeEnabled').checked = !!settings.customVolume?.enabled;
  document.getElementById('volumeLevel').value = settings.customVolume?.level || 100;
  document.getElementById('volumeLabel').textContent = `Volume: ${settings.customVolume?.level || 100}%`;
  document.getElementById('volumeLevelRow').style.display = settings.customVolume?.enabled ? '' : 'none';
  document.getElementById('draggableTweets').checked = !!settings.draggableTweets;
  document.getElementById('hideSuggestedContent').checked = !!settings.hideSuggestedContent;
}

// ==================== BIND CONTROLS ====================
function bindControls() {
  // Master
  document.getElementById('masterToggle').addEventListener('change', e => {
    settings.enabled = e.target.checked;
    document.querySelector('.panel').classList.toggle('disabled', !e.target.checked);
    logOutput('action', `Extension ${e.target.checked?'ON':'OFF'}`);
    saveSettings();
  });

  // Boolean toggles
  ['hidePromoted','hideWhoToFollow','hideTopicsToFollow','compactMode','hideCreatorStudio','hidePremium','hideGrok','hideMessages','blockGrokTweets','blockGrokSummaries'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', e => { settings[id]=e.target.checked; logOutput('action',`${id}: ${e.target.checked?'ON':'OFF'}`); saveSettings(); });
  });

  // New toggles
  document.getElementById('bypassTcoLinks').addEventListener('change', e => {
    settings.bypassTcoLinks = e.target.checked;
    logOutput('action', `t.co bypass: ${e.target.checked?'ON':'OFF'}`);
    saveSettings();
  });

  document.getElementById('customVolumeEnabled').addEventListener('change', e => {
    if (!settings.customVolume) settings.customVolume = { enabled: false, level: 100 };
    settings.customVolume.enabled = e.target.checked;
    document.getElementById('volumeLevelRow').style.display = e.target.checked ? '' : 'none';
    logOutput('action', `Custom volume: ${e.target.checked?'ON':'OFF'}`);
    saveSettings();
  });

  document.getElementById('volumeLevel').addEventListener('input', e => {
    const val = parseInt(e.target.value);
    if (!settings.customVolume) settings.customVolume = { enabled: true, level: 100 };
    settings.customVolume.level = val;
    document.getElementById('volumeLabel').textContent = `Volume: ${val}%`;
    saveSettings();
  });

  document.getElementById('draggableTweets').addEventListener('change', e => {
    settings.draggableTweets = e.target.checked;
    logOutput('action', `Draggable tweets: ${e.target.checked?'ON':'OFF'}`);
    saveSettings();
  });

  document.getElementById('hideSuggestedContent').addEventListener('change', e => {
    settings.hideSuggestedContent = e.target.checked;
    logOutput('action', `Hide suggested content: ${e.target.checked?'ON':'OFF'}`);
    saveSettings();
  });

  // Font size
  document.getElementById('fontSize').addEventListener('input', e => { settings.fontSize=parseInt(e.target.value); document.getElementById('fontSizeLabel').textContent=`${e.target.value}%`; saveSettings(); });

  // Color themes
  document.querySelectorAll('.theme-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.theme-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    settings.theme = b.dataset.theme; logOutput('action',`Theme: ${b.dataset.theme}`); saveSettings();
  }));

  // CSS themes
  document.querySelectorAll('.css-theme-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.css-theme-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    settings.cssTheme = b.dataset.csstheme; logOutput('css',`CSS theme: ${b.dataset.csstheme}`); saveSettings();
  }));

  // Accent
  document.getElementById('accentColor').addEventListener('input', e => { settings.accentColor=e.target.value; document.getElementById('accentHex').textContent=e.target.value; saveSettings(); });
  document.getElementById('bgOpacity').addEventListener('input', e => { settings.bgOpacity=parseInt(e.target.value); document.getElementById('bgOpacityLabel').textContent=`${e.target.value}%`; saveSettings(); });

  // Icon presets
  document.querySelectorAll('.preset-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    settings.presetIcons = b.dataset.preset;
    const p = ICON_PRESETS[b.dataset.preset] || ICON_PRESETS.default;
    settings.iconReplacements = {...p};
    ['Like','Retweet','Reply','Share','Bookmark','Verified'].forEach(k => { const el=document.getElementById('icon'+k); if(el) el.value=p[k.toLowerCase()]||''; });
    logOutput('action',`Icons: ${b.dataset.preset}`); saveSettings();
  }));

  // Custom icons
  ['like','retweet','reply','share','bookmark','verified'].forEach(key => {
    const el = document.getElementById('icon'+key.charAt(0).toUpperCase()+key.slice(1));
    if(el) el.addEventListener('input', e => {
      if(!settings.iconReplacements) settings.iconReplacements={};
      settings.iconReplacements[key] = e.target.value;
      settings.presetIcons = 'custom';
      document.querySelectorAll('.preset-btn').forEach(x=>x.classList.remove('active'));
      saveSettings();
    });
  });

  // Effects
  ['rainbowLikes','smoothAnimations','glowEffects','particlesOnLike'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', e => { if(!settings.customEffects) settings.customEffects={}; settings.customEffects[id]=e.target.checked; saveSettings(); });
  });
  document.getElementById('hoverEffect').addEventListener('change', e => { settings.hoverEffect=e.target.value; saveSettings(); });
  document.getElementById('smoothScroll').addEventListener('change', e => { settings.smoothScroll=e.target.checked; saveSettings(); });

  // CSS
  document.getElementById('applyCSSBtn').addEventListener('click', () => { settings.customCSS=document.getElementById('customCSS').value; logOutput('css','CSS applied'); saveSettings(); });
  document.getElementById('clearCSSBtn').addEventListener('click', () => { document.getElementById('customCSS').value=''; settings.customCSS=''; saveSettings(); });
  document.getElementById('validateCSSBtn').addEventListener('click', () => {
    const css = document.getElementById('customCSS').value;
    if(!css.trim()) { logOutput('warn','No CSS to validate'); return; }
    const o=(css.match(/{/g)||[]).length, c=(css.match(/}/g)||[]).length;
    if(o!==c) logOutput('error',`Mismatched braces: ${o} open, ${c} close`);
    else logOutput('css','CSS validation passed');
  });

  // Script
  document.getElementById('applyScriptBtn').addEventListener('click', () => {
    const script = document.getElementById('customScript').value;
    settings.customScript = script; logOutput('script','Running script...'); saveSettings();
    chrome.tabs.query({active:true,currentWindow:true}, tabs => {
      if(tabs[0]) chrome.tabs.sendMessage(tabs[0].id, {type:'RUN_SCRIPT',script}, res => {
        if(res?.error) logOutput('error',`Script: ${res.error}`);
        else if(res?.result) logOutput('script',`Result: ${res.result}`);
      });
    });
  });
  document.getElementById('clearScriptBtn').addEventListener('click', () => { document.getElementById('customScript').value=''; settings.customScript=''; saveSettings(); });

  // Theme CSS
  document.getElementById('applyThemeCSSBtn').addEventListener('click', () => { settings.customThemeCSS=document.getElementById('customThemeCSS').value; settings.cssTheme='custom'; document.querySelectorAll('.css-theme-btn').forEach(b=>b.classList.remove('active')); logOutput('css','Custom theme applied'); saveSettings(); });
  document.getElementById('clearThemeCSSBtn').addEventListener('click', () => { document.getElementById('customThemeCSS').value=''; settings.customThemeCSS=''; saveSettings(); });

  // Snippets
  document.querySelectorAll('.snippet-btn').forEach(b => b.addEventListener('click', () => {
    const ta = document.getElementById('customCSS');
    const s = CSS_SNIPPETS[b.dataset.snippet];
    if(s) { ta.value = ta.value ? ta.value+'\n\n'+s : s; logOutput('css',`Snippet: ${b.dataset.snippet}`); }
  }));

  // User list
  document.getElementById('addUserBtn').addEventListener('click', addUser);
  document.getElementById('newUsername').addEventListener('keydown', e => { if(e.key==='Enter') addUser(); });
  document.getElementById('userSearch').addEventListener('input', e => filterUserList(e.target.value));
  document.querySelectorAll('.quick-btn').forEach(b => b.addEventListener('click', () => { const v=parseFloat(b.dataset.vis); for(const u in settings.userList) settings.userList[u]=v; renderUserList(); saveSettings(); }));

  // Dislike
  document.getElementById('enableDislike').addEventListener('change', e => { settings.enableDislike=e.target.checked; saveSettings(); });
  document.getElementById('minInteractions').addEventListener('change', e => { settings.minInteractions=Math.max(5,parseInt(e.target.value)||10); e.target.value=settings.minInteractions; saveSettings(); });
  document.getElementById('dislikeRatio').addEventListener('input', e => { settings.dislikeRatio=parseInt(e.target.value); document.getElementById('dislikeRatioDesc').textContent=`Mute at ${e.target.value}%+`; saveSettings(); });
  document.getElementById('clearDislikeData').addEventListener('click', () => { if(!confirm('Clear all dislike data?')) return; settings.dislikeData={}; settings.autoMuted=[]; renderDislikeStats(); renderAutoMutedList(); saveSettings(); });

  // ============ TIMED MUTE ============
  document.getElementById('timedMuteDuration').addEventListener('change', e => {
    document.getElementById('customDurationRow').style.display = e.target.value==='custom' ? '' : 'none';
  });
  document.getElementById('addTimedMuteBtn').addEventListener('click', addTimedMute);
  document.getElementById('timedMuteUsername').addEventListener('keydown', e => { if(e.key==='Enter') addTimedMute(); });

  // ============ CUSTOM FEED ============
  document.getElementById('customFeedEnabled').addEventListener('change', e => {
    if(!settings.customFeed) settings.customFeed = {enabled:false,slots:[]};
    settings.customFeed.enabled = e.target.checked;
    logOutput('action', `Custom feed: ${e.target.checked?'ON':'OFF'}`);
    saveSettings();
  });
  document.getElementById('addFeedSlot').addEventListener('click', addFeedSlot);
  document.getElementById('feedUsername').addEventListener('keydown', e => { if(e.key==='Enter') addFeedSlot(); });

  // ============ NOTIFICATIONS ============
  document.getElementById('addNotifyUser').addEventListener('click', addNotifyUser);
  document.getElementById('notifyUsername').addEventListener('keydown', e => { if(e.key==='Enter') addNotifyUser(); });

  // ============ GALLERY ============
  document.getElementById('uploadMediaBtn').addEventListener('click', () => document.getElementById('mediaFileInput').click());
  document.getElementById('mediaFileInput').addEventListener('change', handleMediaUpload);
  document.getElementById('closePreview').addEventListener('click', () => { document.getElementById('galleryPreview').style.display='none'; });

  // Share
  document.getElementById('copyTweetLink').addEventListener('click', () => { const v=document.getElementById('currentTweetLink').value; if(v&&!v.startsWith('Open')) { navigator.clipboard.writeText(v); showCopyStatus('Copied!'); addToRecentShares(v); }});
  document.getElementById('shareAsText').addEventListener('click', () => { const v=document.getElementById('currentTweetLink').value; if(v&&!v.startsWith('Open')) { navigator.clipboard.writeText(v); showCopyStatus('Text copied!'); addToRecentShares(v); }});
  document.getElementById('shareAsMarkdown').addEventListener('click', () => { const v=document.getElementById('currentTweetLink').value; if(v&&!v.startsWith('Open')) { navigator.clipboard.writeText(`[Tweet](${v})`); showCopyStatus('Markdown copied!'); addToRecentShares(v); }});
  document.getElementById('shareClean').addEventListener('click', () => { const v=document.getElementById('currentTweetLink').value; if(v&&!v.startsWith('Open')) { const c=v.split('?')[0]; navigator.clipboard.writeText(c); showCopyStatus('Clean URL copied!'); addToRecentShares(c); }});

  // Output
  document.getElementById('clearOutput').addEventListener('click', () => { document.getElementById('outputConsole').innerHTML=''; updateOutputCounts(); logOutput('info','Console cleared'); });
  document.getElementById('outputFilter').addEventListener('change', applyOutputFilter);

  // Import/Export
  document.getElementById('exportBtn').addEventListener('click', exportSettings);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', importSettings);
  document.getElementById('resetBtn').addEventListener('click', resetSettings);

  // Listen for content script messages
  chrome.runtime.onMessage.addListener((msg) => {
    if(msg.type==='LOG_OUTPUT') logOutput(msg.level||'info', msg.message);
    if(msg.type==='DISLIKE_UPDATED') { settings.dislikeData=msg.dislikeData; settings.autoMuted=msg.autoMuted||settings.autoMuted; renderDislikeStats(); renderAutoMutedList(); }
    if(msg.type==='TWEET_URL') document.getElementById('currentTweetLink').value = msg.url;
  });
}

// ==================== USER LIST ====================
function addUser() {
  const ui=document.getElementById('newUsername'), vi=document.getElementById('newVisibility');
  let u=ui.value.trim().replace(/^@/,'').toLowerCase(), v=parseFloat(vi.value);
  if(!u) return; if(isNaN(v)||v<0||v>1) v=0.5;
  if(!settings.userList) settings.userList={};
  settings.userList[u]=v; ui.value=''; vi.value='0.5';
  logOutput('action',`@${u} visibility: ${v}`);
  renderUserList(); saveSettings();
}

function renderUserList() {
  const c=document.getElementById('userList'), users=settings.userList||{}, entries=Object.entries(users).sort((a,b)=>a[1]-b[1]);
  if(!entries.length) { c.innerHTML='<div class="empty-state">No users added yet</div>'; }
  else {
    c.innerHTML = entries.map(([u,v]) => {
      let bc='visible', bt=`${(v*100).toFixed(0)}%`;
      if(v===0){bc='hidden';bt='Hidden';} else if(v<1) bc='partial';
      return `<div class="user-item" data-username="${u}"><div class="user-item-left"><span class="user-handle">@${u}</span><span class="vis-badge ${bc}">${bt}</span></div><div class="user-item-right"><input type="range" class="range-slider user-vis-slider" min="0" max="1" step="0.1" value="${v}" data-user="${u}"><button class="btn-remove" data-user="${u}">\u00d7</button></div></div>`;
    }).join('');
    c.querySelectorAll('.user-vis-slider').forEach(s => s.addEventListener('input', e => { settings.userList[e.target.dataset.user]=parseFloat(e.target.value); renderUserList(); saveSettings(); }));
    c.querySelectorAll('.btn-remove').forEach(b => b.addEventListener('click', e => { delete settings.userList[e.target.dataset.user]; renderUserList(); saveSettings(); }));
  }
  document.getElementById('userCount').textContent=`${entries.length} user${entries.length!==1?'s':''}`;
  document.getElementById('hiddenCount').textContent=`${entries.filter(([,v])=>v===0).length} hidden`;
}

function filterUserList(q) { document.querySelectorAll('#userList .user-item').forEach(i => { i.style.display=i.dataset.username.includes(q.toLowerCase())?'':'none'; }); }

// ==================== DISLIKE ====================
function renderDislikeStats() {
  const c=document.getElementById('dislikeStats'), data=settings.dislikeData||{};
  const entries=Object.entries(data).sort((a,b)=>(b[1].dislikes/(b[1].likes+b[1].dislikes||1))-(a[1].dislikes/(a[1].likes+a[1].dislikes||1)));
  if(!entries.length) { c.innerHTML='<div class="empty-state">No data yet.</div>'; return; }
  c.innerHTML = entries.slice(0,50).map(([u,d])=>{
    const t=d.likes+d.dislikes, r=t>0?((d.dislikes/t)*100).toFixed(0):0;
    const m=(settings.autoMuted||[]).includes(u);
    return `<div class="dislike-stat-item"><div class="dislike-stat-left"><span class="user-handle">@${u}</span>${m?'<span class="vis-badge hidden">MUTED</span>':''}</div><div class="dislike-stat-right"><span class="stat-likes">+${d.likes}</span><span class="stat-dislikes">-${d.dislikes}</span><span class="stat-ratio">${r}%</span></div></div>`;
  }).join('');
}

function renderAutoMutedList() {
  const c=document.getElementById('autoMutedList'), muted=settings.autoMuted||[];
  if(!muted.length) { c.innerHTML='<div class="empty-state">None yet.</div>'; return; }
  c.innerHTML = muted.map(u=>`<div class="user-item"><div class="user-item-left"><span class="user-handle">@${u}</span><span class="vis-badge hidden">Auto-Muted</span></div><div class="user-item-right"><button class="btn-add unmute-btn" data-user="${u}">Unmute</button></div></div>`).join('');
  c.querySelectorAll('.unmute-btn').forEach(b => b.addEventListener('click', e => { settings.autoMuted=settings.autoMuted.filter(x=>x!==e.target.dataset.user); renderAutoMutedList(); saveSettings(); }));
}

// ==================== TIMED MUTE ====================
function addTimedMute() {
  const ui = document.getElementById('timedMuteUsername');
  let u = ui.value.trim().replace(/^@/,'').toLowerCase();
  if(!u) return;
  const sel = document.getElementById('timedMuteDuration');
  let minutes = sel.value === 'custom' ? parseInt(document.getElementById('customDurationMin').value) : parseInt(sel.value);
  if(isNaN(minutes) || minutes < 1) minutes = 60;
  if(!settings.timedMutes) settings.timedMutes = {};
  settings.timedMutes[u] = Date.now() + (minutes * 60 * 1000);
  ui.value = '';
  logOutput('action', `@${u} timed-muted for ${formatDuration(minutes)}`);
  renderTimedMutes();
  saveSettings();
}

function renderTimedMutes() {
  const c = document.getElementById('timedMuteList');
  const mutes = settings.timedMutes || {};
  const now = Date.now();
  for(const [u,exp] of Object.entries(mutes)) { if(now >= exp) delete mutes[u]; }
  const entries = Object.entries(mutes).sort((a,b) => a[1]-b[1]);
  if(!entries.length) { c.innerHTML='<div class="empty-state">No timed mutes active.</div>'; return; }
  c.innerHTML = entries.map(([u,exp]) => {
    const remaining = Math.max(0, exp - now);
    const mins = Math.ceil(remaining / 60000);
    return `<div class="user-item"><div class="user-item-left"><span class="user-handle">@${u}</span><span class="xcp-timed-mute-badge">${formatDuration(mins)} left</span></div><div class="user-item-right"><button class="btn-add unmute-timed-btn" data-user="${u}">Unmute</button></div></div>`;
  }).join('');
  c.querySelectorAll('.unmute-timed-btn').forEach(b => b.addEventListener('click', e => {
    delete settings.timedMutes[e.target.dataset.user];
    logOutput('action', `@${e.target.dataset.user} unmuted early`);
    renderTimedMutes(); saveSettings();
  }));
}

function formatDuration(mins) {
  if(mins < 60) return `${mins}m`;
  if(mins < 1440) return `${Math.floor(mins/60)}h ${mins%60}m`;
  return `${Math.floor(mins/1440)}d ${Math.floor((mins%1440)/60)}h`;
}

// ==================== CUSTOM FEED ====================
function addFeedSlot() {
  const ui = document.getElementById('feedUsername');
  const fi = document.getElementById('feedFrequency');
  let u = ui.value.trim().replace(/^@/,'').toLowerCase();
  let freq = parseInt(fi.value) || 1;
  if(!u) return;
  if(!settings.customFeed) settings.customFeed = {enabled:false, slots:[]};
  const existing = settings.customFeed.slots.findIndex(s => s.username === u);
  if(existing >= 0) {
    settings.customFeed.slots[existing].frequency = freq;
  } else {
    settings.customFeed.slots.push({ username: u, frequency: Math.max(1, Math.min(10, freq)) });
  }
  ui.value = ''; fi.value = '1';
  logOutput('action', `Feed: @${u} x${freq}`);
  renderFeedSlots(); saveSettings();
}

function renderFeedSlots() {
  const c = document.getElementById('feedSlotList');
  const slots = settings.customFeed?.slots || [];
  if(!slots.length) { c.innerHTML='<div class="empty-state">No feed slots yet.</div>'; renderFeedPreview(); return; }
  c.innerHTML = slots.map((s,i) => `<div class="feed-slot-item" data-idx="${i}">
    <div class="feed-slot-left"><span class="user-handle">@${s.username}</span><span class="feed-freq-badge">x${s.frequency}</span></div>
    <div class="feed-slot-right">
      <div class="feed-slot-arrows"><button class="feed-arrow-btn feed-up" data-idx="${i}">&uarr;</button><button class="feed-arrow-btn feed-down" data-idx="${i}">&darr;</button></div>
      <input type="number" class="vis-input feed-freq-input" min="1" max="10" value="${s.frequency}" data-idx="${i}" style="width:44px;">
      <button class="btn-remove feed-remove" data-idx="${i}">\u00d7</button>
    </div>
  </div>`).join('');

  c.querySelectorAll('.feed-up').forEach(b => b.addEventListener('click', e => { const i=parseInt(e.target.dataset.idx); if(i>0) { [slots[i-1],slots[i]]=[slots[i],slots[i-1]]; renderFeedSlots(); saveSettings(); }}));
  c.querySelectorAll('.feed-down').forEach(b => b.addEventListener('click', e => { const i=parseInt(e.target.dataset.idx); if(i<slots.length-1) { [slots[i],slots[i+1]]=[slots[i+1],slots[i]]; renderFeedSlots(); saveSettings(); }}));
  c.querySelectorAll('.feed-freq-input').forEach(inp => inp.addEventListener('change', e => { const i=parseInt(e.target.dataset.idx); slots[i].frequency=Math.max(1,Math.min(10,parseInt(e.target.value)||1)); renderFeedSlots(); saveSettings(); }));
  c.querySelectorAll('.feed-remove').forEach(b => b.addEventListener('click', e => { slots.splice(parseInt(e.target.dataset.idx),1); renderFeedSlots(); saveSettings(); }));

  renderFeedPreview();
}

function renderFeedPreview() {
  const c = document.getElementById('feedPreview');
  const slots = settings.customFeed?.slots || [];
  if(!slots.length) { c.innerHTML='<div class="empty-state">Add users above to build your feed.</div>'; return; }
  const cycle = [];
  slots.forEach(s => { for(let i=0; i<s.frequency; i++) cycle.push(s.username); });
  const display = [];
  for(let r=0; r<3; r++) cycle.forEach(u => display.push(u));
  c.innerHTML = display.slice(0,30).map(u => `<span class="feed-preview-item">@${u}</span>`).join('') + (display.length>30 ? '<span class="feed-preview-item">...</span>' : '');
}

// ==================== NOTIFICATIONS ====================
function addNotifyUser() {
  const ui = document.getElementById('notifyUsername');
  let u = ui.value.trim().replace(/^@/,'').toLowerCase();
  if(!u) return;
  if(!settings.tweetNotifications) settings.tweetNotifications = {};
  settings.tweetNotifications[u] = true;
  ui.value = '';
  logOutput('action', `Watching @${u} for new tweets`);
  renderNotifyUsers();
  saveSettings();
}

function renderNotifyUsers() {
  const c = document.getElementById('notifyUserList');
  const users = settings.tweetNotifications || {};
  const entries = Object.entries(users).filter(([,v]) => v);
  if(!entries.length) { c.innerHTML='<div class="empty-state">No users being watched.</div>'; return; }
  c.innerHTML = entries.map(([u]) =>
    `<div class="user-item"><div class="user-item-left"><span class="user-handle">@${u}</span><span class="vis-badge visible">Watching</span></div><div class="user-item-right"><button class="btn-remove notify-remove" data-user="${u}">\u00d7</button></div></div>`
  ).join('');
  c.querySelectorAll('.notify-remove').forEach(b => b.addEventListener('click', e => {
    delete settings.tweetNotifications[e.target.dataset.user];
    logOutput('action', `Stopped watching @${e.target.dataset.user}`);
    renderNotifyUsers(); saveSettings();
  }));
}

// ==================== GALLERY ====================
function loadGallery() {
  chrome.tabs.query({active:true,currentWindow:true}, tabs => {
    if(!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, {type:'GALLERY_GET_ALL'}, res => {
      if(!res || res.error) { renderGalleryEmpty(); return; }
      renderGallery(Array.isArray(res) ? res : []);
    });
  });
}

function renderGalleryEmpty() {
  document.getElementById('galleryGrid').innerHTML='<div class="empty-state">No media uploaded yet. Make sure you\'re on X.</div>';
  document.getElementById('galleryCount').textContent='0 items';
}

function renderGallery(items) {
  const grid = document.getElementById('galleryGrid');
  document.getElementById('galleryCount').textContent = `${items.length} item${items.length!==1?'s':''}`;
  if(!items.length) { grid.innerHTML='<div class="empty-state">No media uploaded yet.</div>'; return; }

  grid.innerHTML = items.map(item => {
    const isVideo = item.type.startsWith('video');
    return `<div class="gallery-item" data-id="${item.id}">
      ${isVideo ? `<video src="${item.data}" muted></video>` : `<img src="${item.data}" alt="${esc(item.name)}">`}
      <div class="gallery-item-name">${esc(item.name)}</div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.gallery-item').forEach(el => {
    el.addEventListener('click', () => openGalleryPreview(parseInt(el.dataset.id), items));
  });
}

function openGalleryPreview(id, items) {
  const item = items.find(i => i.id === id);
  if(!item) return;
  const preview = document.getElementById('galleryPreview');
  const content = document.getElementById('previewContent');
  const isVideo = item.type.startsWith('video');

  content.innerHTML = isVideo
    ? `<video src="${item.data}" controls style="max-width:380px;max-height:300px;"></video>`
    : `<img src="${item.data}" style="max-width:380px;max-height:300px;">`;

  preview.style.display = 'flex';
  preview.dataset.currentId = id;

  document.getElementById('previewCopy').onclick = () => {
    chrome.tabs.query({active:true,currentWindow:true}, tabs => {
      if(tabs[0]) chrome.tabs.sendMessage(tabs[0].id, {type:'GALLERY_COPY_TO_CLIPBOARD', id}, res => {
        document.getElementById('previewStatus').textContent = res?.ok ? 'Copied to clipboard!' : `Error: ${res?.error}`;
        setTimeout(() => { document.getElementById('previewStatus').textContent=''; }, 2000);
      });
    });
  };

  document.getElementById('previewDelete').onclick = () => {
    if(!confirm('Delete this media?')) return;
    chrome.tabs.query({active:true,currentWindow:true}, tabs => {
      if(tabs[0]) chrome.tabs.sendMessage(tabs[0].id, {type:'GALLERY_DELETE', id}, () => {
        preview.style.display = 'none';
        loadGallery();
      });
    });
  };
}

function handleMediaUpload(e) {
  const files = e.target.files;
  if(!files.length) return;
  let processed = 0;
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      const fileData = { name: file.name, type: file.type, size: file.size, dataUrl: reader.result };
      chrome.tabs.query({active:true,currentWindow:true}, tabs => {
        if(tabs[0]) chrome.tabs.sendMessage(tabs[0].id, {type:'GALLERY_SAVE', fileData}, () => {
          processed++;
          if(processed === files.length) {
            logOutput('action', `${files.length} media file(s) uploaded`);
            loadGallery();
          }
        });
      });
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

// ==================== SHARE ====================
function refreshShareLink() {
  chrome.tabs.query({active:true,currentWindow:true}, tabs => {
    if(tabs[0]) {
      const m = (tabs[0].url||'').match(/https:\/\/(x\.com|twitter\.com)\/\w+\/status\/\d+/);
      document.getElementById('currentTweetLink').value = m ? m[0] : '';
      if(!m) document.getElementById('currentTweetLink').placeholder = 'Open a tweet on X...';
    }
  });
}

function showCopyStatus(msg) { const el=document.getElementById('copyStatus'); el.textContent=msg; setTimeout(()=>{el.textContent='';},2000); }

function addToRecentShares(url) {
  if(!settings.recentShares) settings.recentShares=[];
  settings.recentShares = [url,...settings.recentShares.filter(u=>u!==url)].slice(0,20);
  renderRecentShares(); saveSettings();
}

function renderRecentShares() {
  const c=document.getElementById('recentShares'), shares=settings.recentShares||[];
  if(!shares.length) { c.innerHTML='<div class="empty-state">No recent shares.</div>'; return; }
  c.innerHTML = shares.map(url=>`<div class="recent-share-item"><span class="recent-share-url" data-url="${esc(url)}">${esc(url)}</span><button class="btn-remove copy-recent" data-url="${esc(url)}" style="font-size:11px;width:auto;height:auto;padding:2px 8px;border-radius:4px;">Copy</button></div>`).join('');
  c.querySelectorAll('.copy-recent').forEach(b => b.addEventListener('click', e => { navigator.clipboard.writeText(e.target.dataset.url); showCopyStatus('Copied!'); }));
  c.querySelectorAll('.recent-share-url').forEach(el => el.addEventListener('click', () => { navigator.clipboard.writeText(el.dataset.url); showCopyStatus('Copied!'); }));
}

// ==================== IMPORT/EXPORT ====================
function exportSettings() {
  const blob = new Blob([JSON.stringify(settings,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), {href:url, download:`xcp-settings-${Date.now()}.json`}).click();
  URL.revokeObjectURL(url);
  logOutput('action','Settings exported');
}

function importSettings(e) {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      settings = {...getDefaults(), ...JSON.parse(evt.target.result)};
      await saveSettings(); applySettingsToUI(); renderUserList(); renderDislikeStats(); renderAutoMutedList(); renderRecentShares(); renderTimedMutes(); renderFeedSlots(); renderNotifyUsers();
      logOutput('action','Settings imported');
    } catch(err) { logOutput('error',`Import failed: ${err.message}`); alert('Invalid file'); }
  };
  reader.readAsText(file);
}

async function resetSettings() {
  if(!confirm('Reset all settings?')) return;
  settings = getDefaults();
  await saveSettings(); applySettingsToUI(); renderUserList(); renderDislikeStats(); renderAutoMutedList(); renderRecentShares(); renderTimedMutes(); renderFeedSlots(); renderNotifyUsers();
  logOutput('action','Settings reset');
}
