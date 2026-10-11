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

async function handle(msg) {
  if (msg.type === 'ended') return setBadge(msg.tabId, null);
  if (msg.type !== 'start' && !(await hasOffscreen())) return { tabs: {} };
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ ...msg, to: 'offscreen' });
  if (res?.tabs && msg.tabId != null) setBadge(msg.tabId, res.tabs[msg.tabId]?.gain);
  return res;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.to !== 'background') return;
  handle(msg).then(sendResponse, (err) => sendResponse({ error: err.message }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => handle({ type: 'stop', tabId }));

// Tab badges are cleared when a page loads, so put the percentage back.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete' || !(await hasOffscreen())) return;
  const { tabs } = await chrome.runtime.sendMessage({ to: 'offscreen', type: 'get' });
  if (tabs[tabId]) setBadge(tabId, tabs[tabId].gain);
});
