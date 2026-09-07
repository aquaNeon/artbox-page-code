/* ============================================================
   Artbox — Barba page transitions

   Load after gsap, CustomEase, @barba/core, lenis and swiper, before
   </body>: it queries the DOM and calls barba.init() as it parses.

   Docs: README — required DOM structure, per-template attributes,
   and a section per module.
   ============================================================ */

(function () {
  'use strict';

  /* Bump on every push: jsDelivr serves a week-old copy on a plain
     reload, and this line is the only way to tell which build is live. */
  const BUILD = '2026-09-04-bw';
  console.info(`[page-transition] build ${BUILD}`);

  gsap.registerPlugin(CustomEase);
  if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  if (window.SplitText) gsap.registerPlugin(SplitText);
  history.scrollRestoration = 'manual';

  let lenis = null;
  let nextPage = document;
  let onceFunctionsInitialized = false;

  // Lets the enter step wait on the leave timeline. See runPageEnterAnimation.
  let leaveDone = null;
  let resolveLeave = null;

  const hasLenis = typeof window.Lenis !== 'undefined';
  const hasScrollTrigger = typeof window.ScrollTrigger !== 'undefined';
  const hasSplitText = typeof window.SplitText !== 'undefined';

  const rmMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = rmMQ.matches;
  rmMQ.addEventListener?.('change', (e) => (reducedMotion = e.matches));

  const has = (s) => !!nextPage.querySelector(s);

  /* ============================================================
     EASING — EASE holds the curves, E maps a kind of motion to one.
     Modules name a role only.  (docs: README ## Easing)

     Scrubbed tweens keep ease:'none' at the call site: scroll
     position is their timing, and easing it twice reads as lag.
     ============================================================ */

  const durationDefault = 0.6;

  CustomEase.create('osmo', '0.625, 0.05, 0, 1');
  CustomEase.create('pageFade', '0.25, 0.46, 0.45, 0.94');
  CustomEase.create('menuSwipe', '0.05, 0.7, 0.1, 1');

  const EASE = {
    brand: 'osmo',
    page: 'pageFade',
    menu: 'menuSwipe'
  };

  const E = {
    heading: 'power4.out',    // lines rising out of a mask
    body: 'power3.out',       // paragraphs, solo elements, swapped statements
    small: 'power2.out',      // short moves: list items, inline images, nav
    panel: 'power3',          // tab crossfades
    open: EASE.brand,         // things opening in place: faq, colour fills
    travel: 'power2.inOut',   // long journeys: video takeover, row dissolve
    hover: 'power3',          // pointer-following
    hoverOut: 'power3.inOut', // the follower scaling away
    label: 'power1.out',      // text swapping under a button
    page: EASE.page,
    menuSheet: EASE.menu
  };

  gsap.defaults({ ease: EASE.brand, duration: durationDefault });

  const FADE = {
    duration: 1,
    blur: 5,          // px, on both layers
    ease: E.page
  };


  /* ============================================================
     MODULE REGISTRY — keyed by container: sync:true means both pages
     are mounted at once, so one shared cleanup list tears down the
     wrong page.  (docs: README ## Modules)
     ============================================================ */

  const Modules = (function () {
    const registry = [];
    const mounted = new Map();

    return {
      add(name, init) {
        registry.push({ name, init });
      },
      mount(container) {
        const root = container || document;
        // beforeEnter also fires on the initial load, alongside once():
        // without this the first page mounts every module twice.
        if (mounted.has(root)) return;
        const cleanups = [];
        registry.forEach(({ name, init }) => {
          try {
            const teardown = init(root);
            if (typeof teardown === 'function') cleanups.push(teardown);
          } catch (err) {
            console.error('[modules] init failed:', name, err);
          }
        });
        mounted.set(root, cleanups);
      },
      unmount(container) {
        const root = container || document;
        const cleanups = mounted.get(root);
        if (!cleanups) return;
        cleanups.forEach((fn) => {
          try { fn(); } catch (err) { console.error('[modules] cleanup failed', err); }
        });
        mounted.delete(root);
        Intro.drop(root);
      }
    };
  })();


  /* ============================================================
     INTRO QUEUE — mount happens at beforeEnter, where the container is
     still a fixed 100vh rectangle sliding in: an intro started there
     plays behind the transition. Queued timelines run once the page is
     laid out for real (afterEnter, and once() on first load).
     ============================================================ */

  const Intro = (function () {
    const queued = new Map();

    return {
      add(root, play) {
        const list = queued.get(root) || [];
        list.push(play);
        queued.set(root, list);
      },
      play(root) {
        const list = queued.get(root);
        if (!list) return;
        queued.delete(root);
        list.forEach((fn) => {
          try { fn(); } catch (err) { console.error('[intro] play failed', err); }
        });
      },
      drop(root) { queued.delete(root); }
    };
  })();


  /* ============================================================
     ATTRIBUTE-DRIVEN LAYOUT
     Was three inline scripts inside sections. Script tags inside
     the swapped container never execute, so they had to move here.
     Delete those embeds in the Designer or they run twice on load.
     ============================================================ */

  Modules.add('caseRowGrid', function (root) {
    root.querySelectorAll('.c_cases_row_grid_item').forEach((el) => {
      const col = el.getAttribute('data-col');
      const ratio = el.getAttribute('data-ratio');
      if (col) {
        const [start, end] = col.split('/').map((v) => v.trim());
        el.style.gridColumn = `${start} / ${parseInt(end, 10) + 1}`;
      }
      if (ratio) {
        const wrap = el.querySelector('.c_cases_row_image_wrap');
        if (wrap) wrap.style.aspectRatio = ratio;
      }
    });
  });

  Modules.add('collectionRatio', function (root) {
    root.querySelectorAll('.c_collection_item[data-ar]').forEach((el) => {
      const ratio = el.getAttribute('data-ar');
      const wrap = el.querySelector('.cases_card_image_wrap');
      if (ratio && wrap) wrap.style.aspectRatio = ratio;
    });
  });

  Modules.add('testimonialColours', function (root) {
    root.querySelectorAll('.c_testimonial_content_wrap').forEach((el) => {
      const bg = el.getAttribute('data-bg');
      const text = el.getAttribute('data-text');
      const secondary = el.getAttribute('data-text-secondary');
      if (bg) el.style.setProperty('--section-bg', bg);
      if (text) el.style.setProperty('--section-text', text);
      if (secondary) el.style.setProperty('--section-text-secondary', secondary);
    });
  });

  Modules.add('cardHoverColours', function (root) {
    const resolve = (v) => {
      if (!v) return null;
      v = v.trim();
      if (!v) return null;
      return v.startsWith('--') ? `var(${v})` : v;
    };
    root.querySelectorAll('.card_hover_wrap').forEach((card) => {
      const bg = resolve(card.getAttribute('data-card-bg'));
      const text = resolve(card.getAttribute('data-card-text'));
      if (bg) card.style.setProperty('--card-bg', bg);
      if (text) card.style.setProperty('--card-text', text);

      /* Card painted in the hover panel's own colour: the panel covers it
         only to the pixel, and the antialiased edge otherwise exposes a
         hairline of near-black. Read at runtime — the colour comes from a
         Webflow variant class. */
      const panel = card.querySelector('.card_hover_bg_hover');
      if (!panel) return;
      const panelBg = getComputedStyle(panel).backgroundColor;
      if (panelBg && panelBg !== 'rgba(0, 0, 0, 0)' && panelBg !== 'transparent') {
        card.style.backgroundColor = panelBg;
      }

      /* These inherit currentColor from a parent that is already animating
         it, so their own transition makes them lag the rest of the card.
         Inline, because the competing rule is in a later embed and any
         stylesheet rule of ours ties on specificity and loses on order. */
      card.querySelectorAll(
        '.card_hover_details_name, .card_hover_details_position, .u-color-secondary'
      ).forEach((el) => { el.style.transition = 'none'; });
    });
  });

  /* ============================================================
     SMOOTHLY — .work_smoothly_wrap
     Opt-in autoplay: stepping or drift, paused whenever nobody is
     watching.  (docs: README ### smooothy)
     ============================================================ */

 Modules.add('smooothy', function (root) {
  const els = root.querySelectorAll('.work_smoothly_wrap');
  if (!els.length) return;

  const html = document.documentElement;
  const instances = [];
  let rafId = null;
  let killed = false;

  /* smooothy stores position as a NEGATIVE slide count, so reading the
     index back needs -target. Stepping without the sign flip lands on
     0, -1, 0, -1 — forward and back forever. */
  const AUTOPLAY_DEFAULT = 4000;   // ms between steps
  const DRIFT_DEFAULT = 0.15;      // slides per second
  const FRAME_CAP = 100;           // ms of drift credited to one frame

  const autoplayMode = (el) => {
    const raw = el.getAttribute('data-autoplay');
    if (raw === null || raw === 'false') return null;

    if (raw === 'drift' || raw === 'marquee') {
      const speed = parseFloat(el.getAttribute('data-autoplay-speed'));
      return {
        drift: true,
        speed: Number.isFinite(speed) && speed > 0 ? speed : DRIFT_DEFAULT
      };
    }

    const ms = parseInt(raw, 10);
    return { drift: false, delay: Number.isFinite(ms) && ms > 0 ? ms : AUTOPLAY_DEFAULT };
  };

  // Ours rather than the library's isVisible: that flag is internal and
  // only set while its own observer runs.
  const seen = new WeakMap();
  const visibility = new IntersectionObserver((entries) => {
    entries.forEach((entry) => seen.set(entry.target, entry.isIntersecting));
  }, { threshold: 0 });

  const hoverDetachers = [];

  const advance = (inst, now) => {
    if (!inst.auto) return;

    // Clock reset, not paused: no jump when the pause ends.
    if (inst.hover || inst.slider.isDragging || document.hidden
      || seen.get(inst.el) === false) {
      inst.last = now;
      return;
    }

    if (inst.auto.drift) {
      // Nudged every frame; current lerps toward it, so this reads as
      // motion rather than steps. Capped against dropped frames.
      const dt = Math.min(now - inst.last, FRAME_CAP);
      inst.last = now;
      inst.slider.target -= inst.auto.speed * (dt / 1000);
      return;
    }

    if (now - inst.last < inst.auto.delay) return;
    inst.last = now;
    inst.slider.goToIndex(Math.round(-inst.slider.target) + 1);
  };

  const remeasure = (slider) => {
    if (typeof slider.resize === 'function') return slider.resize();
    if (typeof slider.refresh === 'function') return slider.refresh();
    if (typeof slider.update === 'function') return slider.update();
  };

  const refreshAll = () => {
    instances.forEach(({ slider }) => remeasure(slider));
  };

  import('https://cdn.jsdelivr.net/npm/smooothy@0.0.25/+esm')
    .then(({ default: Core }) => {
      if (killed) return;

      els.forEach((el) => {
        const slider = new Core(el, {
          infinite: true,
          snap: false,
          variableWidth: false,
          lerpFactor: 0.08,
          dragSensitivity: 0.005,
          scrollInput: false
        });

        // Reduced motion drops the autoplay, not the slider.
        const auto = reducedMotion ? null : autoplayMode(el);
        const inst = { slider, el, auto, hover: false, last: performance.now() };

        if (auto) {
          visibility.observe(el);

          if (window.matchMedia('(hover: hover)').matches) {
            const onEnter = () => { inst.hover = true; };
            const onLeave = () => { inst.hover = false; inst.last = performance.now(); };
            el.addEventListener('mouseenter', onEnter);
            el.addEventListener('mouseleave', onLeave);
            hoverDetachers.push(() => {
              el.removeEventListener('mouseenter', onEnter);
              el.removeEventListener('mouseleave', onLeave);
            });
          }
        }

        instances.push(inst);
      });

      const tick = (now) => {
        // Mid-transition every layer is fixed, so measuring here reads
        // the wrong box.
        if (!html.classList.contains('is-transitioning')) {
          const at = now || performance.now();
          instances.forEach((inst) => {
            inst.slider.update();
            advance(inst, at);
          });
        } else {
          // Held, not accumulating: no catch-up jump when it ends.
          const at = now || performance.now();
          instances.forEach((inst) => { inst.last = at; });
        }
        rafId = requestAnimationFrame(tick);
      };

      requestAnimationFrame(() => {
        if (killed) return;
        refreshAll();
        instances.forEach(({ el }) => el.classList.add('is-ready'));
        rafId = requestAnimationFrame(tick);
      });
    })
    .catch((err) => console.error('[smooothy] failed to load', err));

  window.__smooothyRefresh = refreshAll;

  return function cleanup() {
    killed = true;
    if (rafId) cancelAnimationFrame(rafId);
    delete window.__smooothyRefresh;
    visibility.disconnect();
    hoverDetachers.forEach((fn) => fn());
    instances.forEach(({ slider, el }) => {
      slider.destroy?.();
      el.classList.remove('is-ready');
    });
  };
});

  /* ============================================================
     TEXT REVEAL — [data-text-anim]

     Every attribute, knob and quirk: README ### textAnim.

     Split and hidden start state at mount; the ScrollTriggers come from
     the Intro queue, since a trigger measured against the transition's
     100vh rectangle fires at the wrong scroll position.
     ============================================================ */

  const TEXT = {
    stagger: 0.15,          // between cards under [data-text-anim-stagger]
    overlap: 0.4,           // step overlap when the attribute carries no value
    start: 'top 80%',

    // em of descender room below the line box, cancelled by an equal
    // negative margin so the clip moves and the layout does not.
    maskPad: 0.34,

    maskPadTop: 0.16,       // em, the same allowance for accents and Å

    headingDuration: 0.75,
    headingStagger: 0.16,
    headingEase: E.heading,

    // Inline heading images scale rather than travel — the line mask
    // already carries them up with the type.
    imgFrom: 0.6,           // 0 turns the image scaling off
    imgDuration: 0.9,
    imgEase: E.small,
    imgOffset: 0.08,        // after its own line starts
    imgStagger: 0.08,       // between images sharing a line

    bodyDuration: 0.9,
    bodyStagger: 0.08,
    bodyEase: E.body,
    bodyFromY: 30,          // yPercent

    soloFromY: 14,          // -solo is one line, where 30% is a big move

    listDuration: 0.5,
    listStagger: 0.06,
    listEase: E.small,

    blur: false,            // layers onto the existing tweens, not a separate mode
    headingBlur: 10,        // px per line
    bodyBlur: 8             // px
  };

  // ?blur=1 / ?blur=0 overrides on a live URL.
  const blurParam = new URLSearchParams(location.search).get('blur');
  const BLUR = blurParam === '1' ? true : blurParam === '0' ? false : TEXT.blur;

  const TEXT_DEBUG = new URLSearchParams(location.search).get('textdebug') === '1';

  let splitTextWarned = false;
  function warnNoSplitText() {
    if (splitTextWarned) return;
    splitTextWarned = true;
    console.warn(
      '[text-anim] SplitText is not loaded, so [data-text-anim-heading] is ' +
      'rising as one block instead of line by line. Add ' +
      '<script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/SplitText.min.js"><\/script> ' +
      'to the Webflow footer embed, after gsap and before page-transition.js, and publish.'
    );
  }

  /* How far the tallest child pokes out of the line box — an inline
     image at 2em stands well above the type, and the descender mask
     would slice its top off. Measured before any padding goes on. */
  function maskBleed(line) {
    const box = line.getBoundingClientRect();
    let top = 0;
    let bottom = 0;
    line.querySelectorAll('*').forEach((child) => {
      const r = child.getBoundingClientRect();
      if (!r.height) return;
      top = Math.max(top, box.top - r.top);
      bottom = Math.max(bottom, r.bottom - box.bottom);
    });
    return { top: Math.max(0, Math.ceil(top)), bottom: Math.max(0, Math.ceil(bottom)) };
  }

  /* Webflow marks the wrapper, not the heading. Splitting the wrapper
     hoists the lines out of the inner <h1> and revert never puts them
     back, emptying the heading for good — so descend to the element
     that holds the text. Stops at inline, which is not a line box. */
  function splitTarget(el) {
    let node = el;
    for (let depth = 0; depth < 4; depth++) {
      const kids = Array.from(node.childNodes).filter(
        (n) => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim())
      );
      if (kids.length !== 1 || kids[0].nodeType !== 1) break;
      if (getComputedStyle(kids[0]).display.startsWith('inline')) break;
      node = kids[0];
    }
    return node;
  }

  function buildLineRise(el) {
    const split = new SplitText(el, { type: 'lines', linesClass: 'text-anim_line' });
    const pads = [];
    const inners = split.lines.map((line) => {
      const bleed = maskBleed(line);
      line.style.overflow = 'hidden';
      line.style.display = 'block';
      let pad = TEXT.maskPad ? descenderPad(line) : 0;
      if (bleed.bottom > pad) pad = bleed.bottom;
      if (pad) {
        line.style.paddingBottom = `${pad}px`;
        line.style.marginBottom = `${-pad}px`;
      }
      // Same upward: child overhang or the type's allowance, whichever
      // is larger.
      let padTop = TEXT.maskPadTop ? glyphPad(line, TEXT.maskPadTop) : 0;
      if (bleed.top > padTop) padTop = bleed.top;
      if (padTop) {
        line.style.paddingTop = `${padTop}px`;
        line.style.marginTop = `${-padTop}px`;
      }
      pads.push(pad + padTop);
      const inner = document.createElement('span');
      inner.style.display = 'block';
      while (line.firstChild) inner.appendChild(line.firstChild);
      line.appendChild(inner);
      return inner;
    });
    /* overflow clips to the PADDING box, so a waiting line shows through
       every pad added above. Start derived per line: 100% clears the line
       box, the ratio clears its own pads, 5% covers rounding. */
    const from = {
      yPercent: (i, target) => {
        const h = target.offsetHeight || 1;
        return 105 + (pads[i] / h) * 100;
      }
    };
    if (BLUR) from.filter = `blur(${TEXT.headingBlur}px)`;
    gsap.set(inners, from);
    return { split, inners };
  }

  /* Measured against the type being clipped, not the element doing the
     clipping: a wrapper around an h2 sits at 16px while the glyphs are
     60, so an em on the wrapper clips exactly as before. */
  function glyphPad(el, ratio) {
    let size = parseFloat(getComputedStyle(el).fontSize) || 16;
    el.querySelectorAll('*').forEach((child) => {
      const s = parseFloat(getComputedStyle(child).fontSize);
      if (s > size) size = s;
    });
    return size * ratio;
  }

  function descenderPad(el) {
    return glyphPad(el, TEXT.maskPad);
  }

  /* -solo and -body can be clipped by a Webflow class of their own — a
     clamp, a fixed height, an overflow on the wrapper. Same pad-and-
     cancel trick, applied to whatever actually clips, up to the root. */
  function unclipDescenders(el, stop) {
    for (let node = el; node && node !== stop && node !== document.body; node = node.parentElement) {
      if (node.dataset.textAnimUnclipped) continue;
      const cs = getComputedStyle(node);
      if (cs.overflow === 'visible' && cs.overflowY === 'visible') continue;
      node.dataset.textAnimUnclipped = 'true';
      // Additive: they usually carry Webflow padding already.
      const pad = parseFloat(cs.paddingBottom) || 0;
      const margin = parseFloat(cs.marginBottom) || 0;
      const extra = descenderPad(node);
      node.style.paddingBottom = `${pad + extra}px`;
      node.style.marginBottom = `${margin - extra}px`;
    }
  }

  function stepOverlap(el) {
    const raw = el.dataset.textAnimHeading || el.dataset.textAnimBody
      || el.dataset.textAnimSolo || el.dataset.textAnimList;
    const val = parseFloat(raw);
    return Number.isFinite(val) && val >= 0 ? val : TEXT.overlap;
  }

  // role="listitem" is the CMS output; the attribute covers hand-added
  // extras; children are the last resort for a Designer-built list.
  function listItems(el) {
    const items = el.querySelectorAll('[role="listitem"], [data-text-anim-list-item]');
    return items.length ? Array.from(items) : Array.from(el.children);
  }

  // A <br><br> reads as a paragraph break: split there so the halves
  // stagger instead of rising fused.
  function splitDoubleBreaks(el) {
    const nodes = Array.from(el.childNodes);
    const groups = [[]];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const next = nodes[i + 1];
      if (node.nodeName === 'BR' && next && next.nodeName === 'BR') {
        groups.push([]);
        i++; // consume both
        continue;
      }
      groups[groups.length - 1].push(node);
    }

    const filled = groups.filter((g) => g.length);
    if (filled.length < 2) return null;

    while (el.firstChild) el.removeChild(el.firstChild);

    return filled.map((group, i) => {
      const wrapper = document.createElement('span');
      wrapper.style.display = 'block';
      if (i > 0) wrapper.style.marginTop = '0.65em'; // replaces the <br><br> gap
      group.forEach((node) => wrapper.appendChild(node));
      el.appendChild(wrapper);
      return wrapper;
    });
  }

  /* The wrapper scales, not the img: the frames are aspect-ratio boxes
     with object-fit:cover, so scaling the picture alone shows the
     frame's background around a shrunken photo. */
  function addHeadingImages(tl, inners, start, speed) {
    if (!TEXT.imgFrom) return;
    const lineStagger = TEXT.headingStagger / speed;
    inners.forEach((inner, i) => {
      const imgs = Array.from(inner.querySelectorAll('img'));
      if (!imgs.length) return;
      const targets = imgs.map((img) => (
        img.parentElement && img.parentElement !== inner ? img.parentElement : img
      ));
      gsap.set(targets, { scale: TEXT.imgFrom, transformOrigin: 'center center' });
      tl.to(targets, {
        scale: 1,
        duration: TEXT.imgDuration / speed,
        ease: TEXT.imgEase,
        stagger: TEXT.imgStagger / speed
      }, start + i * lineStagger + TEXT.imgOffset / speed);
    });
  }

  function buildTextTimeline(wrap) {
    // Nested groups: a marked element belongs to its nearest root only.
    const own = ['data-text-anim-heading', 'data-text-anim-body',
                 'data-text-anim-solo', 'data-text-anim-list'];
    const selfMarked = own.some((attr) => wrap.hasAttribute(attr)) ? [wrap] : [];
    const marked = [
      ...selfMarked,
      ...Array.from(wrap.querySelectorAll(
        '[data-text-anim-heading], [data-text-anim-body], [data-text-anim-solo], [data-text-anim-list]'
      )).filter((el) => el.closest('[data-text-anim]') === wrap)
        // [data-swap] elements belong to that module: both animate the
        // same transform, and the loser is left parked out of place.
        .filter((el) => !el.closest('[data-swap]'))
    ];
    if (!marked.length) return null;

    const tl = gsap.timeline({ paused: true });
    const speed = parseFloat(wrap.dataset.textAnim);
    if (Number.isFinite(speed) && speed > 0) tl.timeScale(speed);
    // Applied as a delayedCall on play: a paused timeline swallows its
    // own delay when play() is called on it.
    const rawDelay = parseFloat(wrap.dataset.textAnimDelay);
    const delay = Number.isFinite(rawDelay) && rawDelay > 0 ? rawDelay : 0;
    const splits = [];
    let bodyBuffer = [];
    let isFirst = true;
    // Where the last-added step begins, for -with to line up against.
    // Read off the timeline, so overlaps and delays are accounted for.
    let lastStart = 0;
    const remember = () => {
      const step = tl.recent();
      if (step) lastStart = step.startTime();
    };

    // Applied as duration / speed rather than a nested timeScale, so it
    // reads the same way as the group root's number.
    const stepSpeed = (el) => {
      const v = parseFloat(el.dataset.textAnimSpeed);
      return Number.isFinite(v) && v > 0 ? v : 1;
    };

    const stepDelay = (el) => {
      if (el === wrap) return 0; // the root's delay is the group delay
      const v = parseFloat(el.dataset.textAnimDelay);
      return Number.isFinite(v) && v > 0 ? v : 0;
    };

    /* Overlap pulls earlier, delay pushes later, and a step can carry
       both: resolved to one signed offset, since two stacked position
       strings would depend on which was written first. */
    const position = (el) => {
      const delay = stepDelay(el);
      if (isFirst) { isFirst = false; return delay; }
      /* -with runs alongside the previous step. An absolute time: a
         relative one measures from the timeline's end, and the previous
         step is still running. */
      if (el.hasAttribute('data-text-anim-with')) return lastStart + delay;
      const offset = delay - stepOverlap(el);
      return offset >= 0 ? `+=${offset}` : `-=${-offset}`;
    };

    // Transforms do not apply to display:inline, and a Webflow Link is
    // inline — it would fade but never move.
    const ensureTransformable = (el) => {
      if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
    };

    // Shared by -solo and by the pieces a <br><br> split produced.
    const addSolo = (el) => {
      ensureTransformable(el);
      unclipDescenders(el, wrap);
      const from = { yPercent: TEXT.soloFromY, opacity: 0 };
      const to = {
        yPercent: 0, opacity: 1,
        duration: TEXT.bodyDuration / stepSpeed(el), ease: TEXT.bodyEase
      };
      if (BLUR) { from.filter = `blur(${TEXT.bodyBlur}px)`; to.filter = 'blur(0px)'; }
      gsap.set(el, from);
      tl.to(el, to, position(el));
      remember();
    };

    const flushBody = () => {
      if (!bodyBuffer.length) return;
      bodyBuffer.forEach(ensureTransformable);
      bodyBuffer.forEach((el) => unclipDescenders(el, wrap));
      const from = { yPercent: TEXT.bodyFromY, opacity: 0 };
      const speed = stepSpeed(bodyBuffer[0]);
      const to = {
        yPercent: 0, opacity: 1,
        duration: TEXT.bodyDuration / speed, ease: TEXT.bodyEase,
        stagger: TEXT.bodyStagger / speed
      };
      if (BLUR) { from.filter = `blur(${TEXT.bodyBlur}px)`; to.filter = 'blur(0px)'; }
      gsap.set(bodyBuffer, from);
      tl.to(bodyBuffer, to, position(bodyBuffer[0]));
      remember();
      bodyBuffer = [];
    };

    marked.forEach((el) => {
      if (el.hasAttribute('data-text-anim-body')) {
        const pieces = splitDoubleBreaks(el);
        if (pieces) {
          flushBody();
          pieces.forEach(addSolo);
        } else {
          bodyBuffer.push(el);
        }
        return;
      }
      flushBody();

      if (el.hasAttribute('data-text-anim-heading') && hasSplitText) {
        // From the heading itself: a one-line heading is exactly as tall
        // as its line box and crops before the parent gets a say.
        const target = splitTarget(el);
        unclipDescenders(target, wrap);
        const { split, inners } = buildLineRise(target);
        splits.push(split);
        const speed = stepSpeed(el);
        const to = {
          yPercent: 0, duration: TEXT.headingDuration / speed,
          ease: TEXT.headingEase, stagger: TEXT.headingStagger / speed
        };
        if (BLUR) to.filter = 'blur(0px)';
        tl.to(inners, to, position(el));
        remember();
        // lastStart, not tl.to()'s return: that is the timeline, and the
        // images need the line tween's own start.
        addHeadingImages(tl, inners, lastStart, speed);
      } else if (el.hasAttribute('data-text-anim-list')) {
        const items = listItems(el);
        if (items.length) {
          gsap.set(items, { y: 6, opacity: 0 });
          const speed = stepSpeed(el);
          tl.to(items, {
            y: 0, opacity: 1,
            duration: TEXT.listDuration / speed, ease: TEXT.listEase,
            stagger: TEXT.listStagger / speed
          }, position(el));
          remember();
        }
      } else {
        // -solo, and -heading without SplitText: a block rise beats a
        // heading that never appears, but it should say so.
        if (el.hasAttribute('data-text-anim-heading')) warnNoSplitText();
        addSolo(el);
      }
    });
    flushBody();

    if (TEXT_DEBUG) {
      console.info('[text-anim] group', wrap, {
        steps: marked.map((el) => {
          const role = ['heading', 'body', 'solo', 'list']
            .find((r) => el.hasAttribute('data-text-anim-' + r)) || '?';
          return role + ':' + (el.className || el.tagName.toLowerCase());
        }),
        duration: Number(tl.duration().toFixed(2))
      });
    }

    return { tl, splits, delay };
  }

  Modules.add('textAnim', function (root) {
    const staggerWraps = root.querySelectorAll('[data-text-anim-stagger]');
    const allGroups = root.querySelectorAll('[data-text-anim]');
    if (!staggerWraps.length && !allGroups.length) return;

    const instances = [];
    const handled = new Set();

    staggerWraps.forEach((repeater) => {
      const groups = Array.from(repeater.querySelectorAll('[data-text-anim]'));
      if (!groups.length) return;

      const delay = parseFloat(repeater.dataset.textAnimStagger) || TEXT.stagger;
      const splits = [];
      // delayedCalls rather than nested paused timelines, which do not
      // reliably play once added to a parent.
      const kills = [];
      const calls = [];

      groups.forEach((group, i) => {
        handled.add(group);
        const built = buildTextTimeline(group);
        if (!built) return;
        splits.push(...built.splits);
        kills.push(built.tl);
        if (reducedMotion) built.tl.progress(1);
        else calls.push(gsap.delayedCall(i * delay + built.delay, () => built.tl.play()).pause());
      });

      kills.push(...calls);
      instances.push({
        trigger: repeater,
        play: () => calls.forEach((c) => c.play()),
        kills,
        splits
      });
    });

    allGroups.forEach((wrap) => {
      if (handled.has(wrap)) return;
      const built = buildTextTimeline(wrap);
      if (!built) return;
      if (reducedMotion) built.tl.progress(1);

      const kills = [built.tl];
      let play = () => built.tl.play();
      if (built.delay) {
        play = () => {
          const call = gsap.delayedCall(built.delay, () => built.tl.play());
          kills.push(call);
        };
      }

      instances.push({ trigger: wrap, play, kills, splits: built.splits });
    });

    if (!instances.length) return;

    // Triggers wait for a real layout. Reduced motion has already
    // jumped to the end state and needs none.
    if (!reducedMotion && hasScrollTrigger) {
      Intro.add(root, () => {
        instances.forEach((inst) => {
          inst.st = ScrollTrigger.create({
            trigger: inst.trigger,
            start: TEXT.start,
            once: true,
            onEnter: () => {
              // A group taller than the viewport fires on its top edge, so
              // its lower steps can finish off-screen. Visible in the log.
              if (TEXT_DEBUG) {
                const r = inst.trigger.getBoundingClientRect();
                console.info('[text-anim] fired', inst.trigger, {
                  top: Math.round(r.top),
                  height: Math.round(r.height),
                  viewport: window.innerHeight,
                  tallerThanViewport: r.height > window.innerHeight
                });
              }
              inst.play();
            }
          });
        });
      });
    } else if (!reducedMotion) {
      // No ScrollTrigger: play everything rather than leave the page blank.
      Intro.add(root, () => instances.forEach((inst) => inst.play()));
    }

    return () => {
      instances.forEach(({ kills, st, splits }) => {
        kills.forEach((k) => k.kill());
        st?.kill();
        splits.forEach((split) => split.revert());
      });
    };
  });


  /* ============================================================
     CTA — .cta_wrap
     Sticks white, the yellow washes up under it, the images rise out
     of the fold in three speed lanes and leave over the top. It lets
     go once the last one is gone.  (docs: README ### ctaReveal)
     ============================================================ */

  const CTA = {
    scroll: 4.7,        // screens of section height, sticky screen included
    tint: 0.22,         // fractions of the pin: the neon wash
    tintStart: 0.04,    // a beat after the lock, or the scrub starts it early
    fit: 0.97,          // where the last image is made to finish
    travel: 0.92,       // everything has cleared the screen by here
    lead: 1.1,          // screens below the fold they all start
    exit: 0.35,         // screens past the top they all finish
    lanes: [0.6, 0.47, 0.34],  // slow, middle, fast: pin fractions to cross
    stagger: 0.16,      // spread by DOM order, unless data-cta-delay says
    spread: 0.62,       // multiplies every delay. Tune this one first

    // The arrangement, by combo class. delay is a fraction of the pin,
    // lane an index into lanes. A late image cannot also be slow.
    images: {
      'is-2': { delay: 0,    lane: 1 },
      'is-1': { delay: 0.14, lane: 0 },
      'is-4': { delay: 0.12, lane: 0 },
      'is-5': { delay: 0.24, lane: 2 },
      'is-3': { delay: 0.48, lane: 0 }
    },

    scrub: 0.6
  };

  Modules.add('ctaReveal', function (root) {
    const section = root.querySelector('.cta_wrap');
    if (!section) return;

    const frame = section.querySelector('.cta_contain');
    if (!frame) return;

    /* Taken off before the parallax module mounts — it is registered
       after this one, so it finds nothing to take over. Restored on
       teardown. */
    const owned = Array.from(section.querySelectorAll('[data-parallax]'))
      .map((el) => {
        const raw = el.getAttribute('data-parallax');
        el.removeAttribute('data-parallax');
        const named = Object.keys(CTA.images).find((c) => el.classList.contains(c));
        const set = named ? CTA.images[named] : null;

        const attr = parseFloat(el.dataset.ctaDelay);
        const delay = Number.isFinite(attr) ? attr : (set ? set.delay : NaN);

        return {
          el, raw,
          speed: Math.abs(parseFloat(raw)) || 1,
          lane: set ? set.lane : null,
          delay: Number.isFinite(delay) ? Math.max(0, Math.min(0.9, delay)) : NaN
        };
      });

    /* A layer, not the section's background: one element cannot
       cross-fade between two backgrounds. On the section rather than in
       the sticky frame, which only covers the screen while the pin
       holds. First child, so the frame paints over it. */
    const tint = document.createElement('div');
    tint.className = 'cta_bg_tint';
    section.insertBefore(tint, section.firstChild);

    /* An unresolved var is not an error to the browser: the layer is
       transparent, and a fade to nothing looks like no fade at all. */
    if (!getComputedStyle(tint).backgroundColor ||
        getComputedStyle(tint).backgroundColor === 'rgba(0, 0, 0, 0)') {
      console.warn(
        '[cta] the tint layer has no colour: --cta-tint is unset and ' +
        '--_colour---color--color-neon does not resolve on this element. ' +
        'Set --cta-tint on .cta_wrap to whatever the section should ' +
        'become.', section
      );
    }

    /* Normally the parallax module's clip, but its items are ours now,
       so it returns before applying one — and unclipped the images are
       in plain sight long before the section sticks.

       clip-path rather than overflow: any overflow but visible makes
       the element the scrollport its sticky descendants resolve
       against, which is the pin all of this is built on. */
    const clipped = [];
    const clipTargets = section.querySelectorAll('[data-parallax-clip]');
    (clipTargets.length ? Array.from(clipTargets) : [frame]).forEach((el) => {
      if (getComputedStyle(el).clipPath !== 'none') return;
      el.style.clipPath = 'inset(0)';
      clipped.push(el);
    });

    section.style.setProperty('--cta-scroll', `${CTA.scroll * 100}vh`);

    const restore = () => {
      owned.forEach(({ el, raw }) => el.setAttribute('data-parallax', raw));
      clipped.forEach((el) => el.style.removeProperty('clip-path'));
      tint.remove();
      section.style.removeProperty('--cta-scroll');
    };

    if (!hasScrollTrigger || reducedMotion) {
      // No scrub to hang off, or reduced motion: land on the end state.
      tint.style.opacity = '1';
      return restore;
    }

    /* DISTINCT speeds are what get ranked, not all of them: with four
       images sharing a number, ranking by position puts all four in the
       same lane. The Designer is choosing between values. */
    const distinct = [...new Set(owned.map((o) => o.speed))].sort((a, b) => a - b);
    const laneOf = (speed) => {
      const at = distinct.length > 1
        ? distinct.indexOf(speed) / (distinct.length - 1)
        : 0;
      const i = Math.round(at * (CTA.lanes.length - 1));
      return CTA.lanes[Math.max(0, Math.min(CTA.lanes.length - 1, i))];
    };

    /* offsetTop is layout, so it excludes the y this module writes — a
       rect would be measuring its own tween. The frame is the screen
       while the pin holds. */
    const inFrame = (el) => {
      let top = 0;
      let node = el;
      while (node && node !== frame) {
        top += node.offsetTop;
        node = node.offsetParent;
      }
      return top;
    };

    /* The pin is everything past the one screen the frame occupies. */
    const pin = () => window.innerHeight * (CTA.scroll - 1);

    const ctx = gsap.context(() => {
      gsap.fromTo(tint,
        { opacity: 0 },
        {
          opacity: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: () => `top top-=${pin() * CTA.tintStart}`,
            end: () => `top top-=${pin() * (CTA.tintStart + CTA.tint)}`,
            scrub: CTA.scrub,
            invalidateOnRefresh: true,
            // After anything that pins above it: heroVideo's pin spacing
            // has to be in the document before this is measured.
            refreshPriority: -1
          }
        }
      );

      // Scaled so the last one lands on fit: same shape and order,
      // stretched to fill the pin rather than ending wherever it ends.
      const ends = owned.map(({ speed, delay, lane }, i) => {
        const span = lane == null
          ? laneOf(speed)
          : CTA.lanes[Math.max(0, Math.min(CTA.lanes.length - 1, lane))];
        const off = (Number.isFinite(delay) ? delay : i * CTA.stagger) * CTA.spread;
        return off + span;
      });
      // Never past the release: a fit beyond travel hurries everything.
      const fit = Math.min(CTA.fit, CTA.travel) / Math.max(...ends);

      owned.forEach(({ el, speed, delay, lane }, i) => {
        // Named lane first, then the number on the markup.
        let span = (lane == null
          ? laneOf(speed)
          : CTA.lanes[Math.max(0, Math.min(CTA.lanes.length - 1, lane))]) * fit;
        const off =
          (Number.isFinite(delay) ? delay : i * CTA.stagger) * CTA.spread * fit;
        let end = off + span;

        /* Hurried rather than cut off at the release. Holding the pin
           open for one straggler would change the section's length out
           from under every other number here. */
        if (end > CTA.travel) {
          console.warn(
            `[cta] data-parallax="${speed}" starting at ${off.toFixed(2)} of ` +
            `the pin runs past the release at ${CTA.travel}, so it is sped ` +
            'up to land on it. Lower its delay, or its number, to ask for ' +
            'this rather than be given it.', el
          );
          end = CTA.travel;
          span = Math.max(0.05, end - off);
        }

        /* Both ends measured against the screen, not the cell: y is
           relative to wherever the grid put the image, and the cells sit
           at different heights. */
        const from = () => window.innerHeight * CTA.lead - inFrame(el);
        const to = () => -(inFrame(el) + el.offsetHeight +
          window.innerHeight * CTA.exit);

        gsap.fromTo(el,
          { y: from },
          {
            y: to,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              // Offsets into the pin, so delay and span stay independent.
              start: () => `top top-=${pin() * off}`,
              end: () => `top top-=${pin() * end}`,
              scrub: CTA.scrub,
              invalidateOnRefresh: true,
              refreshPriority: -1
            }
          }
        );
      });
    }, section);

    return function cleanup() {
      ctx.revert();
      restore();
    };
  });


  /* ============================================================
     EYEBROW ICON — a square matching the type beside it. The size class
     sits on the text, so the wrap cannot do this in em: the text's
     computed size is read and handed back as a variable.
     ============================================================ */

  const EYEBROW = {
    ratio: 0.72,     // of the text's font size
    gap: 0.5,        // of the same, between square and text

    // Same component, drawn more than once under different names.
    pairs: [
      { wrap: '.icon_eyebrow_wrap', text: '.icon_eyebrow_text' },
      { wrap: '.design_sticky_eyebrow', text: '.design_sticky_eyebrow_text' },
      // The footer link's icon was em-sized against the wrap, which
      // stopped working once the text carried its own size class.
      { wrap: '.footer_link_wrap', text: '.footer_link_text' }
    ]
  };

  Modules.add('eyebrowIcon', function (root) {
    const wraps = [];
    EYEBROW.pairs.forEach(({ wrap, text }) => {
      root.querySelectorAll(wrap).forEach((el) => wraps.push({ el, text }));
    });
    if (!wraps.length) return;

    const size = () => wraps.forEach(({ el: wrap, text: textSel }) => {
      const text = wrap.querySelector(textSel);
      if (!text) return;
      const fs = parseFloat(getComputedStyle(text).fontSize);
      if (!fs) return;
      wrap.style.setProperty('--icon-size', `${fs * EYEBROW.ratio}px`);
      wrap.style.setProperty('--icon-gap', `${fs * EYEBROW.gap}px`);
    });

    size();

    // Fluid type changes with the viewport, so the square follows.
    let timer = null;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(size, 150);
    };
    window.addEventListener('resize', onResize, { passive: true });

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(size);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      wraps.forEach(({ el: wrap }) => {
        wrap.style.removeProperty('--icon-size');
        wrap.style.removeProperty('--icon-gap');
      });
    };
  });


  /* ============================================================
     CORPORATE HERO — mobile images. The heading's inline images are
     hidden below 767; these take their place, fading in on a stagger
     (keyframes in the CSS) and drifting against the scroll.
     ============================================================ */

  const CORP_HERO = {
    breakpoint: '(max-width: 767px)',
    parallax: 40,
    depths: [1, 0.55, 0.8]
  };

  Modules.add('corporateHero', function (root) {
    const section = root.querySelector('.corporate_wrap');
    if (!section || !hasScrollTrigger || reducedMotion) return;

    const wraps = section.querySelectorAll('.corporate_images_mobile_img_wrap');
    if (!wraps.length) return;

    const mm = gsap.matchMedia();

    mm.add(CORP_HERO.breakpoint, () => {
      const tweens = [];

      wraps.forEach((wrap, i) => {
        const depth = CORP_HERO.depths[i % CORP_HERO.depths.length];
        tweens.push(gsap.fromTo(wrap,
          { y: 0 },
          {
            y: -CORP_HERO.parallax * depth,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              start: 'top top',
              end: 'bottom top',
              scrub: 0.6,
              invalidateOnRefresh: true
            }
          }
        ));
      });

      return () => tweens.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
    });

    return () => mm.revert();
  });


  /* ============================================================
     SCROLL PARALLAX — [data-parallax]
     Column drift, scrubbed against the group crossing the screen.
     Every attribute: README ### parallax.

     The transform stays on the marked wrapper — put a hover or reveal
     on the element inside it, never both on one.
     ============================================================ */

  const PARALLAX = {
    distance: 120,      // px of travel at strength 1, at the reference viewport
    scrub: 0.6,

    // The eye reads travel relative to the screen, so the base scales
    // against this reference height, clamped at both ends.
    referenceHeight: 900,
    minScale: 0.45,
    maxScale: 1.2,

    mobile: '(max-width: 767px)',
    mobileFactor: 0.5   // a phone shows less of the group, so the same
                        // travel crosses more screen and reads as a lurch
  };

  /* Bare number = px; vh/vw resolve when read. Returned as a function so
     invalidateOnRefresh re-reads them after a resize rather than freezing
     the value taken at mount. */
  function parallaxLength(raw) {
    if (raw == null) return null;
    const v = String(raw).trim();
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return null;
    if (v.endsWith('vh')) return () => (window.innerHeight * n) / 100;
    if (v.endsWith('vw')) return () => (window.innerWidth * n) / 100;
    return () => n;
  }

  function viewportScale() {
    const raw = window.innerHeight / PARALLAX.referenceHeight;
    return Math.max(PARALLAX.minScale, Math.min(PARALLAX.maxScale, raw));
  }

  Modules.add('parallax', function (root) {
    const items = root.querySelectorAll('[data-parallax]');
    if (!items.length || !hasScrollTrigger || reducedMotion) return;

    const tweens = [];
    const clipped = [];

    /* Marked here rather than per item: the group is what the elements are
       meant to stay inside, and one element can be reached by several
       items. */
    root.querySelectorAll('[data-parallax-clip]').forEach((group) => {
      if (getComputedStyle(group).clipPath !== 'none') return;
      group.style.clipPath = 'inset(0)';
      clipped.push(group);
    });

    items.forEach((el) => {
      const raw = parseFloat(el.dataset.parallax);
      const strength = Number.isFinite(raw) ? raw : 1;
      if (!strength) return;

      const marked = el.closest('[data-parallax-group]')
        || el.closest('section')
        || el.parentElement;
      if (!marked) return;

      /* A stuck element's rect stops moving with the page, so it cannot
         describe its own range — start/end collapse against a box
         standing still. Climb to the first ancestor that scrolls. */
      let group = marked;
      while (group && getComputedStyle(group).position === 'sticky') {
        group = group.parentElement;
      }
      if (!group) group = marked;
      if (group !== marked) {
        console.warn(
          '[parallax] the group is position:sticky, so its own rect cannot ' +
          'drive the range — using its scrolling ancestor instead:', group,
          'Put data-parallax-group (and any -start / -end) on the tall ' +
          'section, not on the pinned element inside it.'
        );
      }

      const axis = el.dataset.parallaxAxis === 'x' ? 'x' : 'y';
      const baseFn = parallaxLength(el.dataset.parallaxDistance)
        || (() => PARALLAX.distance);

      // Read at refresh, not at mount, so rotating a phone lands on the
      // right value rather than the one true at load.
      const rawMobile = parseFloat(
        el.dataset.parallaxMobile ?? marked.dataset.parallaxMobile ?? group.dataset.parallaxMobile
      );
      const mobileFactor = Number.isFinite(rawMobile) ? rawMobile : PARALLAX.mobileFactor;
      const isMobile = () => window.matchMedia(PARALLAX.mobile).matches;

      // An explicit distance is face value; only the shared default is
      // normalised, since that one has to travel on every screen.
      const normalise = el.dataset.parallaxDistance ? () => 1 : viewportScale;

      // One reduction or the other, never both: stacked, a phone ends up
      // at about a third and stops reading as parallax at all.
      const travel = () =>
        isMobile()
          ? baseFn() * strength * mobileFactor
          : baseFn() * strength * normalise();

      // Strength alone is symmetric, at rest at the group's midpoint.
      // from/to is literal and one-directional: a rise that lands at 0.
      const fromFn = parallaxLength(el.dataset.parallaxFrom);
      const toFn = parallaxLength(el.dataset.parallaxTo);
      const explicit = fromFn || toFn;
      const mobileMul = () => (isMobile() ? mobileFactor : 1);

      const from = explicit
        ? () => (fromFn ? fromFn() * mobileMul() : 0)
        : () => travel();
      const to = explicit
        ? () => (toFn ? toFn() * mobileMul() : 0)
        : () => -travel();

      const tween = gsap.fromTo(el,
        { [axis]: from },
        {
          [axis]: to,
          ease: 'none',
          scrollTrigger: {
            trigger: group,
            start: el.dataset.parallaxStart || marked.dataset.parallaxStart
              || group.dataset.parallaxStart || 'top bottom',
            end: el.dataset.parallaxEnd || marked.dataset.parallaxEnd
              || group.dataset.parallaxEnd || 'bottom top',
            scrub: PARALLAX.scrub,
            invalidateOnRefresh: true
          }
        }
      );

      tweens.push(tween);
    });

    if (!tweens.length && !clipped.length) return;

    return () => {
      tweens.forEach((t) => {
        t.scrollTrigger?.kill();
        t.kill();
      });
      clipped.forEach((el) => { el.style.clipPath = ''; });
    };
  });


  /* ============================================================
     STICKY CARD STACK — [data-sticky-stack]
     Attributes and the matching CSS: README ### stickyStack.

     The pinning is CSS; this module owns stacking order and the lift
     of the covered card, neither of which CSS can do. Desktop only —
     below 768 the cards are static and stacking hides content.
     ============================================================ */

  const STICKY = {
    lift: 80,
    breakpoint: '(min-width: 768px)'
  };

  Modules.add('stickyStack', function (root) {
    const tracks = root.querySelectorAll('[data-sticky-stack]');
    if (!tracks.length || !hasScrollTrigger) return;

    const mm = gsap.matchMedia();

    tracks.forEach((track) => {
      const marked = track.querySelectorAll('[data-sticky-card]');
      const cards = marked.length
        ? Array.from(marked)
        : Array.from(track.children).filter((el) => el.nodeType === 1);
      if (cards.length < 2) return;

      // Ascending, applied even on mobile: inert there, and the order
      // never depends on the media query having run.
      cards.forEach((card, i) => { card.style.zIndex = String(i + 1); });

      if (reducedMotion) return;

      mm.add(STICKY.breakpoint, () => {
        const triggers = [];

        cards.forEach((card, i) => {
          const next = cards[i + 1];
          if (!next) return; // nothing covers the last card

          const innerMarked = card.querySelectorAll('[data-sticky-inner]');
          const inner = innerMarked.length
            ? Array.from(innerMarked)
            : Array.from(card.children).filter((el) => el.nodeType === 1);
          if (!inner.length) return;

          const rawLift = parseFloat(card.dataset.stickyLift ?? track.dataset.stickyLift);
          const lift = Number.isFinite(rawLift) ? rawLift : STICKY.lift;

          const to = { y: -lift, ease: 'none' };

          const fade = parseFloat(card.dataset.stickyFade ?? track.dataset.stickyFade);
          if (Number.isFinite(fade)) to.opacity = fade;

          const scale = parseFloat(card.dataset.stickyScale ?? track.dataset.stickyScale);
          if (Number.isFinite(scale)) to.scale = scale;

          // Driven by the covering card: this one is stuck, so its rect
          // cannot describe the progress the eye is following.
          const tween = gsap.to(inner, {
            ...to,
            scrollTrigger: {
              trigger: next,
              start: 'top bottom',
              end: 'top top',
              scrub: true,
              invalidateOnRefresh: true
            }
          });

          triggers.push(tween);
        });

        return () => {
          triggers.forEach((t) => {
            t.scrollTrigger?.kill();
            t.kill();
          });
        };
      });
    });

    return () => mm.revert();
  });


  /* ============================================================
     DESIGN STICKY — .design_sticky_track

     Two sticky cards and the work section that climbs over them.
     Sticky is the section's own CSS; this adds the hold before each
     card is reached, and the black under the one arriving last.
     ============================================================ */

  const DESIGN_STICKY = {
    scrim: 0.6,
    breakpoint: '(min-width: 992px)'
  };

  Modules.add('designSticky', function (root) {
    const track = root.querySelector('.design_sticky_track');
    if (!track || !hasScrollTrigger || reducedMotion) return;

    const items = Array.from(track.querySelectorAll(':scope > .design_sticky_item'));
    const cover = track.querySelector(':scope > .work_wrap');
    if (!items.length || !cover) return;

    const mm = gsap.matchMedia();

    mm.add(DESIGN_STICKY.breakpoint, () => {
      const scrims = items.map((item) => {
        const el = document.createElement('div');
        el.className = 'sticky_scrim';
        item.appendChild(el);
        return el;
      });

      /* Driven by the covering section: the cards are stuck, so their
         own rects cannot describe the progress. */
      const tween = gsap.fromTo(scrims,
        { opacity: 0 },
        {
          opacity: DESIGN_STICKY.scrim,
          ease: 'none',
          scrollTrigger: {
            trigger: cover,
            start: 'top bottom',
            end: 'top top',
            scrub: true,
            invalidateOnRefresh: true
          }
        }
      );

      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
        scrims.forEach((el) => el.remove());
      };
    });

    return () => mm.revert();
  });


  /* ============================================================
     TABS — [data-tabs="wrapper"]
     Clickable items on one side, cross-fading visuals on the other,
     optional autoplay.  (docs: README ### tabs)

     The first tab is set rather than animated open, and the autoplay
     trigger comes from the Intro queue: mount runs against the fixed
     100vh transition rectangle, where an animated open plays behind
     the transition and measures height:auto on the wrong box.
     ============================================================ */

  const TABS = {
    duration: 0.65,
    ease: E.panel,
    outProgress: 0.3,   // how long the leaving progress bar takes to empty,
                        // and how long the incoming visual waits
    shift: 3,           // xPercent the visual travels while fading
    autoplayMs: 5000,

    /* The detail's content rises with the height, rather than carrying
       data-text-anim-solo: that fires once as the section passes, which
       for a closed tab animates text nobody can see. */
    textShift: 28,      // px. Small values are swallowed by the box
                        // expanding underneath them
    textDuration: 0.6,
    textDelay: 0.15,    // after the height starts, so it arrives with the room

    // Stacked below 992 there is no tab to open, so each pair reveals
    // itself on the way past.
    stackShift: 24,     // px each pair rises
    stackDuration: 0.7,
    stackEase: E.body,
    stackStart: 'top 85%'
  };

  Modules.add('tabs', function (root) {
    const wrappers = root.querySelectorAll('[data-tabs="wrapper"]');
    if (!wrappers.length) return;

    const cleanups = [];

    wrappers.forEach((wrapper) => {
      const contentItems = Array.from(wrapper.querySelectorAll('[data-tabs="content-item"]'));
      const visualItems = Array.from(wrapper.querySelectorAll('[data-tabs="visual-item"]'));
      if (!contentItems.length) return;
      if (contentItems.length !== visualItems.length) {
        console.warn(
          '[tabs] content-item / visual-item count mismatch:',
          contentItems.length, 'vs', visualItems.length, wrapper
        );
        return;
      }

      const detail = (i) => contentItems[i].querySelector('[data-tabs="item-details"]');
      const bar = (i) => contentItems[i].querySelector('[data-tabs="item-progress"]');
      // The detail is the box being resized, so its child is what moves.
      const detailInner = (i) => {
        const d = detail(i);
        return d ? d.firstElementChild : null;
      };

      const autoplay = wrapper.dataset.tabsAutoplay === 'true' && !reducedMotion;
      const duration = parseInt(wrapper.dataset.tabsAutoplayDuration, 10) || TABS.autoplayMs;

      const controller = new AbortController();
      let currentIndex = 0;
      let isAnimating = false;
      let autoplayReady = false;
      let dead = false;
      let progressTween = null;
      let switchTl = null;
      let trigger = null;

      /* Below 992 the section is a plain stack: every visual with its own
         text, everything open, nothing playing. Tabs are a desktop
         affordance. */
      const desktopMQ = window.matchMedia('(min-width: 992px)');
      let stacked = !desktopMQ.matches;

      /* A marker per visual, so the desktop layout restores exactly.
         Stored siblings do not survive the move — by the time the second
         visual has gone, the first one's nextSibling has too. */
      const markers = visualItems.map(() => document.createComment('tabs-visual'));

      function openAll() {
        contentItems.forEach((item, i) => {
          item.classList.remove('active');
          item.removeAttribute('aria-selected');
          item.removeAttribute('tabindex');
          const d = detail(i);
          if (d) gsap.set(d, { height: 'auto' });
          const b = bar(i);
          if (b) gsap.set(b, { clearProps: 'transform' });
          const inner = detailInner(i);
          if (inner) gsap.set(inner, { clearProps: 'opacity,visibility,transform' });
          gsap.set(visualItems[i], { clearProps: 'opacity,visibility,transform' });
        });
      }

      /* The emptied column still holds its half of the layout, leaving
         the cards in a strip beside a blank space. Skipped when it also
         holds the text, since hiding that takes the section with it. */
      const visualColumns = [...new Set(
        visualItems.map((v) => v.parentElement).filter(Boolean)
      )].filter((col) => col !== wrapper && !contentItems.some((item) => col.contains(item)));

      let stackTriggers = [];

      function killStackReveal() {
        stackTriggers.forEach((t) => t.kill());
        stackTriggers = [];
        gsap.killTweensOf(contentItems);
        gsap.set(contentItems, { clearProps: 'opacity,visibility,transform' });
      }

      /* One reveal per pair, played once on the way past. Built from the
         intro queue on first load — a trigger measured while the container
         is still the transition's fixed rectangle fires at the wrong scroll
         position — and directly when the breakpoint is crossed later, where
         the page is already settled. */
      function buildStackReveal() {
        killStackReveal();
        if (!stacked || dead || reducedMotion) return;
        contentItems.forEach((item) => {
          gsap.set(item, { autoAlpha: 0, y: TABS.stackShift });
          const play = () => gsap.to(item, {
            autoAlpha: 1, y: 0,
            duration: TABS.stackDuration, ease: TABS.stackEase
          });
          if (!hasScrollTrigger) { play(); return; }
          stackTriggers.push(ScrollTrigger.create({
            trigger: item, start: TABS.stackStart, once: true, onEnter: play
          }));
        });
      }

      function applyStack() {
        wrapper.classList.add('is-stacked');
        visualItems.forEach((visual, i) => {
          if (contentItems[i].contains(visual)) return;
          visual.parentNode?.insertBefore(markers[i], visual);
          contentItems[i].insertBefore(visual, contentItems[i].firstChild);
        });
        visualColumns.forEach((col) => col.classList.add('is-tabs-visuals-empty'));
        openAll();
      }

      function undoStack() {
        killStackReveal();
        wrapper.classList.remove('is-stacked');
        visualItems.forEach((visual, i) => {
          const marker = markers[i];
          if (marker.parentNode) marker.parentNode.replaceChild(visual, marker);
        });
        visualColumns.forEach((col) => col.classList.remove('is-tabs-visuals-empty'));
      }

      function markState(index) {
        contentItems.forEach((item, i) => {
          item.classList.toggle('active', i === index);
          item.setAttribute('aria-selected', String(i === index));
          item.setAttribute('tabindex', i === index ? '0' : '-1');
          visualItems[i].classList.toggle('active', i === index);
        });
      }

      function startProgress(index) {
        progressTween?.kill();
        if (!autoplay || dead || stacked) return;
        const el = bar(index);
        if (!el) return;
        gsap.set(el, { scaleX: 0, transformOrigin: 'left center' });
        progressTween = gsap.to(el, {
          scaleX: 1,
          duration: duration / 1000,
          ease: 'none',
          onComplete: () => {
            if (!dead && !isAnimating) switchTab((index + 1) % contentItems.length);
          }
        });
      }

      function setState(index) {
        markState(index);
        currentIndex = index;
        contentItems.forEach((item, i) => {
          const d = detail(i);
          if (d) gsap.set(d, { height: i === index ? 'auto' : 0 });
          const inner = detailInner(i);
          if (inner) {
            gsap.set(inner, i === index
              ? { autoAlpha: 1, y: 0 }
              : { autoAlpha: 0, y: TABS.textShift });
          }
          const b = bar(i);
          if (b) gsap.set(b, { scaleX: 0, transformOrigin: 'left center' });
          gsap.set(visualItems[i], i === index
            ? { autoAlpha: 1, xPercent: 0 }
            : { autoAlpha: 0, xPercent: TABS.shift });
        });
      }

      function switchTab(index) {
        if (dead || stacked || isAnimating || index === currentIndex) return;
        const outIndex = currentIndex;
        progressTween?.kill();
        switchTl?.kill();

        if (reducedMotion) {
          setState(index);
          if (autoplayReady) startProgress(index);
          return;
        }

        isAnimating = true;
        currentIndex = index;
        markState(index);

        switchTl = gsap.timeline({
          defaults: { duration: TABS.duration, ease: TABS.ease },
          onComplete: () => {
            isAnimating = false;
            // height:auto moved the document, so every trigger below is
            // measured against the old one. Guarded and rAF'd inside.
            refreshScrollHeight();
            if (autoplayReady) startProgress(index);
          }
        });

        const outBar = bar(outIndex);
        const outDetail = detail(outIndex);
        if (outBar) {
          switchTl.set(outBar, { transformOrigin: 'right center' }, 0)
                  .to(outBar, { scaleX: 0, duration: TABS.outProgress }, 0);
        }
        switchTl.to(visualItems[outIndex], { autoAlpha: 0, xPercent: TABS.shift }, 0);
        if (outDetail) switchTl.to(outDetail, { height: 0 }, 0);
        const outInner = detailInner(outIndex);
        if (outInner) {
          switchTl.to(outInner, {
            autoAlpha: 0, y: TABS.textShift, duration: TABS.outProgress
          }, 0);
        }

        switchTl.fromTo(
          visualItems[index],
          { autoAlpha: 0, xPercent: TABS.shift },
          { autoAlpha: 1, xPercent: 0 },
          TABS.outProgress
        );
        const inDetail = detail(index);
        if (inDetail) switchTl.fromTo(inDetail, { height: 0 }, { height: 'auto' }, 0);
        const inInner = detailInner(index);
        if (inInner) {
          switchTl.fromTo(inInner,
            { autoAlpha: 0, y: TABS.textShift },
            { autoAlpha: 1, y: 0, duration: TABS.textDuration },
            TABS.textDelay
          );
        }
        const inBar = bar(index);
        if (inBar) switchTl.set(inBar, { scaleX: 0, transformOrigin: 'left center' }, 0);
      }

      contentItems.forEach((item, i) => {
        item.addEventListener('click', () => switchTab(i), { signal: controller.signal });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            switchTab(i);
          }
        }, { signal: controller.signal });
      });

      if (stacked) applyStack();
      else setState(0);

      Intro.add(root, () => { if (stacked) buildStackReveal(); });

      // Crossing the breakpoint rebuilds the other shape in place.
      const onBreakpoint = (e) => {
        const nowStacked = !e.matches;
        if (nowStacked === stacked || dead) return;
        stacked = nowStacked;
        progressTween?.kill();
        switchTl?.kill();
        isAnimating = false;
        if (stacked) {
          applyStack();
          buildStackReveal();
        } else {
          undoStack();
          setState(0);
          if (autoplay && autoplayReady) startProgress(0);
        }
        refreshScrollHeight();
      };
      desktopMQ.addEventListener('change', onBreakpoint);

      Intro.add(root, () => {
        if (dead || !autoplay || stacked) return;
        if (!hasScrollTrigger) {
          autoplayReady = true;
          startProgress(currentIndex);
          return;
        }
        trigger = ScrollTrigger.create({
          trigger: wrapper,
          start: 'top 70%',
          once: true,
          onEnter: () => {
            autoplayReady = true;
            if (!isAnimating) startProgress(currentIndex);
          }
        });
      });

      cleanups.push(() => {
        dead = true;
        controller.abort();
        desktopMQ.removeEventListener('change', onBreakpoint);
        progressTween?.kill();
        switchTl?.kill();
        trigger?.kill();
        killStackReveal();
        // The visuals were moved; put the markup back as written.
        if (stacked) undoStack();
      });
    });

    return () => cleanups.forEach((fn) => fn());
  });

  /* ============================================================
     FAQ / ACCORDION — .faq_item_wrap or [data-faq-item]
     Attributes and behaviour: README ### faq.

     The Osmo reference does this in CSS with grid-template-rows and
     needs markup this site does not have, so the same motion is built
     in GSAP against the classes that already exist. Height 0 <-> auto
     rather than a max-height guess: measured per open, so a long answer
     never clips. Every toggle moves the document, hence the refresh.
     ============================================================ */

  const FAQ = {
    duration: 0.6,
    ease: E.open,
    iconRotate: 45,   // the icon is a plus: 45deg reads as a close cross
    textShift: 12     // px the answer rises as it opens
  };

  Modules.add('faq', function (root) {
    const groups = new Set([
      ...root.querySelectorAll('[data-faq]'),
      ...root.querySelectorAll('.faq_items_wrap')
    ]);
    if (!groups.size) return;

    const cleanups = [];
    let groupIndex = 0;

    groups.forEach((group) => {
      const items = Array.from(new Set([
        ...group.querySelectorAll('[data-faq-item]'),
        ...group.querySelectorAll('.faq_item_wrap')
      ]));
      if (!items.length) return;

      // One answer at a time; data-faq-multi="true" lets them stack.
      const multi = group.dataset.faqMulti === 'true';
      const gi = groupIndex++;
      const records = [];

      items.forEach((item, i) => {
        const toggle = item.querySelector('[data-faq-toggle]')
          || item.querySelector('.faq_items_heading_wrap');
        const panel = item.querySelector('[data-faq-panel]')
          || item.querySelector('.faq_items_info');
        if (!toggle || !panel) return;

        // The class is on both the wrapper and its svg; querySelector
        // takes the wrapper, which is the one to rotate.
        const icon = item.querySelector('[data-faq-icon]')
          || item.querySelector('.faq_items_heading_icon');
        const inner = panel.firstElementChild;

        const open = item.hasAttribute('data-faq-open');

        if (!panel.id) panel.id = `faq-panel-${gi}-${i}`;
        toggle.setAttribute('role', 'button');
        toggle.setAttribute('tabindex', '0');
        toggle.setAttribute('aria-controls', panel.id);
        toggle.style.cursor = 'pointer';

        records.push({ item, toggle, panel, icon, inner, open, tl: null });
      });

      if (!records.length) return;

      function paint(rec) {
        rec.item.classList.toggle('is-open', rec.open);
        rec.item.setAttribute('data-accordion-status', rec.open ? 'active' : 'not-active');
        rec.toggle.setAttribute('aria-expanded', String(rec.open));
        rec.panel.setAttribute('aria-hidden', String(!rec.open));
      }

      // Set, never animate: at mount the container is still the fixed
      // 100vh rectangle, and height:auto measures the wrong box.
      function setState(rec) {
        rec.tl?.kill();
        rec.tl = null;
        paint(rec);
        gsap.set(rec.panel, { overflow: 'hidden', height: rec.open ? 'auto' : 0 });
        if (rec.inner) gsap.set(rec.inner, { autoAlpha: rec.open ? 1 : 0, y: rec.open ? 0 : FAQ.textShift });
        if (rec.icon) gsap.set(rec.icon, { rotate: rec.open ? FAQ.iconRotate : 0 });
      }

      function animate(rec, open) {
        if (rec.open === open) return;
        rec.open = open;
        rec.tl?.kill();
        paint(rec);

        if (reducedMotion) {
          setState(rec);
          refreshScrollHeight();
          return;
        }

        rec.tl = gsap.timeline({
          defaults: { duration: FAQ.duration, ease: FAQ.ease },
          onComplete: () => {
            // auto, not the measured px, or a resize freezes the open
            // answer at yesterday's height.
            if (open) gsap.set(rec.panel, { height: 'auto' });
            refreshScrollHeight();
          }
        });

        rec.tl.to(rec.panel, { height: open ? 'auto' : 0 }, 0);
        if (rec.inner) {
          rec.tl.to(rec.inner, {
            autoAlpha: open ? 1 : 0,
            y: open ? 0 : FAQ.textShift,
            duration: open ? FAQ.duration : FAQ.duration * 0.5
          }, 0);
        }
        if (rec.icon) rec.tl.to(rec.icon, { rotate: open ? FAQ.iconRotate : 0 }, 0);
      }

      function toggleItem(rec) {
        const next = !rec.open;
        if (next && !multi) {
          records.forEach((other) => { if (other !== rec && other.open) animate(other, false); });
        }
        animate(rec, next);
      }

      const find = (target) => records.find((rec) => rec.toggle.contains(target));

      const controller = new AbortController();

      // Delegated per group: answers can hold links, and a click there
      // must not toggle.
      group.addEventListener('click', (e) => {
        const rec = find(e.target);
        if (rec) toggleItem(rec);
      }, { signal: controller.signal });

      group.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const rec = find(e.target);
        if (!rec) return;
        e.preventDefault();
        toggleItem(rec);
      }, { signal: controller.signal });

      records.forEach(setState);

      cleanups.push(() => {
        controller.abort();
        records.forEach((rec) => rec.tl?.kill());
      });
    });

    return () => cleanups.forEach((fn) => fn());
  });

  /* ============================================================
     HOME HERO — the heading holds still, only the images move.
     (docs: README ### homeHero)

     Two transforms per cell, deliberately on two elements: parallax on
     .home_img_wrap, the pointer bump on the img inside it, so neither
     has to preserve the other's matrix.
     ============================================================ */

  const HERO = {
    /* The entrance is a @keyframes in the .home_wrap embed, not a
       timeline here: 0.9s, 0.6 start scale, 0.08 stagger, 0.15s delay.
       Change them there; nothing here needs to keep in sync. */

    bump: true,
    bumpStrength: 0.12,
    bumpDuration: 0.4,
    bumpEase: E.small,

    parallax: true,
    parallaxMax: 48,           // px of travel across the section's scroll range,
                               // negative y: cells rise against the scroll
    parallaxDepths: [1, 0.45, 0.85, 0.3, 0.7, 0.55]  // per cell, DOM order
  };

  Modules.add('homeHero', function (root) {
    const section = root.querySelector('.home_wrap');
    if (!section) return;

    const wraps = section.querySelectorAll('.home_img_wrap');
    const imgs = section.querySelectorAll('.home_img_wrap img');

    if (!imgs.length) return;
    if (reducedMotion) return;

    const cleanups = [];
    let dead = false;

    /* The entrance is CSS so the paint waits on a stylesheet rather than
       on this bundle — at opacity 0 nothing is painted, and LCP could not
       fire until gsap, ScrollTrigger and SplitText had all landed. Only
       the bump and the parallax stay here.

       On a swap the container is inserted while it is still the fixed
       transition rectangle, so its keyframes would run out behind the
       transition. The start state is pinned inline before first paint and
       the animation released once from the intro queue. */
    const swapped = root !== document;

    if (swapped) {
      imgs.forEach((img) => {
        img.style.animation = 'none';
        img.style.opacity = '0';
      });
    }

    /* A filled CSS animation outranks an inline transform, so gsap's
       writes are ignored and the bump never moves. Its end state is
       scale(1) — the img's base — so dropping it looks identical and
       hands the transform back. */
    const afterEntrance = (img, fn) => {
      const done = () => {
        if (dead) return;
        img.style.animation = 'none';
        fn();
      };
      if (getComputedStyle(img).animationName === 'none') { done(); return; }
      img.addEventListener('animationend', done, { once: true });
      cleanups.push(() => img.removeEventListener('animationend', done));
    };

    /* Collected, not bound inside the context: on a swap the animation
       is still suppressed there, so measuring would read `none` and bind
       against an entrance that has not run. */
    const binders = [];
    const bindBumps = () => binders.forEach((fn) => fn());

    const ctx = gsap.context(() => {
      if (HERO.bump && window.matchMedia('(hover: hover)').matches) {
        wraps.forEach((wrap) => {
          const img = wrap.querySelector('img');
          if (!img) return;

          binders.push(() => afterEntrance(img, () => {
            const xTo = gsap.quickTo(img, 'x', { duration: HERO.bumpDuration, ease: HERO.bumpEase });
            const yTo = gsap.quickTo(img, 'y', { duration: HERO.bumpDuration, ease: HERO.bumpEase });
            let rect = null;

            const onEnter = () => { rect = wrap.getBoundingClientRect(); };
            const onMove = (e) => {
              if (!rect) rect = wrap.getBoundingClientRect();
              xTo((e.clientX - (rect.left + rect.width / 2)) * HERO.bumpStrength);
              yTo((e.clientY - (rect.top + rect.height / 2)) * HERO.bumpStrength);
            };
            const onLeave = () => { xTo(0); yTo(0); rect = null; };

            wrap.addEventListener('mouseenter', onEnter);
            wrap.addEventListener('mousemove', onMove);
            wrap.addEventListener('mouseleave', onLeave);

            cleanups.push(() => {
              wrap.removeEventListener('mouseenter', onEnter);
              wrap.removeEventListener('mousemove', onMove);
              wrap.removeEventListener('mouseleave', onLeave);
            });
          }));
        });
      }

      // Created inside the context, so teardown kills this page's only.
      if (HERO.parallax && hasScrollTrigger) {
        wraps.forEach((wrap, i) => {
          const depth = HERO.parallaxDepths[i % HERO.parallaxDepths.length];
          gsap.fromTo(wrap,
            { y: 0 },
            {
              y: -HERO.parallaxMax * depth,
              ease: 'none',
              scrollTrigger: {
                trigger: section,
                start: 'top top',
                end: 'bottom top',
                scrub: 0.6,
                invalidateOnRefresh: true
              }
            }
          );
        });
      }
    }, section);

    if (swapped) {
      Intro.add(root, () => {
        if (dead) return;
        imgs.forEach((img) => {
          img.style.removeProperty('animation');
          img.style.removeProperty('opacity');
        });
        bindBumps();
      });
    } else {
      // First load: the keyframes have run since the stylesheet parsed,
      // which is the point — nothing here gated the paint.
      bindBumps();
    }

    return () => {
      dead = true;
      cleanups.forEach((fn) => fn());
      ctx.revert();
      // The inline clear goes back, so the embed owns the markup again.
      imgs.forEach((img) => {
        img.style.removeProperty('animation');
        img.style.removeProperty('opacity');
      });
    };
  });


  /* ============================================================
     SERVICES HOVER — .services_wrap  (docs: README ### servicesHover)

     Each preview image is stacked on the one showing and grown until
     it covers it, and the covering tween removes what it covered — so
     a fast run down the list is safe: whichever clone is on top wins.

     The follower belongs to <body>: perspective on .page_wrap makes a
     containing block, and a fixed follower inside it would stop
     resolving against the viewport.
     ============================================================ */

  const SERVICES = {
    follow: 0.6,             // pointer smoothing
    followEase: E.hover,
    show: 0.45,              // follower scaling in and out
    showEase: E.body,
    coverFrom: 0.18,         // the incoming image starts this small, centred
    coverDuration: 0.7,
    coverEase: E.body,
    fill: 0.5,               // the colour wipe behind the row
    fillEase: E.open,
    dim: 0.45                // the rows that are not hovered
  };

  /* ------------------------------------------------------------
     Tablet and down: the rows are lifted into one sticky viewport and
     crossfaded, the list carrying the scroll height. A viewport rather
     than sticky rows in flow, which would slide up over each other —
     this is meant to be a crossfade with nothing moving.
     ------------------------------------------------------------ */

  const SERVICES_STACK = {
    screens: 1,          // screens of scroll between one row and the next
    hold: 1,             // screens the last row holds before the release,
                         // or the final dissolve lands as it lets go
    duration: 0.9,       // the dissolve, once it is triggered
    ease: E.travel
  };

  function buildServicesStack(root, immediate) {
    const sections = root.querySelectorAll('.services_wrap');
    if (!sections.length) return;

    const cleanups = [];

    sections.forEach((section) => {
      const list = section.querySelector('.services_hover_items');
      const items = list ? Array.from(list.querySelectorAll('.services_hover_item')) : [];
      if (!list || items.length < 2) return;

      const viewport = document.createElement('div');
      viewport.className = 'services_stack_viewport';
      list.appendChild(viewport);
      items.forEach((item) => viewport.appendChild(item));
      list.classList.add('is-stacked');
      // A sticky child holds while its container passes, so the track is
      // a step per gap, plus the hold, plus its own screen.
      const screens = (items.length - 1) * SERVICES_STACK.screens
        + SERVICES_STACK.hold + 1;
      list.style.height = `${screens * 100}svh`;

      // The rest wait at zero rather than hidden, so their images are
      // decoded before they are needed.
      gsap.set(items, { opacity: 0 });
      gsap.set(items[0], { opacity: 1 });

      /* Triggered, not scrubbed: the dissolve plays at its own pace, so
         it reads the same eased or flicked. Scrubbed, a trackpad flick
         blinks the rows past half-drawn. */
      let active = 0;

      const show = (index) => {
        if (index === active || index < 0 || index >= items.length) return;
        active = index;
        items.forEach((item, i) => {
          gsap.to(item, {
            opacity: i === index ? 1 : 0,
            duration: reducedMotion ? 0 : SERVICES_STACK.duration,
            ease: SERVICES_STACK.ease,
            overwrite: 'auto'
          });
        });
      };

      if (!hasScrollTrigger) {
        gsap.set(items, { opacity: 1 });
      } else {
        /* From the intro queue on first mount, since a trigger measured
           against the transition rectangle starts at the wrong scroll
           position. A resize rebuild is direct: the queue for this
           container has already been played and dropped. */
        const createTriggers = () => {
          /* One boundary per gap between rows. Positions are functions so
             they are recomputed on refresh — the step is a screen tall and
             a phone's screen changes when its address bar does. */
          for (let i = 1; i < items.length; i += 1) {
            const boundary = ScrollTrigger.create({
              trigger: list,
              start: () => `top top-=${i * window.innerHeight * SERVICES_STACK.screens}`,
              invalidateOnRefresh: true,
              onEnter: () => show(i),
              // Leave, not enter: the trigger is the whole track, so the
              // boundary is crossed on the way back out of its start.
              onLeaveBack: () => show(i - 1)
            });
            cleanups.push(() => boundary.kill());
          }
        };

        if (immediate) createTriggers();
        else Intro.add(root, createTriggers);
      }

      cleanups.push(() => {
        gsap.killTweensOf(items);
        gsap.set(items, { clearProps: 'opacity' });
        list.classList.remove('is-stacked');
        list.style.removeProperty('height');
        items.forEach((item) => list.appendChild(item));
        viewport.remove();
      });
    });

    if (!cleanups.length) return;
    return () => cleanups.forEach((fn) => fn());
  }

  function buildServicesHover(root) {
    const sections = root.querySelectorAll('.services_wrap');
    if (!sections.length) return;


    const resolve = (v) => {
      if (!v) return null;
      v = v.trim();
      if (!v) return null;
      return v.startsWith('--') ? `var(${v})` : v;
    };
    const opaque = (c) => !!c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)';

    const cleanups = [];

    sections.forEach((section) => {
      const collection = section.querySelector('.services_hover_items');
      if (!collection) return;
      const items = Array.from(collection.querySelectorAll('.services_hover_item'));
      if (!items.length) return;

      const controller = new AbortController();
      const signal = controller.signal;
      const restore = [];

      /* ---- follower ---- */

      const follower = document.createElement('div');
      follower.className = 'services_follower';
      follower.setAttribute('aria-hidden', 'true');
      const followerInner = document.createElement('div');
      followerInner.className = 'services_follower__inner';
      follower.appendChild(followerInner);
      document.body.appendChild(follower);

      gsap.set(follower, { xPercent: -50, yPercent: -50, scale: 0, autoAlpha: 0, force3D: true });

      const xTo = gsap.quickTo(follower, 'x', { duration: SERVICES.follow, ease: SERVICES.followEase });
      const yTo = gsap.quickTo(follower, 'y', { duration: SERVICES.follow, ease: SERVICES.followEase });

      let visible = false;
      let layer = 0;

      window.addEventListener('mousemove', (e) => {
        if (!visible) return;
        xTo(e.clientX);
        yTo(e.clientY);
      }, { signal });

      function showFollower(e) {
        if (visible) return;
        visible = true;
        // Jump to the pointer first, or the follower flies in from 0,0.
        gsap.set(follower, { x: e.clientX, y: e.clientY });
        gsap.to(follower, {
          scale: 1,
          autoAlpha: 1,
          duration: reducedMotion ? 0 : SERVICES.show,
          ease: SERVICES.showEase,
          overwrite: 'auto'
        });
      }

      function hideFollower() {
        visible = false;
        gsap.to(follower, {
          scale: 0,
          autoAlpha: 0,
          duration: reducedMotion ? 0 : SERVICES.show,
          ease: E.hoverOut,
          overwrite: 'auto',
          onComplete: () => {
            followerInner.querySelectorAll('*').forEach((el) => gsap.killTweensOf(el));
            followerInner.replaceChildren();
            layer = 0;
          }
        });
      }

      /* The clone lands on what is showing and grows into it, taking
         the covered layers with it on arrival — nothing is removed
         early, so the image underneath never flashes through. */
      function pushVisual(source) {
        const clone = source.cloneNode(true);
        clone.removeAttribute('id');
        clone.classList.add('services_follower__visual');
        clone.setAttribute('loading', 'eager');
        clone.setAttribute('aria-hidden', 'true');
        clone.alt = '';

        const covered = Array.from(followerInner.children);
        followerInner.appendChild(clone);

        const drop = () => covered.forEach((el) => { gsap.killTweensOf(el); el.remove(); });

        gsap.set(clone, {
          zIndex: ++layer,
          transformOrigin: 'center center',
          force3D: true,
          scale: covered.length && !reducedMotion ? SERVICES.coverFrom : 1
        });

        if (!covered.length || reducedMotion) { drop(); return; }

        gsap.to(clone, {
          scale: 1,
          duration: SERVICES.coverDuration,
          ease: SERVICES.coverEase,
          onComplete: drop
        });
      }

      /* ---- rows ---- */

      const records = items.map((item) => {
        const inner = item.querySelector('.services_hover_inner');
        const imgWrap = item.querySelector('.services_hover_img_wrap');
        const img = imgWrap && imgWrap.querySelector('img');

        /* The Designer paints the neon on the row itself, flat, with
           nothing to reveal — so it moves to a layer of ours and the row
           gets its background back on teardown. data-services-fill
           overrides, as a literal or a variable name. */
        const declared = resolve(item.getAttribute('data-services-fill'));
        const painted = getComputedStyle(item).backgroundColor;
        const colour = declared || (opaque(painted) ? painted : null);

        const fill = document.createElement('div');
        fill.className = 'services_hover_fill';
        fill.setAttribute('aria-hidden', 'true');
        Object.assign(fill.style, {
          position: 'absolute',
          inset: '0',
          zIndex: '0',
          pointerEvents: 'none',
          background: colour || 'var(--_colour---color--color-neon)'
        });
        gsap.set(fill, { clipPath: 'inset(100% 0% 0% 0%)' });

        const itemPos = item.style.position;
        const itemBg = item.style.backgroundColor;
        if (getComputedStyle(item).position === 'static') item.style.position = 'relative';
        if (colour && !declared) item.style.backgroundColor = 'transparent';
        item.prepend(fill);

        // The text sits over the wipe.
        const innerPos = inner && inner.style.position;
        const innerZ = inner && inner.style.zIndex;
        if (inner) {
          if (getComputedStyle(inner).position === 'static') inner.style.position = 'relative';
          inner.style.zIndex = '1';
        }
        /* Out of the layout but still in the render tree: display:none
           stops a lazy image fetching, and the first hover would clone
           something with nothing decoded to show. */
        const wrapStyle = imgWrap && imgWrap.getAttribute('style');
        if (imgWrap) Object.assign(imgWrap.style, {
          position: 'absolute',
          width: '1px',
          height: '1px',
          opacity: '0',
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: '-1'
        });

        restore.push(() => {
          gsap.killTweensOf(fill);
          fill.remove();
          item.style.backgroundColor = itemBg;
          item.style.position = itemPos || '';
          if (inner) {
            gsap.killTweensOf(inner);
            gsap.set(inner, { clearProps: 'opacity' });
            inner.style.position = innerPos || '';
            inner.style.zIndex = innerZ || '';
          }
          if (imgWrap) {
            if (wrapStyle === null) imgWrap.removeAttribute('style');
            else imgWrap.setAttribute('style', wrapStyle);
          }
        });

        return { item, inner, fill, img };
      });

      function wipe(rec, open) {
        gsap.to(rec.fill, {
          clipPath: open ? 'inset(0% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)',
          duration: reducedMotion ? 0 : SERVICES.fill,
          ease: SERVICES.fillEase,
          overwrite: 'auto',
          // Parked at the bottom edge, so the next wipe rises again.
          onComplete: () => { if (!open) gsap.set(rec.fill, { clipPath: 'inset(100% 0% 0% 0%)' }); }
        });
      }

      function dim(active) {
        records.forEach((rec) => {
          if (!rec.inner) return;
          gsap.to(rec.inner, {
            opacity: active && rec !== active ? SERVICES.dim : 1,
            duration: reducedMotion ? 0 : SERVICES.fill,
            ease: SERVICES.fillEase,
            overwrite: 'auto'
          });
        });
      }

      records.forEach((rec) => {
        rec.item.addEventListener('mouseenter', (e) => {
          wipe(rec, true);
          dim(rec);
          if (rec.img) {
            showFollower(e);
            pushVisual(rec.img);
          }
        }, { signal });

        rec.item.addEventListener('mouseleave', () => wipe(rec, false), { signal });
      });

      // One leave for the whole list: it ends the preview, and does not
      // fire while the pointer only crosses between rows.
      collection.addEventListener('mouseleave', () => {
        // A pointer leaving the window can skip a row's own leave.
        records.forEach((rec) => wipe(rec, false));
        dim(null);
        hideFollower();
      }, { signal });

      cleanups.push(() => {
        controller.abort();
        gsap.killTweensOf(follower);
        followerInner.querySelectorAll('*').forEach((el) => gsap.killTweensOf(el));
        follower.remove();
        restore.forEach((fn) => fn());
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }

  /* Two shapes, chosen by viewport: pointer-following on desktop, a
     pinned dissolve below. Rebuilt on the way across. */
  Modules.add('servicesHover', function (root) {
    if (!root.querySelector('.services_wrap')) return;

    /* Width, not hover capability: the CSS half lives in a max-width
       block, and a touchscreen laptop keyed on hover:none built the stack
       while the CSS left the rows in flow. */
    const pointer = window.matchMedia('(min-width: 992px)');
    let teardown = null;
    let built = false;

    const build = (immediate) => {
      teardown = pointer.matches
        ? buildServicesHover(root)
        : buildServicesStack(root, immediate);
      built = true;
    };

    const rebuild = () => {
      if (!built) return;
      teardown?.();
      teardown = null;
      build(true);
      // The stack adds a few screens of height, or gives them back.
      if (hasScrollTrigger) ScrollTrigger.refresh();
      refreshScrollHeight();
    };

    build(false);
    pointer.addEventListener('change', rebuild);

    return () => {
      pointer.removeEventListener('change', rebuild);
      teardown?.();
      teardown = null;
    };
  });


  /* ============================================================
     SINGLE-SELECT FILTER CHECKBOXES — .insights_filter_check
     Webflow checkboxes behaving like radios, since radios cannot be
     unchecked back to an "all" state.  (docs: README ### filterSingle)

     Two traps: Webflow's w--redirected-checked tick only toggles on real
     user events, and Finsweet reads its filters off change events, so a
     box cleared behind its back stays in the query.
     ============================================================ */

  Modules.add('filterSingle', function (root) {
    const nodes = Array.from(new Set([
      ...root.querySelectorAll('[data-filter-single]'),
      ...root.querySelectorAll('.insights_filter_check')
    ]));
    if (!nodes.length) return;

    // The class can be on the input or on the div Webflow paints; both
    // resolve to the same pair.
    const boxes = [];
    nodes.forEach((node) => {
      const label = node.closest('label') || node.parentElement;
      const input = node.matches('input[type="checkbox"]')
        ? node
        : label && label.querySelector('input[type="checkbox"]');
      if (!input || boxes.some((b) => b.input === input)) return;

      const group = node.getAttribute('data-filter-single')
        || node.closest('[data-filter-single-group]')?.getAttribute('data-filter-single-group')
        || 'default';

      boxes.push({
        input,
        label,
        visual: label ? label.querySelector('.w-checkbox-input') : null,
        group
      });
    });
    if (!boxes.length) return;

    const controller = new AbortController();
    let syncing = false;

    /* is-checked on the label, for the idle border and text colours:
       w--redirected-checked sits on whichever element Webflow owns, and
       is absent entirely for a plain input. */
    const paint = () => boxes.forEach((box) => {
      box.label?.classList.toggle('is-checked', box.input.checked);
    });

    /* Finsweet updates its field per input, so a change event for a box
       we cleared lands as a second update in the same tick and the pair
       filters the list to nothing. Those are cleared silently. */
    const finsweetManaged = (input) => input.hasAttribute('fs-list-field')
      || input.hasAttribute('fs-list-value')
      || !!input.closest('[fs-list-element="filters"]');

    const clear = (box) => {
      if (!box.input.checked) return;
      box.input.checked = false;
      box.visual?.classList.remove('w--redirected-checked');
      box.input.classList.remove('w--redirected-checked');
      if (finsweetManaged(box.input)) return;
      // Anything else listening cannot know the box changed otherwise.
      box.input.dispatchEvent(new Event('input', { bubbles: true }));
      box.input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    boxes.forEach((box) => {
      box.label?.classList.add('filter-single');

      box.input.addEventListener('change', () => {
        // Guards the change events we fire, which land back here.
        if (syncing) return;
        if (box.input.checked) {
          syncing = true;
          boxes.forEach((other) => {
            if (other !== box && other.group === box.group) clear(other);
          });
          syncing = false;
        }
        paint();
      }, { signal: controller.signal });
    });

    paint();

    return () => {
      controller.abort();
      boxes.forEach((box) => box.label?.classList.remove('filter-single', 'is-checked'));
    };
  });


  /* ============================================================
     TEXT SWAP — [data-swap]
     One statement at a time in the same spot, the outgoing one leaving
     upward.  (docs: README ### textSwap)

     Laid over each other in one grid cell rather than absolutely:
     absolute children collapse the wrapper and the section loses its
     height, while in one cell the tallest still sets the box.
     ============================================================ */

  const SWAP = {
    hold: 3500,
    duration: 0.7,
    shift: 24,          // px travelled, out upward and in from below
    ease: E.body,
    start: 'top 70%',
    stack: '(max-width: 767px)'   // below this the statements go full width
  };

  /* ============================================================
     FINSWEET ATTRIBUTES — it scans the DOM once on load, so a swapped-in
     list is one it has never seen and its filters do nothing. Restarted
     per container.  (docs: README ### Finsweet Attributes)
     ============================================================ */

  Modules.add('finsweet', function (root) {
    if (!root.querySelector || !root.querySelector('[fs-list-element="list"]')) return;

    let dead = false;

    // Fetched here, not site-wide, so a page with no list never pays
    // for it. Resolves immediately once it is in the document.
    Assets.finsweet().then(() => {
      if (dead) return;

      const restart = window.FinsweetAttributes?.modules?.list?.restart;
      if (typeof restart !== 'function') return;

      try {
        restart();
      } catch (err) {
        console.warn('[finsweet] list restart failed', err);
      }
    }).catch((err) => console.error('[finsweet] failed to load', err));

    return () => { dead = true; };
  });


  Modules.add('textSwap', function (root) {
    const wraps = root.querySelectorAll('[data-swap]');
    if (!wraps.length) return;

    const cleanups = [];

    wraps.forEach((wrap) => {
      const items = Array.from(wrap.querySelectorAll('[data-swap-item]'));
      const list = items.length ? items : Array.from(wrap.children);
      if (list.length < 2) return;

      const hold = parseInt(wrap.dataset.swapHold, 10) || SWAP.hold;
      const loop = wrap.dataset.swapLoop !== 'false';

      /* data-swap-wait hands the start to heroVideo, which fires it once
         the video has finished growing — its own trigger goes off while
         the video is still travelling. Assumed inside the hero stage
         whether or not the attribute survived the Designer. */
      const waits = wrap.hasAttribute('data-swap-wait') ||
        !!wrap.closest('.home_video_wrap');

      wrap.classList.add('is-swapping');

      /* Stacked where the FIRST item sits, not in cell 1/1: that is a
         single track, and a statement spanning half the grid came out a
         column wide. Inline, because Webflow writes placement against
         each child's node id and an id outranks any class rule. */
      const track = (start, end) => {
        const span = /span\s+(\d+)/.exec(start) || /span\s+(\d+)/.exec(end);
        if (start !== 'auto' && !/span/.test(start)) return `${start} / ${end}`;
        return `1 / span ${span ? span[1] : 1}`;
      };

      const stacked = window.matchMedia(SWAP.stack);

      // Re-read on resize: measured once, the desktop track is written
      // inline and outranks the Designer's smaller breakpoints.
      const place = () => {
        // Cleared first, or the last pass's values measure back in.
        list.forEach((el) => {
          el.style.removeProperty('grid-area');
          el.style.removeProperty('grid-column');
          el.style.removeProperty('grid-row');
          el.style.removeProperty('width');
        });

        const area = wrap.dataset.swapArea;
        if (area) {
          list.forEach((el) => { el.style.gridArea = area; });
          return;
        }

        /* The wrap is forced to grid: where the Designer switches it to
           flex below the breakpoint, grid-column and grid-row do nothing
           and the statements run down the page instead. */
        if (stacked.matches) {
          wrap.style.display = 'grid';
          list.forEach((el) => {
            el.style.gridArea = '1 / 1';
            el.style.width = '100%';
          });
          return;
        }

        wrap.style.removeProperty('display');
        const anchor = getComputedStyle(list[0]);
        const column = track(anchor.gridColumnStart, anchor.gridColumnEnd);
        const row = track(anchor.gridRowStart, anchor.gridRowEnd);

        list.forEach((el) => {
          el.style.removeProperty('width');
          el.style.gridColumn = column;
          el.style.gridRow = row;
        });
      };

      place();

      let placeTimer = null;
      const onResize = () => {
        clearTimeout(placeTimer);
        placeTimer = setTimeout(place, 150);
      };
      window.addEventListener('resize', onResize, { passive: true });

      let index = 0;
      let timer = null;
      let tl = null;
      let dead = false;
      let scrubbed = false;

      // These usually arrive with display:none on every statement but
      // the first, which cannot take its turn. Restored on teardown.
      const hidden = list.filter((el) => getComputedStyle(el).display === 'none');
      hidden.forEach((el) => { el.style.display = 'block'; });

      /* -solo asks for that entrance instead of the swap's own, played
         here because textAnim skips everything inside a [data-swap].
         Group-wide: the attribute usually lands on the first statement
         only, and statements arriving differently read as a mistake. */
      const solo = wrap.hasAttribute('data-text-anim-solo') ||
        list.some((el) => el.hasAttribute('data-text-anim-solo'));

      const dur = solo ? TEXT.bodyDuration : SWAP.duration;
      const ease = solo ? TEXT.bodyEase : SWAP.ease;
      // Both units written every time, or a statement that entered under
      // one and leaves under the other starts from the wrong place.
      const hiddenBelow = solo
        ? { autoAlpha: 0, yPercent: TEXT.bodyFromY, y: 0 }
        : { autoAlpha: 0, yPercent: 0, y: SWAP.shift };
      const hiddenAbove = solo
        ? { autoAlpha: 0, yPercent: -TEXT.bodyFromY, y: 0 }
        : { autoAlpha: 0, yPercent: 0, y: -SWAP.shift };
      const resting = { autoAlpha: 1, yPercent: 0, y: 0 };

      gsap.set(list, hiddenBelow);
      // Waiting means waiting for the first one too: shown at mount, it
      // has been read by the time its cue arrives.
      if (!waits) gsap.set(list[0], resting);

      const queue = () => {
        clearTimeout(timer);
        if (dead || scrubbed) return;
        if (!loop && index === list.length - 1) return;
        timer = setTimeout(() => swap((index + 1) % list.length), hold);
      };

      function swap(next) {
        if (dead || next === index) return;
        const current = list[index];
        index = next;

        /* Anything neither leaving nor arriving is put away outright: an
           interrupted swap leaves its statement wherever the kill caught
           it, and two half-showing over each other is the result. */
        list.forEach((el) => {
          if (el !== current && el !== list[index]) gsap.set(el, hiddenBelow);
        });

        tl?.kill();
        if (reducedMotion) {
          gsap.set(list, { autoAlpha: 0, yPercent: 0, y: 0 });
          gsap.set(list[index], { autoAlpha: 1 });
          queue();
          return;
        }

        tl = gsap.timeline({ onComplete: queue });
        tl.to(current, { ...hiddenAbove, duration: dur, ease }, 0);
        tl.fromTo(list[index],
          hiddenBelow,
          { ...resting, duration: dur, ease },
          dur * 0.35
        );
      }

      let trigger = null;

      // Queued, not started here: at mount a trigger measured against the
      // transition rectangle fires at the wrong scroll position.
      const onExternalStart = () => {
        if (dead) return;
        if (reducedMotion) gsap.set(list[0], resting);
        else gsap.fromTo(list[0], hiddenBelow, { ...resting, duration: dur, ease });
        queue();
      };

      /* Scroll-driven from here on: whoever sends swap:to owns the
         sequence, and the timer is dropped rather than have two things
         disagree about what is being read. */
      let shown = false;
      const onExternalTo = (e) => {
        if (dead) return;
        scrubbed = true;
        clearTimeout(timer);

        const i = Math.max(0, Math.min(list.length - 1, Number(e.detail) || 0));
        if (!shown) {
          shown = true;
          index = i;
          if (reducedMotion) gsap.set(list[i], resting);
          // fromTo, not to: a `to` from wherever it sits has nowhere to
          // travel, and the first statement arrives without the rise.
          else gsap.fromTo(list[i], hiddenBelow, { ...resting, duration: dur, ease });
          return;
        }
        swap(i);
      };

      // Back to before the first cue, latch released so the next
      // swap:to is an entrance again.
      const onExternalReset = () => {
        if (dead) return;
        clearTimeout(timer);
        tl?.kill();
        gsap.set(list, hiddenBelow);
        index = 0;
        shown = false;
      };

      if (waits) {
        wrap.addEventListener('swap:start', onExternalStart, { once: true });
        wrap.addEventListener('swap:to', onExternalTo);
        wrap.addEventListener('swap:reset', onExternalReset);
      }

      Intro.add(root, () => {
        if (dead || waits) return;
        if (!hasScrollTrigger) { queue(); return; }
        trigger = ScrollTrigger.create({
          trigger: wrap,
          start: SWAP.start,
          once: true,
          onEnter: queue
        });
      });

      cleanups.push(() => {
        dead = true;
        clearTimeout(timer);
        clearTimeout(placeTimer);
        wrap.removeEventListener('swap:start', onExternalStart);
        wrap.removeEventListener('swap:to', onExternalTo);
        wrap.removeEventListener('swap:reset', onExternalReset);
        window.removeEventListener('resize', onResize);
        tl?.kill();
        trigger?.kill();
        wrap.classList.remove('is-swapping');
        hidden.forEach((el) => el.style.removeProperty('display'));
        list.forEach((el) => {
          el.style.removeProperty('grid-area');
          el.style.removeProperty('grid-column');
          el.style.removeProperty('grid-row');
        });
        gsap.set(list, { clearProps: 'opacity,visibility,transform,translate,rotate,scale' });
      });
    });

    if (!cleanups.length) return;
    return () => cleanups.forEach((fn) => fn());
  });


  /* ============================================================
     LAZY ASSETS — Swiper and Finsweet came from the site-wide embeds,
     about 90 KiB every page paid for and home uses neither. Fetched
     here instead, once per asset and only for a container that has the
     markup; the promise is cached, so a second slider reuses it.
     ============================================================ */

  const Assets = (function () {
    const cache = new Map();

    const once = (key, make) => {
      if (!cache.has(key)) cache.set(key, make());
      return cache.get(key);
    };

    const script = (src, attrs) => new Promise((resolve, reject) => {
      const el = document.createElement('script');
      Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('could not load ' + src));
      document.head.appendChild(el);
    });

    // Resolves either way: a 404 leaves an ugly slider, refusing to
    // build leaves none at all.
    const style = (href) => new Promise((resolve) => {
      const el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = href;
      el.onload = el.onerror = () => resolve();
      document.head.appendChild(el);
    });

    return {
      swiper() {
        return once('swiper', () => {
          if (window.Swiper) return Promise.resolve();
          return Promise.all([
            style('https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css'),
            script('https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js')
          ]);
        });
      },

      /* Both attributes are load-bearing: type=module because the entry
         is ESM, and fs-list because v2 boots the solutions named on its
         own tag — without it nothing initialises at all. */
      finsweet() {
        return once('finsweet', () => {
          if (window.FinsweetAttributes) return Promise.resolve();
          return script(
            'https://cdn.jsdelivr.net/npm/@finsweet/attributes@2/attributes.js',
            { type: 'module', async: '', 'fs-list': '' }
          );
        });
      }
    };
  })();


  Modules.add('slider', function (root) {
    // Nothing to build, and nothing to fetch.
    if (!root.querySelector('.c_slider_swiper')) return;

    const instances = [];
    const resizeHandlers = [];
    const slideTags = [];
    let dead = false;

    const build = () => {
      if (dead) return;
      root.querySelectorAll('.c_slider_swiper').forEach((el) => {
        const num = (attr, fallback) => {
          const v = el.getAttribute(attr);
          return v !== null && v !== '' ? parseFloat(v) : fallback;
        };
        const bool = (attr, fallback) => {
          const v = el.getAttribute(attr);
          return v !== null && v !== '' ? v === 'true' : fallback;
        };
        const str = (attr) => {
          const v = el.getAttribute(attr);
          return v !== null && v.trim() !== '' ? v.trim() : null;
        };

        const gapAttr = str('data-gap');
        const gapMobileAttr = str('data-gap-mobile');
        const gapTabletAttr = str('data-gap-tablet');
        const mq = window.matchMedia('(max-width: 767px)');
        const tabletMq = window.matchMedia('(max-width: 991px)');

        // Three tiers, each falling back to the one above it.
        const applyGap = () => {
          const value = mq.matches
            ? (gapMobileAttr || gapTabletAttr || gapAttr)
            : (tabletMq.matches ? (gapTabletAttr || gapAttr) : gapAttr);
          if (value) el.style.setProperty('--slider-gap', value);
        };

        /* Rounded: a rem gap measures fractional, Swiper multiplies it
           into every offset, and the accumulated fraction lands edges on
           half pixels — the hairline of the next image. */
        const measureGap = () => {
          const probe = document.createElement('div');
          probe.className = 'c_slider_gap_probe';
          el.appendChild(probe);
          const px = probe.getBoundingClientRect().width;
          probe.remove();
          return Math.round(px);
        };

        applyGap();

        /* Full-bleed track with the first slide pushed in to the page
           text, so the clipping edge is the viewport and a slide leaving
           to the left stays visible all the way out. data-align-to names
           the element to match; the defaults are the several names the
           site uses for the same container. */
        const alignSel = str('data-align-to') || '.u-container, .u-container-full';
        const section = el.closest('section') || el.parentElement;

        const measureOffset = () => {
          if (!section) return 0;
          const rail = el.getBoundingClientRect().left;

          let best = 0;
          section.querySelectorAll(alignSel).forEach((target) => {
            // A container the rail sits inside already applies its own
            // margin; matching it would double the inset.
            if (target.contains(el)) return;
            const delta = target.getBoundingClientRect().left - rail;
            if (delta > best) best = delta;
          });

          return Math.round(best);
        };

        /* Without a matching offset at the far end the last card stops
           against the viewport rather than the page margin, and reads as
           cut off. */
        const measureOffsetAfter = () => measureOffset();

        /* One-per-view means one WHOLE card: the rail is the viewport, so
           a slide comes out viewport-wide and the offset pushes its right
           edge off screen. Fractional values are the author's peek. */
        const fitPerView = (authored) => {
          if (authored !== 1) return authored;
          const width = el.clientWidth;
          const inset = measureOffset() + measureOffsetAfter();
          if (!width || inset <= 0 || width - inset <= 0) return authored;
          return width / (width - inset);
        };

        const wrap = el.closest('.c_slider_wrap');

        /* A Designer card component arrives without .swiper-slide, and
           Swiper then initialises against zero slides: nothing gets a
           width and the track never moves. */
        const track = el.querySelector('.swiper-wrapper, .c_slider_swiper_wrap');
        if (track && !track.querySelector(':scope > .swiper-slide')) {
          const children = Array.from(track.children);
          children.forEach((child) => {
            child.classList.add('swiper-slide');
            slideTags.push(child);
          });
          if (children.length) {
            console.info('[slider] tagged', children.length,
              'cards as swiper-slide — add the class in the Designer to make it explicit');
          }
        }

        const loop = bool('data-loop', false);

        const swiper = new Swiper(el, {
          slidesPerView: fitPerView(num('data-slides-mobile', 1)),
          spaceBetween: measureGap(),
          loop,
          // Mutually exclusive in Swiper 11: with both, the re-order and
          // the index jump fight on the same transition.
          rewind: loop ? false : bool('data-rewind', true),
          loopAdditionalSlides: num('data-loop-extra', 4),
          speed: num('data-speed', 600),

          // Mount measures against the transition rectangle, which is
          // about to change; these make Swiper re-measure.
          observer: true,
          observeParents: true,
          resizeObserver: true,
          watchOverflow: true,

          slidesOffsetBefore: measureOffset(),
          slidesOffsetAfter: measureOffsetAfter(),

          /* Fractional per-view widths translate the track by fractions,
             and every layer inside a card rounds independently — a panel
             at inset:0 lands a pixel short of its image. */
          roundLengths: true,
          // data-slides-tablet covers 768-991, falling back to desktop.
          breakpoints: {
            768: {
              slidesPerView: fitPerView(
                num('data-slides-tablet', num('data-slides-per-view', 1.25))
              )
            },
            992: {
              slidesPerView: fitPerView(num('data-slides-per-view', 1.25))
            }
          },
          navigation: {
            prevEl: wrap ? wrap.querySelector('.c_slider_button_prev') : null,
            nextEl: wrap ? wrap.querySelector('.c_slider_button_next') : null,
            disabledClass: 'is-inactive'
          }
        });

        /* loop parks duplicates just outside the container and re-orders
           them at the seam, so the clipping is what keeps that machinery
           off screen. */
        if (loop) {
          const overflow = getComputedStyle(el).overflowX;
          if (overflow === 'visible') {
            console.warn(
              '[slider] data-loop is on but this slider does not clip:',
              el, 'overflow-x is visible, so the loop duplicates are on ' +
              'screen and every seam crossing looks like a jump. Set ' +
              'overflow: clip on .c_slider_swiper (clip, not hidden — hidden ' +
              'makes it a scrollport and breaks sticky sections).'
            );
          }
        }

        // One explicit update once the page is laid out, closing the
        // window where the first drag snaps.
        Intro.add(root, () => {
          if (!swiper.destroyed) swiper.update();
        });

        let t;
        const onResize = () => {
          clearTimeout(t);
          t = setTimeout(() => {
            applyGap();
            const gap = measureGap();
            const offset = measureOffset();
            /* Only the base value is ours: above the first breakpoint
               Swiper owns slidesPerView and re-applies it on resize, and
               writing to params too leaves a stale snap grid. */
            const base = fitPerView(num('data-slides-mobile', 1));
            const tablet = fitPerView(
              num('data-slides-tablet', num('data-slides-per-view', 1.25))
            );
            const desktop = fitPerView(num('data-slides-per-view', 1.25));

            const changed = swiper.params.slidesOffsetBefore !== offset
              || swiper.params.slidesOffsetAfter !== offset
              || (mq.matches && swiper.params.slidesPerView !== base);

            /* A breakpoint rebuilds params from the ORIGINAL init values,
               so runtime writes are thrown away when one lands. The
               offsets have to live in all three places. */
            const carry = (target) => {
              if (!target) return;
              target.slidesOffsetBefore = offset;
              target.slidesOffsetAfter = offset;
            };

            carry(swiper.params);
            carry(swiper.originalParams);

            if (swiper.params.breakpoints) {
              if (swiper.params.breakpoints[768]) {
                swiper.params.breakpoints[768].slidesPerView = tablet;
                carry(swiper.params.breakpoints[768]);
              }
              if (swiper.params.breakpoints[992]) {
                swiper.params.breakpoints[992].slidesPerView = desktop;
                carry(swiper.params.breakpoints[992]);
              }
            }
            if (swiper.originalParams && swiper.originalParams.breakpoints) {
              carry(swiper.originalParams.breakpoints[768]);
              carry(swiper.originalParams.breakpoints[992]);
            }

            if (changed) {
              if (mq.matches) swiper.params.slidesPerView = base;
              swiper.update();
            }
            if (swiper.params.spaceBetween === gap) return;
            swiper.params.spaceBetween = gap;
            Object.keys(swiper.params.breakpoints).forEach((bp) => {
              swiper.params.breakpoints[bp].spaceBetween = gap;
            });
            swiper.update();
          }, 150);
        };

        window.addEventListener('resize', onResize);
        resizeHandlers.push(onResize);
        instances.push(swiper);
      });
    };

    Assets.swiper()
      .then(build)
      .catch((err) => console.error('[slider] swiper failed to load', err));


    return function cleanup() {
      dead = true;
      resizeHandlers.forEach((fn) => window.removeEventListener('resize', fn));
      instances.forEach((s) => s.destroy(true, true));
      /* Only the ones this mount added, so the markup is left as it was. */
      slideTags.forEach((el) => el.classList.remove('swiper-slide'));
    };
  });


  /* ============================================================
     MARQUEE
     The original rAF loop had no exit and the IntersectionObserver
     was never disconnected, so every page visit would have left a
     loop animating detached nodes forever.
     ============================================================ */

  Modules.add('marquee', function (root) {
    const marquees = [];
    const detachers = [];
    let rafId = null;

    root.querySelectorAll('[data-marquee-wrap]').forEach((marquee) => {
      const list = marquee.querySelector('[data-marquee-list]');
      if (!list) return;

      let track = marquee.querySelector('.custom_marquee_track');
      if (!track) {
        track = document.createElement('div');
        track.classList.add('custom_marquee_track');
        list.parentNode.insertBefore(track, list);
        track.appendChild(list);
      }

      const clone1 = list.cloneNode(true);
      const clone2 = list.cloneNode(true);
      const gap = window.getComputedStyle(list).gap || '0px';
      clone1.style.marginLeft = gap;
      clone2.style.marginLeft = gap;
      track.appendChild(clone1);
      track.appendChild(clone2);

      const listWidth = list.offsetWidth;
      marquee.style.setProperty('--list-width', listWidth + 'px');

      const speed = parseFloat(marquee.dataset.speed) || 50;
      const direction = marquee.dataset.direction || 'left';
      const pixelsPerFrame = speed / 60;
      const directionMultiplier = direction === 'left' ? -1 : 1;
      const slowSpeed = parseFloat(marquee.dataset.slowSpeed) || 0.2;
      const hoverBehavior = marquee.dataset.hover || 'pause';
      const isDraggable = marquee.dataset.draggable !== 'false';

      const state = {
        currentPosition: 0, isDragging: false, dragStarted: false,
        isAnimating: true, speedMultiplier: 1, inertiaVelocity: 0, inInertia: false
      };

      let startX = 0, startY = 0, dragStartTranslate = 0;
      let velocityTracker = [];
      let clickStartTime = 0, clickStartX = 0, clickStartY = 0;
      const CLICK_THRESHOLD = 5;
      const CLICK_TIME_THRESHOLD = 300;

      function normalizePosition(pos) {
        while (pos < -listWidth) pos += listWidth;
        while (pos > 0) pos -= listWidth;
        return pos;
      }

      function calculateVelocity() {
        if (velocityTracker.length < 2) return 0;
        const recent = velocityTracker.slice(-5);
        let total = 0;
        for (let i = 1; i < recent.length; i++) {
          const dt = recent[i].time - recent[i - 1].time;
          if (dt > 0) total += (recent[i].x - recent[i - 1].x) / dt * 16;
        }
        return total / (recent.length - 1);
      }

      function preventClickHandler(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }

      function removeDocListeners() {
        document.removeEventListener('mousemove', handlePointerMove);
        document.removeEventListener('touchmove', handlePointerMove);
        document.removeEventListener('mouseup', handlePointerUp);
        document.removeEventListener('touchend', handlePointerUp);
      }

      function handlePointerDown(e) {
        if (!isDraggable) return;
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        state.dragStarted = true;
        state.isDragging = false;
        state.isAnimating = false;
        state.inInertia = false;

        clickStartTime = Date.now();
        clickStartX = clientX;
        clickStartY = clientY;
        startX = clientX;
        startY = clientY;
        velocityTracker = [{ x: clientX, time: Date.now() }];
        dragStartTranslate = state.currentPosition;

        document.addEventListener('mousemove', handlePointerMove);
        document.addEventListener('touchmove', handlePointerMove, { passive: false });
        document.addEventListener('mouseup', handlePointerUp);
        document.addEventListener('touchend', handlePointerUp);
      }

      function handlePointerMove(e) {
        if (!state.dragStarted) return;
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;

        if (!state.isDragging && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            state.isDragging = true;
            marquee.style.cursor = 'grabbing';
            e.preventDefault();
            marquee.querySelectorAll('[data-marquee-item]').forEach((item) => {
              item.addEventListener('click', preventClickHandler, { capture: true });
            });
          } else {
            state.dragStarted = false;
            state.isAnimating = true;
            removeDocListeners();
            return;
          }
        }

        if (!state.isDragging) return;
        e.preventDefault();
        velocityTracker.push({ x: clientX, time: Date.now() });
        if (velocityTracker.length > 10) velocityTracker.shift();
        state.currentPosition = normalizePosition(dragStartTranslate + deltaX);
        track.style.transform = `translate3d(${state.currentPosition}px, 0, 0)`;
      }

      function handlePointerUp(e) {
        if (!state.dragStarted) return;
        const wasDragging = state.isDragging;

        if (!state.isDragging) {
          const clientX = e.type.includes('touch') ? e.changedTouches[0].clientX : e.clientX;
          const clientY = e.type.includes('touch') ? e.changedTouches[0].clientY : e.clientY;
          const dist = Math.hypot(clientX - clickStartX, clientY - clickStartY);
          const elapsed = Date.now() - clickStartTime;

          if (dist <= CLICK_THRESHOLD && elapsed <= CLICK_TIME_THRESHOLD) {
            state.isAnimating = true;
            state.dragStarted = false;
            removeDocListeners();
            return;
          }
        }

        marquee.style.cursor = 'grab';

        if (wasDragging) {
          setTimeout(() => {
            marquee.querySelectorAll('[data-marquee-item]').forEach((item) => {
              item.removeEventListener('click', preventClickHandler, { capture: true });
            });
          }, 50);
        }

        const velocity = calculateVelocity();
        if (Math.abs(velocity) > 1) {
          state.inInertia = true;
          state.inertiaVelocity = velocity;
        } else {
          state.isAnimating = true;
          state.speedMultiplier = 1;
        }

        state.isDragging = false;
        state.dragStarted = false;
        velocityTracker = [];
        removeDocListeners();
      }

      function handleMouseEnter() {
        if (state.isDragging) return;
        if (hoverBehavior === 'pause') state.isAnimating = false;
        else if (hoverBehavior === 'slow') state.speedMultiplier = slowSpeed;
      }

      function handleMouseLeave() {
        if (state.isDragging) return;
        if (hoverBehavior === 'pause') state.isAnimating = true;
        else if (hoverBehavior === 'slow') state.speedMultiplier = 1;
      }

      const onContextMenu = (e) => e.preventDefault();
      const onDragStart = (e) => e.preventDefault();

      if (isDraggable) {
        marquee.addEventListener('mousedown', handlePointerDown);
        marquee.addEventListener('touchstart', handlePointerDown, { passive: true });
        marquee.addEventListener('contextmenu', onContextMenu);
        marquee.addEventListener('dragstart', onDragStart);
        marquee.style.cursor = 'grab';
      }

      if (hoverBehavior !== 'none') {
        marquee.addEventListener('mouseenter', handleMouseEnter);
        marquee.addEventListener('mouseleave', handleMouseLeave);
      }

      detachers.push(function () {
        removeDocListeners();
        marquee.removeEventListener('mousedown', handlePointerDown);
        marquee.removeEventListener('touchstart', handlePointerDown);
        marquee.removeEventListener('contextmenu', onContextMenu);
        marquee.removeEventListener('dragstart', onDragStart);
        marquee.removeEventListener('mouseenter', handleMouseEnter);
        marquee.removeEventListener('mouseleave', handleMouseLeave);
      });

      marquees.push({
        state, track, marquee, pixelsPerFrame, directionMultiplier,
        normalizePosition, listWidth, visible: true
      });
    });

    if (!marquees.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const m = marquees.find((x) => x.marquee === entry.target);
        if (m) m.visible = entry.isIntersecting;
      });
    }, { threshold: 0 });

    marquees.forEach((m) => observer.observe(m.marquee));

    function tick() {
      for (let i = 0; i < marquees.length; i++) {
        const m = marquees[i];
        const s = m.state;
        if (!m.visible && !s.inInertia) continue;

        if (s.inInertia) {
          s.currentPosition = m.normalizePosition(s.currentPosition + s.inertiaVelocity);
          s.inertiaVelocity *= 0.92;
          if (Math.abs(s.inertiaVelocity) < 0.5) {
            s.inInertia = false;
            s.isAnimating = true;
            s.speedMultiplier = 1;
          }
        } else if (s.isAnimating) {
          s.currentPosition = m.normalizePosition(
            s.currentPosition + m.pixelsPerFrame * m.directionMultiplier * s.speedMultiplier
          );
        }
        m.track.style.transform = `translate3d(${s.currentPosition}px, 0, 0)`;
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    return function cleanup() {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
      detachers.forEach((fn) => fn());
    };
  });


  /* ============================================================
     SHARE — [data-share]
     LinkedIn, copy, and the OS sheet where there is one. Attributes and
     keyboard behaviour: README ### share.
     ============================================================ */

  const SHARE = {
    copiedFor: 3000,   // ms the confirmation stays up, alone, before the
                       // trigger comes back
    window: 'width=600,height=600,noopener,noreferrer'
  };

  Modules.add('share', function (root) {
    const wraps = root.querySelectorAll('[data-share]');
    if (!wraps.length) return;

    const cleanups = [];

    wraps.forEach((wrap) => {
      const trigger = wrap.querySelector('[data-share-open]');
      const menu = wrap.querySelector('[data-share-menu]');
      if (!trigger || !menu) return;

      const copied = wrap.querySelector('[data-share-copied]');
      if (!copied && wrap.querySelector('[data-share-action="copy"]')) {
        console.info(
          '[share] no [data-share-copied] in this wrapper, so a copy will ' +
          'succeed silently and read as a dead button.', wrap
        );
      }
      let copiedTimer = null;
      let open = false;

      // Webflow's inline display:none, cleared so a class owns the state.
      const inlineDisplay = menu.style.display;
      if (getComputedStyle(menu).display === 'none') menu.style.removeProperty('display');
      if (copied) copied.style.removeProperty('display');

      const url = () => wrap.dataset.shareUrl || window.location.href;

      const setOpen = (next, restoreFocus) => {
        open = next;
        wrap.classList.toggle('is-share-open', next);
        trigger.setAttribute('aria-expanded', next ? 'true' : 'false');
        if (next) {
          const first = menu.querySelector('[data-share-action], [data-share-close]');
          first?.focus?.();
        } else if (restoreFocus !== false) {
          trigger.focus?.();
        }
      };

      /* A third state, not a message: menu gone, trigger still held back,
         confirmation standing alone until the timer. One class on the
         wrapper decides which of the three is showing. */
      const clearCopied = () => {
        clearTimeout(copiedTimer);
        wrap.classList.remove('is-share-copied');
      };

      const showCopied = () => {
        if (!copied) return;
        clearTimeout(copiedTimer);
        wrap.classList.add('is-share-copied');
        copiedTimer = setTimeout(() => {
          wrap.classList.remove('is-share-copied');
        }, SHARE.copiedFor);
      };

      // Clipboard needs a secure context; an http preview falls back.
      const copy = async (value) => {
        try {
          await navigator.clipboard.writeText(value);
          return true;
        } catch (err) {
          const field = document.createElement('textarea');
          field.value = value;
          field.setAttribute('readonly', '');
          field.style.cssText = 'position:fixed;top:-9999px;opacity:0';
          document.body.appendChild(field);
          field.select();
          let ok = false;
          try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
          field.remove();
          return ok;
        }
      };

      const onTrigger = (e) => {
        e.preventDefault();
        clearCopied();
        setOpen(!open);
      };
      trigger.addEventListener('click', onTrigger);
      trigger.setAttribute('aria-expanded', 'false');
      cleanups.push(() => trigger.removeEventListener('click', onTrigger));

      wrap.querySelectorAll('[data-share-close]').forEach((el) => {
        const onClose = (e) => { e.preventDefault(); setOpen(false); };
        el.addEventListener('click', onClose);
        cleanups.push(() => el.removeEventListener('click', onClose));
      });

      wrap.querySelectorAll('[data-share-action]').forEach((el) => {
        const action = el.getAttribute('data-share-action');

        if (action === 'native' && typeof navigator.share !== 'function') {
          el.style.display = 'none';
          cleanups.push(() => el.style.removeProperty('display'));
          return;
        }

        const onAct = async (e) => {
          e.preventDefault();
          const value = url();

          if (action === 'linkedin') {
            window.open(
              'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(value),
              '_blank',
              SHARE.window
            );
            setOpen(false);
            return;
          }

          if (action === 'copy') {
            const ok = await copy(value);
            if (!ok) { console.warn('[share] could not copy', value); return; }
            /* Closed on success, leaving the confirmation. Focus does not
               go back to the trigger: it is faded out under it, and a
               focus ring on something invisible is worse than none. */
            setOpen(false, false);
            showCopied();
            return;
          }

          if (action === 'native') {
            try {
              await navigator.share({ title: document.title, url: value });
              setOpen(false);
            } catch (err) {
              /* An abort is the person changing their mind, not a fault. */
              if (err?.name !== 'AbortError') console.warn('[share] native share failed', err);
            }
          }
        };

        el.addEventListener('click', onAct);
        cleanups.push(() => el.removeEventListener('click', onAct));
      });

      const onOutside = (e) => {
        if (!open || wrap.contains(e.target)) return;
        setOpen(false);
      };
      const onKey = (e) => {
        if (e.key === 'Escape' && open) setOpen(false);
      };
      document.addEventListener('click', onOutside);
      document.addEventListener('keydown', onKey);

      cleanups.push(() => {
        document.removeEventListener('click', onOutside);
        document.removeEventListener('keydown', onKey);
        clearTimeout(copiedTimer);
        wrap.classList.remove('is-share-open', 'is-share-copied');
        if (inlineDisplay) menu.style.display = inlineDisplay;
      });
    });

    if (!cleanups.length) return;
    return () => cleanups.forEach((fn) => fn());
  });


  /* ============================================================
     VIDEO POSTER — [data-video="component"]
     base-lib drops the poster when it decides to play, which is before
     any frame exists — so the box is empty and the section shows
     through. Held here and faded on the first PAINTED frame instead; a
     video that never arrives keeps its poster, which is the right
     fallback.  (docs: README ### videoPoster)

     Registered ahead of baseLib, so the poster is ours before video-min
     touches it.
     ============================================================ */

  Modules.add('videoPoster', function (root) {
    const wraps = root.querySelectorAll('[data-video="component"]');
    if (!wraps.length) return;

    const cleanups = [];

    wraps.forEach((wrap) => {
      const video = wrap.querySelector('video[data-video="video"]');
      const poster = wrap.querySelector('[data-video="poster"]');
      if (!video || !poster) return;

      /* Both of these are Designer defaults working against a hero: the
         poster is the first thing anyone sees, and the video wants to be
         arriving before the section scrolls in. Corrected here rather
         than left as two attributes somebody has to remember. */
      if (video.preload === 'none') video.preload = 'metadata';
      poster.setAttribute('loading', 'eager');
      poster.setAttribute('fetchpriority', 'high');

      let dead = false;
      let handle = null;

      const reveal = () => {
        if (dead) return;
        wrap.classList.add('is-video-playing');
      };

      const onPlaying = () => {
        if (dead) return;
        if (typeof video.requestVideoFrameCallback === 'function') {
          handle = video.requestVideoFrameCallback(reveal);
          return;
        }
        // No rVFC: `playing` means presentable, not composited, so wait
        // for the frame after the next.
        requestAnimationFrame(() => requestAnimationFrame(reveal));
      };

      // A swap back to a still-playing video never fires `playing` again.
      if (!video.paused && video.readyState >= 3) onPlaying();
      video.addEventListener('playing', onPlaying);

      cleanups.push(() => {
        dead = true;
        video.removeEventListener('playing', onPlaying);
        if (handle && typeof video.cancelVideoFrameCallback === 'function') {
          video.cancelVideoFrameCallback(handle);
        }
        wrap.classList.remove('is-video-playing');
      });
    });

    if (!cleanups.length) return;
    return () => cleanups.forEach((fn) => fn());
  });


  /* ============================================================
     HERO VIDEO — cell 6 of the hero grid to full screen
     Docs: README ### heroVideo.

     Triggered rather than scrubbed: a scrubbed growth is only as
     committed as the hand on the wheel, and stopping mid-scroll left
     the video stranded at whatever size the scroll had bought. Where it
     travels to stays scroll-bound.

     Fixed and out of flow for the travel — inside the grid it would be
     clipped by the section and fighting the hero's parallax for the
     same matrix. The cell it leaves keeps its aspect ratio so the grid
     does not collapse around a hole.

     Position is arithmetic off one measurement per refresh: the cell
     travels linearly with the scroll, so there is nothing to ask the
     layout engine per frame.
     ============================================================ */

  const HERO_VIDEO = {
    pin: 1.5,          // screens of pin once it is full bleed

    /* The growth is a second long and a flick of the wheel is a screen,
       so the page is carried to the pin and locked while it travels —
       otherwise it is possible to arrive having seen none of it. Never
       under reduced motion: taking the scroll away is the one thing
       that setting asks you not to do. */
    takeover: true,
    takeoverDuration: 1,
    z: 5,              // over the hero and the stage, under the nav

    // px of scroll out of the hero before the growth fires. Pixels, not
    // a fraction: what fires it is the gesture, the same on any screen.
    growAfter: 120,
    growDuration: 1,
    growEase: E.travel,

    dwell: 1300,       // ms a statement holds, however fast the pin runs

    // Fallback only: the real delay is this cell's slot in the entrance
    // order, read off --hero-in-* in the CSS.
    from: 0.6,
    duration: 0.9,
    delay: 0.55,
    ease: E.small,

    overspill: 1.02,   // painted larger than its frame, as in the CSS

    /* px past the viewport on every side: a scaled layer's edges land on
       fractions and the compositor rounds the other way from the paint,
       leaving a flickering hairline. Never visible in a screenshot,
       which captures the composited result. */
    bleed: 2
  };

  Modules.add('heroVideo', function (root) {
    const hero = root.querySelector('.home_wrap');
    const stage = root.querySelector('.home_video_wrap');
    if (!hero || !stage) return;

    const comp = hero.querySelector('[data-video="component"]');
    const cell = comp && comp.closest('.home_img_wrap');
    if (!comp || !cell) return;

    const swap = stage.querySelector('[data-swap]');
    const statements = swap
      ? (swap.querySelectorAll('[data-swap-item]').length || swap.children.length)
      : 0;
    let reading = -1;
    const video = comp.querySelector('video');

    /* page-transition.css holds the component hidden from first paint,
       because the pre-hide below is JS and everything before it — the
       bundle, GSAP, ScrollTrigger — is a stretch of time in which the
       video is sitting in the grid, painted. That was the flash.

       Released here, at mount, before anything is drawn: a running CSS
       animation outranks an inline style, so leaving it alive would
       mean the fade had nothing to say until the hold expired. The
       hold is a watchdog, not a state — if this file never arrives it
       lets go by itself and the video is simply there. */
    comp.style.animation = 'none';

    /* Reduced motion gets the destination without the journey: the
       video is placed in the stage full bleed and never travels. */
    if (reducedMotion || !hasScrollTrigger) {
      const marker = document.createComment('hero-video');
      cell.insertBefore(marker, comp);
      stage.insertBefore(comp, stage.firstChild);
      comp.classList.add('is-hero-video-static');
      swap?.dispatchEvent(new Event('swap:start'));
      return () => {
        comp.classList.remove('is-hero-video-static');
        marker.parentNode?.insertBefore(comp, marker);
        marker.remove();
      };
    }

    let base = null;    // cell box in document coordinates
    let cover = null;   // where and how big it has to be to fill the screen
    let dead = false;
    let lifted = false;

    /* position:fixed resolves against the viewport only while no
       ancestor is transformed — and the hero parallax transforms this
       very cell. So it moves to the body for the journey, and this
       marker holds its seat for teardown. */
    const seat = document.createComment('hero-video');

    /* The statements move INTO the video for the pin: fixed on the body
       it paints over the whole stage, and every section is its own
       stacking context, so no z-index on the text could outrank it. As
       children they are simply painted after. */
    const text = stage.querySelector('.home_video_contain');
    const textSeat = document.createComment('hero-video-text');

    // The theme travels with them: colour is a variable the stage sets,
    // and inside the component they read the page default instead.
    const themed = stage.classList.contains('u-theme-dark');

    /* The statements keep the box the design gave them in the stage,
       measured before the move: centring them was a guess, and a wrong
       one. All four edges, since the frame is no longer the viewport —
       it is the video's own shape, scaled until it covers, running well
       past both sides of a phone.

       Measured against the frame's RESTING box, not its current rect: a
       fast scroll reaches the pin with the growth still running, and a
       rect read mid-flight is a scaled one.

       Anchored to the bottom, because the gap to the foot of the stage
       is the design and the height is whatever the text needs.

       Kept as offsets rather than viewport numbers, which go stale as
       soon as the address bar retracts — and resolved against the
       VIEWPORT, since while the pin holds the stage is the screen.
       (A refresh reverts pins to measure them, so the stage's own rect
       at that moment is a page away.) */
    let textBox = null;

    const placeText = () => {
      if (!text || !textBox || text.parentNode !== comp) return;

      /* Settled, the component IS the stage, so the measured gaps are
         written unchanged. Travelling, it is the frame — bigger than the
         screen — so they resolve through where the frame sits. */
      const settled = comp.classList.contains('is-settled');
      if (!settled && !cover) return;

      /* Travelling, the component is laid out at viewport width and
         scaled to cover, so its children scale too — the statements came
         out at four times their size. Offsets are expressed in the
         component's own units so the text lands 1:1. */
      const k = 1;
      const fromLeft = textBox.leftRatio * window.innerWidth;
      const width = textBox.widthRatio * window.innerWidth;

      text.style.top = 'auto';
      text.style.bottom = settled
        ? `${textBox.fromBottom}px`
        : `${((cover.y + cover.h) - (window.innerHeight - textBox.fromBottom)) / k}px`;
      text.style.left = settled
        ? `${fromLeft}px`
        : `${(fromLeft - cover.x) / k}px`;
      text.style.right = 'auto';
      text.style.width = `${width}px`;
      text.style.height = 'auto';

      if (k === 1) {
        text.style.removeProperty('transform');
        text.style.removeProperty('transform-origin');
      } else {
        text.style.transformOrigin = '0 100%';
        text.style.transform = `scale(${1 / k})`;
      }
    };

    const bringText = () => {
      if (!text || text.parentNode === comp) return;

      const t = text.getBoundingClientRect();
      const st = stage.getBoundingClientRect();

      /* Horizontals as fractions of the stage: measured once in pixels,
         a phone's box survives into a desktop window. The vertical stays
         in px — the gap above the bottom edge is a fixed offset. */
      const stageW = st.width || window.innerWidth;
      textBox = {
        fromBottom: st.bottom - t.bottom,
        leftRatio: (t.left - st.left) / stageW,
        widthRatio: t.width / stageW
      };

      stage.insertBefore(textSeat, text);
      comp.appendChild(text);
      if (themed) comp.classList.add('u-theme-dark');

      placeText();
    };

    /* Leaving the pin either way rewinds the statements. Without it the
       sequence is a one-off: coming back finds them already read. */
    const resetSwap = () => {
      if (dead || !swap) return;
      clearTimeout(catchUp);
      readAt = 0;
      reading = -1;
      swap.dispatchEvent(new Event('swap:reset'));
    };

    const returnText = () => {
      if (!text || !textSeat.parentNode) return;
      textSeat.parentNode.insertBefore(text, textSeat);
      textSeat.remove();
      comp.classList.remove('u-theme-dark');
      text.style.removeProperty('top');
      text.style.removeProperty('bottom');
      text.style.removeProperty('left');
      text.style.removeProperty('right');
      text.style.removeProperty('width');
      text.style.removeProperty('height');
      text.style.removeProperty('transform');
      text.style.removeProperty('transform-origin');
      textBox = null;
    };

    gsap.set(comp, { autoAlpha: 0 });

    const measure = () => {
      /* The cell carries its own Designer height, so it measured as a
         square box around a 16/9 component. Stamping the component's
         ratio on it first makes the measurement describe the video. */
      if (!lifted) {
        const declared = getComputedStyle(comp).aspectRatio;
        cell.style.aspectRatio = declared && declared !== 'auto' ? declared : '16 / 9';
        cell.style.height = 'auto';
      }

      const r = cell.getBoundingClientRect();
      const y = window.scrollY || window.pageYOffset;
      if (!r.width || !r.height) {
        console.warn(
          '[heroVideo] the hero cell has no size, so there is nothing to ' +
          'travel from. Usually the component is still absolutely ' +
          'positioned and contributing no height to the grid.', cell
        );
        return;
      }

      base = { x: r.left, y: r.top + y, w: r.width, h: r.height };

      /* The frame is the viewport, never wider: kept at the video's
         ratio it is four screens wide on a phone, and the browser scales
         the whole page to that. The shape is fixed on the video inside
         instead — see apply(). */
      const b = HERO_VIDEO.bleed;
      const cw = window.innerWidth + b * 2;
      const ch = window.innerHeight + b * 2;

      const ratio = base.w / base.h;

      cover = {
        w: cw,
        h: ch,
        sx: base.w / cw,
        sy: base.h / ch,
        ratio,
        // Scale the video needs to cover a frame of another shape.
        toCover: Math.max(1, (ch * ratio) / cw),
        x: -b,
        y: -b
      };

      /* Laid out in its own ratio rather than stretched to the frame:
         object-fit against a portrait box crops a 16/9 video to 9/16
         before any transform sees it. */
      if (visual) {
        visual.style.position = 'absolute';
        visual.style.left = '50%';
        visual.style.top = '50%';
        visual.style.width = `${cw}px`;
        visual.style.height = `${cw / ratio}px`;
        visual.style.maxWidth = 'none';
      }

      // Once, and after the first measurement: the cell needs the
      // component's height before it can hold the shape itself.
      if (!lifted) {
        cell.insertBefore(seat, comp);
        document.body.appendChild(comp);
        comp.classList.add('is-travelling');
        lifted = true;
      }

      comp.style.width = `${cover.w}px`;
      comp.style.height = `${cover.h}px`;
    };

    /* Taken off base-lib's books before it initialises (heroVideo mounts
       first): once the component is fixed on the body, that observer's
       idea of "in view" has nothing to do with what is on screen, and it
       would pause the video mid-flight. Started with the travel here
       instead, or the first thing anyone sees of it is a still. */
    video?.removeAttribute('data-video-scroll-in-play');

    let playing = false;
    const play = () => {
      if (!video) return;
      playing = true;
      // An autoplay refusal is a decision, not a fault.
      video.play?.().catch(() => {});
    };

    // Re-asserted while it travels: something else pausing it is likelier
    // than it having ended.
    const keepPlaying = () => {
      if (playing && video && video.paused) video.play?.().catch(() => {});
    };

    const lerp = (a, b, t) => a + (b - a) * t;

    // The entrance cannot be a CSS animation: apply() writes the same
    // transform every frame, so its scale is composed in instead.
    let intro = HERO_VIDEO.from;
    let lastP = 0;
    let lastScroll = 0;

    /* p 0 is the cell, p 1 the filled screen. In between it still has to
       travel with the page, or it hangs in the viewport while the hero
       leaves — hence the scroll term, faded out as p rises. */
    let frozen = false;

    const visual = comp.querySelector('.g_visual_video') || video;

    const apply = (p, scroll) => {
      if (frozen || !base || !cover) return;
      lastP = p;
      lastScroll = scroll;

      const x = lerp(base.x, cover.x, p);
      const y = lerp(base.y - scroll, cover.y, p);
      const sx = lerp(cover.sx, 1, p);
      const sy = lerp(cover.sy, 1, p);

      /* The frame morphs from the cell's shape to the screen's and the
         video is handed that difference back, so it is only ever scaled
         by one number: the cell's fill at one end, cover at the other. */
      if (visual && sx > 0 && sy > 0) {
        const f = lerp(cover.sx, cover.toCover, p) * HERO_VIDEO.overspill;
        visual.style.transform =
          `translate(-50%, -50%) scale(${f / sx}, ${f / sy})`;
      }

      // The travel scales from the top left, so the entrance's centre is
      // held by hand: half the shrink on each side.
      const dx = (cover.w * sx * (1 - intro)) / 2;
      const dy = (cover.h * sy * (1 - intro)) / 2;

      comp.style.transform =
        `translate3d(${x + dx}px, ${y + dy}px, 0) scale(${sx * intro}, ${sy * intro})`;
    };

    /* Measured against the STAGE, not the hero: the stage's top entering
       the viewport to reaching it is one screen, and its end is the
       pin's start by definition. Tied to the hero's height instead, the
       travel finished whenever that section happened to end.

       Declared before anything that reaches for it — the trigger's own
       callbacks run during its creation, where a const on the same line
       is still in its dead zone. */
    let travel = null;

    const growth = { p: 0 };
    let growing = false;
    let wants = 0;

    /* Its own tween, not the trigger's updates: once it is going it has
       to keep going, and a scroll that races past the range — or stops
       dead inside it — takes those updates with it. The scroll is read
       live for the same reason.

       The page is carried to the pin rather than merely blocked: a lock
       on its own is a page that stops answering. */
    let tookOver = false;
    let scrollTween = null;

    const takeover = () => {
      if (!HERO_VIDEO.takeover || reducedMotion || tookOver || dead) return;
      if (!travel) return;

      const target = travel.end;
      if (!isFinite(target) || travel.scroll() >= target) return;
      tookOver = true;

      if (hasLenis && lenis && lenis.scrollTo) {
        lenis.scrollTo(target, {
          duration: HERO_VIDEO.takeoverDuration,
          lock: true,
          force: true
        });
        return;
      }

      const pos = { y: travel.scroll() };
      scrollTween = gsap.to(pos, {
        y: target,
        duration: HERO_VIDEO.takeoverDuration,
        ease: HERO_VIDEO.growEase,
        overwrite: true,
        onUpdate: () => window.scrollTo(0, pos.y)
      });
    };

    const growTo = (target) => {
      if (dead || wants === target) return;
      wants = target;
      growing = true;

      // Re-armed only once the growth is let go entirely, so scrolling
      // back up and down again gets the same throw.
      if (target === 1) takeover();
      else tookOver = false;
      gsap.to(growth, {
        p: target,
        duration: HERO_VIDEO.growDuration,
        ease: HERO_VIDEO.growEase,
        overwrite: true,
        onUpdate: () => apply(growth.p, travel ? travel.scroll() : lastScroll),
        onComplete: () => { growing = false; apply(growth.p, travel ? travel.scroll() : lastScroll); }
      });
    };

    /* Latched, edges far apart: one threshold for both directions means
       a scroll hovering on it flips the growth back and forth. */
    const wanted = (distance) => {
      if (distance >= HERO_VIDEO.growAfter) return 1;
      if (distance <= 0) return 0;
      return wants;
    };

    travel = ScrollTrigger.create({
      trigger: stage,
      start: 'top bottom',
      end: 'top top',
      invalidateOnRefresh: true,

      /* Refreshes land on every navigation and footer resize, so only
         the settled value is corrected — snapping p mid-growth is a jump
         in the middle of it. */
      onRefresh: (self) => {
        measure();
        placeText();
        if (!growing) {
          wants = wanted(self.scroll() - self.start);
          growth.p = wants;
        }
        apply(growth.p, self.scroll());
      },

      onUpdate: (self) => {
        if (dead) return;
        growTo(wanted(self.scroll() - self.start));
        apply(growth.p, self.scroll());
        keepPlaying();
      }
    });

    /* The entrance order lives on .home_wrap in the CSS, next to the
       images' own delays; this reads its slot out of there rather than
       keeping a second copy. Falls back to the constants above. */
    const introDelay = () => {
      const cs = getComputedStyle(hero);
      const num = (name) => {
        const raw = cs.getPropertyValue(name).trim();
        if (!raw) return NaN;
        const v = parseFloat(raw);
        return raw.endsWith('ms') ? v / 1000 : v;
      };
      const lead = num('--hero-in-lead');
      const step = num('--hero-in-step');
      const slot = num('--hero-in-video-slot');
      if (!isFinite(lead) || !isFinite(step) || !isFinite(slot)) return HERO_VIDEO.delay;
      return lead + step * slot;
    };

    /* A tween, not a keyframe: moving an element in the DOM restarts its
       CSS animations, and this one moves to the body and back — so the
       fade replayed on the way up. Opacity only; apply() owns the
       transform. */
    Intro.add(root, () => {
      if (dead) return;
      play();

      const delay = introDelay();

      gsap.to(comp, {
        autoAlpha: 1,
        duration: HERO_VIDEO.duration,
        delay: delay,
        ease: HERO_VIDEO.ease,
        overwrite: 'auto'
      });

      gsap.to({ k: HERO_VIDEO.from }, {
        k: 1,
        duration: HERO_VIDEO.duration,
        delay: delay,
        ease: HERO_VIDEO.ease,
        onUpdate() {
          intro = this.targets()[0].k;
          apply(lastP, lastScroll);
        },
        onComplete() { intro = 1; apply(lastP, lastScroll); }
      });
    });

    /* Handed back to the document once the pin is done, so the video
       scrolls away with the stage instead of staying stuck to the
       viewport for the rest of the page. */
    const settle = () => {
      if (dead) return;
      // Past the pin the stage owns the box, so a growth still running
      // would be writing to nothing.
      gsap.killTweensOf(growth);
      growing = false;
      wants = 1;
      growth.p = 1;
      stage.appendChild(comp);
      comp.classList.remove('is-travelling');
      comp.classList.add('is-settled');
      // Settled, the frame is the stage's box and object-fit is right
      // again.
      if (visual) {
        ['position', 'left', 'top', 'width', 'height', 'max-width', 'transform']
          .forEach((prop) => visual.style.removeProperty(prop));
      }
      comp.style.transform = '';
      comp.style.width = '';
      comp.style.height = '';
    };

    const lift = () => {
      if (dead) return;
      document.body.appendChild(comp);
      comp.classList.remove('is-settled');
      comp.classList.add('is-travelling');
      measure();
      if (!cover) return;
      comp.style.width = `${cover.w}px`;
      comp.style.height = `${cover.h}px`;
      // Placed at once: settle() cleared the transform, and with the
      // travel behind us nothing else would ever write one.
      apply(growth.p, travel.scroll());
    };

    /* One statement at a time: driven straight off the pin's progress, a
       flick skips whatever it crosses. Advance a step, hold it for
       dwell, then catch up to where the scroll now is. */
    let readAt = 0;
    let catchUp = null;

    const step = (want) => {
      if (dead || !swap) return;
      clearTimeout(catchUp);
      if (want === reading) return;

      const wait = HERO_VIDEO.dwell - (performance.now() - readAt);
      if (wait > 0) {
        catchUp = setTimeout(() => step(want), wait);
        return;
      }

      // One at a time, so a jump of several still plays as a sequence.
      reading += want > reading ? 1 : -1;
      readAt = performance.now();
      swap.dispatchEvent(new CustomEvent('swap:to', { detail: reading }));
      if (reading !== want) catchUp = setTimeout(() => step(want), HERO_VIDEO.dwell);
    };

    const held = ScrollTrigger.create({
      trigger: stage,
      start: 'top top',
      end: () => '+=' + window.innerHeight * HERO_VIDEO.pin,
      pin: true,
      pinSpacing: true,

      /* Refreshed before anything below it: pin spacing is real height,
         so a trigger measured before it lands is early by exactly the
         pin's length. Creation order does not settle this. */
      refreshPriority: 1,
      onEnter: () => {
        if (dead) return;
        /* A growth still running is left to finish rather than snapped
           to 1, which is the jump; it lands well inside the hold. The
           entrance is over by definition here — left at its start value
           the video renders at 60% with the page showing around it. */
        intro = 1;
        if (!growing) {
          wants = 1;
          growth.p = 1;
          apply(1, travel.scroll());
        }
        bringText();
      },
      onEnterBack: () => {
        if (dead) return;
        lift();
        // If it left through the bottom the text is already inside, but
        // the gaps now resolve against the frame again.
        bringText();
        placeText();
      },
      /* Out the bottom the last statement stays put — it is the one the
         pin ended on, and only going back above the pin resets. It also
         stays inside the component: handed back to the stage it jumps to
         the middle of a screen-tall centred block. */
      onLeave: () => { settle(); placeText(); },
      onLeaveBack: () => { returnText(); resetSwap(); },

      // One statement per equal share of the pin, both directions.
      onUpdate: (self) => {
        if (dead || !swap || !statements) return;
        step(Math.min(statements - 1, Math.floor(self.progress * statements)));
      }
    });

    /* A swap collapses the document under the triggers — the footer
       margin goes and both containers become fixed layers — which they
       read as a race back up the page, playing the travel in reverse
       over the transition. Hiding it is wrong (it is part of what the
       outgoing page still shows), so it is frozen where it stands. */
    const freeze = () => {
      if (dead) return;
      frozen = true;
      gsap.killTweensOf(growth);
      scrollTween?.kill();
      travel?.disable(false);
      held?.disable(false);
    };

    document.addEventListener('page:leaving', freeze);

    // On the resize itself, not ScrollTrigger's refresh a beat later:
    // sized in px off the viewport, it is briefly the old box.
    const onResize = () => {
      if (dead || frozen || !lifted) return;
      measure();
      placeText();
      apply(growth.p, travel ? travel.scroll() : lastScroll);
    };
    window.addEventListener('resize', onResize, { passive: true });

    return function cleanup() {
      dead = true;
      clearTimeout(catchUp);
      document.removeEventListener('page:leaving', freeze);
      window.removeEventListener('resize', onResize);
      gsap.killTweensOf(growth);
      scrollTween?.kill();
      travel.kill();
      held.kill();
      gsap.set(comp, { clearProps: 'opacity,visibility' });
      comp.classList.remove('is-travelling', 'is-settled', 'is-page-leaving');
      comp.style.removeProperty('transform');
      comp.style.removeProperty('width');
      comp.style.removeProperty('height');
      if (visual) {
        ['position', 'left', 'top', 'width', 'height', 'max-width', 'transform']
          .forEach((prop) => visual.style.removeProperty(prop));
      }
      returnText();
      cell.style.removeProperty('aspect-ratio');
      cell.style.removeProperty('height');
      if (seat.parentNode) {
        seat.parentNode.insertBefore(comp, seat);
        seat.remove();
      }
    };
  });


  /* ============================================================
     THIRD PARTY (base-lib) — form-validation, match-container and
     video-min bind on DOMContentLoaded, which fires once, so they die
     after the first swap unless re-initialised per container.
     ============================================================ */

  Modules.add('baseLib', function (root) {
    const MYL = window.MYL;
    if (!MYL) return;
    MYL.video?.init?.(root);
    MYL.formValidation?.init?.(root);
    MYL.matchContainer?.init?.(root);
  });


  /* ============================================================
     PERSISTENT: FOOTER REVEAL
     ============================================================ */

  /* The footer is revealed through a margin, so it changes the scrollable
     height that Lenis and ScrollTrigger both cache. Re-measured on the
     frame after the margin lands — but never mid-transition, where every
     layer is fixed and the document measures as almost nothing. The after
     hook drops is-transitioning first, so it still happens. */
  function refreshScrollHeight() {
    if (document.documentElement.classList.contains('is-transitioning')) return;
    requestAnimationFrame(() => {
      if (hasLenis && lenis) lenis.resize();
      if (hasScrollTrigger) ScrollTrigger.refresh();
    });
  }

  const FooterReveal = (function () {
    const footer = document.querySelector('.footer_wrap');
    const page = document.querySelector('.page_wrap');
    if (!footer || !page) return { sync() {}, collapse() {} };

    const sync = () => {
      page.style.marginBottom = `${footer.offsetHeight}px`;
      refreshScrollHeight();
    };
    const collapse = () => { page.style.marginBottom = '0px'; };

    new ResizeObserver(() => {
      if (!document.documentElement.classList.contains('is-transitioning')) sync();
    }).observe(footer);

    sync();
    return { sync, collapse };
  })();


  /* ============================================================
     NAV SYNC — the meganav persists, so data-transparent and the
     active-link state are copied off the incoming page.
     (docs: README ## Per-template attributes)
     ============================================================ */

  function syncNavFrom(container) {
    const nav = findNav();
    if (!nav || !container) return;
    const transparent = container.dataset.navTransparent ?? 'true';
    nav.setAttribute('data-transparent', transparent);
    nav.classList.remove('is-open', 'is-mobile-open');
    if (window.scrollY <= 10) nav.classList.remove('is-scrolled');

    /* A menu open before a navigation is still open after it, and the tap
       that navigated was usually a link inside it. The nav's own embed
       only toggles on click, so every piece of the open state is cleared
       here — including the body lock, or the next page cannot scroll. */
    document.querySelectorAll(
      '[data-nav-mobile].is-open, .meganav_mobile_open.is-open, ' +
      '.meganav_panel.is-open, .meganav_backdrop.is-open, ' +
      '.meganav_mobile_dropdown.is-open, .meganav_locale_dropdown.is-open'
    ).forEach((el) => el.classList.remove('is-open'));

    document.querySelectorAll('.meganav_mobile_icon.is-rotated')
      .forEach((el) => el.classList.remove('is-rotated'));

    if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
  }

  function initBarbaNavUpdate(data) {
    const tpl = document.createElement('template');
    tpl.innerHTML = data.next.html.trim();
    const nextNodes = tpl.content.querySelectorAll('[data-barba-update]');
    const currentNodes = document.querySelectorAll('nav [data-barba-update]');

    currentNodes.forEach((curr, index) => {
      const next = nextNodes[index];
      if (!next) return;
      const status = next.getAttribute('aria-current');
      if (status !== null) curr.setAttribute('aria-current', status);
      else curr.removeAttribute('aria-current');
      curr.setAttribute('class', next.getAttribute('class') || '');
    });
  }


  /* ============================================================
     NAV SCROLL STATE — is-scrolled on the persistent nav: transparent
     at the top of the page, solid past the threshold.

     Owned here rather than by the nav's embed, whose guard returns on a
     mega-panel selector the markup does not use, taking the scroll
     state, burger, panel and locale with it. Delete that embed's SCROLL
     WATCHER block — two owners of one class is still wrong.

     .meganav is the published class name; data-nav overrides it.
     ============================================================ */

  const NAV_SCROLL_AT = 10;

  /* The footer is fixed behind the page, so how much shows is the
     distance left to the bottom. Past enough of it the nav leaves, being
     the last thing overlapping a full-bleed panel. Two thresholds, since
     one line flickers wherever an inertia scroll rests on it. */
  const NAV_HIDE = {
    hideAt: 0.5,          // fraction of the footer revealed → nav leaves
    showAt: 0.35,         // scrolled back above this → nav returns
    duration: 0.45,
    ease: E.small,

    offset: 120,          // px from the top before hiding is allowed: a
                          // small scroll there is settling, not travel
    threshold: 6          // px of movement before a direction is read,
                          // so an inertia wobble does not flicker it
  };

  let updateNavScroll = () => {};
  /* Navigating from the footer starts with the nav parked off-screen and
     the scroll check cannot recover it: is-transitioning outlives the
     navigation's last scroll event by two frames. */
  let resetNav = () => {};

  function footerRevealed() {
    const footer = document.querySelector('.footer_wrap');
    const height = footer ? footer.offsetHeight : 0;
    if (!height) return 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return 0;
    return Math.min(1, Math.max(0, (window.scrollY - (max - height)) / height));
  }

  // An open panel outranks the footer: hiding the nav under a menu
  // leaves a lock and no way back.
  function navMenuOpen() {
    return !!document.querySelector(
      '[data-nav-mobile].is-open, .meganav_mobile_open.is-open, ' +
      '.meganav_panel.is-open, .meganav_backdrop.is-open'
    );
  }

  /* Chrome carries the page scale across a width change, so a desktop
     window resized to phone width stays magnified by the ratio between
     them. Clamping maximum-scale for one frame makes it recompute.
     Width changes only — a pinch is someone's own zoom. */
  function initZoomReset() {
    const vv = window.visualViewport;
    const meta = document.querySelector('meta[name="viewport"]');
    if (!vv || !meta) return;

    let lastWidth = window.innerWidth;

    window.addEventListener('resize', () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      if (vv.scale === 1) return;

      const own = meta.getAttribute('content');
      meta.setAttribute('content', `${own}, maximum-scale=1`);
      requestAnimationFrame(() => meta.setAttribute('content', own));
    }, { passive: true });
  }

  /* Which nav link is the page you are on. Webflow answers this with
     w--current at render, but the nav is persistent — it is never
     swapped — so those classes still describe whichever page was loaded
     first. Recomputed from the URL after every navigation instead.

     Trailing slashes and absolute hrefs both normalise to a pathname,
     so /kontakt, /kontakt/ and https://site/kontakt are one thing. */
  function syncNavCurrent() {
    /* The footer is persistent too — it lives outside the swapped
       container so its links go as stale as the nav's. */
    const roots = document.querySelectorAll('.meganav_root, .footer_wrap');
    if (!roots.length) return;

    const tidy = (path) => path.replace(/\/+$/, '') || '/';
    const here = tidy(location.pathname);

    roots.forEach((root) => root.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || /^[a-z]+:/i.test(href) && !href.startsWith(location.origin)) {
        a.classList.remove('is-current');
        return;
      }
      let path;
      try { path = new URL(href, location.origin).pathname; } catch (err) { return; }
      a.classList.toggle('is-current', tidy(path) === here);
    }));
  }

  function initNavScroll() {
    const nav = findNav();
    if (!nav) {
      console.warn('[nav] no nav found for the scroll state — put data-nav on it');
      return;
    }

    let scrolled = null;
    let hidden = false;
    let queued = false;
    let lastY = window.scrollY;

    const setHidden = (hide) => {
      if (hide === hidden) return;
      hidden = hide;
      nav.classList.toggle('is-hidden', hide);
      // pointer-events goes with it, or the sliding nav takes a click
      // meant for the footer.
      nav.style.pointerEvents = hide ? 'none' : '';
      gsap.to(nav, {
        yPercent: hide ? -100 : 0,
        duration: reducedMotion ? 0 : NAV_HIDE.duration,
        ease: NAV_HIDE.ease,
        overwrite: 'auto',
        /* Cleared once home: even an identity transform keeps the bar on
           its own layer, and a layer edge on half a device pixel shows a
           seam of whatever is behind it. */
        onComplete: () => {
          if (!hidden) gsap.set(nav, { clearProps: 'transform,translate,rotate,scale' });
        }
      });
    };

    resetNav = () => {
      // The incoming page starts at the top, so the old reading would
      // land as a large scroll up.
      lastY = 0;
      setHidden(false);
    };

    // One read per frame: Lenis fires scroll continuously and every
    // scrollY read forces layout.
    const apply = () => {
      queued = false;

      const next = window.scrollY > NAV_SCROLL_AT;
      if (next !== scrolled) {
        scrolled = next;
        nav.classList.toggle('is-scrolled', next);
      }

      // Mid-transition the document height is meaningless, so the footer
      // fraction is too. Hold until the page lands.
      if (document.documentElement.classList.contains('is-transitioning')) return;

      /* Priority order: an open menu pins the nav on, the footer reveal
         takes it away, otherwise direction decides. Between the two
         footer thresholds the state is held — that band is the
         anti-flicker. */
      const revealed = footerRevealed();
      const y = Math.max(0, window.scrollY);   // iOS rubber-banding goes negative
      const moved = y - lastY;

      if (navMenuOpen()) {
        setHidden(false);
      } else if (revealed >= NAV_HIDE.hideAt) {
        setHidden(true);
      } else if (revealed <= NAV_HIDE.showAt) {
        if (y <= NAV_HIDE.offset) {
          setHidden(false);
        } else if (Math.abs(moved) >= NAV_HIDE.threshold) {
          setHidden(moved > 0);
        }
      }

      if (Math.abs(moved) >= NAV_HIDE.threshold) lastY = y;
    };

    updateNavScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(apply);
    };

    window.addEventListener('scroll', updateNavScroll, { passive: true });
    window.addEventListener('resize', updateNavScroll, { passive: true });
    apply();
  }

  /* ============================================================
     MEGANAV — a full-viewport sheet swiping down from the top edge,
     its contents rising behind the swipe.  (docs: README ## Meganav)

     The panel is absolute and sized in viewport units, not fixed: it
     lives inside the nav, and the nav's footer-hide transform would
     otherwise become its containing block. CSS half in the stylesheet.

     Init runs once, not per container: the nav persists, and sync:true
     would leave a second set of listeners bound per navigation.
     ============================================================ */

  const MENU = {
    duration: 0.89,          // the swipe, matching the reference
    ease: E.menuSheet,
    contentDelay: 0.18,      // content starts while the sheet is still moving
    contentDuration: 0.6,
    contentStagger: 0.05,
    contentShift: 40,        // px the rows rise
    contentEase: E.body,
    /* The CTA goes last, after both the swipe and the final row: the
       rows rise under the swipe, which is what makes the sheet read as
       carrying them, and the button doing it too looked like it had
       been there all along. data-nav-delay adds to a row's position. */
    buttonGap: 0.02,

    buttonOverlap: 0.45,     // of the last row's rise: 1 waits it out,
                             // 0 leaves with it

    // Fraction of the close where the bar takes its colours back: the
    // sheet clips upward, so the strip behind it goes last.
    restore: 0.72,

    labelClosed: 'Meny',
    labelOpen: 'Lukk',
    labelFade: 0.12       // out and back in, either side of the swap
  };

  const CLOSED_CLIP = 'inset(0% 0% 100% 0%)';
  const OPEN_CLIP = 'inset(0% 0% 0% 0%)';

  /* Called from beforeLeave: syncNavFrom drops is-open, but the inline
     clip-path and pointer-events set here would survive it as an
     invisible sheet over the incoming page. */
  let closeMeganav = () => {};

  function initMeganav() {
    const nav = findNav();
    const panel = document.querySelector('[data-nav-panel]')
      || document.querySelector('.meganav_panel');
    if (!nav || !panel) return;

    // The toggle is a div wrapping an <a href="#">, the burger another
    // anchor. Clicks are caught on the wrapper.
    const toggles = Array.from(new Set([
      ...document.querySelectorAll('[data-nav-toggle]'),
      ...document.querySelectorAll('.meganav_button_nav_open-wrap'),
      ...document.querySelectorAll('.meganav_mobile_open')
    ]));
    if (!toggles.length) {
      console.warn('[meganav] no toggle found — add data-nav-toggle to the Meny button');
      return;
    }

    // DOM order, so the stagger reads down the sheet.
    const content = Array.from(panel.querySelectorAll(
      '.meganav_feature_text, .button_main_wrap, ' +
      '.meganav_heading, .meganav_links_wrap .footer_link_wrap, [data-nav-content]'
    ));

    /* The panel has to be full-bleed for the black to reach the edges,
       which costs the content its container margins — so the class moves
       down to the inner. In script because the container's own rules
       live in the Designer and are not ours to restate. */
    const inner = panel.querySelector('.meganav_panel_inner');
    const containerClass = Array.from(panel.classList)
      .find((c) => c === 'u-container' || c.startsWith('u-container'));
    let movedContainer = null;
    if (inner && containerClass && !inner.classList.contains(containerClass)) {
      panel.classList.remove(containerClass);
      inner.classList.add(containerClass);
      movedContainer = containerClass;
    }

    /* The visible label and the screen-reader one are different elements
       of the Webflow component and both have to say the same thing.
       Overrides: data-nav-label-open / -closed. */
    const labels = [];
    toggles.forEach((toggle) => {
      const els = Array.from(toggle.querySelectorAll(
        '[data-nav-label], .footer_link_text, .u-sr-only'
      ));
      if (!els.length) return;
      const override = toggle.getAttribute('data-nav-label-closed');
      const opened = toggle.getAttribute('data-nav-label-open') || MENU.labelOpen;
      // Each keeps its OWN resting text: the visible label reads Meny
      // and the screen-reader one Menu.
      els.forEach((el) => labels.push({
        el,
        closed: override || el.textContent.trim() || MENU.labelClosed,
        opened
      }));
    });

    // Faded, not swapped: a hard text change mid-swipe reads as a glitch.
    const setLabels = (isOpen, instant) => {
      labels.forEach(({ el, closed, opened }) => {
        const next = isOpen ? opened : closed;
        if (el.textContent.trim() === next) return;
        if (instant || reducedMotion) {
          gsap.killTweensOf(el);
          gsap.set(el, { clearProps: 'opacity' });
          el.textContent = next;
          return;
        }
        gsap.killTweensOf(el);
        gsap.to(el, {
          opacity: 0,
          duration: MENU.labelFade,
          ease: E.label,
          onComplete: () => {
            el.textContent = next;
            gsap.to(el, { opacity: 1, duration: MENU.labelFade, ease: E.label });
          }
        });
      });
    };

    if (!panel.id) panel.id = 'meganav-panel';
    panel.setAttribute('aria-hidden', 'true');
    toggles.forEach((t) => {
      t.setAttribute('aria-expanded', 'false');
      t.setAttribute('aria-controls', panel.id);
    });

    let open = false;
    let tl = null;
    /* kill() does not fire onComplete, so an interrupted close left the
       classes on and the state disagreeing with the sheet. Held here and
       run before anything kills the timeline. */
    let pending = null;

    /* Lenis swallows touchmove while stopped, which is the whole sheet
       unscrollable on a phone; this attribute opts the panel out. The
       bar's real height is measured below — --nav--height is a guess,
       and a wrong one leaves a strip of page under the bar. */
    panel.setAttribute('data-lenis-prevent', '');

    const root = nav.closest('.meganav_root') || document.documentElement;
    const syncTop = () => {
      root.style.setProperty('--meganav-top', `${nav.getBoundingClientRect().height}px`);
    };
    syncTop();
    if (window.ResizeObserver) new ResizeObserver(syncTop).observe(nav);

    const lock = (on) => {
      document.documentElement.classList.toggle('is-menu-open', on);

      /* The lock takes the scrollbar with it, so anything measured while
         the menu was open used a wider viewport. Also drops what a
         cut-short swap left under the sheet. */
      if (!on) {
        requestAnimationFrame(() => {
          clearTransitionLeftovers();
          if (hasScrollTrigger) ScrollTrigger.refresh();
        });
      }

      if (!hasLenis || !lenis) return;
      // Lenis owns the scroll, so overflow:hidden alone does nothing.
      if (on) lenis.stop(); else lenis.start();
    };

    /* aria and the bar flip at once; .is-open carries the panel's
       visibility, so on the way out it outlives the swipe. */
    const paint = (instant) => {
      // The bar carries the sheet's colour on mobile, so it is dropped
      // when the swipe ends rather than when the close starts.
      if (open) nav.classList.add('is-open');
      if (open) panel.classList.add('is-open');
      panel.setAttribute('aria-hidden', String(!open));
      toggles.forEach((t) => t.setAttribute('aria-expanded', String(open)));
      setLabels(open, instant);
    };

    function show() {
      if (open) return;
      if (pending) { const fn = pending; pending = null; fn(); }
      open = true;
      paint();
      lock(true);
      resetNav();               // the sheet is full height; the bar has to be on screen

      tl?.kill();
      gsap.killTweensOf(content);

      if (reducedMotion) {
        gsap.set(panel, { clipPath: OPEN_CLIP });
        gsap.set(content, { y: 0, opacity: 1 });
        return;
      }

      tl = gsap.timeline();
      tl.fromTo(panel,
        { clipPath: CLOSED_CLIP },
        { clipPath: OPEN_CLIP, duration: MENU.duration, ease: MENU.ease },
        0
      );
      if (content.length) {
        const isButton = (el) => el.classList.contains('button_main_wrap');
        const rowsEnd = content.reduce((end, el, i) => isButton(el) ? end
          : Math.max(end, MENU.contentDelay + i * MENU.contentStagger
              + MENU.contentDuration * MENU.buttonOverlap), 0);
        const buttonAt = Math.max(MENU.duration, rowsEnd) + MENU.buttonGap;

        content.forEach((el, i) => {
          const at = isButton(el)
            ? buttonAt
            : MENU.contentDelay + i * MENU.contentStagger;
          const own = parseFloat(el.dataset.navDelay);

          tl.fromTo(el,
            { y: MENU.contentShift, opacity: 0 },
            {
              y: 0, opacity: 1,
              duration: MENU.contentDuration,
              ease: MENU.contentEase
            },
            at + (Number.isFinite(own) ? own : 0)
          );
        });
      }
    }

    function hide(instant) {
      if (!open) return;
      if (pending) { const fn = pending; pending = null; fn(); }
      open = false;
      paint(instant || reducedMotion);
      lock(false);

      tl?.kill();
      gsap.killTweensOf(content);

      // Clicks pass through from the first frame of the close.
      gsap.set(panel, { pointerEvents: 'none' });

      const restore = gsap.delayedCall(
        MENU.duration * MENU.restore,
        () => nav.classList.remove('is-open')
      );

      const done = () => {
        pending = null;
        restore.kill();
        panel.classList.remove('is-open');
        nav.classList.remove('is-open');
        // Back to the CSS's closed state, so nothing competes with a
        // stale inline clip-path.
        gsap.set(panel, { clearProps: 'clipPath,pointerEvents' });
        gsap.set(content, { clearProps: 'transform,opacity' });
      };

      if (instant || reducedMotion) { done(); return; }

      pending = done;
      tl = gsap.timeline({ onComplete: done });
      tl.to(panel, { clipPath: CLOSED_CLIP, duration: MENU.duration, ease: MENU.ease }, 0);
      tl.to(content, { opacity: 0, duration: 0.25, ease: E.small }, 0);
    }

    const controller = new AbortController();
    const { signal } = controller;

    /* One click, one toggle: the Designer nests an overlay anchor inside
       a wrapper that is itself a toggle, so one click bubbles through
       both and the menu opens and shuts in the same frame. */
    let lastClick = null;

    toggles.forEach((toggle) => {
      toggle.addEventListener('click', (e) => {
        // The anchor inside is href="#", which jumps the page to the top.
        e.preventDefault();
        if (lastClick === e) return;
        lastClick = e;
        if (open) hide(); else show();
      }, { signal });
    });

    // beforeLeave closes the menu on a navigation, but a link to the
    // current page never fires one.
    panel.addEventListener('click', (e) => {
      if (e.target.closest('a[href]')) hide();
    }, { signal });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) {
        hide();
        toggles[0]?.focus?.();
      }
    }, { signal });

    closeMeganav = () => hide(true);

    return () => {
      controller.abort();
      closeMeganav = () => {};
      labels.forEach(({ el, closed }) => {
        gsap.killTweensOf(el);
        gsap.set(el, { clearProps: 'opacity' });
        el.textContent = closed;
      });
      if (movedContainer) {
        inner?.classList.remove(movedContainer);
        panel.classList.add(movedContainer);
      }
    };
  }


  function findNav() {
    return document.querySelector('[data-nav]')
      || document.querySelector('.meganav')
      || document.querySelector('.meganav_root nav, .meganav_root header')
      || document.querySelector('.meganav_root > *');
  }


  /* ============================================================
     WEBFLOW REINIT
     ============================================================ */

  function reinitWebflow() {
    if (!window.Webflow) return;
    try {
      window.Webflow.destroy();
      window.Webflow.ready();
      window.Webflow.require('ix2')?.init();
      document.dispatchEvent(new Event('readystatechange'));
    } catch (err) {
      console.error('[webflow] reinit failed', err);
    }
  }


  /* ============================================================
     LENIS
     ============================================================ */

  function initLenis() {
    if (lenis || !hasLenis) return;

    lenis = new Lenis({ lerp: 0.165, wheelMultiplier: 1.25 });

    if (hasScrollTrigger) lenis.on('scroll', ScrollTrigger.update);

    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }


  /* ============================================================
     FUNCTION REGISTRY
     ============================================================ */

  function initOnceFunctions() {
    initLenis();
    if (onceFunctionsInitialized) return;
    onceFunctionsInitialized = true;
    initZoomReset();
    initNavScroll();
    syncNavCurrent();
    initMeganav();
    // Persistent, non-swapped behaviour goes here
  }

  function initBeforeEnterFunctions(next) {
    nextPage = next || document;
    reinitWebflow();
    Modules.mount(nextPage);
  }

  function initAfterEnterFunctions(next) {
    nextPage = next || document;
    syncNavCurrent();
    updateNavScroll();
    Intro.play(nextPage);
    FooterReveal.sync();
    if (hasLenis && lenis) lenis.resize();
    if (hasScrollTrigger) ScrollTrigger.refresh();
  }


  /* ============================================================
     PAGE TRANSITIONS — a crossfade: both pages hold the same rectangle
     for a second, the outgoing one blurring out under the incoming one.
     The layers below are what lets them overlap at all.
     (docs: README ## The transition)
     ============================================================ */

  function runPageOnceAnimation(next) {
    const tl = gsap.timeline();
    tl.call(() => { resetPage(next); }, null, 0);
    return tl;
  }

  function prepareForTransition(parent, current, next) {
    // Belt and braces: both pages must share the perspective parent, so
    // never animate a next that beforeEnter did not manage to move.
    if (next.parentElement !== parent) parent.insertBefore(next, current);

    const wrapper = document.createElement('div');
    wrapper.className = 'page-transition__wrapper';

    parent.insertBefore(wrapper, current);
    wrapper.appendChild(current);

    const scrollY = window.scrollY || 0;
    window.scrollTo(0, 0);

    /* The perspective below makes parent the containing block for every
       fixed child, so their 0,0 is its padding box — which starts under
       the persistent nav. Measured after the scroll reset, cancelled. */
    const rect = parent.getBoundingClientRect();
    const offsetX = rect.left;
    const offsetY = rect.top;

    // Behind both pages, so the gap between them is colourable
    // separately from the page background.
    const backdrop = document.createElement('div');
    backdrop.className = 'page-transition__backdrop';
    const bg = next.dataset.transitionBg;
    if (bg) {
      const value = bg.trim();
      backdrop.style.setProperty(
        '--transition-bg',
        value.startsWith('--') ? `var(${value})` : value
      );
    }
    parent.insertBefore(backdrop, wrapper);

    gsap.set(backdrop, {
      position: 'fixed', top: -offsetY, left: -offsetX,
      width: '100%', height: '100vh', zIndex: 0
    });

    gsap.set(parent, {
      perspective: '100vw',
      // 50% 50% resolves against a parent as tall as the document, which
      // puts the vanishing point below the fold.
      perspectiveOrigin: `50% ${window.innerHeight / 2 - offsetY}px`,
      transformStyle: 'preserve-3d'
    });

    /* No overflow:clip on any of these three: a non-visible overflow
       makes the element the scrollport sticky descendants resolve
       against, and every sticky section lands in the same 100vh box.
       clip-path clips without that; is-transitioning takes the
       scrollbars. pointer-events off, since the outgoing page keeps live
       links for a full second underneath. */
    gsap.set(wrapper, {
      position: 'fixed', top: -offsetY, left: -offsetX,
      width: '100%', height: '100vh',
      zIndex: 1, pointerEvents: 'none',
      willChange: 'opacity, filter',
      clipPath: 'rect(0% 100% 100% 0% round 0em)'
    });

    gsap.set(current, {
      position: 'absolute', top: -scrollY, left: 0, width: '100%',
      willChange: 'transform, opacity', backfaceVisibility: 'hidden'
    });

    if (footerAtLeave) {
      liftFooterIntoLayer(wrapper, footerAtLeave.top);
      footerAtLeave = null;
    }

    /* A wrapper of its own, for symmetry with the outgoing side: as the
       fixed 100vh box itself, every percentage height and sticky section
       inside the incoming container resolved against one viewport. */
    const nextWrapper = document.createElement('div');
    nextWrapper.className = 'page-transition__wrapper';
    parent.insertBefore(nextWrapper, next);
    nextWrapper.appendChild(next);

    gsap.set(nextWrapper, {
      position: 'fixed', top: -offsetY, left: -offsetX,
      width: '100%', height: '100vh',
      zIndex: 2,
      willChange: 'opacity, filter',
      autoAlpha: 0, filter: `blur(${FADE.blur}px)`,
      clipPath: 'rect(0% 100% 100% 0% round 0em)'
    });

    gsap.set(next, {
      position: 'absolute', top: 0, left: 0, width: '100%',
      willChange: 'transform, opacity', backfaceVisibility: 'hidden'
    });

    /* Every symptom so far has come down to one of these, and none is
       visible in a screenshot. Logged mid-leave, so this is the
       animating state rather than the cleaned-up one. */
    requestAnimationFrame(() => {
      const cs = getComputedStyle(next);
      console.info('[page-transition] state', {
        build: BUILD,
        containerParent: next.parentElement?.className || '(none)',
        parentPerspective: getComputedStyle(parent).perspective,
        backdropInDom: document.body.contains(backdrop),
        backdropBg: getComputedStyle(backdrop).backgroundColor,
        nextPosition: cs.position,
        nextHeight: cs.height,
        nextTransform: cs.transform,
        nextZIndex: cs.zIndex
      });
    });

    return { wrapper, nextWrapper, backdrop, scrollY };
  }

  /* The footer is fixed and lives outside .page_wrap, so it is no part of
     the outgoing page — and hiding it meant clicking a footer link made
     the footer vanish a frame before the page moved. The real element is
     moved into the outgoing layer instead, pinned where it already was:
     inside a fixed wrapper an absolute child resolves against the same
     rect, so it does not shift a pixel. The element, not a clone, which
     would drop its links, form and IX2 bindings. */
  let footerLayer = null;
  let footerAtLeave = null;

  /* Read at beforeLeave, before FooterReveal.collapse(): collapsing the
     reserved space shortens the document and the scroll clamps, so a
     footer filling half the screen measures as one nobody reached. */
  function captureFooterForLeave(current) {
    const footer = document.querySelector('.footer_wrap');
    /* The OUTGOING container, not .page_wrap: sync:true has already put
       the incoming one in there, so the wrapper measures twice as tall
       as the page anybody is looking at. */
    const page = current || document.querySelector('.page_wrap');
    footerAtLeave = null;
    if (!footer || !page) return;
    if (page.getBoundingClientRect().bottom >= window.innerHeight - 1) return;
    footerAtLeave = { top: footer.getBoundingClientRect().top };
  }

  function liftFooterIntoLayer(wrapper, top) {
    const footer = document.querySelector('.footer_wrap');
    if (!footer || footerLayer) return;
    footerLayer = { el: footer, parent: footer.parentElement, next: footer.nextSibling };
    footer.classList.add('is-transition-layer');
    wrapper.insertBefore(footer, wrapper.firstChild);
    /* left/right rather than a width, and no height: an absolute box with
       only left shrinks to fit, and a pinned offsetHeight adds the
       padding twice under content-box. */
    gsap.set(footer, { position: 'absolute', top, left: 0, right: 0, zIndex: 0 });
  }

  function restoreFooterLayer() {
    if (!footerLayer) return;
    const { el, parent, next } = footerLayer;
    footerLayer = null;
    el.classList.remove('is-transition-layer');
    gsap.set(el, { clearProps: 'position,top,left,right,width,height,zIndex' });
    if (parent) parent.insertBefore(el, next);
  }

  function sweepStaleLayers() {
    // First: a stale layer holds the real footer, and lifting its
    // children out strands it in .page_wrap with inline styles on.
    restoreFooterLayer();
    document.querySelectorAll('.page-transition__wrapper').forEach((el) => {
      const host = el.parentElement;
      if (host) while (el.firstChild) host.insertBefore(el.firstChild, el);
      el.remove();
    });
    document.querySelectorAll('.page-transition__backdrop').forEach((el) => el.remove());
  }

  function runPageLeaveAnimation(current, next) {
    sweepStaleLayers();
    const parent = current.parentElement || document.querySelector('.page_wrap') || document.body;
    const { wrapper, nextWrapper, backdrop } = prepareForTransition(parent, current, next);

    const tl = gsap.timeline({
      onComplete: () => {
        restoreFooterLayer();
        wrapper.remove();
        backdrop.remove();
        // Put the incoming page back where it belongs before dropping its
        // wrapper, so it ends up in the same slot a normal load leaves it.
        parent.insertBefore(next, nextWrapper);
        nextWrapper.remove();
        resolveLeave?.();
        gsap.set(parent, {
          clearProps: 'perspective,perspectiveOrigin,transformStyle,overflow'
        });
        gsap.set(next, {
          clearProps: 'position,inset,width,height,zIndex,transformStyle,willChange,backfaceVisibility,transform,filter,opacity,visibility'
        });
      }
    });

    if (reducedMotion) return tl.set(current, { autoAlpha: 0 });

    // Both at position 0: the overlap is the whole effect.
    tl.to(wrapper, {
      autoAlpha: 0, filter: `blur(${FADE.blur}px)`,
      duration: FADE.duration, ease: FADE.ease
    }, 0);

    tl.to(nextWrapper, {
      autoAlpha: 1, filter: 'blur(0px)',
      duration: FADE.duration, ease: FADE.ease
    }, 0);

    return tl;
  }

  /* resetPage strips the fixed 100vh box off the incoming container, so
     it has to wait for the leave: run at position 0 the incoming page
     reflows full-bleed a frame after being placed, and only the outgoing
     one keeps its rectangle. leaveDone is created in beforeLeave, which
     barba runs before either leave or enter. */
  function runPageEnterAnimation(next) {
    if (reducedMotion) gsap.set(next, { autoAlpha: 1 });
    return (leaveDone || Promise.resolve()).then(() => resetPage(next));
  }

  /* A cut-short swap leaves the container holding the transform it was
     partway through, which under the parent's perspective renders the
     whole page scaled. Called from hooks that run whatever the timeline
     did, and idempotent. */
  function clearTransitionLeftovers() {
    if (document.documentElement.classList.contains('is-transitioning')) return;

    // The wrapper holds the transform, so a container left inside one
    // reads as untransformed while the page is visibly scaled.
    document.querySelectorAll('.page-transition__wrapper').forEach((w) => {
      const inner = w.querySelector('[data-barba="container"]');
      if (inner && w.parentNode) w.parentNode.insertBefore(inner, w);
      w.remove();
    });
    document.querySelectorAll('.page-transition__backdrop').forEach((b) => b.remove());

    const container = document.querySelector('[data-barba="container"]');
    if (container && container.getAttribute('style')) {
      gsap.set(container, {
        clearProps: 'position,inset,top,left,right,width,height,zIndex,' +
          'transformStyle,willChange,backfaceVisibility,transform,filter,opacity,visibility'
      });
    }

    const wrap = document.querySelector('.page_wrap');
    if (wrap && getComputedStyle(wrap).perspective !== 'none') {
      gsap.set(wrap, { clearProps: 'perspective,perspectiveOrigin,transformStyle,overflow' });
    }
  }

  function clearContainerLayer(container) {
    if (!container) return;
    if (getComputedStyle(container).position !== 'fixed') return;
    gsap.set(container, { clearProps: 'position,top,left,right' });
    if (hasLenis && lenis) lenis.resize();
    if (hasScrollTrigger) ScrollTrigger.refresh();
  }

  function resetPage(container) {
    window.scrollTo(0, 0);
    gsap.set(container, { clearProps: 'position,top,left,right' });
    if (hasLenis && lenis) {
      lenis.resize();
      lenis.start();
    }
  }


  /* ============================================================
     BARBA
     ============================================================ */

  const root = document.documentElement;

  barba.hooks.beforeLeave((data) => {
    root.classList.add('is-transitioning');
    /* A travelling video is fixed on the body, so it would hang above
       both pages for the swap. Marked before the incoming page mounts
       anything of its own; the CSS does the hiding. */
    document.querySelectorAll('[data-video="component"].is-travelling')
      .forEach((el) => el.classList.add('is-page-leaving'));
    // Before the footer margin collapses below: that is the change the
    // outgoing page's triggers would react to.
    document.dispatchEvent(new CustomEvent('page:leaving'));
    closeMeganav();
    resetNav();
    restoreFooterLayer();
    captureFooterForLeave(data?.current?.container);
    FooterReveal.collapse();
    leaveDone = new Promise((resolve) => { resolveLeave = resolve; });
  });

  /* Barba appends the incoming container to [data-barba="wrapper"] —
     body — while the published markup nests it in .page_wrap, so every
     navigation after the first leaves the page one level too high: no
     perspective, above the backdrop, and losing to the footer once the
     inline styles are cleared. Moved back before anything measures it. */
  function reparentContainer(next, current) {
    const parent = current?.parentElement || document.querySelector('.page_wrap');
    if (!parent || !next || next.parentElement === parent) return;
    // insertBefore, not appendChild: .page_wrap has other children, and
    // appending relayers the page against them.
    if (current && current.parentElement === parent) parent.insertBefore(next, current);
    else parent.appendChild(next);
  }

  barba.hooks.beforeEnter((data) => {
    reparentContainer(data.next.container, data.current?.container);

    /* Only a real navigation lifts the container: on the initial load
       there is no leave timeline to clear it again, and a fixed container
       contributes no height, collapsing the page to one viewport. */
    if (data.current?.container) {
      gsap.set(data.next.container, { position: 'fixed', top: 0, left: 0, right: 0 });
      if (lenis?.stop) lenis.stop();
    }

    initBeforeEnterFunctions(data.next.container);
    syncNavFrom(data.next.container);
  });

  barba.hooks.enter((data) => {
    initBarbaNavUpdate(data);
  });

  // Runs once the outgoing container is gone, so its Swiper and
  // marquee stay alive and animating through the whole leave.
  barba.hooks.afterLeave((data) => {
    /* Scoped, never getAll().kill(): sync:true has already mounted the
       incoming page's triggers by now. Orphans go too — nothing will
       ever refresh a trigger whose element has left the document. */
    if (hasScrollTrigger) {
      ScrollTrigger.getAll().forEach((t) => {
        const el = t.trigger || t.vars?.trigger;
        if (!el || data.current.container.contains(el) || !document.contains(el)) t.kill();
      });
    }
    Modules.unmount(data.current.container);
  });

  barba.hooks.afterEnter((data) => {
    initAfterEnterFunctions(data.next.container);
    if (hasLenis && lenis) {
      lenis.resize();
      lenis.start();
    }
    if (hasScrollTrigger) ScrollTrigger.refresh();
  });


  /* Both ends of the first load: whichever of the two runs last wins, and
     both are safe to run when there is nothing to clear. */
  barba.hooks.afterOnce((data) => {
    clearContainerLayer(data.next.container);
  });

  barba.hooks.after((data) => {
    clearContainerLayer(data?.next?.container);
    // The marked one leaves with its container; this is for the swap
    // that never completes.
    document.querySelectorAll('[data-video="component"].is-page-leaving')
      .forEach((el) => el.classList.remove('is-page-leaving'));
    requestAnimationFrame(clearTransitionLeftovers);
  });

  barba.hooks.after(() => {
  FooterReveal.sync();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove('is-transitioning');
      window.__smooothyRefresh?.();
    });
  });
});

  barba.init({
    debug: true, // set false before launch
    timeout: 7000,
    preventRunning: true,

    prevent: ({ el }) => {
      if (!el) return false;
      const href = el.getAttribute('href') || '';

      /* Finsweet pages a list by clicking Webflow's own pagination
         anchor, which is a real same-origin link — so Load more ran a
         page transition. Scoped to the controls, not [fs-list-element]
         generally: the cards inside the list should still transition. */
      const paging = el.closest(
        '.w-pagination-wrapper, [fs-list-element="load-more"], ' +
        '[fs-list-element="pagination-next"], [fs-list-element="pagination-previous"], ' +
        '[fs-list-element="page-button"]'
      );
      if (paging) return true;

      return (
        el.hasAttribute('data-barba-prevent') ||
        el.getAttribute('target') === '_blank' ||
        el.hasAttribute('download') ||
        /^(mailto:|tel:)/.test(href) ||
        href.startsWith('#') ||
        el.closest('.w-editor-bem-EditSiteButton') !== null
      );
    },

    transitions: [
      {
        name: 'default',
        sync: true,

        async once(data) {
          initOnceFunctions();
          Modules.mount(data.next.container);
          Intro.play(data.next.container);
          return runPageOnceAnimation(data.next.container);
        },

        async leave(data) {
          return runPageLeaveAnimation(data.current.container, data.next.container);
        },

        async enter(data) {
          return runPageEnterAnimation(data.next.container);
        }
      }
    ]
  });

})();
