// X Control Panel — Background Service Worker v4

const DEFAULT_SETTINGS = {
  enabled: true,
  customCSS: '',
  customScript: '',
  customThemeCSS: '',
  cssTheme: 'none',
  iconReplacements: {},
  userList: {},
  theme: 'cyberpunk',
  accentColor: '#7b61ff',
  bgOpacity: 100,
  hidePromoted: true,
  hideWhoToFollow: false,
  hideTopicsToFollow: false,
  compactMode: false,
  hideCreatorStudio: false,
  hidePremium: false,
  hideGrok: false,
  hideMessages: false,
  blockGrokTweets: false,
  blockGrokSummaries: false,
  fontSize: 100,
  customEffects: {
    rainbowLikes: false,
    smoothAnimations: true,
    glowEffects: false,
    particlesOnLike: false
  },
  hoverEffect: 'lift',
  smoothScroll: true,
  presetIcons: 'default',
  enableDislike: true,
  minInteractions: 10,
  dislikeRatio: 60,
  dislikeData: {},
  autoMuted: [],
  timedMutes: {},
  recentShares: [],
  customFeed: {
    enabled: false,
    slots: []
  },
  // New features v3
  bypassTcoLinks: false,
  customVolume: { enabled: false, level: 100 },
  tweetNotifications: {},   // { username: true }
  draggableTweets: false,
  hideSuggestedContent: false
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get('settings');
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  } else {
    const merged = { ...DEFAULT_SETTINGS, ...existing.settings };
    await chrome.storage.local.set({ settings: merged });
  }
});

// Alarms: timed mute check + notification polling
chrome.alarms.create('xcp-timed-mute-check', { periodInMinutes: 1 });
chrome.alarms.create('xcp-notification-check', { periodInMinutes: 2 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'xcp-timed-mute-check') {
    const data = await chrome.storage.local.get('settings');
    const settings = data.settings;
    if (!settings?.timedMutes) return;

    const now = Date.now();
    let changed = false;
    for (const [user, expires] of Object.entries(settings.timedMutes)) {
      if (now >= expires) {
        delete settings.timedMutes[user];
        changed = true;
      }
    }
    if (changed) {
      await chrome.storage.local.set({ settings });
      notifyTabs(settings);
    }
  }

  if (alarm.name === 'xcp-notification-check') {
    const data = await chrome.storage.local.get('settings');
    const settings = data.settings;
    if (!settings?.tweetNotifications) return;
    const watchedUsers = Object.keys(settings.tweetNotifications).filter(u => settings.tweetNotifications[u]);
    if (!watchedUsers.length) return;
    // Ask content scripts to check for new tweets from watched users
    chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, tabs => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: 'CHECK_WATCHED_USERS', users: watchedUsers }).catch(() => {});
      }
    });
  }
});

function notifyTabs(settings) {
  chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, tabs => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings }).catch(() => {});
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_SETTINGS') {
    chrome.storage.local.get('settings').then(data => {
      sendResponse(data.settings || DEFAULT_SETTINGS);
    });
    return true;
  }

  if (msg.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set({ settings: msg.settings }).then(() => {
      notifyTabs(msg.settings);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'LOG_OUTPUT' || msg.type === 'DISLIKE_UPDATED' || msg.type === 'TWEET_URL') {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  // Notification from content script that a watched user posted
  if (msg.type === 'NOTIFY_NEW_TWEET') {
    chrome.notifications.create(`xcp-tweet-${msg.username}-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `@${msg.username} just posted!`,
      message: msg.text || 'New tweet on your timeline',
      priority: 2
    });
  }

  if (msg.type === 'EXPORT_SETTINGS') {
    chrome.storage.local.get('settings').then(data => {
      sendResponse(data.settings || DEFAULT_SETTINGS);
    });
    return true;
  }

  if (msg.type === 'IMPORT_SETTINGS') {
    chrome.storage.local.set({ settings: msg.settings }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
});

// Open tweet when notification clicked
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('xcp-tweet-')) {
    chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, tabs => {
      if (tabs.length) chrome.tabs.update(tabs[0].id, { active: true });
    });
  }
});
