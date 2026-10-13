// Runs in the page itself. Scales every <video>/<audio> by Hush's factor while the
// site keeps seeing its own volume values, so its volume controls still behave normally.
(() => {
  const native = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  const pageVolume = new WeakMap(); // element -> volume the site asked for
  const elements = new Set(); // WeakRefs, so factor changes reach elements already playing
  let factor = 1;

  const track = (el) => {
    if (pageVolume.has(el)) return;
    pageVolume.set(el, native.get.call(el));
    elements.add(new WeakRef(el));
  };
  const apply = (el) => native.set.call(el, pageVolume.get(el) * factor);

  Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
    configurable: true,
    enumerable: native.enumerable,
    get() {
      return pageVolume.has(this) ? pageVolume.get(this) : native.get.call(this);
    },
    set(v) {
      track(this);
      native.set.call(this, v); // throws for out-of-range values, like the real setter
      pageVolume.set(this, native.get.call(this));
      apply(this);
    },
  });

  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    track(this);
    apply(this);
    return play.apply(this, args);
  };

  // Catches autoplaying elements, which never call play().
  document.addEventListener('play', (e) => {
    if (e.target instanceof HTMLMediaElement) {
      track(e.target);
      apply(e.target);
    }
  }, true);

  window.addEventListener('hush-factor', (e) => {
    factor = e.detail;
    for (const ref of elements) {
      const el = ref.deref();
      if (el) apply(el);
      else elements.delete(ref);
    }
  });
})();
