/* Document invisible qui joue le son d'alerte (un service worker ne peut pas jouer d'audio). */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'play') return;
  const audio = new Audio('sounds/alert.wav');
  audio.volume = Math.min(1, Math.max(0, Number(msg.volume ?? 0.7)));
  audio.play().then(() => sendResponse({ ok: true }), err => sendResponse({ ok: false, error: String(err) }));
  return true;
});
