(function () {
  'use strict';
  window.__csReady = true;

  var doc = document.documentElement;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* Fixed top bar: add a thin line under it once the page has scrolled */
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* Reveal each piece as it comes into view */
  if (doc.classList.contains('cs-armed') && 'IntersectionObserver' in window) {
    // Map of observed element -> elements to reveal. A clip-path reveal hides its own box,
    // so those are watched through their parent instead.
    var targets = new Map();
    var reveal = function (el) { el.classList.add('cs-in'); };
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && (en.intersectionRatio >= 0.2 || en.intersectionRect.height >= 140)) {
          (targets.get(en.target) || [en.target]).forEach(reveal);
          io.unobserve(en.target);
          targets.delete(en.target);
        }
      });
    }, { threshold: [0, 0.1, 0.2, 0.3], rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.cs-l, .cs-r, .cs-up, .cs-wipe-l, .cs-wipe-r, .cs-clip').forEach(function (el) {
      var t = el.classList.contains('cs-clip') ? el.parentElement : el;
      if (!targets.has(t)) targets.set(t, []);
      targets.get(t).push(el);
      io.observe(t);
    });
    // At the very bottom of the page, show anything still waiting (e.g. the footer)
    var revealRest = function () {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        targets.forEach(function (list, t) { list.forEach(reveal); io.unobserve(t); });
        targets.clear();
      }
    };
    window.addEventListener('scroll', revealRest, { passive: true });
  }

  /* Pixel edges on the games carousel: dense at the frame edge, sparse further in */
  var pxPath = document.querySelector('[data-px-path]');
  if (pxPath) {
    var size = 18, cols = 8, rows = 24, seed = 1337, d = '';
    var rand = function () { seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5; return ((seed >>> 0) % 10000) / 10000; };
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var p = c === 0 ? 1 : 0.7 * Math.pow(1 - (c - 1) / (cols - 1), 2.8);
        if (rand() < p) d += 'M' + (c * size) + ' ' + (r * size) + 'h' + (size + 1) + 'v' + (size + 1) + 'h-' + (size + 1) + 'z';
      }
    }
    pxPath.setAttribute('d', d);
  }

  /* Games carousel: self-scrolling endless loop, arrows, drag/swipe/trackpad scrubbing */
  var wrap = document.querySelector('[data-carousel]');
  if (!wrap) return;
  var zone = document.querySelector('[data-scrub]') || wrap;
  var track = wrap.querySelector('[data-track]');
  var originals = Array.prototype.slice.call(track.children);
  var n = originals.length;
  if (!n) return;

  function cloneSet() {
    var frag = document.createDocumentFragment();
    originals.forEach(function (li) {
      var c = li.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.querySelectorAll('[tabindex]').forEach(function (x) { x.setAttribute('tabindex', '-1'); });
      c.querySelectorAll('img').forEach(function (img) { img.setAttribute('alt', ''); });
      frag.appendChild(c);
    });
    return frag;
  }
  // Layout becomes: [copy][originals][copy], so there is always art on both sides
  track.insertBefore(cloneSet(), track.firstChild);
  track.appendChild(cloneSet());
  var items = track.children;

  var offset = 0, speed = 0, last = 0, anim = null, paused = false, drag = null, resumeTimer = null;
  var CRUISE = 42; // pixels per second

  function measure() {
    var step = items[1].offsetLeft - items[0].offsetLeft;
    var set = items[n].offsetLeft - items[0].offsetLeft;
    if (!(step > 0) || !(set > 0)) return null;
    return { step: step, set: set };
  }

  function tick(t) {
    requestAnimationFrame(tick);
    var dt = last ? Math.min(64, t - last) / 1000 : 0;
    last = t;
    var m = measure();
    if (!m) return;
    var cruise = (paused || reduce) ? 0 : CRUISE;
    speed += (cruise - speed) * Math.min(1, dt * 3);
    if (drag) {
      // offset follows the pointer while dragging
    } else if (anim) {
      var p = anim.dur ? Math.min(1, (t - anim.start) / anim.dur) : 1;
      var e = 1 - Math.pow(1 - p, 3);
      offset = anim.from + (anim.to - anim.from) * e;
      if (p >= 1) anim = null;
    } else {
      offset += speed * dt;
    }
    var o = ((offset % m.set) + m.set) % m.set;
    if (!anim) offset = o;
    track.style.transform = 'translate3d(' + (-m.set - o).toFixed(2) + 'px,0,0)';
  }
  requestAnimationFrame(tick);

  function go(dir) {
    var m = measure();
    if (!m) return;
    var o = offset;
    var k = dir > 0 ? Math.floor(o / m.step + 0.02) + 1 : Math.ceil(o / m.step - 0.02) - 1;
    anim = { from: o, to: k * m.step, start: performance.now(), dur: reduce ? 0 : 750 };
    speed = 0;
  }
  wrap.querySelector('[data-prev]').addEventListener('click', function () { go(-1); });
  wrap.querySelector('[data-next]').addEventListener('click', function () { go(1); });

  // Pause while the pointer is over the games so people can read the hover info
  wrap.addEventListener('mouseenter', function () { paused = true; });
  wrap.addEventListener('mouseleave', function () { paused = false; });
  wrap.addEventListener('focusin', function (e) {
    paused = true;
    if (drag) return;
    var li = e.target.closest ? e.target.closest('[data-track] > li') : null;
    if (!li) return;
    var idx = Array.prototype.indexOf.call(items, li);
    var m = measure();
    if (idx < 0 || !m) return;
    anim = { from: offset, to: (idx % n) * m.step, start: performance.now(), dur: reduce ? 0 : 600 };
  });
  wrap.addEventListener('focusout', function () { paused = false; });

  // Drag or swipe anywhere across the full width of the carousel row
  zone.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || (e.target.closest && e.target.closest('button'))) return;
    drag = { last: e.clientX, t: performance.now(), v: 0 };
    anim = null;
    speed = 0;
    try { zone.setPointerCapture(e.pointerId); } catch (err) {}
  });
  zone.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var now = performance.now();
    var dx = e.clientX - drag.last;
    drag.last = e.clientX;
    offset -= dx;
    drag.v = (-dx / Math.max(1, now - drag.t)) * 1000;
    drag.t = now;
  });
  var endDrag = function () {
    if (!drag) return;
    speed = Math.max(-2400, Math.min(2400, drag.v)); // a quick flick carries on, then eases back
    drag = null;
    anim = null;
  };
  zone.addEventListener('pointerup', endDrag);
  zone.addEventListener('pointercancel', endDrag);

  // Sideways trackpad scrolling
  zone.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    anim = null;
    speed = 0;
    offset += e.deltaX;
  }, { passive: false });

  // On touch screens, resume the slow scroll a few seconds after letting go
  zone.addEventListener('touchstart', function () {
    paused = true;
    clearTimeout(resumeTimer);
  }, { passive: true });
  zone.addEventListener('touchend', function () {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () { paused = false; }, 3000);
  }, { passive: true });
})();
