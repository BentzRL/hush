// Tells page.js the saved level for this site. Frames use the top page's site,
// so an embedded YouTube video follows the level of the page it's on.
const origins = location.ancestorOrigins;
const topOrigin = origins?.length ? origins[origins.length - 1] : location.origin;
const host = new URL(topOrigin).hostname.replace(/^www\./, '');

let level = 1;
let captured = false; // while Hush captures this tab, the capture applies the level instead

const send = () =>
  window.dispatchEvent(new CustomEvent('hush-factor', { detail: captured ? 1 : Math.min(level, 1) }));

async function load(levels) {
  level = levels?.[host] ?? 1;
  if (level < 1 && !captured) {
    const res = await chrome.runtime.sendMessage({ to: 'background', type: 'captured?' });
    captured = !!res?.captured;
  }
  send();
}

chrome.storage.local.get('levels').then(({ levels }) => load(levels));
chrome.storage.onChanged.addListener((changes) => changes.levels && load(changes.levels.newValue));
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'captured') return;
  captured = msg.on;
  send();
});
