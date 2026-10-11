// Each controlled tab: its captured audio -> gain node -> speakers.
const tabs = new Map(); // tabId -> { stream, ctx, node, gain, title }

async function start({ tabId, streamId, gain, title }) {
  if (tabs.has(tabId)) return setGain(tabId, gain);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: false,
  });
  const ctx = new AudioContext();
  const node = ctx.createGain();
  node.gain.value = gain;
  ctx.createMediaStreamSource(stream).connect(node).connect(ctx.destination);
  stream.getAudioTracks()[0].addEventListener('ended', () => {
    stop(tabId);
    chrome.runtime.sendMessage({ to: 'background', type: 'ended', tabId });
  });
  tabs.set(tabId, { stream, ctx, node, gain, title });
}

function setGain(tabId, gain) {
  const t = tabs.get(tabId);
  if (!t) return;
  t.gain = gain;
  t.node.gain.setTargetAtTime(gain, t.ctx.currentTime, 0.02); // short ramp avoids clicks
}

function stop(tabId) {
  const t = tabs.get(tabId);
  if (!t) return;
  t.stream.getTracks().forEach((track) => track.stop());
  t.ctx.close();
  tabs.delete(tabId);
}

function list() {
  return Object.fromEntries([...tabs].map(([id, t]) => [id, { gain: t.gain, title: t.title }]));
}

async function handle(msg) {
  if (msg.type === 'start') await start(msg);
  else if (msg.type === 'set') setGain(msg.tabId, msg.gain);
  else if (msg.type === 'stop') stop(msg.tabId);
  return { tabs: list() };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.to !== 'offscreen') return;
  handle(msg).then(sendResponse, (err) => sendResponse({ error: err.message }));
  return true;
});
