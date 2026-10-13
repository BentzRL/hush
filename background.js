// Relays popup requests to the offscreen document, which owns the audio, and keeps the badge current.
let creating = null;

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Play captured tab audio through a volume control',
    })
    .finally(() => (creating = null));
  await creating;
}

function setBadge(tabId, gain) {
  const text = gain == null ? '' : String(Math.round(gain * 100));
  chrome.action.setBadgeText({ tabId, text }).catch(() => {}); // tab may already be closed
}

chrome.action.setBadgeBackgroundColor({ color: '#6a5cff' });

// Pages apply the saved site level themselves unless the tab is captured, so tell them.
function setCaptured(tabId, on) {
  chrome.tabs.sendMessage(tabId, { type: 'captured', on }).catch(() => {}); // page may have no content script
}

async function handle(msg, sender) {
  if (msg.type === 'ended') {
    setBadge(msg.tabId, null);
    return setCaptured(msg.tabId, false);
  }
  if (msg.type === 'captured?') {
    if (!(await hasOffscreen())) return { captured: false };
    const { tabs } = await chrome.runtime.sendMessage({ to: 'offscreen', type: 'get' });
    return { captured: !!tabs[sender.tab?.id] };
  }
  if (msg.type !== 'start' && !(await hasOffscreen())) return { tabs: {} };
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ ...msg, to: 'offscreen' });
  if (res?.tabs && msg.tabId != null) setBadge(msg.tabId, res.tabs[msg.tabId]?.gain);
  if (msg.type === 'start' || msg.type === 'stop') setCaptured(msg.tabId, msg.type === 'start');
  return res;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.to !== 'background') return;
  handle(msg, sender).then(sendResponse, (err) => sendResponse({ error: err.message }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => handle({ type: 'stop', tabId }));

// Tab badges are cleared when a page loads, so put the percentage back.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete' || !(await hasOffscreen())) return;
  const { tabs } = await chrome.runtime.sendMessage({ to: 'offscreen', type: 'get' });
  if (tabs[tabId]) setBadge(tabId, tabs[tabId].gain);
});
