# X Control Panel

A Chrome extension that gives you more control over what you see and how X/Twitter looks and behaves. Built around a settings panel that persists across sessions.

---

## Installation

Chrome blocks `.crx` files from outside the Web Store by default, so you need to enable Developer Mode first.

1. Download `twitter.crx` from this repo
2. Go to `chrome://extensions` in your browser
3. Toggle **Developer mode** on (top right)
4. Drag and drop the `.crx` file into the extensions page
5. Click **Add extension** when prompted

> The extension only runs on `x.com` and `twitter.com`. It does not collect or transmit any data — all settings and dislike data are stored locally in your browser via `chrome.storage.local`.

---

## What it does

### Content filtering
- Hide promoted/sponsored posts ( turn it off it's blocking too many tweets ) 
- Hide "Who to Follow" suggestions
- Hide "Topics to Follow"
- Hide Grok UI elements
- Hide Premium upsells
- Hide Creator Studio entries
- Hide suggested content ( turn if off if it's blocking too many posts ) 

### Visual customization
- Theme system with accent color picker
- Font size scaling
- Compact mode (reduces tweet padding)
- Hover effects: lift, glow, border, scale
- Smooth scroll toggle
- Background opacity control

Themes apply CSS variables across the page. Media (images and video) is explicitly excluded from theme filters, so photos and videos always display normally regardless of what theme is active.

### Interaction
- Dislike button added to each tweet (tracked locally, never sent anywhere)
- Dislike ratio display based on configurable thresholds
- Icon replacement for action buttons (reply, retweet, like, etc.)
- Like animations: particle burst, rainbow cycle on liked posts

### Utility
- **Timed mutes** — mute a user for a set duration; automatically unmutes when time expires
- **Tweet notifications** — get a browser notification when a specific user posts (checks every 2 minutes while X is open)
- **Custom feed slots** — filter your timeline to specific criteria
- **Draggable tweets** — reposition individual tweets on the page ( aware of some bugs will be fixed tomorrow ) 
- **Per-video volume control** — slider appears on videos independently of system volume
- **T.co link bypass** — resolves redirect links before you click them ( aware of bugs will try to fix as soon as possible ) 
- **Custom CSS** — inject your own stylesheet into X
- **Custom JavaScript** — run your own script on page load
- **Import/export settings** — back up or transfer your configuration

---

## Permissions used

| Permission | Why |
|---|---|
| `storage` | Save your settings locally |
| `activeTab` | Read the current X tab to apply changes |
| `scripting` | Inject CSS and JS into X pages |
| `alarms` | Check timed mutes and notifications on a schedule |
| `notifications` | Show browser notifications for watched users |

---

## Limitations worth knowing

- X frequently changes its internal markup and `data-testid` attributes. If a feature stops working after an X update, selectors in the extension may need updating.
- The dislike system is entirely local — it's a personal tracking tool, not a shared signal.
- Tweet notifications require X to be open in a tab; the extension can't fetch tweets in the background independently.
- `.crx` sideloading works but Chrome may show a warning on startup about extensions not from the Web Store. This is expected behavior for any sideloaded extension.

---

## File structure (for source reference)

```
background.js         — Service worker, settings management, alarms
manifest.json         — Extension manifest (MV3)
content/
  content.js          — Main logic injected into X pages
  base.css            — Base styles injected alongside content script
popup/
  popup.html          — Settings panel UI
  popup.js            — Settings panel logic
  popup.css           — Settings panel styles
icons/
  icon16.png
  icon48.png
  icon128.png
generate-icons.html   — Script used to generate the icon files
```

---

## Notes

This is a personal project. It works on the current version of X as of the last commit, but may break if X changes its frontend. Issues and pull requests are open if you want to report something or contribute a fix.
