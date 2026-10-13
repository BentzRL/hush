const $ = (s) => document.querySelector(s);
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
let controlled = {}; // tabId -> { gain, title, host }

// Levels are remembered per site (www. ignored); content.js applies them when pages load.
const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};
const host = hostOf(tab.url);
let { levels = {} } = await chrome.storage.local.get('levels');

function saveLevel(site, gain) {
  if (!site) return;
  if (gain === 1) delete levels[site];
  else levels[site] = gain;
  chrome.storage.local.set({ levels });
}

// Snap to 100% when dragged close to the middle, so normal volume is easy to hit.
const snap = (v) => (Math.abs(v - 100) <= 4 ? 100 : Number(v));

// Gradient fill up to the thumb (sliders run 0-200).
const paint = (slider) => slider.style.setProperty('--p', slider.value / 2 + '%');
document.addEventListener('input', (e) => e.target.type === 'range' && paint(e.target));

async function send(msg) {
  const res = await chrome.runtime.sendMessage({ ...msg, to: 'background' });
  if (res?.error) throw new Error(res.error);
  controlled = res?.tabs ?? {};
  return res;
}

function showStatus(text, isError = false) {
  $('#status').textContent = text;
  $('#status').className = 'status' + (isError ? ' error' : '');
}

function renderCurrent() {
  const mine = controlled[tab.id];
  const saved = levels[host];
  const pct = Math.round((mine?.gain ?? saved ?? 1) * 100);
  $('#slider').value = pct;
  paint($('#slider'));
  $('#pct').textContent = pct + '%';
  $('#reset').disabled = !mine && saved == null;
  if ($('#status').classList.contains('error')) return;
  if (saved != null) showStatus(`Remembered for ${host}`);
  else showStatus(mine ? '' : 'Normal volume. Move the slider to adjust.');
}

function renderOthers() {
  const others = Object.entries(controlled).filter(([id]) => Number(id) !== tab.id);
  const box = $('#others');
  box.replaceChildren();
  if (!others.length) return;
  box.append(Object.assign(document.createElement('h2'), { textContent: 'Other adjusted tabs' }));
  for (const [id, t] of others) {
    const tabId = Number(id);
    const el = document.createElement('div');
    el.className = 'other';
    el.innerHTML = `<div class="name"></div><div class="row">
      <input type="range" min="0" max="200" step="1"><span class="pct"></span><button>Stop</button></div>`;
    el.querySelector('.name').textContent = t.title || `Tab ${tabId}`;
    const slider = el.querySelector('input');
    const pct = el.querySelector('.pct');
    slider.value = Math.round(t.gain * 100);
    paint(slider);
    pct.textContent = slider.value + '%';
    slider.oninput = () => {
      slider.value = snap(slider.value);
      pct.textContent = slider.value + '%';
      send({ type: 'set', tabId, gain: slider.value / 100 });
      saveLevel(t.host, slider.value / 100);
    };
    el.querySelector('button').onclick = async () => {
      await send({ type: 'stop', tabId });
      renderOthers();
    };
    box.append(el);
  }
}

// Slider events can arrive faster than capture starts, so apply only the latest value once ready.
let latest = null;
let busy = false;
async function setCurrent(pct) {
  $('#pct').textContent = pct + '%';
  latest = pct / 100;
  if (busy) return;
  busy = true;
  try {
    let gain;
    do {
      gain = latest;
      if (controlled[tab.id]) {
        await send({ type: 'set', tabId: tab.id, gain });
      } else {
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
        await send({ type: 'start', tabId: tab.id, streamId, gain, title: tab.title, host });
      }
      saveLevel(host, gain);
    } while (latest !== gain);
    showStatus('');
  } catch (err) {
    showStatus(`Can't control this tab: ${err.message}`, true);
  } finally {
    busy = false;
    renderCurrent();
  }
}

$('#title').textContent = tab.title || tab.url || 'This tab';
$('#slider').oninput = (e) => {
  e.target.value = snap(e.target.value);
  setCurrent(Number(e.target.value));
};

// Mouse wheel over any slider moves it 5% per notch.
document.addEventListener('wheel', (e) => {
  if (e.target.type !== 'range') return;
  e.preventDefault();
  e.target.value = Number(e.target.value) + (e.deltaY < 0 ? 5 : -5);
  e.target.dispatchEvent(new Event('input'));
}, { passive: false });
for (const b of document.querySelectorAll('.presets button')) b.onclick = () => setCurrent(Number(b.dataset.v));
$('#reset').onclick = async () => {
  saveLevel(host, 1);
  await send({ type: 'stop', tabId: tab.id });
  renderCurrent();
};

await send({ type: 'get' });
renderCurrent();
renderOthers();
