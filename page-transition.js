/* Artbox — Barba page transitions. Load after gsap, CustomEase,
   @barba/core, lenis, kugiri and swiper, before </body>: it queries the
   DOM and calls barba.init() as it parses. Docs: README. */

(function () {
  'use strict';

  /* Bump on every push: jsDelivr serves a week-old copy on a plain
     reload, and this line is the only way to tell which build is live. */
  const BUILD = '2026-09-25-hero-video-trigger';
  console.info(`[page-transition] build ${BUILD}`);

  gsap.registerPlugin(CustomEase);
  if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  history.scrollRestoration = 'manual';

  let lenis = null;
  let nextPage = document;
  let onceFunctionsInitialized = false;

  // Lets the enter step wait on the leave timeline. See runPageEnterAnimation.
  let leaveDone = null;
  let resolveLeave = null;

  const hasLenis = typeof window.Lenis !== 'undefined';
  const hasScrollTrigger = typeof window.ScrollTrigger !== 'undefined';

  const rmMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = rmMQ.matches;
  rmMQ.addEventListener?.('change', (e) => (reducedMotion = e.matches));

  const has = (s) => !!nextPage.querySelector(s);

  /* ===== EASING — curves, then a role per kind of motion — README ## Easing ===== */

  const durationDefault = 0.6;

  CustomEase.create('osmo', '0.625, 0.05, 0, 1');
  CustomEase.create('pageFade', '0.25, 0.46, 0.45, 0.94');
  CustomEase.create('menuSwipe', '0.05, 0.7, 0.1, 1');

  const EASE = {
    brand: 'osmo',
    page: 'pageFade',
    menu: 'menuSwipe'
  };

  /* Named curves. Modules ask for the gesture rather than restate its
     numbers, and the control points live in exactly one place: gsap needs
     a registered CustomEase, the Web Animations API needs a cubic-bezier
     string, and neither reads the other's. One call cuts both. */
  function namedEase(name, points) {
    CustomEase.create(name, points);
    return {
      ease: name,                        // gsap
      css: `cubic-bezier(${points})`     // WAAPI, and any stylesheet
    };
  }

  // qubicL and qubicXL: one curve at two speeds.
  const QUBIC = Object.assign(namedEase('qubic', '0.65, 0.05, 0.36, 1'), {
    xl: 1.2,
    l: 0.8
  });


  const INOUT_MASK = Object.assign(namedEase('inoutMask', '0.65,0.05,0.36,1'), {
    duration: 1.0
  });

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
    qubic: QUBIC.ease,        // the named curve, whatever speed the caller wants
    /* inOutQuart, the curve the text sections fade their buttons on.
       gsap counts from Quad, so the quartic is power3 — not power4. */
    quart: 'power3.inOut',
    page: EASE.page,
    menuSheet: EASE.menu
  };

  // Scrubbed tweens keep ease:'none' at the call site: scroll position
  // is their timing, and easing it twice reads as lag.
  gsap.defaults({ ease: EASE.brand, duration: durationDefault });

  const FADE = {
    duration: 1,
    blur: 5,          // px, on both layers
    ease: E.page
  };


  /* ===== MODULE REGISTRY — README ## Modules ===== */

  // Keyed by container: sync:true means both pages are mounted at once,
  // so one shared cleanup list tears down the wrong page.

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


  /* ===== INTRO QUEUE — README ### Intro timings ===== */

  // Mount is at beforeEnter, where the container is still a fixed 100vh
  // rectangle: an intro started there plays behind the transition.
  // Queued timelines run once the page is laid out for real.

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


  /* ===== ATTRIBUTE-DRIVEN LAYOUT ===== */

  // Was three inline scripts in sections: a script tag inside the swapped
  // container never executes. Delete those embeds in the Designer, or they
  // run a second time on first load.

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

  /* The same arrangement testimonialColours has: the stylesheet reads the
     attribute with typed attr(), which is Chrome only, and this writes
     the variable inline for everywhere else. Inline wins, so the two
     never disagree.

     It matters more here than there. A browser without typed attr() does
     not drop the declaration — a custom property takes any tokens, so
     --scale-to held the attr() text verbatim, scale() was handed that,
     and the whole transform was thrown out at computed time. The 1.04
     inside var() only covers a property nobody set, and this one was set
     to nonsense: Safari and Firefox never leaned at all. */
  Modules.add('hoverScale', function (root) {
    root.querySelectorAll('[data-scale]').forEach((el) => {
      const raw = (el.getAttribute('data-scale') || '').trim();
      const value = Number.parseFloat(raw);
      // An empty attribute is the usual case: it marks the picture and
      // takes the house number.
      el.style.setProperty('--scale-to', Number.isFinite(value) ? value : 1.04);
    });
  });

  /* ===== CARD LOGOS — README ### cardLogos ===== */

  /* Same ink for every logo, rather than the same height. A stacked
     lockup and a horizontal wordmark set to one height read nothing
     alike — the stacked one carries about twice the mark — and the row
     came out with the wide ones looming over the small ones.

     Area is what the eye is weighing, so area is what is held: a height
     of sqrt(area / ratio) gives every logo the same number of pixels
     whatever shape it is. The clamps stop the extremes — a very wide
     wordmark would otherwise be a hairline, and a square mark taller
     than the row it sits in.

     data-logo-scale on the embed nudges one that still reads heavy or
     light. Ink density is not in the ratio: an outline mark can take
     more size than a solid one, and no number here knows that. */
  const CARD_LOGO = {
    area: 4200,       // px² of logo, before the clamps
    minHeight: 22,    // px, the floor for a very wide wordmark
    maxHeight: 64,    // px, the row itself
    maxWidth: 210     // px, so a hairline logo cannot run the card's width
  };

  Modules.add('cardLogos', function (root) {
    const holders = root.querySelectorAll('.card_hover_logo_svg');
    if (!holders.length) return;

    const touched = [];

    holders.forEach((holder) => {
      const svg = holder.querySelector('svg');
      if (!svg) return;

      /* The viewBox, not the rendered box: the rendered one is whatever
         the last rule did to it, and this runs before any of that
         settles. */
      const box = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      const ratio = box.length === 4 && box[2] > 0 && box[3] > 0 ? box[2] / box[3] : 0;
      if (!ratio) return;

      const nudge = Number.parseFloat(holder.getAttribute('data-logo-scale'));
      const area = CARD_LOGO.area * (Number.isFinite(nudge) ? nudge * nudge : 1);

      let height = Math.sqrt(area / ratio);
      height = Math.min(CARD_LOGO.maxHeight, Math.max(CARD_LOGO.minHeight, height));
      // A wide one can still reach the cap; the width decides then.
      if (height * ratio > CARD_LOGO.maxWidth) height = CARD_LOGO.maxWidth / ratio;

      svg.style.height = `${Math.round(height)}px`;
      svg.style.width = 'auto';
      svg.style.maxHeight = 'none';
      svg.style.maxWidth = '100%';
      touched.push(svg);
    });

    if (!touched.length) return;

    return () => touched.forEach((svg) => {
      svg.style.removeProperty('height');
      svg.style.removeProperty('width');
      svg.style.removeProperty('max-height');
      svg.style.removeProperty('max-width');
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

  /* ===== SMOOTHLY — .work_smoothly_wrap — README ### smooothy ===== */

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

  /* ===== TEXT REVEAL — [data-text-anim] — README ### textAnim ===== */

  /* kugiri splits, the Web Animations API animates. No gsap in this
     module on purpose: every unit's cue is a number worked out before
     anything moves, which a WAAPI delay states directly, and the reveal
     then runs off the main thread while gsap is busy with the swap. */

  const TEXT = {
    stagger: 0.15,          // between cards under [data-text-anim-stagger]
    overlap: 0.4,           // step overlap when the attribute carries no value
    start: '-20%',          // observer margin: fires at 80% of the viewport

    /* How far a mask's clip opens past the box, kugiri's mask reach.
       Descenders and Å sit outside a leading set tighter than the glyphs,
       and a clip cut to the line box alone shears them at rest. */
    reach: '0.3em',

    /* And how far a parked unit clears the window on top of that. The same
       ink the reach exists for hangs above a unit's own box, so a unit
       parked by the reach alone hangs it back into the window — an Å ring
       showing along the mask's edge before the line has moved. Lower it if
       the travel reads as too far; 0 puts the ring back. */
    parkCushion: '0.3em',

    /* One curve and one duration across the three line roles: a heading
       and the paragraph under it read as the same gesture, and three
       near-identical eases only made them drift. */
    headingDuration: 1.0,
    headingStagger: 0.16,
    headingEase: QUBIC.css,

    bodyDuration: 0.4,
    bodyStagger: 0.08,
    bodyEase: QUBIC.css,

    listDuration: 0.4,
    listStagger: 0.06,
    listEase: QUBIC.css,

    /* -solo is one line standing on its own — a link, an eyebrow, a
       single statement — so it takes the longer qubicL rather than the
       body's 0.4s, which is paced for a paragraph of lines following
       each other. */
    soloDuration: QUBIC.l,
    soloStagger: 0.08,
    soloEase: QUBIC.css,

    // Smaller units, more of them: their own spacing, not the role's.
    wordStagger: 0.03,
    charStagger: 0.012,

    /* A picture set into a heading arrives exactly the way the home hero
       cells do — the numbers of hero-in / hero-scale in the CSS: an iris
       opening from its middle over 1s while it grows out of nothing over
       0.8s. Two animations on two clocks, as there, since the clip landing
       a beat after the scale is what stops the edge arriving at full size.

       It waits for its own line to land rather than riding up with it.
       The line's mask carries the type; the picture sitting in the middle
       of that line has no mask of its own, so travelling with it means
       arriving early and alone. Waiting leaves a hole in the line exactly
       the size of the picture — the wrapper is laid out either way, and a
       transform never touches layout — and the hole fills once the words
       have settled. */
    imgFrom: 0,             // scale it starts at; false turns the reveal off
    imgClip: 'inset(50% 50% 50% 50%)',   // '' for the scale alone
    imgClipDuration: 1.0,   // --hero-in-open
    imgDuration: 0.8,       // --hero-in-grow

    /* --ease-inout-mask, written out: INOUT_MASK is registered with
       qubic's control points, and the hero it has to match is not. */
    imgEase: 'cubic-bezier(0.77, 0, 0.175, 1)',

    /* How much of its line's rise the picture waits out: 1 lets the line
       land first, 0 leaves with it, and a fraction starts partway up.
       At 0.5 the line is half its time in — which on the heading's
       easing is most of the way home, so the picture opens into a line
       that is nearly settled rather than one still travelling. */
    imgAfterLine: 0.5,
    imgOffset: 0,           // after that
    imgStagger: 0.08,       // between images sharing a line

    /* [data-text-anim-icon], its own knobs rather than the image ones: a
       square beside an eyebrow is a smaller thing than a photo in a
       headline and wants a shorter, harder pop. No off switch here —
       0 is a scale, not a sentinel, since the attribute is the switch. */
    iconFrom: 0,            // scale it starts at
    iconDuration: 0.45,
    iconEase: 'cubic-bezier(0.34, 1.3, 0.64, 1)',
    iconOffset: 0,          // relative to its step's start
    iconStagger: 0.08,      // between icons in one step

    /* One-offs that cannot wear the attribute: the eyebrow square is a
       component used across the site, and the Designer writes a custom
       attribute onto every instance of it at once. Class names, scoped
       to the one section that wants the pop, leave the rest alone.
       Add a selector per one-off; an empty string is none. */
    iconAlso: '.insight_item_wrap .icon_eyebrow_item',

    /* Cells whose top border is drawn with the text inside them rather
       than on a trigger of its own: the line sets off with the first step
       in the cell, so cells whose text starts together draw together.
       The drawing is [data-rule]'s — see RULE. */
    ruleWith: '.challenges_points_cell',

    /* -with holds here only while the two cells are side by side. These
       layouts stack at a breakpoint, and stacked, each cell waits its
       turn. Everywhere else -with pairs as written. */
    withRow: '.challenges_points_inner',

    // Unsplit fallback: -split="none", and every role with no kugiri.
    blockFromY: 30,         // % of its own height
    soloFromY: 14,          // -solo is one line, where 30% is a big move

    /* A fade has no distance to cover, so it does not borrow the clock a
       travel needs: -fade steps run on these instead of their role's.

       The curve is written out rather than taken from INOUT_MASK, which
       is registered in this file with qubic's control points — the two
       names disagree at the moment, and a button quietly following that
       disagreement is not worth the tidiness. */
    fadeDuration: 0.45,
    fadeEase: 'cubic-bezier(0.77, 0, 0.175, 1)',   // inOutQuart

    blur: false,            // layers onto the existing keyframes, not a mode
    headingBlur: 10,        // px per line
    bodyBlur: 8,            // px

    fontWait: 1.5,          // s before splitting without the webfont
    resplit: 0.15           // s a resize drag has to settle
  };

  /* The attribute, plus whatever one-offs TEXT.iconAlso names. Both are
     read the same way everywhere: kugiri is told to leave them alone, and
     revealIcons gives them the step's cue. */
  const ICONS = ['[data-text-anim-icon]', TEXT.iconAlso]
    .filter(Boolean).join(', ');

  /* ===== SEQUENCE — the cadence of a composed item ===== */

  /* A list item is several things arriving one after another — its rule,
     then the link, then the heading, then the body. Written as named
     slots rather than as a delay per element: the shape of the sequence
     lives here in two numbers, and the markup only says which part a
     thing is. Reorder by renumbering, retime by moving `step`.

     `data-slot="heading"` on the element, or a bare number for a place
     the table has no name for. Read by textAnim and by ruleReveal. */
  const SEQUENCE = {
    lead: 0.4,   // after the trigger before the first part moves

    /* A hair, not a beat: the text goes with its line rather than after
       it. Measured off the reference, where the two are 3-45ms apart —
       close enough to read as one gesture, far enough that the line
       still leads. The pairs are what the list then marches through. */
    step: 0.05,  // between one part and the next

    item: 0.6,   // between one item of a [data-seq] list and the next

    slots: {
      rule: 0,
      /* A component whose text is one marked wrapper has a single part
         here, whatever it holds: the tailored list items carry their
         heading and paragraph as one solo step, so `text` is the whole
         block and the names below it are for items that split theirs. */
      text: 1,
      link: 1,
      heading: 2,
      body: 3
    }
  };

  function slotCue(el) {
    const raw = ((el && el.dataset && el.dataset.slot) || '').trim();
    if (!raw) return null;
    const named = SEQUENCE.slots[raw.toLowerCase()];
    const n = Number.isFinite(named) ? named : parseFloat(raw);
    return Number.isFinite(n) ? SEQUENCE.lead + n * SEQUENCE.step + itemCue(el) : null;
  }

  /* A list marked [data-seq] runs as one cascade rather than as a row of
     separate reveals: its items are cued off the list, each a further
     SEQUENCE.item along, so the parts interleave — first item's rule,
     first item's text, second item's rule, and so on — instead of every
     rule going at once and every text after them.

     The list is also what triggers, since a per-item trigger would put
     the fifth item's offset after the moment it came into view, which is
     five items' worth of waiting for a reveal already on screen. */
  function seqList(el) {
    return el && el.closest ? el.closest('[data-seq]') : null;
  }

  function itemCue(el) {
    const list = seqList(el);
    if (!list) return 0;
    const items = Array.from(list.children);
    const i = items.findIndex((item) => item === el || item.contains(el));
    return i > 0 ? i * SEQUENCE.item : 0;
  }

  // ?blur=1 / ?blur=0 overrides on a live URL.
  const blurParam = new URLSearchParams(location.search).get('blur');
  const BLUR = blurParam === '1' ? true : blurParam === '0' ? false : TEXT.blur;

  const TEXT_DEBUG = new URLSearchParams(location.search).get('textdebug') === '1';

  const hasKugiri = typeof window.kugiri !== 'undefined';

  let kugiriWarned = false;
  function warnNoKugiri() {
    if (kugiriWarned) return;
    kugiriWarned = true;
    console.warn(
      '[text-anim] kugiri is not loaded, so every marked element is rising as ' +
      'one block instead of line by line. Add ' +
      '<script src="https://raw.githack.com/aquaNeon/artbox-page-code/main/kugiri.global.js"><\/script> ' +
      'to the Webflow footer embed, above page-transition.js, and publish.'
    );
  }

  const ROLES = ['heading', 'body', 'solo', 'list'];
  const ROLE_SELECTOR = ROLES.map((r) => `[data-text-anim-${r}]`).join(', ');

  /* Webflow writes the attribute with a value, and a component switched off
     in the Designer arrives as "false" rather than as no attribute at all.
     Presence alone would read that as on. */
  const markedAs = (el, role) => {
    const raw = el.getAttribute(`data-text-anim-${role}`);
    return raw !== null && raw.trim().toLowerCase() !== 'false';
  };

  const isMarked = (el) => ROLES.some((r) => markedAs(el, r));

  const roleOf = (el) => ROLES.find((r) => markedAs(el, r)) || 'solo';

  function roleTiming(role) {
    if (role === 'heading') {
      return {
        duration: TEXT.headingDuration, stagger: TEXT.headingStagger,
        ease: TEXT.headingEase, blur: TEXT.headingBlur, fromY: TEXT.blockFromY
      };
    }
    if (role === 'list') {
      return {
        duration: TEXT.listDuration, stagger: TEXT.listStagger,
        ease: TEXT.listEase, blur: TEXT.bodyBlur, fromY: TEXT.blockFromY
      };
    }
    if (role === 'solo') {
      return {
        duration: TEXT.soloDuration, stagger: TEXT.soloStagger,
        ease: TEXT.soloEase, blur: TEXT.bodyBlur, fromY: TEXT.soloFromY
      };
    }
    return {
      duration: TEXT.bodyDuration, stagger: TEXT.bodyStagger,
      ease: TEXT.bodyEase, blur: TEXT.bodyBlur, fromY: TEXT.blockFromY
    };
  }

  const LEVELS = ['lines', 'words', 'chars', 'none'];

  function splitLevel(el) {
    if (!hasKugiri) return 'none';
    const raw = (el.dataset.textAnimSplit || '').trim();
    return LEVELS.includes(raw) ? raw : 'lines';
  }

  const levelStagger = (level, base) => (
    level === 'words' ? TEXT.wordStagger : level === 'chars' ? TEXT.charStagger : base
  );

  function stepOverlap(el) {
    const raw = el.dataset.textAnimHeading || el.dataset.textAnimBody
      || el.dataset.textAnimSolo || el.dataset.textAnimList;
    const val = parseFloat(raw);
    return Number.isFinite(val) && val >= 0 ? val : TEXT.overlap;
  }

  // Applied to that step's own durations rather than to its cue, so it
  // reads the same way as the group root's number.
  function stepSpeed(el) {
    const v = parseFloat(el.dataset.textAnimSpeed);
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  function stepDelay(el, wrap) {
    if (el === wrap) return 0; // the root's delay is the group delay
    const v = parseFloat(el.dataset.textAnimDelay);
    if (Number.isFinite(v) && v > 0) return v;
    /* A slot on a step is measured from the group's start, not added to
       where the step before it happened to end — that is the point of
       naming places rather than gaps. The chain's own cue is subtracted
       back out in scheduleGroup. */
    const slot = slotCue(el);
    return Number.isFinite(slot) ? slot : 0;
  }

  /* Opacity only: nothing travels and nothing is clipped. Read off the
     group root as well as the step, so one attribute fades a whole block,
     and parsed like the role markers because a Webflow component switched
     off in the Designer arrives as "false" rather than as no attribute. */
  function fadeOn(el, wrap) {
    const on = (node) => {
      const raw = node.getAttribute('data-text-anim-fade');
      return raw !== null && raw.trim().toLowerCase() !== 'false';
    };
    return on(el) || (el !== wrap && on(wrap));
  }

  /* The mask window opens past the line box by the reach, so a unit parked
     at exactly 100% still shows that much of itself — and its tall ink sits
     above its box, so it needs the cushion on top. Measured per unit: an em
     is the unit's own font size, not the wrapper's, and a wrapper around an
     h2 sits at 16px while the glyphs are 60. */
  function parkOffset(unit) {
    const fontSize = parseFloat(getComputedStyle(unit).fontSize) || 16;
    const px = (value) => {
      const raw = String(value).trim();
      const n = parseFloat(raw) || 0;
      return raw.endsWith('em') ? n * fontSize : n;
    };
    const clear = px(TEXT.reach) + px(TEXT.parkCushion);
    return 100 + (clear / (unit.offsetHeight || 1)) * 100 + 2; // 2% covers rounding
  }

  /* One kugiri call per level, not per element: a call plans all of its
     targets against one clean layout before it writes any of them, where
     a loop would force a reflow per heading. */
  function splitSteps(steps) {
    const byLevel = new Map();
    steps.forEach((step) => {
      if (step.level === 'none') return;
      const list = byLevel.get(step.level) || [];
      list.push(step);
      byLevel.set(step.level, list);
    });

    byLevel.forEach((list, level) => {
      const splits = window.kugiri.splitText(list.map((step) => step.el), {
        type: [level],
        mask: { [level]: TEXT.reach },
        // Both belong to another module, which animates them itself.
        ignore: `[data-swap], [data-text-anim-ignore], ${ICONS}`,
        classes: {
          lines: 'text-anim_line',
          words: 'text-anim_word',
          chars: 'text-anim_char',
          mask: 'text-anim_mask'
        }
      });
      list.forEach((step, i) => {
        step.split = splits[i];
        step.units = splits[i][level];
        fitToContainer(step);
      });
    });
  }

  /* A line is an element, so splitting a grid or flex heading turns its
     lines into items and the container places them: a centred grid centres
     each line to its own width, a row flex sets them side by side. Both read
     as the text moving on its own. Sized to fill instead, they sit where the
     line boxes did. Which property does that depends on the container, which
     is why this is here and not a stylesheet rule. */
  function fitToContainer(step) {
    const el = step.el;
    const kids = (step.split.masks.length ? step.split.masks : step.units)
      .filter((node) => node.parentElement === el);
    if (!kids.length) return;

    const style = getComputedStyle(el);
    if (style.display.includes('grid')) {
      kids.forEach((kid) => { kid.style.justifySelf = 'stretch'; });
      return;
    }
    if (!style.display.includes('flex')) return;

    if (style.flexDirection.startsWith('row')) {
      // Lines are rows of their own, not columns beside each other.
      el.style.flexWrap = 'wrap';
      step.wrapped = true;
      kids.forEach((kid) => { kid.style.flexBasis = '100%'; });
    } else {
      kids.forEach((kid) => { kid.style.alignSelf = 'stretch'; });
    }
  }

  function planGroup(wrap) {
    // Nested groups: a marked element belongs to its nearest root only.
    const selfMarked = isMarked(wrap) ? [wrap] : [];
    const candidates = [
      ...selfMarked,
      ...Array.from(wrap.querySelectorAll(ROLE_SELECTOR))
        .filter(isMarked)
        .filter((el) => el.closest('[data-text-anim]') === wrap)
        // [data-swap] elements belong to that module: both animate the
        // same transform, and the loser is left parked out of place.
        .filter((el) => !el.closest('[data-swap]'))
    ];

    /* One marker per piece of text. A Webflow component carries its
       attribute everywhere it is placed, so a marked paragraph lands
       inside a wrapper that is marked too — and then the outer target has
       nothing left to cut, since the inner split already took the text.
       It splits to zero units, falls back to a block rise, and that rise
       runs against the inner reveal. The outer marker wins. */
    const set = new Set(candidates);
    const displaced = new Map(); // outer element -> inner markers it covers
    const marked = candidates.filter((el) => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (set.has(node)) {
          const list = displaced.get(node) || [];
          list.push(el);
          displaced.set(node, list);
          return false;
        }
        if (node === wrap) break;
      }
      return true;
    });
    /* -with and -fade modify a step, they do not make one: an element
       carrying only those is not a candidate, and a group of nothing but
       those is skipped whole — which looks like the reveal breaking
       rather than like markup missing its role marker. */
    const orphans = Array.from(wrap.querySelectorAll('[data-text-anim-with], [data-text-anim-fade]'))
      // A nested group root carries -fade for its own steps, like this one.
      .filter((el) => !isMarked(el) && !el.hasAttribute('data-text-anim'));
    if (orphans.length) {
      console.warn(
        '[text-anim] -with / -fade only modify a step, so these elements do ' +
        'nothing: add a role marker (data-text-anim-heading, -body, -solo or ' +
        '-list) to each. -fade on the group root is the one exception, and ' +
        'it applies to the steps under it.',
        orphans
      );
    }

    if (!marked.length) return null;

    const speed = parseFloat(wrap.dataset.textAnim);
    const rawDelay = parseFloat(wrap.dataset.textAnimDelay);
    // An explicit delay is face value; a slot is a place in the sequence.
    const slot = slotCue(wrap);

    return {
      wrap,
      speed: Number.isFinite(speed) && speed > 0 ? speed : 1,
      delay: Number.isFinite(rawDelay) && rawDelay > 0
        ? rawDelay
        : (Number.isFinite(slot) ? slot : 0),
      cardOffset: 0,
      steps: marked.map((el) => ({
        el,
        role: roleOf(el),
        level: splitLevel(el),
        split: null,
        units: [],
        displaced: displaced.get(el) || []
      }))
    };
  }

  // TEXT.withRow: sharing a row is sharing some of the same height.
  function besideLast(el, last) {
    if (!last || !TEXT.withRow || !el.matches(TEXT.withRow)) return true;
    const a = el.getBoundingClientRect();
    const b = last.getBoundingClientRect();
    return a.top < b.bottom && b.top < a.bottom;
  }

  /* Cues for one group, in group-local seconds. Read after the split and
     before any keyframe: parking a unit needs its height, and measuring
     them all here keeps the play pass free of layout reads. */
  function scheduleGroup(group) {
    let cursor = 0;      // where the last step ends
    let lastStart = 0;   // where it began, for -with to line up against
    let lastEl = null;   // and what it was, for TEXT.withRow
    let first = true;

    group.steps.forEach((step) => {
      const timing = roleTiming(step.role);
      const speed = stepSpeed(step.el);
      const delay = stepDelay(step.el, group.wrap);

      step.ease = timing.ease;
      step.blur = timing.blur;
      step.fromY = timing.fromY;
      step.duration = timing.duration / speed;
      step.stagger = levelStagger(step.level, timing.stagger) / speed;
      step.fade = fadeOn(step.el, group.wrap);
      if (step.fade) {
        step.duration = TEXT.fadeDuration / speed;
        step.ease = TEXT.fadeEase;
      }
      // Parking is a layout read per unit, and a fade never leaves home.
      step.park = step.fade ? [] : step.units.map(parkOffset);

      /* Overlap pulls a step earlier, delay pushes it later, and a step
         can carry both: resolved to one signed offset here, since two
         stacked cues would depend on which was written first. */
      if (Number.isFinite(slotCue(step.el))) {
        // Placed at its slot, whatever ran before it.
        step.start = delay;
        first = false;
      } else if (first) {
        step.start = delay;
        first = false;
      } else if (step.el.hasAttribute('data-text-anim-with') && besideLast(step.el, lastEl)) {
        // -with runs alongside the step before it, from that step's own
        // start rather than from the end of everything so far.
        step.start = lastStart + delay;
      } else {
        step.start = Math.max(0, cursor + delay - stepOverlap(step.el));
      }

      lastStart = step.start;
      lastEl = step.el;
      const spread = Math.max(0, step.units.length - 1) * step.stagger;
      cursor = step.start + spread + step.duration;
    });

    /* The group's own number is a rate, so it scales the gaps between
       steps as well as the steps. The group delay and the card offset are
       dead air before any of that and stay as written. */
    const factor = 1 / group.speed;
    group.steps.forEach((step) => {
      step.start *= factor;
      step.duration *= factor;
      step.stagger *= factor;
    });
    group.duration = cursor * factor;
  }

  function unitKeyframes(step, park) {
    const from = step.fade ? { opacity: 0 } : { transform: `translateY(${park}%)` };
    const to = step.fade ? { opacity: 1 } : { transform: 'none' };
    if (BLUR) {
      from.filter = `blur(${step.blur}px)`;
      to.filter = 'blur(0px)';
    }
    return [from, to];
  }

  /* The wrapper scales, not the img: the frames are aspect-ratio boxes
     with object-fit:cover, so scaling the picture alone shows the frame's
     background around a shrunken photo. */
  function revealImages(step, base) {
    if (TEXT.imgFrom === false) return [];
    const anims = [];
    step.units.forEach((unit, i) => {
      const imgs = Array.from(unit.querySelectorAll('img'));
      if (!imgs.length) return;
      const targets = imgs.map((img) => (
        img.parentElement && img.parentElement !== unit ? img.parentElement : img
      ));
      targets.forEach((target, j) => {
        target.style.transformOrigin = 'center center';

        const lineAt = base + step.start + i * step.stagger;
        /* true and false still mean all of it and none of it, so a
           number is the only new spelling. */
        const share = TEXT.imgAfterLine === true ? 1
          : TEXT.imgAfterLine === false ? 0
          : Number(TEXT.imgAfterLine) || 0;
        const cue = lineAt + step.duration * share
          + TEXT.imgOffset + j * TEXT.imgStagger;
        const timing = { delay: cue * 1000, easing: TEXT.imgEase, fill: 'backwards' };

        anims.push(target.animate(
          [{ transform: `scale(${TEXT.imgFrom})` }, { transform: 'none' }],
          { ...timing, duration: TEXT.imgDuration * 1000 }
        ));
        if (TEXT.imgClip) {
          // Both ends four values, or there is no shape to interpolate
          // between and it snaps at the end.
          anims.push(target.animate(
            [{ opacity: 0, clipPath: TEXT.imgClip }, { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }],
            { ...timing, duration: TEXT.imgClipDuration * 1000 }
          ));
        }
      });
    });
    return anims;
  }

  /* An icon beside the text is not text: kugiri walks past it, so it has
     no line to ride the way an inline heading image does, and it would
     otherwise pop in whole at the step's start while the text staggers.
     It takes the step's own cue — scaling up, or fading where the step
     fades, so the two land on the same frame rather than near it. */
  function revealIcons(step, base) {
    if (!step.units.length) return []; // a block rise already carries it

    return Array.from(step.el.querySelectorAll(ICONS)).map((icon, j) => {
      if (step.fade) {
        return icon.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: step.duration * 1000,
          delay: (base + step.start + j * step.stagger) * 1000,
          easing: step.ease,
          fill: 'backwards'
        });
      }
      /* -icon="x" wipes across from its left edge instead of growing out
         of its middle — the move the tab progress bar makes. Any other
         value, "true" from Webflow included, scales both ways. */
      const wipe = (icon.getAttribute('data-text-anim-icon') || '').trim().toLowerCase() === 'x';
      icon.style.transformOrigin = wipe ? 'left center' : 'center center';
      const start = wipe ? `scaleX(${TEXT.iconFrom})` : `scale(${TEXT.iconFrom})`;

      return icon.animate([{ transform: start }, { transform: 'none' }], {
        duration: TEXT.iconDuration * 1000,
        delay: (base + step.start + TEXT.iconOffset + j * TEXT.iconStagger) * 1000,
        easing: TEXT.iconEase,
        fill: 'backwards'
      });
    });
  }

  /* -split="none", and every role when kugiri never landed: the element
     rises whole. Transforms do not apply to display:inline, and a Webflow
     Link is inline — it would fade but never move. */
  function blockRise(step, base) {
    const el = step.el;
    // Only the travel needs a block box. Opacity applies to inline as it is.
    if (!step.fade && getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
    const from = step.fade ? { opacity: 0 } : { transform: `translateY(${step.fromY}%)`, opacity: 0 };
    const to = step.fade ? { opacity: 1 } : { transform: 'none', opacity: 1 };
    if (BLUR) {
      from.filter = `blur(${step.blur}px)`;
      to.filter = 'blur(0px)';
    }
    return [el.animate([from, to], {
      duration: step.duration * 1000,
      delay: (base + step.start) * 1000,
      easing: step.ease,
      fill: 'backwards'
    })];
  }

  function playGroup(group) {
    const base = group.delay + group.cardOffset;
    const anims = [];

    group.steps.forEach((step) => {
      // Hidden since mount, so nothing shows before its keyframes exist.
      step.el.style.visibility = '';
      if (step.rule) drawRule(step.rule, base + step.start);

      /* A fade has nothing to hide, and a clip left on for its length
         still shears the descenders it was padded to clear. */
      if (step.fade) unclipStep(step);

      if (!step.units.length) {
        anims.push(...blockRise(step, base));
        return;
      }

      step.units.forEach((unit, i) => {
        anims.push(unit.animate(unitKeyframes(step, step.park[i]), {
          duration: step.duration * 1000,
          delay: (base + step.start + i * step.stagger) * 1000,
          easing: step.ease,
          // Parked out of sight until its turn, at rest once it is done.
          fill: 'backwards'
        }));
      });

      anims.push(...revealIcons(step, base));
      if (step.role === 'heading') anims.push(...revealImages(step, base));
    });

    return anims;
  }

  // Where a group ends up: visible, unclipped, nothing animating. Also
  // where one starts when the reveal is not worth playing.
  function showAtRest(group) {
    group.steps.forEach((step) => { step.el.style.visibility = ''; });
    releaseMasks(group);
  }

  // A clip cuts at rest too — descenders, a focus ring, a hover lift — so
  // it comes off once the group it belongs to has finished moving.
  /* kugiri's reach widens a mask window vertically and leaves it flush
     with the line box on both sides. Text never needs the slack, but a
     picture set into a line does: an inline-block at the end of a line
     can sit past the box the split measured, so it is cut while the
     reveal runs and snaps to full width the moment the masks are
     released. A width glitch, exactly at the end.

     Horizontal slack costs nothing — lines are stacked, so nothing else
     is out there to show through — and the vertical value, which is the
     one doing the work, is left exactly as kugiri wrote it. */
  function widenMasks(split) {
    split?.masks?.forEach((mask) => {
      const clip = mask.style.clipPath;
      if (!clip) return;
      /* The horizontal value is the last one before the bracket, and the
         vertical one is whatever kugiri wrote — a calc(), usually, which
         is why this replaces the tail rather than parsing the shape. */
      const widened = clip.replace(/\s+[^\s)]+\)\s*$/, ' -100vw)');
      if (widened !== clip) mask.style.clipPath = widened;
    });
  }

  function releaseMasks(group) {
    group.steps.forEach(unclipStep);
  }

  function unclipStep(step) {
    const splits = [step.split, ...(step.extra || [])];
    splits.forEach((split) => split?.masks.forEach((mask) => {
      mask.style.clipPath = 'none';
    }));
  }

  function fontsReady() {
    if (!document.fonts?.ready) return Promise.resolve();
    /* A webfont that swaps after the split re-wraps text already cut, and
       the lines land on top of each other. The race is for the font that
       never arrives at all. */
    return Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, TEXT.fontWait * 1000))
    ]);
  }

  /* The stylesheet holds anything wearing a step attribute at opacity 0
     from before the first paint, and textAnim drops that hold as it takes
     the element over. A step with no [data-text-anim] root above it is
     never taken over by anybody — so the hold ran its full three seconds
     and the text plopped in when it expired, unannounced and unanimated.
     Blank then sudden is worse than never animating at all.

     Released here, so a forgotten root costs the animation and nothing
     else. Document-wide because the nav and the footer live outside the
     swapped container, and their own reveals write opacity too — a hold
     still running would swallow those the same way. */
  const HOLD_STEPS = [
    'heading', 'solo', 'body', 'list'
  ].map((k) => `[data-text-anim-${k}]:not([data-text-anim-${k}="false"])`).join(',');

  let warnedOrphans = false;

  function releaseOrphanHolds() {
    const orphans = Array.from(document.querySelectorAll(HOLD_STEPS))
      .filter((el) => !el.closest('[data-text-anim]'));
    if (!orphans.length) return;

    orphans.forEach((el) => { el.style.animation = 'none'; });

    if (!warnedOrphans) {
      warnedOrphans = true;
      console.warn(
        `[textAnim] ${orphans.length} marked element(s) have no [data-text-anim] ` +
        'root above them, so nothing animates them — add the root to the wrapper, ' +
        'or drop the attribute. First one:', orphans[0]
      );
    }
  }

  Modules.add('textAnim', function (root) {
    releaseOrphanHolds();

    const staggerWraps = Array.from(root.querySelectorAll('[data-text-anim-stagger]'));
    const allGroups = Array.from(root.querySelectorAll('[data-text-anim]'));
    if (!staggerWraps.length && !allGroups.length) return;
    // Nothing hidden and nothing split: the text is simply already there.
    if (reducedMotion) return;
    if (!hasKugiri) warnNoKugiri();

    const instances = [];
    const handled = new Set();

    staggerWraps.forEach((repeater) => {
      const groups = Array.from(repeater.querySelectorAll('[data-text-anim]'));
      if (!groups.length) return;

      const stagger = parseFloat(repeater.dataset.textAnimStagger) || TEXT.stagger;
      const planned = [];

      groups.forEach((wrap, i) => {
        handled.add(wrap);
        const group = planGroup(wrap);
        if (!group) return;
        group.cardOffset = i * stagger;
        planned.push(group);
      });

      if (planned.length) instances.push({ trigger: repeater, groups: planned });
    });

    allGroups.forEach((wrap) => {
      if (handled.has(wrap)) return;
      const group = planGroup(wrap);
      if (group) instances.push({ trigger: wrap, groups: [group] });
    });

    if (!instances.length) return;

    const groups = instances.flatMap((inst) => inst.groups);
    const steps = groups.flatMap((group) => group.steps);
    const cleanups = [];
    let observer = null;
    let resizeTimer = null;
    let dead = false;

    /* Hidden at mount, before anything is measured or split: the reveal
       that would hide them is two frames and a webfont away.

       The stylesheet has been holding them at opacity 0 since before the
       first paint; that hold is dropped here, since visibility carries
       the hiding from now on and a hold left running would swallow the
       reveal when it expires. */
    steps.forEach((step) => {
      step.el.style.visibility = 'hidden';
      step.el.style.animation = 'none';
    });

    // TEXT.ruleWith: each cell's line belongs to the first step inside it.
    const rules = [];
    if (TEXT.ruleWith) {
      groups.forEach((group) => group.steps.forEach((step) => {
        const cell = step.el.closest(TEXT.ruleWith);
        if (!cell || !group.wrap.contains(cell) || rules.includes(cell)) return;
        if (!armRule(cell, 'top')) return;
        rules.push(cell);
        step.rule = cell;
      }));
    }

    /* Split at the trigger, not at intro. A group far down the page can be
       unlaid-out when the page starts — a section behind an anti-flicker
       rule, a component variant still display:none — and kugiri reads the
       lines the browser painted, so it would find nothing and the group
       would fall back to a block rise. By its own trigger it is a screen
       away and certainly laid out. Splitting per group also costs nothing
       for groups nobody scrolls to. */
    /* kugiri cuts into block containers and walks past everything else:
       grid, flex and inline-block are one piece and never units. A Webflow
       component styled as a grid is exactly that, so a marked wrapper
       around it splits its paragraphs and leaves the heading whole — with
       or without a marker of its own, since the attribute is not what
       kugiri reads. Text the wrapper's split could not reach is cut as a
       target of its own, which is the one case display does not gate, and
       its lines join the step that was reaching for them. */
    const ownText = (el) => Array.from(el.childNodes)
      .some((node) => node.nodeType === 3 && node.textContent.trim());

    const unreached = (root) => {
      const found = [];
      const visit = (node) => {
        Array.from(node.children).forEach((child) => {
          // kugiri's own output: a mask, and the unit inside it, hold text
          // that is already split. Descending into them splits it twice.
          if (child.matches('[data-mask], [data-line], [data-word], [data-char]')) return;
          if (child.querySelector('[data-line], [data-word], [data-char]')) { visit(child); return; }
          if (!child.textContent.trim()) return;
          if (child.matches('[data-swap], [data-text-anim-ignore]')) return;
          // Descend to whoever actually holds the text, not the box around it.
          if (ownText(child) || !Array.from(child.children).some((c) => c.textContent.trim())) {
            found.push(child);
          } else {
            visit(child);
          }
        });
      };
      visit(root);
      return found;
    };

    const inDocumentOrder = (a, b) => (
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );

    const rescueUnreached = (group) => {
      group.steps.forEach((step) => {
        if (step.level === 'none') return;
        const missed = unreached(step.el);
        if (!missed.length) return;

        const rescued = missed.map((el) => ({ el, level: step.level, split: null, units: [] }));
        splitSteps(rescued);

        step.extra = rescued.map((one) => one.split).filter(Boolean);
        step.units = step.units
          .concat(rescued.flatMap((one) => one.units))
          .sort(inDocumentOrder);
      });
    };

    const buildInstance = (inst) => {
      if (inst.built) return;
      inst.built = true;
      const own = inst.groups.flatMap((group) => group.steps);
      if (hasKugiri) {
        splitSteps(own);
        inst.groups.forEach(rescueUnreached);
        own.forEach((step) => {
          widenMasks(step.split);
          step.extra?.forEach(widenMasks);
        });
      }
      inst.groups.forEach(scheduleGroup);
      if (TEXT_DEBUG) {
        console.info('[text-anim] built', inst.trigger, {
          groups: inst.groups.length,
          steps: own.length,
          units: own.reduce((n, step) => n + step.units.length, 0),
          rescued: own.reduce((n, step) => n + (step.extra?.length || 0), 0),
          unsplit: own.filter((step) => !step.units.length).length,
          fade: own.filter((step) => step.fade).length
        });
      }
    };

    const play = (inst) => {
      if (inst.played || dead) return;
      inst.played = true;
      buildInstance(inst);
      inst.anims = inst.groups.flatMap(playGroup);

      if (TEXT_DEBUG) {
        const r = inst.trigger.getBoundingClientRect();
        console.info('[text-anim] fired', inst.trigger, {
          // A group taller than the viewport fires on its top edge, so
          // its lower steps can finish off-screen.
          top: Math.round(r.top),
          height: Math.round(r.height),
          viewport: window.innerHeight,
          tallerThanViewport: r.height > window.innerHeight,
          duration: Number(Math.max(
            ...inst.groups.map((g) => g.delay + g.cardOffset + g.duration)
          ).toFixed(2))
        });
      }

      /* Said out loud, so anything that wants to follow the text can wait
         for it instead of guessing at a number — a guess survives a
         reload and not a page transition, where the reveal starts
         whenever the incoming container is laid out.

         Two moments, because following text rarely means waiting for all
         of it: `textanim:last` is the final step setting off, which is
         the one to follow if the two are meant to overlap, and
         `textanim:done` is everything settled. */
      const lastCue = Math.max(0, ...inst.groups.map((g) => (
        g.delay + g.cardOffset + Math.max(0, ...g.steps.map((step) => step.start))
      )));

      const shout = (name) => {
        if (dead) return;
        inst.trigger.dispatchEvent(new CustomEvent(name, { bubbles: true }));
      };

      setTimeout(() => shout('textanim:last'), lastCue * 1000);

      Promise.allSettled(inst.anims.map((a) => a.finished)).then(() => {
        if (dead) return;
        inst.groups.forEach(releaseMasks);
        shout('textanim:done');
      });
    };

    // Already scrolled past: it has no reveal to play, so it is never split.
    const settle = (inst) => {
      if (inst.played || dead) return;
      inst.played = true;
      inst.groups.forEach(showAtRest);
      inst.groups.forEach((group) => group.steps.forEach((step) => {
        if (step.rule) step.rule.style.setProperty('--rule-scale', '1');
      }));
    };

    const observe = () => {
      if (!('IntersectionObserver' in window)) {
        // Play everything rather than leave the page blank.
        instances.forEach(play);
        return;
      }
      /* The root reaches far above the viewport on purpose. An observer
         reports threshold crossings, not positions, so a group that goes
         from below the fold to above it in one move — an anchor link, a
         restored scroll, a swipe on a phone, a tab that was in the
         background and painted no frame in between — crosses nothing and
         would stay invisible for good. Reaching upwards makes passing the
         group a crossing too; which of the two it is, is geometry. */
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const inst = instances.find((i) => i.trigger === entry.target);
          if (!inst || !entry.isIntersecting) return;
          observer.unobserve(entry.target);
          // Wholly above the viewport: there is no reveal left to watch,
          // so it is put at rest instead of played to an empty screen.
          if (entry.boundingClientRect.bottom <= 0) settle(inst);
          else play(inst);
        });
      }, { rootMargin: `100000px 0px ${TEXT.start} 0px` });
      instances.forEach((inst) => observer.observe(inst.trigger));
    };

    /* A split is a snapshot of one layout: kugiri reads the lines the
       browser painted and does not watch for the next paint. A width
       change paints different lines, so the old ones go back and the
       text is cut again. */
    const resplit = () => {
      if (dead || !hasKugiri) return;
      instances.forEach((inst) => {
        if (!inst.built) return; // never split, nothing to put back
        inst.anims?.forEach((a) => a.cancel());
        inst.groups.forEach((group) => {
          group.steps.forEach((step) => {
            // Inside out: a rescued split sits within the outer one's
            // markup, and reverting the outer first strands it there.
            step.extra?.forEach((split) => split.revert());
            step.split?.revert();
            if (step.wrapped) step.el.style.removeProperty('flex-wrap');
            step.split = null;
            step.extra = null;
            step.units = [];
            step.wrapped = false;
          });
        });
        inst.built = false;
        buildInstance(inst);
        // Fresh units carry no keyframes, so a group that already played
        // is at rest as it stands; it only wants its clip off again.
        if (inst.played) inst.groups.forEach(showAtRest);
      });
    };

    const watchResize = () => {
      let width = window.innerWidth;
      const onResize = () => {
        if (window.innerWidth === width) return; // a taller viewport moves no wrap
        width = window.innerWidth;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resplit, TEXT.resplit * 1000);
      };
      window.addEventListener('resize', onResize, { passive: true });
      cleanups.push(() => window.removeEventListener('resize', onResize));
    };

    /* Mount hides, the intro queue starts watching: at mount the container
       is still the transition's fixed 100vh rectangle, and anything
       measured against it reads a width the page never has. */
    Intro.add(root, () => {
      fontsReady().then(() => {
        if (dead) return;
        observe();
        watchResize();
      });
    });

    return () => {
      dead = true;
      clearTimeout(resizeTimer);
      observer?.disconnect();
      cleanups.forEach((fn) => fn());
      instances.forEach((inst) => inst.anims?.forEach((a) => a.cancel()));
      // Not the mount-time list: a build can add steps for markers an outer
      // one displaced, and those hold splits of their own to put back.
      groups.flatMap((group) => group.steps).forEach((step) => {
        step.extra?.forEach((split) => split.revert()); // inside out
        step.split?.revert();
        if (step.wrapped) step.el.style.removeProperty('flex-wrap');
        step.el.style.visibility = '';
      });
      rules.forEach(disarmRule);
    };
  });


  /* ===== CTA — .cta_wrap — README ### ctaReveal ===== */

  const CTA = {
    scroll: 4.7,        // screens of section height, sticky screen included

    /* Where the section lets go on a phone, as a share of the journey.
       Not a shorter journey: every range here is measured against the
       full one, so the images travel at the rate they always did and the
       section simply stops holding them before they have all left —
       they finish on their way up with it rather than in front of it.

       Shortening the journey instead sped everything up, which is the
       one thing this was not supposed to change.

       Measured on the home page, of five images: three are still on
       screen at 0.5 of the journey, one at 0.6, and none by 0.85. At
       0.72 the section was letting go with a single straggler left,
       which reads as having waited for all of them. */
    release: 0.5,
    mobile: '(max-width: 767px)',   // mobile landscape and down

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

    /* Two numbers, not one. The journey is what every range below is
       measured against — the pace, the same at any width. The section's
       own height is how much of that journey it stays stuck for, which
       is all of it on a desktop and CTA.release of it on a phone. */
    const phone = window.matchMedia(CTA.mobile);
    const held = () => (phone.matches ? CTA.release : 1);
    const setLength = () => section.style.setProperty(
      '--cta-scroll',
      `${((CTA.scroll - 1) * held() + 1) * 100}vh`
    );
    setLength();

    // Crossing the breakpoint changes the section's height, and every
    // trigger below it is measured against a document that just moved.
    const onBreakpoint = () => {
      setLength();
      if (hasScrollTrigger) ScrollTrigger.refresh();
    };
    phone.addEventListener?.('change', onBreakpoint);

    const restore = () => {
      owned.forEach(({ el, raw }) => el.setAttribute('data-parallax', raw));
      clipped.forEach((el) => el.style.removeProperty('clip-path'));
      tint.remove();
      section.style.removeProperty('--cta-scroll');
      phone.removeEventListener?.('change', onBreakpoint);
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

    /* The journey: everything past the one screen the frame occupies,
       and the same on every screen. The section may let go partway
       through it — see held() — but nothing here is measured against
       that, or the images would cross the screen faster on a phone. */
    const pin = () => window.innerHeight * (CTA.scroll - 1);

    /* The frame, not the window: they are the same number on Android and
       they are not on iOS, where the toolbar leaves innerHeight and the
       painted sticky screen disagreeing. The images are clipped to the
       frame, so a start measured against the window put them inside it —
       visible at the bottom, parked, until their tween began. */
    const screenHeight = () => frame.offsetHeight || window.innerHeight;

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
            // After anything that pins above it: pin spacing has to be
            // in the document before this is measured.
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
        const from = () => screenHeight() * CTA.lead - inFrame(el);
        const to = () => -(inFrame(el) + el.offsetHeight +
          screenHeight() * CTA.exit);

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


  /* ===== EYEBROW ICON — a square matching the type beside it ===== */

  // The size class sits on the text, so the wrap cannot do this in em:
  // the text's computed size is read and handed back as a variable.

  const EYEBROW = {
    ratio: 0.72,     // of the text's font size
    gap: 0.5,        // of the same, between square and text

    /* Same component, drawn more than once under different names. A pair
       may carry its own ratio / gap. */
    pairs: [
      { wrap: '.icon_eyebrow_wrap', text: '.icon_eyebrow_text' },
      { wrap: '.design_sticky_eyebrow', text: '.design_sticky_eyebrow_text' },
      // The footer link's icon was em-sized against the wrap, which
      // stopped working once the text carried its own size class.
      { wrap: '.footer_link_wrap', text: '.footer_link_text' },
      { wrap: '.stats_eyebrow_wrap', text: '.stats_eyebrow' },
      { wrap: '.subheading_eyebrow_wrap', text: '.subheading_text_eyebrow' },
      // 'cap' rather than a guessed fraction: the square is measured
      // against the capitals it stands beside, not the em box, which
      // carries the leading and reads too tall.
      { wrap: '.c_title_text_eyebrow_wrap', text: '.c_title_text_eyebrow', ratio: 'cap' }
    ]
  };

  /* The font's real cap height, read off a canvas: no CSS length gives
     it, and the ratio differs per family. Cached per font shorthand, and
     the ratio is the fallback wherever the measurement is unavailable. */
  const capCache = new Map();

  function capRatio(font, fallback) {
    if (capCache.has(font)) return capCache.get(font);

    let ratio = fallback;
    try {
      const ctx = (capRatio.ctx || (capRatio.ctx = document.createElement('canvas').getContext('2d')));
      ctx.font = font;
      const m = ctx.measureText('H');
      const size = parseFloat(ctx.font.match(/(\d+(?:\.\d+)?)px/)?.[1]);
      if (m && m.actualBoundingBoxAscent && size) ratio = m.actualBoundingBoxAscent / size;
    } catch (e) { /* no canvas, keep the fallback */ }

    capCache.set(font, ratio);
    return ratio;
  }

  Modules.add('eyebrowIcon', function (root) {
    const wraps = [];
    EYEBROW.pairs.forEach(({ wrap, text, ratio, gap }) => {
      root.querySelectorAll(wrap).forEach((el) => wraps.push({
        el,
        text,
        ratio: ratio == null ? EYEBROW.ratio : ratio,
        gap: gap == null ? EYEBROW.gap : gap
      }));
    });
    if (!wraps.length) return;

    const size = () => wraps.forEach(({ el: wrap, text: textSel, ratio, gap }) => {
      const text = wrap.querySelector(textSel);
      if (!text) return;
      const cs = getComputedStyle(text);
      const fs = parseFloat(cs.fontSize);
      if (!fs) return;
      const r = ratio === 'cap' ? capRatio(cs.font || `${fs}px ${cs.fontFamily}`, EYEBROW.ratio) : ratio;
      wrap.style.setProperty('--icon-size', `${fs * r}px`);
      wrap.style.setProperty('--icon-gap', `${fs * gap}px`);
    });

    size();

    // Fluid type changes with the viewport, so the square follows.
    let timer = null;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(size, 150);
    };
    window.addEventListener('resize', onResize, { passive: true });

    // The webfont was not there to measure at first paint.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
      capCache.clear();
      size();
    });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      wraps.forEach(({ el: wrap }) => {
        wrap.style.removeProperty('--icon-size');
        wrap.style.removeProperty('--icon-gap');
      });
    };
  });


  /* ===== CORPORATE HERO — mobile images ===== */

  // The heading's inline images are hidden below 992; these take their
  // place, fading in on a stagger (keyframes in the CSS) and drifting.
  // Tablet included: an iPad is wide enough to hold the inline images but
  // not to read them, and the line breaks land in the wrong places.

  const CORP_HERO = {
    breakpoint: '(max-width: 991px)',
    parallax: 40,
    depths: [1, 0.55, 0.8],

    /* The entrance, the CSS keyframes' numbers written out. It is played
       here rather than left to them because a keyframe restarts whenever
       its element moves in the DOM, and the incoming container is moved
       once per navigation — the pictures arrived, then arrived again.
       Same scar as heroVideo's intro, same answer: a tween.

       It also hands the transform back. animation-fill-mode kept the
       keyframe's scale applied for good, and an animation outranks an
       inline style, so the parallax below was writing to an element that
       could not move. */
    open: 1.0,      // --hero-in-open, the clip
    grow: 0.8,      // --corp-hero-duration, the scale
    lead: 0.15,     // --corp-hero-lead
    step: 0.1,      // --corp-hero-step

    /* --ease-inout-mask written out, as the inline heading pictures do
       it: INOUT_MASK carries qubic's control points, and the curve this
       has to match is inOutQuart. */
    ease: 'cubic-bezier(0.77, 0, 0.175, 1)'
  };

  Modules.add('corporateHero', function (root) {
    const section = root.querySelector('.corporate_wrap');
    if (!section || !hasScrollTrigger || reducedMotion) return;

    const wraps = section.querySelectorAll('.corporate_images_mobile_img_wrap');
    if (!wraps.length) return;

    const mm = gsap.matchMedia();

    // True only while mm.add's own synchronous entry is running.
    let mounting = true;

    mm.add(CORP_HERO.breakpoint, () => {
      const tweens = [];

      /* The keyframes are the fallback for a dead script; with one
         running they are in the way, so they go off while this context
         is alive and the entrance is played below. */
      const animations = Array.from(wraps).map((wrap) => wrap.style.animation);
      wraps.forEach((wrap) => { wrap.style.animation = 'none'; });

      const entrance = gsap.timeline({ paused: true });
      wraps.forEach((wrap, i) => {
        const at = CORP_HERO.lead + i * CORP_HERO.step;
        entrance
          .fromTo(wrap,
            { scale: 0 },
            { scale: 1, duration: CORP_HERO.grow, ease: CORP_HERO.ease }, at)
          .fromTo(wrap,
            { opacity: 0, clipPath: 'inset(50% 50% 50% 50%)' },
            { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)', duration: CORP_HERO.open, ease: CORP_HERO.ease }, at);
      });

      /* Mounted at beforeEnter, where the container is still a fixed
         100vh rectangle: queued, it plays once the page is laid out.
         A context entered later — someone dragging a window narrow — has
         missed that queue, and waiting for it would leave the pictures
         at scale 0 for good. */
      if (mounting) Intro.add(root, () => entrance.play());
      else entrance.play();

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

      return () => {
        entrance.kill();
        tweens.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
        wraps.forEach((wrap, i) => {
          gsap.set(wrap, { clearProps: 'transform,opacity,clipPath' });
          wrap.style.animation = animations[i] || '';
        });
      };
    });

    mounting = false;

    return () => mm.revert();
  });


  /* ===== SCROLL PARALLAX — [data-parallax] — README ### parallax ===== */

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


  /* ===== REVEALS — [data-mask], [data-grow] — README ### maskReveal ===== */

  /* A wipe down the picture as it arrives: the media is clipped to
     nothing at the top edge and the clip opens to the full box.

     clip-path rather than a wrapper with overflow and a moving child.
     The pictures already sit in wrappers that other modules own — the
     cards, the parallax groups — and a second layer inside them is a
     second thing to keep in sync with a layout that changes per
     breakpoint. A clip on the element itself touches nothing else. */

  const MASK = {
    from: 'top',          // edge the wipe starts at: top, bottom, left, right
    duration: INOUT_MASK.duration,
    ease: INOUT_MASK.ease,
    start: 'top 85%',     // ScrollTrigger start, the same reading as textAnim
    stagger: 0.12,        // between marked elements sharing a [data-mask-group]

    /* Off: the wipe is the whole gesture. Set it above 1 per element
       with data-mask-scale to have the picture settle as the clip lands
       — and leave it alone wherever the picture already carries a
       parallax or hover transform, which is the same property. */
    scaleFrom: 1,

    /* data-mask="hero" is the home hero's arrival, brought to anything
       that has to wait for a scroll: the clip opens from a line at the
       middle while the picture grows out of nothing. The numbers are the
       hero's, so the two read as one gesture wherever they meet. */
    heroScaleFrom: 0,
    heroOpen: 1,          // s the clip takes, --hero-in-open in the CSS
    heroGrow: 0.8,        // s the scale takes, --hero-in-grow

    /* data-mask-after: the run waits for the text above it to finish
       rather than for a number. */
    afterGap: 0,          // s between the last line landing and the first picture
    afterWait: 5          // s before it gives up waiting and plays anyway
  };

  /* [data-grow] — the same wipe, opening sideways from the middle and
     starting part-open rather than shut: the picture is uncovered out to
     both edges from 80% of its width.

     A clip, not a scaleX. Scaling the picture to 0.8 on one axis squashes
     it — every face in it narrows for the length of the move and springs
     back — where a clip only ever shows less of a picture that is already
     the right shape. */
  /* [data-fade] — the picture arrives out of nothing. Opacity only, so it
     stacks with anything that writes a transform: data-scale's hover lean
     is the one it will usually meet. */
  const FADE_IN = {
    duration: 0.5,
    ease: QUBIC.ease,

    /* Off unless asked for, per element or per group: data-fade is
       opacity-only by default so it can sit inside a slider or a marquee
       without meeting the transform that library is already writing.
       Asked for, the transform goes on the marked element — which in
       those components is the picture, never the slide. */
    rise: 0,   // px it travels up into place

    /* Degrees of rotationX, not Z: the top edge leans away and the
       picture straightens as it arrives, rather than the whole frame
       turning on the page. Positive is away.

       A 3D rotation is flat without something to see it through, so the
       perspective rides on the element itself — a parent would need the
       property too, and in a slider that parent belongs to the library. */
    tilt: 0,
    perspective: 900,


    /* Fired as the picture begins to enter, not scrubbed to how far it
       has come. Scrubbing looked right on paper and wrong in the hand:
       tie opacity to travel and a slow scroll leaves the picture parked
       half-lit for as long as you hold there.

       Triggered, the crawl reads the way the reference does — the two
       pixels of picture that are on screen have already faded, because
       the fade ran while there was nothing to see — and a fast scroll
       brings the whole frame in mid-fade. */
    start: 'top bottom'
  };

  const GROW = {
    from: 0.75,            // width the clip starts at, 0-1
    duration: 0.4,
    ease: INOUT_MASK.ease
  };

  const MASK_EDGES = {
    top: [0, 0, 100, 0],
    bottom: [100, 0, 0, 0],
    left: [0, 100, 0, 0],
    right: [0, 0, 0, 100],
    // Shut in the middle and opening to every edge at once.
    center: [50, 50, 50, 50],
    hero: [50, 50, 50, 50]
  };

  /* One-offs the Designer cannot reach. An attribute typed onto a
     component lands on every instance of it, and the placements that
     should stay still outnumber the one that should move — so the
     entrance is named here instead, scoped by the page rather than by
     the component. [data-barba-namespace] is on the container, which is
     page-level markup no component owns.

     Each entry is a selector and the attributes to give whatever it
     finds, exactly as if they had been typed in the Designer. Nothing
     else changes: the element is collected, cued and staggered by the
     same machinery as every hand-marked one. */
  const ADOPTED = [
    /* The whole section arrives at once, on the scroll that brings it in.
       Its parts were staggering against a wait for the text above them,
       and that section's heading is switched off — so the wait had
       nothing to hear and the cards sat out the five seconds before the
       handshake gives up. One fade on the section is the thing that was
       actually wanted, and the paragraph still plays its own lines
       inside it. */
    ['[data-barba-namespace="contact"] .reach_out_wrap',
      { 'data-fade': '', 'data-fade-start': 'top 80%',
        'data-fade-follows': '.contact_wrap' }]
  ];

  function adoptOneOffs(root) {
    ADOPTED.forEach(([selector, attrs]) => {
      let found;
      try {
        found = root.querySelectorAll(selector);
      } catch (err) {
        console.warn('[maskReveal] bad selector in ADOPTED:', selector, err);
        return;
      }
      found.forEach((el) => {
        Object.entries(attrs).forEach(([name, value]) => {
          // Never argue with the Designer: a hand-typed value wins.
          if (!el.hasAttribute(name)) el.setAttribute(name, value);
        });
      });
    });
  }

  Modules.add('maskReveal', function (root) {
    // Before anything is collected, or the marks arrive too late to count.
    adoptOneOffs(root);

    /* :not(.text-anim_mask) because kugiri numbers its own line wrappers
       with data-mask — data-mask="0" on every masked line. Nothing is
       split yet when this mounts, so the two have never actually met,
       but the day they do this module would clip the text's own windows
       shut and the lines behind them would never be seen. */
    const items = Array.from(root.querySelectorAll(
      '[data-mask]:not(.text-anim_mask), [data-grow], [data-fade], ' +
      '[data-fade-children]:not([data-fade-children="false"])'
    ));
    if (!items.length || !hasScrollTrigger || reducedMotion) return;

    const triggers = [];
    const touched = [];
    const listeners = [];

    /* The clip is written before anything is measured or scrolled: the
       trigger is a frame away at best, and an unclipped first paint is
       the whole picture flashing in ahead of its own reveal. */
    const plan = items.map((el) => {
      /* Both attributes write the same clip, so grow is a variant of the
         wipe rather than a second effect: its own edges, its own clock,
         one clip-path. Marked with both, the wipe wins — the sides would
         be writing over each other otherwise. */
      const clips = el.hasAttribute('data-mask') || el.hasAttribute('data-grow');
      const grows = el.hasAttribute('data-grow') && !el.hasAttribute('data-mask');

      /* Opacity, and nothing else. A fade shares an element with a clip
         or a hover scale without either noticing. */
      const fades = el.hasAttribute('data-fade');

      /* The children carry it, not this element: a marquee copies its
         list, and inline opacity written before that is copied with it —
         a rule in the stylesheet reaches the copies, an inline style
         never does. All this does at its cue is add the class.

         "false" counts as off, so this can be a component property: the
         attribute is then baked into every instance and the value is what
         says which placement animates. It can also sit on any ancestor —
         a section, a wrapper around one instance — since the rule that
         does the work is a descendant selector. */
      const fadesChildren = el.hasAttribute('data-fade-children')
        && el.getAttribute('data-fade-children').trim().toLowerCase() !== 'false';
      const rawFade = parseFloat(el.dataset.fade);
      const fadeDuration = Number.isFinite(rawFade) && rawFade > 0
        ? rawFade
        : FADE_IN.duration;

      /* Read off the element, then the group it sits in: a row wants one
         number, not one per picture. */
      const fadeGroup = el.closest('[data-fade-group]');
      const num = (key, fallback) => {
        const own = parseFloat(el.dataset[key]);
        if (Number.isFinite(own)) return own;
        const shared = fadeGroup && parseFloat(fadeGroup.dataset[key]);
        return Number.isFinite(shared) ? shared : fallback;
      };
      const fadeRise = num('fadeRise', FADE_IN.rise);
      const fadeTilt = num('fadeTilt', FADE_IN.tilt);

      /* Asked for and never assumed. A picture that travels leaves its
         box uncovered at one edge, and an overscale is the fix — but it
         crops the picture for the length of the move, so it is the
         caller's call, not this module's. */
      const ownZoom = num('fadeZoom', 0);
      const fadeZoom = ownZoom > 0 ? ownZoom : 1;
      const key = (el.dataset.mask || '').trim().toLowerCase();

      /* The hero gesture is a centre iris and a scale together, on the
         hero's own clocks — one attribute rather than three, since it is
         a thing the site does rather than a set of numbers. */
      const hero = key === 'hero';

      const rawGrow = parseFloat(el.dataset.grow);
      const growFrom = Number.isFinite(rawGrow) ? rawGrow : GROW.from;
      const side = Math.max(0, (1 - growFrom) / 2) * 100;

      const edges = grows
        ? [0, side, 0, side]
        : (MASK_EDGES[key] || MASK_EDGES[MASK.from]);

      const duration = grows ? GROW.duration : (hero ? MASK.heroOpen : MASK.duration);
      const ease = grows ? GROW.ease : MASK.ease;

      /* Corners come from the element itself: inset() clips to a
         rectangle, so a rounded picture squares off for the length of
         the wipe unless the radius rides along. */
      const radius = getComputedStyle(el).borderRadius;
      const round = radius && radius !== '0px' ? ` round ${radius}` : '';

      /* Written from a number every frame rather than tweened as a
         string. gsap interpolates two clip-paths only when they read as
         the same shape token for token, and a radius breaks that: the
         browser reports the four insets back as three whenever two
         agree, so `inset(0% 0% 100% round 24px)` and the four-value end
         state are different shapes to it and the clip simply jumps at
         the end. A proxy sidesteps the whole comparison. */
      const clipAt = (p) =>
        `inset(${edges.map((n) => `${(n * (1 - p)).toFixed(3)}%`).join(' ')}${round})`;

      /* The clip goes on whatever is marked — a wrapper clips its
         picture just as well as the picture does, and marking the
         wrapper is the one attribute the Designer can put on a div that
         holds a video, a poster and an overlay at once.

         The overscale does not: scaling a wrapper scales the whole
         cell, padding and captions with it. It goes to the picture
         inside, and to the marked element only when that IS the
         picture. Nothing to scale, no scale. */
      const media = /^(IMG|VIDEO)$/.test(el.tagName)
        ? el
        : el.querySelector('img, video');

      const scale = parseFloat(el.dataset.maskScale);
      const scaleFrom = media
        ? (Number.isFinite(scale) ? scale : (hero ? MASK.heroScaleFrom : MASK.scaleFrom))
        : 1;
      // The hero's two clocks: the clip finishes a beat after the scale,
      // which is what stops the edge arriving at full size.
      const scaleDuration = hero ? MASK.heroGrow : duration;

      /* The start state is written before anything is measured or
         scrolled: the trigger is a frame away at best, and an unclipped
         first paint is the picture flashing in ahead of its own
         reveal. */
      if (clips) el.style.clipPath = clipAt(0);
      if (fadesChildren) touched.push(el);
      if (fades) {
        el.style.opacity = '0';
        if (fadeRise || fadeTilt) {
          gsap.set(el, {
            y: fadeRise,
            rotationX: fadeTilt,
            ...(fadeZoom !== 1 ? { scale: fadeZoom } : {}),
            transformPerspective: FADE_IN.perspective,
            transformOrigin: 'center bottom'
          });
        }
      }
      if (scaleFrom !== 1) media.style.transform = `scale(${scaleFrom})`;
      touched.push(el);
      if (media && media !== el) touched.push(media);

      return { el, media, clips, clipAt, fades, fadesChildren, fadeDuration, fadeRise, fadeTilt,
        fadeZoom, scaleFrom, scaleDuration, duration, ease };
    });

    /* Marked elements inside one group play as a run rather than each on
       its own trigger: a grid of stills that crosses the line together
       otherwise fires as one event and reads as a flicker. */
    const groups = new Map();
    plan.forEach((item) => {
      const group = item.el.closest('[data-mask-group], [data-grow-group], [data-fade-group]');
      const list = groups.get(group || item.el) || [];
      list.push(item);
      groups.set(group || item.el, list);
    });

    /* Which runs have already played. A follower that mounts after its
       leader has finished would otherwise wait for an event that has
       been and gone. */
    const finished = new Set();

    groups.forEach((list, trigger) => {
      const data = trigger.dataset || {};
      const rawStagger = parseFloat(data.maskStagger ?? data.growStagger ?? data.fadeStagger);

      /* A whole run can be held back: the pictures under a heading want
         to wait for it rather than race it, and the heading is a
         different module on a different trigger. Seconds, on the group,
         added to every cue in it. */
      const rawHold = parseFloat(data.maskDelay ?? data.growDelay ?? data.fadeDelay);
      const fixedHold = Number.isFinite(rawHold) && rawHold > 0 ? rawHold : 0;

      /* data-mask-after waits for the text instead of counting: a number
         that lines up on a reload is wrong on a page transition, where
         the text does not start until the incoming container has been
         laid out. Empty means every text group in the section; a value is
         a selector for the ones to wait for.

         It follows the text's LAST step setting off rather than all of it
         settling: the pictures are answering the paragraph, not queueing
         behind it, and a step's tail is long enough that waiting it out
         reads as dead air. data-mask-after-settled waits for the end
         instead.

         The hold becomes the gap after that moment rather than the wait
         itself, since the waiting is no longer this group's to measure. */
      const afterRaw = data.maskAfter ?? data.growAfter ?? data.fadeAfter;
      const waits = afterRaw !== undefined;
      const hold = waits ? (fixedHold || MASK.afterGap) : fixedHold;

      /* A run of nothing but fades takes the fade's start. Mixed with a
         clip, the clip's wins: they are one gesture then, and a picture
         that fades in a screen below where it uncovers reads as two. */
      const fadeOnly = list.every((item) => item.fades && !item.clips);
      const stagger = Number.isFinite(rawStagger) ? rawStagger : MASK.stagger;

      /* Said out loud so another run can follow this one. Nothing else
         crosses a section boundary: data-*-after listens for the text
         inside its own section, which is the right scope for pictures
         answering their own heading and no use at all to a section that
         wants to come after the section above it. */
      const tl = gsap.timeline({
        paused: true,
        onComplete: () => {
          finished.add(trigger);
          trigger.dispatchEvent(new CustomEvent('maskreveal:done', { bubbles: true }));
        }
      });

      list.forEach((item, i) => {
        const at = hold + i * stagger;
        const delay = parseFloat(item.el.dataset.maskDelay ?? item.el.dataset.growDelay);
        const cue = at + (Number.isFinite(delay) ? delay : 0);

        if (item.clips) {
          const wipe = { p: 0 };
          tl.to(wipe, {
            p: 1,
            duration: item.duration,
            ease: item.ease,
            onUpdate: () => { item.el.style.clipPath = item.clipAt(wipe.p); }
          }, cue);
        }


        if (item.fadesChildren) {
          tl.call(() => item.el.classList.add('is-faded'), null, cue);
        }

        if (item.fades) {
          const to = {
            opacity: 1,
            duration: item.fadeDuration,
            ease: FADE_IN.ease,
            // Handed back, so a hover or a swap is not fighting numbers
            // this module left on the element.
            clearProps: item.fadeRise || item.fadeTilt ? 'opacity,transform' : 'opacity'
          };
          if (item.fadeRise) to.y = 0;
          if (item.fadeTilt) to.rotationX = 0;
          if (item.fadeZoom !== 1) to.scale = 1;
          tl.to(item.el, to, cue);
        }

        if (item.scaleFrom !== 1) {
          tl.to(item.media, {
            scale: 1,
            duration: item.scaleDuration,
            ease: item.ease,
            transformOrigin: 'center center'
          }, cue);
        }
      });

      /* Both have to have happened: the group has to have been reached,
         and the text it follows has to have finished. Whichever is last
         starts the run. */
      let entered = false;
      const pending = new Set();
      let giveUp = null;

      const start = () => {
        if (!entered || pending.size) return;
        clearTimeout(giveUp);
        tl.play();
      };

      /* data-fade-follows="<selector>": wait for another run to finish,
         anywhere on the page. A section that should arrive after the one
         above it has no other way to say so — the scroll alone cannot,
         since reaching the second section says nothing about whether the
         first has played. */
      const followsRaw = data.maskFollows ?? data.growFollows ?? data.fadeFollows;
      if (followsRaw) {
        const leaders = Array.from(document.querySelectorAll(String(followsRaw).trim()))
          .filter((el) => el !== trigger && !finished.has(el));
        leaders.forEach((el) => pending.add(el));

        const onDone = (e) => {
          if (!pending.has(e.target)) return;
          pending.delete(e.target);
          start();
        };
        document.addEventListener('maskreveal:done', onDone);
        listeners.push(() => document.removeEventListener('maskreveal:done', onDone));
      }

      if (waits) {
        const sel = (String(afterRaw).trim() && String(afterRaw).trim() !== 'true')
          ? String(afterRaw).trim()
          : '[data-text-anim]';
        const scope = trigger.closest('section') || document;

        /* The scope itself counts. A section is usually the text group's
           own root — data-text-anim sits on the <section> — and
           querySelectorAll never returns the element it was called on, so
           searching inside it finds nothing and the pictures wait for a
           group that was never in the list. */
        const sources = Array.from(scope.querySelectorAll(sel));
        if (scope.matches && scope.matches(sel)) sources.unshift(scope);
        sources.forEach((el) => pending.add(el));

        /* Read across the three families like every other key here: a
           fade group asking for the strict cue writes
           data-fade-after-settled, and only the mask spelling worked. */
        const settled = data.maskAfterSettled ?? data.growAfterSettled ?? data.fadeAfterSettled;
        const cue = settled !== undefined ? 'textanim:done' : 'textanim:last';
        const onCue = (e) => {
          if (!pending.has(e.target)) return;
          pending.delete(e.target);
          start();
        };
        document.addEventListener(cue, onCue);
        listeners.push(() => document.removeEventListener(cue, onCue));
      }

      triggers.push(ScrollTrigger.create({
        trigger,
        start: data.maskStart || data.growStart || data.fadeStart
          || (fadeOnly ? FADE_IN.start : MASK.start),
        once: true,
        onEnter: () => {
          entered = true;
          /* Text that never plays must not strand the pictures: a group
             below the fold, one switched off, a reveal that threw. */
          if (pending.size) {
            giveUp = setTimeout(() => { pending.clear(); start(); }, MASK.afterWait * 1000);
          }
          start();
        }
      }));
    });

    return () => {
      triggers.forEach((t) => t.kill());
      listeners.forEach((fn) => fn());
      touched.forEach((el) => {
        gsap.killTweensOf(el);
        el.classList.remove('is-faded');
        el.style.removeProperty('clip-path');
        el.style.removeProperty('opacity');
        el.style.removeProperty('transform');
        el.style.removeProperty('transform-origin');
      });
    };
  });


  /* ===== RULE REVEAL — [data-rule] — README ### ruleReveal ===== */

  /* The element's own border, drawn on as it arrives.

     A border cannot be animated across: border-width is layout, and
     growing one from nothing shifts everything under it by a pixel a
     frame. So the border stays exactly where the Designer put it, its
     colour is taken to transparent — the box keeps the same height — and
     a pseudo of the same weight and colour is drawn over it and scaled
     from the left edge.

     The colour and the weight are read off the element rather than
     written here: whatever the component is wearing, at whatever
     breakpoint, is what gets drawn. */

  const RULE = {
    /* Both taken off the reference: a 1s transform on easeInOutCubic,
       which is qubic to two decimals. It draws a 1px box from a left
       origin there too. */
    duration: 1,
    ease: QUBIC.ease,
    start: 'top 85%',

    // Its place in the item's cadence — see SEQUENCE. A slot on the
    // element itself wins, so one rule can run out of turn.
    slot: 'rule'
  };

  /* Shared with textAnim, which draws TEXT.ruleWith cells on its own
     clock. Declarations, so the module above this one can reach them. */
  function armRule(el, edge) {
    const cs = getComputedStyle(el);
    const width = edge === 'bottom' ? cs.borderBottomWidth : cs.borderTopWidth;
    const colour = edge === 'bottom' ? cs.borderBottomColor : cs.borderTopColor;

    // Nothing drawn on that edge is nothing to draw on.
    if (!parseFloat(width)) return false;

    el.style.setProperty('--rule-h', width);
    el.style.setProperty('--rule-color', colour);
    el.style.setProperty('--rule-scale', '0');
    el.style.setProperty(`border-${edge}-color`, 'transparent');

    /* The class is what turns the pseudo on, so a page where this never
       runs — no ScrollTrigger, reduced motion, a throw above here —
       keeps its real border rather than losing the line entirely. */
    el.classList.add('is-rule');
    return true;
  }

  function drawRule(el, delay) {
    return gsap.to(el, { '--rule-scale': 1, duration: RULE.duration, ease: RULE.ease, delay });
  }

  function disarmRule(el) {
    gsap.killTweensOf(el);
    el.classList.remove('is-rule');
    ['--rule-h', '--rule-color', '--rule-scale'].forEach((v) => el.style.removeProperty(v));
    el.style.removeProperty('border-top-color');
    el.style.removeProperty('border-bottom-color');
  }

  Modules.add('ruleReveal', function (root) {
    const items = Array.from(root.querySelectorAll('[data-rule]'));
    if (!items.length || !hasScrollTrigger || reducedMotion) return;

    const triggers = [];
    const touched = [];

    items.forEach((el) => {
      const edge = (el.dataset.rule || '').trim().toLowerCase() === 'bottom'
        ? 'bottom'
        : 'top';
      if (!armRule(el, edge)) return;
      touched.push(el);

      const own = slotCue(el);
      const delay = Number.isFinite(own)
        ? own
        : SEQUENCE.lead + (SEQUENCE.slots[RULE.slot] || 0) * SEQUENCE.step + itemCue(el);

      triggers.push(ScrollTrigger.create({
        // The list, where there is one: see itemCue.
        trigger: seqList(el) || el,
        start: el.dataset.ruleStart || RULE.start,
        once: true,
        onEnter: () => drawRule(el, delay)
      }));
    });

    return () => {
      triggers.forEach((t) => t.kill());
      touched.forEach(disarmRule);
    };
  });


  /* ===== BUTTON CHARACTERS — [data-button-animate-chars] — README ### buttonChars ===== */

  /* The label climbs a character at a time under the pointer, each one a
     hair behind the last. There is no second copy of the text: a
     text-shadow one line-height below each character is what arrives as
     the character itself leaves, which is why the whole thing is one
     transform per span and costs nothing to run.

     The split is the only part that needs a script. Everything about the
     movement — distance, clock, curve — is in the stylesheet, so a button
     that never meets this module still reads and still clicks. */

  const BUTTON_CHARS = {
    step: 0.012,        // s between one character and the next
    max: 60,            // characters past which the stagger stops growing
    selector: '.button_main_text'   // marked without an attribute
  };

  Modules.add('buttonChars', function (root) {
    /* The site's own button label carries it without being asked: it is
       one component in one class, and an attribute on every instance is
       a thing to forget. The attribute stays for anything that is not
       that button — a link, a one-off — and marking the class with it
       here means the stylesheet only ever has one selector to know.

       The document, not the container: a mount is scoped to the page
       Barba swapped in, and the nav and the footer sit outside it. They
       were the three buttons on this site that never split. */
    document.querySelectorAll(BUTTON_CHARS.selector).forEach((el) => {
      el.setAttribute('data-button-animate-chars', '');
    });

    const labels = Array.from(document.querySelectorAll('[data-button-animate-chars]'));
    if (!labels.length) return;

    const cut = [];
    const hovers = [];

    labels.forEach((label) => {
      // Mounted twice — a Barba swap, a re-entry — the second pass would
      // otherwise split the spans it made the first time, character by
      // character, until there is nothing left to split.
      if (label.dataset.charsSplit === 'true') return;

      const text = label.textContent;
      if (!text.trim()) return;

      label.dataset.charsSplit = 'true';
      /* Only what this page brought with it is put back on teardown. The
         nav and the footer outlive the swap, and a label restored under
         them would be split again by the next mount — and carry the last
         page's teardown in its history. */
      if (root === document || root.contains(label)) cut.push({ label, text });

      /* Read as one word, not as a column of letters. A screen reader
         announcing a split label spells it out, so the pieces are hidden
         from the tree and the name is put back on whatever is being
         clicked — unless that already carries one of its own. */
      const link = label.closest('a, button');
      if (link && !link.getAttribute('aria-label')) {
        link.setAttribute('aria-label', text.trim());
        link.dataset.charsNamed = 'true';
      }
      label.setAttribute('aria-hidden', 'true');

      /* The pointer never touches the label. The site's button puts an
         absolutely positioned link over the whole component and keeps the
         text in a sibling, so the link is what is hovered and the label
         is not inside it — no selector starting at :hover can reach from
         one to the other. The nearest thing holding both is what carries
         the state. */
      const host = link && link.contains(label)
        ? link
        : (() => {
          let node = label.parentElement;
          while (node && node !== document.body) {
            if (node.querySelector('a, button')) return node;
            node = node.parentElement;
          }
          return label;
        })();

      const enter = () => host.classList.add('is-chars-hover');
      const leave = () => host.classList.remove('is-chars-hover');
      host.addEventListener('pointerenter', enter);
      host.addEventListener('pointerleave', leave);
      // Keyboard reaches the link, not the box around it.
      host.addEventListener('focusin', enter);
      host.addEventListener('focusout', leave);
      hovers.push(() => {
        host.removeEventListener('pointerenter', enter);
        host.removeEventListener('pointerleave', leave);
        host.removeEventListener('focusin', enter);
        host.removeEventListener('focusout', leave);
        host.classList.remove('is-chars-hover');
      });

      const frag = document.createDocumentFragment();
      Array.from(text).forEach((char, i) => {
        const span = document.createElement('span');
        span.textContent = char;
        span.style.transitionDelay = `${Math.min(i, BUTTON_CHARS.max) * BUTTON_CHARS.step}s`;
        // A space in an inline-block collapses to nothing without this.
        if (char === ' ') span.style.whiteSpace = 'pre';
        frag.appendChild(span);
      });

      label.replaceChildren(frag);
    });

    return () => {
      hovers.forEach((off) => off());
      cut.forEach(({ label, text }) => {
        label.replaceChildren(document.createTextNode(text));
        label.removeAttribute('aria-hidden');
        delete label.dataset.charsSplit;

        const link = label.closest('a, button');
        if (link && link.dataset.charsNamed === 'true') {
          link.removeAttribute('aria-label');
          delete link.dataset.charsNamed;
        }
      });
    };
  });


  /* ===== STICKY CARD STACK — [data-sticky-stack] — README ### stickyStack ===== */

  // The pinning is CSS. This owns the stacking order and the lift of the
  // covered card, neither of which CSS can do, and only on desktop —
  // below the breakpoint the cards are static and stacking hides content.

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


  /* ===== DESIGN STICKY — .design_sticky_track — README ### designSticky ===== */

  // Sticky and the hold between cards are CSS; this is the scrim that
  // darkens a card as the work section climbs over it.

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


  /* ===== TABS — [data-tabs="wrapper"] — README ### tabs ===== */

  const TABS = {
    duration: 0.65,
    ease: E.panel,
    outProgress: 0.3,   // how long the leaving progress bar takes to empty

    /* The visual does not cross-fade: the incoming one grows from the
       middle over the one before it, which stays put until it is
       covered. Same move as the services rows, same numbers — see
       SERVICES.coverFrom. */
    coverFrom: 0.18,    // the incoming visual starts this small, centred
    coverDuration: 0.7,
    coverEase: E.body,

    /* And an iris with it, so a tab arrives the way everything else on
       the site does — data-mask="hero", the home hero's cells. A beat
       longer than the growth, which is what stops the edge landing while
       the picture is still getting there. */
    coverClip: 0.9,
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
          visualItems[i].style.removeProperty('clip-path');
          gsap.set(visualItems[i], i === index
            ? { autoAlpha: 1, scale: 1, zIndex: 1 }
            : { autoAlpha: 0, scale: 1, zIndex: 0 });
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
        /* The leaving visual is covered, not faded: it holds still at
           full strength and the incoming one grows over it. Dropped only
           once it is hidden, so nothing shows through the corners of a
           picture that has not finished arriving. */
        switchTl.set(visualItems[outIndex], { zIndex: 0 }, 0);
        switchTl.set(visualItems[outIndex], { autoAlpha: 0 }, TABS.coverDuration);
        if (outDetail) switchTl.to(outDetail, { height: 0 }, 0);
        const outInner = detailInner(outIndex);
        if (outInner) {
          switchTl.to(outInner, {
            autoAlpha: 0, y: TABS.textShift, duration: TABS.outProgress
          }, 0);
        }

        switchTl.fromTo(
          visualItems[index],
          { autoAlpha: 1, scale: TABS.coverFrom, zIndex: 1, transformOrigin: 'center center' },
          { scale: 1, duration: TABS.coverDuration, ease: TABS.coverEase },
          0
        );

        /* Written from a number rather than tweened as a string: gsap
           interpolates two clip-paths only when they read as the same
           shape token for token, and the browser hands four equal insets
           back as one, so the two ends are different shapes to it and the
           clip jumps at the end instead of opening. */
        const iris = { p: 0 };
        const incoming = visualItems[index];
        switchTl.fromTo(iris,
          { p: 0 },
          {
            p: 1,
            duration: TABS.coverClip,
            ease: TABS.coverEase,
            onUpdate: () => {
              const inset = (50 * (1 - iris.p)).toFixed(3);
              incoming.style.clipPath = `inset(${inset}% ${inset}% ${inset}% ${inset}%)`;
            },
            // Handed back once it is open, so nothing carries a clip into
            // the next swap or into a page transition.
            onComplete: () => { incoming.style.removeProperty('clip-path'); }
          },
          0
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

      // Set, never animated open: at mount the container is still the
      // transition's 100vh rectangle, where height:auto measures the
      // wrong box and the open would play behind the transition.
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

  /* ===== FAQ / ACCORDION — .faq_item_wrap, [data-faq-item] — README ### faq ===== */

  // Height 0 <-> auto rather than a max-height guess: measured per open,
  // so a long answer never clips. Every toggle moves the document.

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

        /* height:0 only empties the content box, so a panel with padding
           stays as tall as its padding — the closed answers were holding
           31px each. The authored values are read once and animated with
           the height, then cleared on open so the Designer's units, not
           yesterday's pixels, are what an open panel keeps. */
        const panelStyle = getComputedStyle(panel);
        const pad = {
          top: panelStyle.paddingTop,
          bottom: panelStyle.paddingBottom
        };

        records.push({ item, toggle, panel, icon, inner, open, pad, tl: null });
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
        gsap.set(rec.panel, {
          overflow: 'hidden',
          height: rec.open ? 'auto' : 0,
          paddingTop: rec.open ? rec.pad.top : 0,
          paddingBottom: rec.open ? rec.pad.bottom : 0
        });
        if (rec.open) gsap.set(rec.panel, { clearProps: 'paddingTop,paddingBottom' });
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

        /* Re-read on the way open rather than trusting the mount: the
           padding is a fluid variable, so the number it resolved to at
           load is not the number it holds at this width.

           The target height is measured here too, with that padding in
           place, and tweened as a number. Left as 'auto', gsap measures
           it while the inline padding is still zero — and under
           border-box the padding then grows into the height as the panel
           opens, squeezing the content box until the last line only
           appears when 'auto' lands at the end. */
        let target = 0;
        if (open) {
          gsap.set(rec.panel, { clearProps: 'paddingTop,paddingBottom' });
          const live = getComputedStyle(rec.panel);
          rec.pad = { top: live.paddingTop, bottom: live.paddingBottom };

          const was = rec.panel.style.height;
          gsap.set(rec.panel, { height: 'auto' });
          const box = getComputedStyle(rec.panel);
          const outer = rec.panel.offsetHeight;
          target = box.boxSizing === 'border-box'
            ? outer
            : outer
              - Number.parseFloat(box.paddingTop)
              - Number.parseFloat(box.paddingBottom)
              - Number.parseFloat(box.borderTopWidth)
              - Number.parseFloat(box.borderBottomWidth);

          gsap.set(rec.panel, { height: was || 0, paddingTop: 0, paddingBottom: 0 });
        }

        rec.tl = gsap.timeline({
          defaults: { duration: FAQ.duration, ease: FAQ.ease },
          onComplete: () => {
            // auto, not the measured px, or a resize freezes the open
            // answer at yesterday's height.
            if (open) {
              gsap.set(rec.panel, { height: 'auto' });
              gsap.set(rec.panel, { clearProps: 'paddingTop,paddingBottom' });
            }
            refreshScrollHeight();
          }
        });

        rec.tl.to(rec.panel, {
          height: open ? target : 0,
          paddingTop: open ? rec.pad.top : 0,
          paddingBottom: open ? rec.pad.bottom : 0
        }, 0);
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

  /* ===== HOME HERO — README ### homeHero ===== */

  // The heading holds still; only the images move. Two transforms per
  // cell, deliberately on two elements — parallax on .home_img_wrap, the
  // bump on the img inside it — so neither preserves the other's matrix.

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
       fire until gsap and ScrollTrigger had both landed. Only
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

      /* Every entrance on the cell, not the first to finish. A cell can
         carry more than one — the mask and the scale run on their own
         clocks — and dropping the animation at the first animationend
         takes the longer one down with it, mid-wipe. */
      const onEnd = () => {
        if (img.getAnimations().some((a) => a.playState === 'running')) return;
        img.removeEventListener('animationend', onEnd);
        done();
      };
      img.addEventListener('animationend', onEnd);
      cleanups.push(() => img.removeEventListener('animationend', onEnd));
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


  /* ===== SERVICES HOVER — .services_wrap — README ### servicesHover ===== */

  const SERVICES = {
    follow: 0.6,             // pointer smoothing
    followEase: E.hover,
    show: 0.45,              // follower scaling in and out
    showEase: E.body,
    coverFrom: 0.18,         // the incoming image starts this small, centred
    coverDuration: 0.7,

    /* And an iris with it, the same pair the tabs and the hero cells
       use. A beat longer than the growth, so the edge does not land
       while the picture is still on its way. */
    coverClip: 0.9,
    coverEase: E.body,
    fill: 0.5,               // the colour wipe behind the row
    fillEase: E.open,
    dim: 0.45,               // the rows that are not hovered

    /* Which way the colour travels.

       'follow' — in from the edge the pointer crossed, out towards the
       edge it leaves by. A wipe that always rose met anyone coming down
       the list head-on: the colour travelled against the pointer on
       every second approach, which is what reads as wrong.

       'fade'   — no direction at all, just opacity. Safe, and gives up
       the gesture the section is built on.

       'up'     — the original, always from the bottom edge. */
    fillMode: 'follow'
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

      /* The heading sticks over the rows. Its container is measured, not
         the wrap: the CSS spends the number twice — once as a negative
         margin that takes the heading out of the flow, once as the top
         padding the rows centre inside — and both want the box that is
         actually stuck, padding and all. Measured rather than guessed,
         since it is two lines on one phone and four on the next, and it
         reflows when the device turns. */
      const heading = section.querySelector('.services_contain');
      if (heading) {
        const measure = () => {
          const h = Math.round(heading.getBoundingClientRect().height);
          section.style.setProperty('--services-stack-heading', `${h}px`);
        };
        measure();
        const observer = typeof ResizeObserver === 'function'
          ? new ResizeObserver(measure)
          : null;
        observer?.observe(heading);
        cleanups.push(() => {
          observer?.disconnect();
          section.style.removeProperty('--services-stack-heading');
        });
      }

      const viewport = document.createElement('div');
      viewport.className = 'services_stack_viewport';
      list.appendChild(viewport);
      items.forEach((item) => viewport.appendChild(item));
      list.classList.add('is-stacked');
      // A sticky child holds while its container passes, so the track is
      // a step per gap, plus the hold, plus its own screen.
      const screens = (items.length - 1) * SERVICES_STACK.screens
        + SERVICES_STACK.hold + 1;
      /* lvh, never dvh: this track is everything above the rest of the
         page, and dvh moves with the iOS toolbar — which shows and hides on
         every change of scroll direction. Times six screens, that shifted
         the CTA and the FAQ by half a screen each time. Chrome's scroll
         anchoring hid it on Android; Safari has none. lvh is the tallest
         the viewport gets, so the track is never short of the screens it
         holds either. */
      const unit = CSS.supports?.('height', '1lvh') ? 'lvh' : 'vh';
      list.style.height = `${screens * 100}${unit}`;
      const step = () => list.offsetHeight / screens;

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
          /* One boundary per gap between rows, measured off the track
             rather than innerHeight, which on iOS moves with the toolbar
             while the track does not. */
          for (let i = 1; i < items.length; i += 1) {
            const boundary = ScrollTrigger.create({
              trigger: list,
              start: () => `top top-=${i * step() * SERVICES_STACK.screens}`,
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
      // <body>, never the section: perspective on .page_wrap makes a
      // containing block, and a fixed follower inside it stops resolving
      // against the viewport.
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

        /* The iris, written from a number each frame: gsap interpolates
           two clip-paths only when they read as the same shape token for
           token, and the browser hands four equal insets back as one, so
           a plain tween between them jumps at the end instead of
           opening. */
        const iris = { p: 0 };
        gsap.set(clone, { clipPath: 'inset(50% 50% 50% 50%)' });
        gsap.to(iris, {
          p: 1,
          duration: SERVICES.coverClip,
          ease: SERVICES.coverEase,
          onUpdate: () => {
            const inset = (50 * (1 - iris.p)).toFixed(3);
            clone.style.clipPath = `inset(${inset}% ${inset}% ${inset}% ${inset}%)`;
          },
          // Handed back, so the layer underneath is never covered by a
          // clip that has finished its work.
          onComplete: () => { clone.style.removeProperty('clip-path'); }
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
        gsap.set(fill, SERVICES.fillMode === 'fade'
          ? { clipPath: 'inset(0% 0% 0% 0%)', opacity: 0 }
          : { clipPath: 'inset(100% 0% 0% 0%)' });

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

      // Collapsed against one edge or the other. A top inset of 100%
      // parks the band on the bottom edge, and the reverse on the top.
      const PARKED = {
        top: 'inset(0% 0% 100% 0%)',
        bottom: 'inset(100% 0% 0% 0%)'
      };

      /* Which edge the pointer crossed. Halfway is the split: on the way
         in the pointer is still on the boundary it came through, and on
         the way out it is at the one it is leaving by. */
      function edgeOf(e, el) {
        if (!e || typeof e.clientY !== 'number') return 'bottom';
        const r = el.getBoundingClientRect();
        return e.clientY - r.top < r.height / 2 ? 'top' : 'bottom';
      }

      function wipe(rec, open, e) {
        const duration = reducedMotion ? 0 : SERVICES.fill;

        if (SERVICES.fillMode === 'fade') {
          gsap.to(rec.fill, {
            opacity: open ? 1 : 0,
            duration,
            ease: SERVICES.fillEase,
            overwrite: 'auto'
          });
          return;
        }

        const edge = SERVICES.fillMode === 'follow' ? edgeOf(e, rec.item) : 'bottom';

        /* Only a wipe starting from nothing picks its edge. Reversing one
           already in flight tweens from wherever it is, or the colour
           would jump across the row to start again. */
        if (open && !rec.open) gsap.set(rec.fill, { clipPath: PARKED[edge] });
        rec.open = open;

        gsap.to(rec.fill, {
          clipPath: open ? 'inset(0% 0% 0% 0%)' : PARKED[edge],
          duration,
          ease: SERVICES.fillEase,
          overwrite: 'auto'
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
          wipe(rec, true, e);
          dim(rec);
          if (rec.img) {
            showFollower(e);
            pushVisual(rec.img);
          }
        }, { signal });

        rec.item.addEventListener('mouseleave', (e) => wipe(rec, false, e), { signal });
      });

      // One leave for the whole list: it ends the preview, and does not
      // fire while the pointer only crosses between rows.
      collection.addEventListener('mouseleave', (e) => {
        // A pointer leaving the window can skip a row's own leave.
        records.forEach((rec) => wipe(rec, false, e));
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


  /* ===== SINGLE-SELECT FILTER CHECKBOXES — README ### filterSingle ===== */

  // Webflow checkboxes behaving like radios, since a radio cannot be
  // unchecked back to the "all" state.

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


  /* ===== TEXT SWAP — [data-swap] — README ### textSwap ===== */

  const SWAP = {
    hold: 3500,
    duration: QUBIC.l,
    shift: 24,          // px travelled, out upward and in from below
    ease: E.qubic,

    /* The -solo entrance, played here rather than by textAnim. Same
       gesture, taken from the preset: textAnim states the curve as a
       cubic-bezier string for the Web Animations API, which gsap does
       not read, and E.qubic is that curve registered for gsap. */
    soloDuration: QUBIC.l,
    soloEase: E.qubic,
    soloShift: 30,      // yPercent

    /* The statements arrive line by line, the way a heading does. Where
       a line waits is parkOffset's business, not a number here: the mask
       window opens past the line box by the reach, so a line parked at a
       flat 110% still shows a few pixels of itself along the edge — the
       slivers of the next line you see above and below the one that has
       arrived. */
    lineStagger: 0.08,  // between one line and the next

    start: 'top 70%',
    stack: '(max-width: 767px)'   // below this the statements go full width
  };

  /* ===== FINSWEET ATTRIBUTES — README ### Finsweet Attributes ===== */

  // It scans the DOM once on load, so a swapped-in list is one it has
  // never seen and its filters do nothing. Restarted per container.

  Modules.add('finsweet', function (root) {
    if (!root.querySelector || !root.querySelector('[fs-list-element="list"]')) return;

    let dead = false;

    // Fetched here, not site-wide, so a page with no list never pays
    // for it. Resolves immediately once it is in the document.
    Assets.finsweet().then(() => {
      if (dead) return;

      const fs = window.FinsweetAttributes;
      if (!fs) return;

      /* load, never destroy: destroy tears the solution off the elements it
         holds, and with sync:true both containers are in the document
         while this mounts — so it reached into the incoming page and took
         its pagination markup with it, which is why Load more had no
         button to bind and only a reload brought it back.

         And not until the outgoing container has actually left, or the
         scan sees two lists and binds the one that is on its way out. */
      const reload = () => {
        if (dead) return;

        const api = window.FinsweetAttributes;

        try {
          /* restart first, load second, and not the other way round:
             load('list') only boots a solution that has not booted. Asked
             again for one that is already running it resolves to
             undefined without looking at the page, so every list swapped
             in by a transition was left exactly as it arrived — Load more
             still the plain pagination anchor underneath, which navigates
             and lands you at the top of page two. Reloading the page hid
             it, because a boot from scratch does read the list.

             load stays as the fallback for the first list of a session,
             where there is genuinely nothing running yet. */
          if (typeof api?.modules?.list?.restart === 'function') api.modules.list.restart();
          else if (typeof api?.load === 'function') api.load('list');
          else console.warn('[finsweet] no way to reload the list solution');
        } catch (err) {
          console.warn('[finsweet] list reload failed', err);
        }
      };

      const alone = () => document.querySelectorAll('[data-barba="container"]').length <= 1;

      /* A frame, unless frames are not coming. A hidden tab — opened in
         the background, restored into a window that is not being painted
         — serves no animation frames at all, and a list that waited on
         one stayed unbound until the tab was looked at. The timer is the
         floor, the frame is the common case, and whichever arrives first
         wins once. */
      const soon = (fn) => {
        let run = false;
        const go = () => { if (run) return; run = true; fn(); };
        requestAnimationFrame(go);
        setTimeout(go, 32);
      };

      const restart = () => {
        if (dead) return;
        if (alone()) { reload(); return; }

        // The transition owns the second container; this waits it out
        // rather than racing it, and gives up rather than spinning.
        let tries = 0;
        const wait = () => {
          if (dead) return;
          if (alone() || tries > 120) { reload(); return; }
          tries += 1;
          soon(wait);
        };
        wait();
      };

      /* push, not modules.list.restart: on the first list page of a
         session the solution is still booting when this runs, and reading
         its controls synchronously got undefined and gave up quietly —
         the swapped-in list then had nobody listening, so Load more fell
         through to Webflow's own pagination anchor and navigated to page
         two. The callback fires once the solution is ready, and
         immediately on every later navigation.

         A frame later either way: with sync:true the outgoing container
         is still in the document while this mounts, and a restart there
         binds to the list that is leaving. */
      const queue = () => soon(() => soon(restart));

      if (typeof fs.push === 'function') fs.push(['list', queue]);
      else queue();
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

      // data-swap-wait holds the start until something sends swap:start.
      const waits = wrap.hasAttribute('data-swap-wait');

      // One grid cell rather than absolute children, which collapse the
      // wrapper: in one cell the tallest statement still sets the box.
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
        placeTimer = setTimeout(() => { place(); recut(); }, 150);
      };
      window.addEventListener('resize', onResize, { passive: true });

      let index = 0;
      let timer = null;
      let tl = null;
      let dead = false;
      let scrubbed = false;
      let shown = false;

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

      const dur = solo ? SWAP.soloDuration : SWAP.duration;
      const ease = solo ? SWAP.soloEase : SWAP.ease;
      // Both units written every time, or a statement that entered under
      // one and leaves under the other starts from the wrong place.
      const hiddenBelow = solo
        ? { autoAlpha: 0, yPercent: SWAP.soloShift, y: 0 }
        : { autoAlpha: 0, yPercent: 0, y: SWAP.shift };
      const hiddenAbove = solo
        ? { autoAlpha: 0, yPercent: -SWAP.soloShift, y: 0 }
        : { autoAlpha: 0, yPercent: 0, y: -SWAP.shift };
      const resting = { autoAlpha: 1, yPercent: 0, y: 0 };

      /* Cut into lines here rather than by textAnim, which skips
         everything inside a [data-swap] — both would be writing the same
         transform to the same statement. Cut, the swap moves the lines
         and the statement itself carries only visibility; uncut, it moves
         the statement whole, which is what happens where kugiri never
         landed and under reduced motion, where nothing travels at all. */
      const cuts = new Map();
      const lined = () => cuts.size === list.length;
      const linesOf = (el) => (cuts.get(el) || {}).lines || [];

      const cut = () => {
        if (!hasKugiri || reducedMotion) return;
        try {
          const splits = window.kugiri.splitText(list, {
            type: ['lines'],
            mask: { lines: TEXT.reach },
            classes: { lines: 'text-anim_line', mask: 'text-anim_mask' }
          });
          list.forEach((el, i) => { if (splits[i]) cuts.set(el, splits[i]); });
        } catch (err) {
          console.warn('[swap] could not cut the statements into lines, ' +
            'moving them whole instead', err);
          cuts.clear();
        }
      };

      const uncut = () => {
        cuts.forEach((split) => {
          try { split.revert(); } catch (err) { /* already gone */ }
        });
        cuts.clear();
      };

      const lineOpts = () => ({ duration: dur, ease, stagger: SWAP.lineStagger });

      /* How long a statement actually takes: the last line starts a full
         stagger behind the first, so the run is longer than the duration
         by the whole spread. Hiding it at `dur` cut the last lines off
         mid-move while the next statement was already arriving over
         them, which is two statements showing at once in pieces. */
      const span = (el) => (lined()
        ? dur + Math.max(0, linesOf(el).length - 1) * SWAP.lineStagger
        : dur);

      // Per line, measured: an em is the line's own font size, and the
      // cushion is what keeps its tall ink out of the window.
      const parkBelow = (i, target) => parkOffset(target);
      const parkAbove = (i, target) => -parkOffset(target);

      const away = (els) => els.forEach((el) => {
        if (!lined()) { gsap.set(el, hiddenBelow); return; }
        gsap.set(el, { autoAlpha: 0 });
        gsap.set(linesOf(el), { yPercent: parkBelow });
      });

      const settle = (el) => {
        if (!lined()) { gsap.set(el, resting); return; }
        gsap.set(el, { autoAlpha: 1 });
        gsap.set(linesOf(el), { yPercent: 0 });
      };

      const leave = (timeline, el, at) => {
        if (!lined()) {
          timeline.to(el, { ...hiddenAbove, duration: dur, ease }, at);
          return;
        }
        timeline.to(linesOf(el), { yPercent: parkAbove, ...lineOpts() }, at);
        // Put away only once the last line has gone.
        timeline.set(el, { autoAlpha: 0 }, at + span(el));
      };

      const enter = (timeline, el, at) => {
        if (!lined()) {
          timeline.fromTo(el, hiddenBelow, { ...resting, duration: dur, ease }, at);
          return;
        }
        timeline.set(el, { autoAlpha: 1 }, at);
        timeline.fromTo(linesOf(el),
          { yPercent: parkBelow },
          { yPercent: 0, ...lineOpts() },
          at
        );
      };

      const enterNow = (el) => enter(gsap.timeline(), el, 0);

      /* A split is a snapshot of one layout, so a resize takes it back to
         the text and cuts again at the new width. Whichever statement was
         showing is put back, since cutting parks every line. */
      const recut = () => {
        if (dead || !lined()) return;
        uncut();
        cut();
        away(list);
        if (shown || !waits) settle(list[index]);
      };

      cut();
      away(list);

      /* And the stylesheet's hold goes with it. A statement carrying
         data-text-anim-solo matches the anti-flicker rule, textAnim
         skips anything inside a [data-swap] — so nobody dropped it, and
         a running animation outranks an inline style: the entrance wrote
         opacity 1 onto an element the hold was still pinning at 0. The
         statement arrived invisible and stayed that way until the hold
         expired by itself, three seconds in, which on the home hero is
         most of the time you spend looking at it.

         Safe here because away() has already hidden them: visibility
         carries the hiding from now on, exactly as it does in textAnim. */
      list.forEach((el) => { el.style.animation = 'none'; });

      // Waiting means waiting for the first one too: shown at mount, it
      // has been read by the time its cue arrives.
      if (!waits) settle(list[0]);

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
        away(list.filter((el) => el !== current && el !== list[index]));

        tl?.kill();
        if (reducedMotion) {
          gsap.set(list, { autoAlpha: 0, yPercent: 0, y: 0 });
          gsap.set(list[index], { autoAlpha: 1 });
          queue();
          return;
        }

        tl = gsap.timeline({ onComplete: queue });
        leave(tl, current, 0);
        // A third of the way through the statement that is leaving, not a
        // third of one line's duration: with eight lines those are very
        // different moments, and the early one had them arriving on top
        // of each other.
        enter(tl, list[index], span(current) * 0.35);
      }

      let trigger = null;

      // Queued, not started here: at mount a trigger measured against the
      // transition rectangle fires at the wrong scroll position.
      const onExternalStart = () => {
        if (dead) return;
        if (reducedMotion) settle(list[0]);
        else enterNow(list[0]);
        queue();
      };

      /* Scroll-driven from here on: whoever sends swap:to owns the
         sequence, and the timer is dropped rather than have two things
         disagree about what is being read. */
      const onExternalTo = (e) => {
        if (dead) return;
        scrubbed = true;
        clearTimeout(timer);

        const i = Math.max(0, Math.min(list.length - 1, Number(e.detail) || 0));
        if (!shown) {
          shown = true;
          index = i;
          if (reducedMotion) settle(list[i]);
          // fromTo, not to: a `to` from wherever it sits has nowhere to
          // travel, and the first statement arrives without the rise.
          else enterNow(list[i]);
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
        away(list);
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
        uncut();
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


  /* ===== LAZY ASSETS ===== */

  // Swiper and Finsweet were site-wide embeds: about 90 KiB every page
  // paid for, and home uses neither. Fetched once per asset here, only
  // for a container that has the markup; the promise is cached.

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
          const URL = 'https://cdn.jsdelivr.net/npm/@finsweet/attributes@2/attributes.js';
          const tag = () => document.querySelector('script[src*="@finsweet/attributes"]');

          /* A tag on the page but not yet run is not the same as no tag.
             The global appears only once the module has executed, so
             checking for it and finding nothing meant adding a second
             copy of a script that was already on its way. Both carry
             fs-list, so both boot the list solution, and the second scan
             left Load more bound to nothing — it fell through to
             Webflow's own pagination anchor, which navigates and jumps to
             the top. A reload hid it, since a cached script runs before
             this does; an incognito window did not.

             A module script fires load after it executes, which is
             exactly the moment the global exists. */
          const waitFor = (el) => new Promise((resolve) => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            el.addEventListener('load', finish, { once: true });
            // A script that fails is not worth waiting on: the list stays
            // a plain list, which is what it was before any of this.
            el.addEventListener('error', finish, { once: true });
            // It may have run between the check above and this line.
            if (window.FinsweetAttributes) finish();
            setTimeout(finish, 8000);
          });

          const boot = () => {
            if (window.FinsweetAttributes) return Promise.resolve();
            const existing = tag();
            if (existing) return waitFor(existing);
            /* Both attributes are load-bearing: type=module because the
               entry is ESM, and fs-list because v2 boots the solutions
               named on its own tag — without it nothing initialises. */
            return script(URL, { type: 'module', async: '', 'fs-list': '' });
          };

          /* And not before the document has been read. This bundle sits
             earlier in the footer than the site's own attributes tag, so
             at the moment this runs that tag has not been parsed:
             looking for it finds nothing, and a copy goes in beside one
             that was always going to arrive. */
          if (document.readyState === 'loading' && !tag() && !window.FinsweetAttributes) {
            return new Promise((resolve) => {
              document.addEventListener('DOMContentLoaded', () => resolve(boot()), { once: true });
            });
          }

          return boot();
        });
      }
    };
  })();


  /* How hard a sideways trackpad gesture has to be before the slider
     takes it. A trackpad reports tiny deltas constantly while a hand
     rests on it, and at 0 the cards drift under an idle palm. */
  const SLIDER_WHEEL = { threshold: 6 };

  Modules.add('slider', function (root) {
    // Nothing to build, and nothing to fetch.
    if (!root.querySelector('.c_slider_swiper')) return;

    const instances = [];
    const resizeHandlers = [];
    const slideTags = [];
    const unstretchedSlides = [];
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
          /* A trackpad's two fingers sideways arrive as a wheel event
             carrying deltaX, which is the gesture people expect to move
             a row of cards without pressing anything down.

             forceToAxis is what keeps the page scrolling: without it any
             wheel over the slider drives it, and a vertical flick on the
             way down the page snags on the cards instead of passing
             through. releaseOnEdges hands the gesture back at either end
             rather than swallowing it. */
          mousewheel: {
            forceToAxis: true,
            releaseOnEdges: true,
            thresholdDelta: SLIDER_WHEEL.threshold
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

        /* Slides stay stretched, so a row of cards takes one height and
           grows with the longest quote in it. A card carrying an
           aspect-ratio cannot be stretched, though: a flex item's cross
           size comes from the line and outranks the ratio, which Chrome
           resolves first and WebKit does not — the square cards came out
           square in one browser and oblong in the other.

           One slide at a time, because no media query can ask whether an
           element has a ratio, and the same component is square on one
           page and quote-shaped on another. */
        const sortStretch = () => {
          el.querySelectorAll('.swiper-slide').forEach((slide) => {
            const ratio = getComputedStyle(slide).aspectRatio;
            const want = ratio && ratio !== 'auto' ? 'flex-start' : 'stretch';
            if (slide.style.alignSelf === want) return;

            /* important, and not for the usual reason: the card carries
               align-self from the Designer's own component styles, which
               a plain inline style loses to — a quote card stood at its
               own height while its neighbours were taller, and nothing
               written here moved it. This is the one hand that knows
               whether the slide has a ratio to protect. */
            slide.style.setProperty('align-self', want, 'important');
            unstretchedSlides.push(slide);
          });
        };
        sortStretch();

        // One explicit update once the page is laid out, closing the
        // window where the first drag snaps.
        Intro.add(root, () => {
          if (!swiper.destroyed) swiper.update();
          // A ratio can arrive with a breakpoint, and the duplicates a
          // loop makes are not there at init.
          sortStretch();
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

            // A ratio can come and go with a breakpoint.
            sortStretch();

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
      unstretchedSlides.forEach((el) => el.style.removeProperty('align-self'));
    };
  });


  /* ===== MARQUEE ===== */

  /* The trackpad gesture. strength is how far a row travels per pixel of
     swipe — 1 would run it away, since a trackpad reports a whole flick
     in a few large deltas. settle is how long after the last event the
     auto-scroll waits before taking the row back. */
  const MARQUEE_WHEEL = { threshold: 4, strength: 0.6, settle: 260 };

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

      /* Two fingers sideways on a trackpad, the gesture the sliders take.
         A row that can already be dragged should answer the same push
         without one being held down.

         The sideways test is what keeps the page scrolling: a trackpad
         reports a little deltaX through any vertical scroll, and without
         it the logos would jiggle every time someone passed them. The
         nudge goes through the drag's own inertia, so it slows the way a
         thrown row does and the auto-scroll picks up where it stops. */
      let wheelIdle = null;
      function handleWheel(e) {
        if (!isDraggable) return;
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        if (Math.abs(e.deltaX) < MARQUEE_WHEEL.threshold) return;
        if (state.isDragging) return;

        e.preventDefault();

        state.isAnimating = false;
        state.inInertia = false;
        state.currentPosition = normalizePosition(
          state.currentPosition - e.deltaX * MARQUEE_WHEEL.strength
        );
        track.style.transform = `translate3d(${state.currentPosition}px, 0, 0)`;

        /* The gesture arrives as a burst of events rather than one, so
           the hand is only off it once they stop coming. */
        clearTimeout(wheelIdle);
        wheelIdle = setTimeout(() => {
          state.isAnimating = true;
          state.speedMultiplier = 1;
        }, MARQUEE_WHEEL.settle);
      }

      const onContextMenu = (e) => e.preventDefault();
      const onDragStart = (e) => e.preventDefault();

      if (isDraggable) {
        marquee.addEventListener('mousedown', handlePointerDown);
        marquee.addEventListener('touchstart', handlePointerDown, { passive: true });
        marquee.addEventListener('contextmenu', onContextMenu);
        marquee.addEventListener('dragstart', onDragStart);
        marquee.addEventListener('wheel', handleWheel, { passive: false });
        marquee.style.cursor = 'grab';
      }

      if (hoverBehavior !== 'none') {
        marquee.addEventListener('mouseenter', handleMouseEnter);
        marquee.addEventListener('mouseleave', handleMouseLeave);
      }

      detachers.push(function () {
        removeDocListeners();
        clearTimeout(wheelIdle);
        marquee.removeEventListener('mousedown', handlePointerDown);
        marquee.removeEventListener('touchstart', handlePointerDown);
        marquee.removeEventListener('contextmenu', onContextMenu);
        marquee.removeEventListener('dragstart', onDragStart);
        marquee.removeEventListener('wheel', handleWheel);
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


  /* ===== SHARE — [data-share] — README ### share ===== */

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


  /* ===== VIDEO POSTER — [data-video="component"] — README ### videoPoster ===== */

  // Held until the first PAINTED frame: base-lib drops the poster when it
  // decides to play, before any frame exists. Registered ahead of baseLib,
  // so the poster is ours before video-min touches it.

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


  /* ===== HERO VIDEO — the hero's last cell grows into the section below — README ### heroVideo ===== */

  const HERO_VIDEO = {
    // Fallback only: the real delay is this cell's slot in the entrance
    // order, read off --hero-in-* in the CSS.
    from: 0.6,
    duration: 0.9,
    delay: 0.55,
    ease: E.small,

    // px of scroll into the section before the growth fires. Pixels, not
    // a fraction: what fires it is the gesture, the same on any screen.
    growAfter: 120,
    growDuration: 1,
    growEase: E.travel,

    /* The growth is a second long and a flick of the wheel is a screen,
       so the page is carried to the section and locked while it grows —
       otherwise it is possible to arrive having seen none of it. Never
       under reduced motion: taking the scroll away is the one thing that
       setting asks you not to do. */
    takeover: true,
    takeoverDuration: 1,

    /* px past the section on every side: a scaled layer's edges land on
       fractions and the compositor rounds the other way from the paint,
       leaving a flickering hairline. */
    bleed: 1
  };

  /* The video lives in the section it grows into, from mount to teardown,
     and every frame is drawn from where the cell and the section are on
     screen right now. No pin, and nothing moved mid-scroll — the pinned
     version kept breaking on iOS, where its hand-offs (lift to the body,
     pin, settle back) could be left half done by a toolbar resize or a
     scroll reversal. The one piece of state left is how far the growth
     has got. */
  Modules.add('heroVideo', function (root) {
    const hero = root.querySelector('.home_wrap');
    const stage = root.querySelector('.home_video_wrap');
    if (!hero || !stage) return;

    const comp = hero.querySelector('[data-video="component"]');
    const cell = comp && comp.closest('.home_img_wrap');
    if (!comp || !cell) return;

    const video = comp.querySelector('video');
    const seat = document.createComment('hero-video');

    /* The cell keeps the video's shape once it is empty, so the grid
       holds its shape around the hole. */
    const declared = (getComputedStyle(comp).aspectRatio.match(/[\d.]+/g) || []).map(Number);
    const ratio = declared.length >= 2 && declared[1] ? declared[0] / declared[1] : 16 / 9;
    cell.style.aspectRatio = String(ratio);
    cell.style.height = 'auto';

    // The CSS hold is written against the hero, and would stop matching
    // the moment the component leaves it.
    comp.style.animation = 'none';
    cell.insertBefore(seat, comp);
    stage.appendChild(comp);

    const restore = () => {
      comp.classList.remove('is-staged', 'is-hero-video-static');
      ['animation', 'left', 'top', 'width', 'height', 'transform', 'clip-path']
        .forEach((prop) => comp.style.removeProperty(prop));
      cell.style.removeProperty('aspect-ratio');
      cell.style.removeProperty('height');
      if (seat.parentNode) {
        seat.parentNode.insertBefore(comp, seat);
        seat.remove();
      }
    };

    if (reducedMotion) {
      comp.classList.add('is-hero-video-static');
      return restore;
    }

    comp.classList.add('is-staged');
    gsap.set(comp, { autoAlpha: 0 });

    // base-lib's observer pauses anything it thinks is out of view, and
    // this is a video that spends its first screen outside its section.
    video?.removeAttribute('data-video-scroll-in-play');
    const play = () => video?.play?.().catch(() => {});

    /* The frame is the video's own shape, just covering the section, so
       nothing is ever stretched: the growth is one scale plus a crop. */
    let frame = null;
    const size = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (!w || !h) return;
      const fw = Math.max(w, h * ratio);
      const fh = fw / ratio;
      frame = { w: fw, h: fh };
      comp.style.width = `${fw}px`;
      comp.style.height = `${fh}px`;
      comp.style.left = `${(w - fw) / 2}px`;
      comp.style.top = `${(h - fh) / 2}px`;
    };

    const lerp = (a, b, t) => a + (b - a) * t;
    const bleed = HERO_VIDEO.bleed;

    let intro = HERO_VIDEO.from;
    let frozen = false;
    let dead = false;
    let drawn = '';

    /* Triggered, not scrubbed: growAfter px after the section starts to
       come up, the growth runs on its own clock and finishes whatever the
       scroll does. Latched, edges far apart — it only lets go back at the
       very start of that range, so a scroll parked on the threshold cannot
       flip it back and forth. */
    const growth = { p: 0 };
    let wants = 0;
    let scrollTween = null;

    // Carried rather than blocked: a page that stops answering reads as
    // broken. The same second as the growth, so both land together.
    const takeover = (s) => {
      if (!HERO_VIDEO.takeover || reducedMotion || s.top <= 0) return;
      const target = window.scrollY + s.top;
      if (hasLenis && lenis && lenis.scrollTo) {
        lenis.scrollTo(target, { duration: HERO_VIDEO.takeoverDuration, lock: true, force: true });
        return;
      }
      const pos = { y: window.scrollY };
      scrollTween = gsap.to(pos, {
        y: target,
        duration: HERO_VIDEO.takeoverDuration,
        ease: HERO_VIDEO.growEase,
        overwrite: true,
        onUpdate: () => window.scrollTo(0, pos.y)
      });
    };

    const growTo = (target, s) => {
      if (wants === target) return;
      wants = target;
      /* Already past the section — Back, or a reload further down — is a
         place, not a journey: drawn full size at once rather than growing
         over whatever the page came back to. */
      if (target === 1 && s.top <= 0) {
        gsap.killTweensOf(growth);
        growth.p = 1;
        return;
      }
      if (target === 1) takeover(s);
      gsap.to(growth, {
        p: target,
        duration: HERO_VIDEO.growDuration,
        ease: HERO_VIDEO.growEase,
        overwrite: true
      });
    };

    /* Measured against the section's own height, not the window's: on iOS
       innerHeight moves with the toolbar and the section does not. */
    const draw = () => {
      if (dead || frozen) return;
      if (!frame) size();
      if (!frame) return;

      const s = stage.getBoundingClientRect();
      const c = cell.getBoundingClientRect();

      const distance = s.height - s.top;
      if (distance >= HERO_VIDEO.growAfter) growTo(1, s);
      else if (distance <= 0) growTo(0, s);
      const q = growth.p;

      /* Grown means the screen until the section arrives, then the
         section: the two are the same box the moment its top reaches the
         top, so the video is handed from one to the other without a seam
         and then scrolls away with it. */
      const t = s.top > 0
        ? { left: s.left, top: 0, width: s.width, height: s.height }
        : s;

      const w = lerp(c.width, t.width + bleed * 2, q);
      const h = lerp(c.height, t.height + bleed * 2, q);
      const dx = lerp(c.left + c.width / 2, t.left + t.width / 2, q) - (s.left + s.width / 2);
      const dy = lerp(c.top + c.height / 2, t.top + t.height / 2, q) - (s.top + s.height / 2);

      // Scaled to cover the rectangle, then cropped to it.
      const k = Math.max(w / frame.w, h / frame.h);
      const insetX = Math.max(0, (frame.w - w / k) / 2);
      const insetY = Math.max(0, (frame.h - h / k) / 2);

      const next = `${dx.toFixed(2)},${dy.toFixed(2)},${(k * intro).toFixed(5)},${insetX.toFixed(2)},${insetY.toFixed(2)}`;
      if (next === drawn) return;
      drawn = next;
      comp.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${k * intro})`;
      comp.style.clipPath = `inset(${insetY}px ${insetX}px)`;

      if (video && video.paused && s.bottom > 0) play();
    };

    gsap.ticker.add(draw);

    const onResize = () => {
      size();
      drawn = '';
    };
    window.addEventListener('resize', onResize, { passive: true });

    // A swap turns both containers into fixed layers, and the rects this
    // reads stop describing the page anyone is looking at.
    const freeze = () => {
      frozen = true;
      gsap.killTweensOf(growth);
      scrollTween?.kill();
    };
    document.addEventListener('page:leaving', freeze);

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

    Intro.add(root, () => {
      if (dead) return;
      play();
      const delay = introDelay();
      gsap.to(comp, {
        autoAlpha: 1,
        duration: HERO_VIDEO.duration,
        delay,
        ease: HERO_VIDEO.ease
      });
      gsap.to({ k: HERO_VIDEO.from }, {
        k: 1,
        duration: HERO_VIDEO.duration,
        delay,
        ease: HERO_VIDEO.ease,
        onUpdate() { intro = this.targets()[0].k; },
        onComplete() { intro = 1; }
      });
    });

    return function cleanup() {
      dead = true;
      gsap.ticker.remove(draw);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('page:leaving', freeze);
      gsap.killTweensOf([comp, growth]);
      scrollTween?.kill();
      gsap.set(comp, { clearProps: 'opacity,visibility' });
      restore();
    };
  });


  /* ===== THIRD PARTY (base-lib) ===== */

  // form-validation, match-container and video-min bind on
  // DOMContentLoaded, which fires once: without this they die on the
  // first swap.

  /* window.MYL does not exist and never did — the video library puts
     itself on window.videoLibrary, and form validation on a bare
     initAdvancedFormValidation. So this module read an undefined global,
     returned on the first line, and every swapped-in page got none of
     base-lib back.

     The cost was a hero video that played on a fresh load and not when
     you navigated to the page: these scripts bind once, on
     DOMContentLoaded, and a Barba swap replaces the elements they bound
     to. Nothing was re-scanning the new container, so a video waiting on
     data-video-scroll-in-play was waiting on an observer watching
     elements that had left the document.

     init(), not reinitialize(): reinitialize is destroy() then init(),
     and destroy() walks this.eventListeners with forEach — which is a
     WeakMap, and a WeakMap has no forEach. It throws every time, so the
     tidy call is the one that cannot work. init() re-scans and re-observes,
     which is the half that matters; the old observers are left pointing at
     nodes that have gone, and go with them. */
  Modules.add('baseLib', function (root) {
    const video = window.videoLibrary;
    if (video && typeof video.init === 'function') {
      try { video.init(); } catch (err) { console.warn('[baseLib] video init failed', err); }
    } else if (typeof window.initializeVideoLibrary === 'function') {
      try { window.initializeVideoLibrary(); } catch (err) { console.warn('[baseLib] video init failed', err); }
    }

    // Takes no root: it finds its own fields across the document.
    if (typeof window.initAdvancedFormValidation === 'function') {
      try { window.initAdvancedFormValidation(); } catch (err) { console.warn('[baseLib] form validation failed', err); }
    }

    /* match-container exposes nothing to call, so a swapped-in page
       cannot have it back. Left alone rather than guessed at. */
  });


  /* ===== PERSISTENT: FOOTER REVEAL ===== */

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

  /* Desktop only, matching the Designer: below this the footer is in flow
     and scrolls with the page, so there is nothing to reveal it through —
     the reserved space would just be a footer's height of nothing under
     the footer. */
  const FOOTER_PIN = '(min-width: 992px)';

  const FooterReveal = (function () {
    const footer = document.querySelector('.footer_wrap');
    const page = document.querySelector('.page_wrap');
    if (!footer || !page) return { sync() {}, collapse() {}, pinned: () => false };

    let pinned = false;

    /* '' rather than '0px' when there is nothing to reserve: the margin
       below the breakpoint belongs to the Designer, and zeroing it is
       still us writing it. Compared against the inline value first, so a
       no-op does not cost a scroll-height refresh. */
    const write = (value) => {
      if (page.style.marginBottom === value) return;
      page.style.marginBottom = value;
      refreshScrollHeight();
    };

    const sync = () => write(pinned ? `${footer.offsetHeight}px` : '');

    // Mid-transition the reserved space has to go, or the outgoing page is
    // measured against a document taller than what is on screen.
    const collapse = () => write(pinned ? '0px' : '');

    /* The context is torn down as the viewport crosses the breakpoint, so
       resizing down from desktop clears the margin rather than leaving
       yesterday's number on the element. */
    gsap.matchMedia().add(FOOTER_PIN, () => {
      pinned = true;
      sync();

      const ro = new ResizeObserver(() => {
        if (!document.documentElement.classList.contains('is-transitioning')) sync();
      });
      ro.observe(footer);

      return () => {
        pinned = false;
        ro.disconnect();
        sync();
      };
    });

    return { sync, collapse, pinned: () => pinned };
  })();


  /* ===== FOOTER CONTENT — README ### Footer reveal ===== */

  /* The footer is uncovered rather than scrolled to, so its contents are
     already in place when the first pixel of it shows. They sit low and
     ride up to meet it, scrubbed, so the rise happens while the page is
     still clearing rather than after it has.

     Not the site's [data-fade]: that waits for an intersection, and a
     fixed footer intersects the viewport from the first frame of the
     page — everything would have played long before anyone saw it. */
  const FOOTER_CONTENT = {
    travel: 160,            // px below its resting place the contents start

    /* The run-up, in viewports before the reveal. The section above the
       footer — a prefooter, or whatever is last — is what it is measured
       against when one is there. */
    lead: 1,
    prefooter: '.prefooter_wrap',

    /* Where in the reveal it lands, as a fraction of it. Short of 1 on
       purpose: ending on the document's last pixel puts the landing
       somewhere nobody can scroll to, and the footer reads as still
       arriving once the page has stopped. */
    settle: 0.7,

    // The spacer at the top of the footer holds no text and moving it
    // only shifts the gap above the content.
    skip: '.g_section_space'
  };

  (function initFooterContent() {
    const footer = document.querySelector('.footer_wrap');
    if (!footer || reducedMotion) return;

    const blocks = Array.from(footer.children).filter((el) => !el.matches(FOOTER_CONTENT.skip));
    if (!blocks.length) return;

    if (!hasScrollTrigger) return;

    const mm = gsap.matchMedia();

    /* ScrollTrigger rather than a scroll listener: Lenis drives the page
       from its own ticker and the window fires no scroll events at all,
       so a listener here never hears the reveal happen.

       Desktop only, like the pin itself: below the breakpoint the footer
       is in flow and scrolled to like any other section, with no reveal
       for the contents to ride. */
    mm.add(FOOTER_PIN, () => {
      const pre = document.querySelector(FOOTER_CONTENT.prefooter);

      /* Scroll positions, not an element trigger: the footer is fixed, so
         its box sits in the same place whatever the scroll and a trigger
         on it resolves once and stays there. The prefooter is in flow and
         can be measured — its top reaching the viewport's bottom is where
         the run-up begins. */
      const revealStart = () => ScrollTrigger.maxScroll(window) - footer.offsetHeight;

      const start = () => (pre
        ? revealStart() - pre.offsetHeight
        : revealStart() - window.innerHeight * FOOTER_CONTENT.lead);

      const end = () => revealStart() + footer.offsetHeight * FOOTER_CONTENT.settle;

      const tween = gsap.fromTo(blocks,
        { y: FOOTER_CONTENT.travel },
        {
          y: 0,
          ease: 'none',
          scrollTrigger: {
            /* Start and end are absolute positions, so the element is not
               measured — but afterLeave sweeps every trigger it cannot
               place in the document, and a trigger without one reads as
               an orphan. The footer is persistent, so it is the honest
               answer to where this belongs. */
            trigger: footer,
            start: () => Math.max(0, start()),
            end,
            scrub: true,
            invalidateOnRefresh: true
          }
        }
      );

      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
        gsap.set(blocks, { clearProps: 'transform' });
      };
    });

  })();


  /* ===== NAV SYNC — README ## Per-template attributes ===== */

  // The meganav persists, so data-transparent and the active-link state
  // are copied off the incoming page.

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


  /* ===== NAV SCROLL STATE — README ### Rules to delete from the nav's Webflow embed ===== */

  // is-scrolled on the persistent nav: transparent at the top, solid past
  // the threshold. Owned here, not by the nav's embed — delete that
  // embed's SCROLL WATCHER block.

  const NAV_SCROLL_AT = 10;

  /* The footer is fixed behind the page on desktop, so how much shows is
     the distance left to the bottom. Past enough of it the nav leaves,
     being the last thing overlapping a full-bleed panel. Two thresholds,
     since one line flickers wherever an inertia scroll rests on it. */
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
    // In flow below the breakpoint: nothing is being revealed, so the nav
    // is left to the scroll direction alone.
    if (!FooterReveal.pinned()) return 0;
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
        a.classList.remove('is-current', 'w--current');
        return;
      }
      let path;
      try { path = new URL(href, location.origin).pathname; } catch (err) { return; }
      const current = tidy(path) === here;
      a.classList.toggle('is-current', current);

      /* Webflow's own class goes with it. It is written at render and the
         nav is never swapped, so it otherwise describes whichever page
         was loaded first — and the Designer can hang styles on it: the
         logo carries a narrower width under .w--current on mobile, which
         followed you off the home page and shrank the mark everywhere. */
      a.classList.toggle('w--current', current);
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

  /* ===== MEGANAV — README ## Meganav ===== */

  // A full-viewport sheet swiping down from the top edge, its contents
  // rising behind the swipe. Init runs once, never per container: the nav
  // persists, and sync:true would bind a second set of listeners per
  // navigation. The sheet's own CSS is in page-transition.css.

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

    /* Of the feature sentence's rise, the text the button sits under: 1
       waits it out, 0 leaves with it. Where that sentence is not on
       screen, of the last row's rise, after the swipe. */
    buttonOverlap: 0.45,

    /* Opacity and nothing else — the button does not travel to get
       there. Shorter than the text sections' 0.45s: it follows a sentence
       already on its way, and a slow fade read as the button lagging. */
    buttonFade: 0.3,
    buttonFadeEase: E.quart,

    /* The feature sentence rises line by line out of its masks, the way
       a heading does on the page — on the heading's curve, but a menu's
       clock: 1.2s a line is paced for a page, not a sheet that is open
       for seconds. */
    featureDuration: QUBIC.l,   // 0.8
    featureStagger: 0.08,
    featureEase: QUBIC.ease,

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

    /* Cut on every open and put back on every close: the sheet opens at
       whatever width the window has now, and a split is one layout's
       lines. It rides in content all the same, for its place in the
       stagger and for the close's fade. */
    const feature = panel.querySelector('.meganav_feature_text');
    let featureStep = null;
    const unsplitFeature = () => {
      featureStep?.split?.revert();
      featureStep = null;
    };

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
        const rowAt = (i) => MENU.contentDelay + i * MENU.contentStagger;

        unsplitFeature();
        const featureShown = Boolean(feature) && content.includes(feature)
          && feature.getClientRects().length > 0;
        if (featureShown && hasKugiri) {
          featureStep = { el: feature, level: 'lines', split: null, units: [] };
          splitSteps([featureStep]);
          widenMasks(featureStep.split);
          if (!featureStep.units.length) unsplitFeature();
        }
        const lines = featureStep ? featureStep.units : [];
        const featureRise = lines.length
          ? (lines.length - 1) * MENU.featureStagger + MENU.featureDuration
          : MENU.contentDuration;

        const rowsEnd = content.reduce((end, el, i) => isButton(el) ? end
          : Math.max(end, rowAt(i) + MENU.contentDuration * MENU.buttonOverlap), 0);
        const buttonAt = featureShown
          ? rowAt(content.indexOf(feature)) + featureRise * MENU.buttonOverlap + MENU.buttonGap
          : Math.max(MENU.duration, rowsEnd) + MENU.buttonGap;

        content.forEach((el, i) => {
          const at = isButton(el) ? buttonAt : rowAt(i);
          const own = parseFloat(el.dataset.navDelay);

          if (el === feature && lines.length) {
            const from = at + (Number.isFinite(own) ? own : 0);
            // The lines travel inside their masks; the block only has to show.
            tl.set(el, { y: 0, opacity: 1 }, 0);
            lines.forEach((line, k) => {
              tl.fromTo(line,
                { yPercent: parkOffset(line) },
                { yPercent: 0, duration: MENU.featureDuration, ease: MENU.featureEase },
                from + k * MENU.featureStagger
              );
            });
            // A mask cuts descenders at rest, so it comes off once they land.
            tl.call(() => { if (featureStep) unclipStep(featureStep); }, null, from + featureRise);
            return;
          }

          tl.fromTo(el,
            isButton(el) ? { opacity: 0 } : { y: MENU.contentShift, opacity: 0 },
            isButton(el)
              ? { opacity: 1, duration: MENU.buttonFade, ease: MENU.buttonFadeEase }
              : {
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
        unsplitFeature();
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
      unsplitFeature();
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


  /* ===== WEBFLOW REINIT ===== */

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


  /* ===== LENIS ===== */

  function initLenis() {
    if (lenis || !hasLenis) return;

    lenis = new Lenis({ lerp: 0.165, wheelMultiplier: 1.25 });

    if (hasScrollTrigger) lenis.on('scroll', ScrollTrigger.update);

    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }


  /* ===== FUNCTION REGISTRY ===== */

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
    /* Before the intro, not after: the queue creates this page's
       ScrollTriggers, and the reserved space is part of the document they
       measure against — collapse() left it at the outgoing page's value. */
    FooterReveal.sync();
    Intro.play(nextPage);
    if (hasLenis && lenis) lenis.resize();
    if (hasScrollTrigger) ScrollTrigger.refresh();
  }


  /* ===== PAGE TRANSITIONS — README ## The transition ===== */

  // A crossfade: both pages hold the same rectangle for a second, the
  // outgoing one blurring out under the incoming one. The layers below
  // are what lets them overlap at all.

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
      position: 'absolute', top: -ScrollMemory.layerOffset(next), left: 0, width: '100%',
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
    ScrollMemory.apply(container);
  }


  /* ===== BACK TO THE SECTION — README ## Back button ===== */

  /* history.scrollRestoration is manual and every swap starts at the top,
     so Back used to land there too. The section is what is kept, not the
     pixel: an intro, a pin or a slider settling differently moves every
     offset below it, and the section still holds the place.

     Menu, nav and footer links forget the page instead — the client asked
     for Back after a menu jump to go to the top. */
  const ScrollMemory = (function () {
    const KEY = 'artbox-scroll';
    const MENU = '.meganav_root, .meganav, [data-nav], [data-nav-panel], .footer_wrap';
    let saved = {};
    let pending = null;
    try { saved = JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) {}

    const keyOf = (href) => {
      const url = new URL(href, location.href);
      return url.pathname + url.search;
    };
    const persist = () => {
      try { sessionStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {}
    };

    const sectionsIn = (container) => [...container.querySelectorAll('section')]
      .filter((el) => !el.parentElement.closest('section'));

    // A pinned section sits at the viewport top for its whole run; the
    // spacer is what holds its place in the page.
    function topIn(el, container) {
      const host = el.parentElement?.classList.contains('pin-spacer') ? el.parentElement : el;
      return host.getBoundingClientRect().top - container.getBoundingClientRect().top;
    }

    function capture(container) {
      const view = -container.getBoundingClientRect().top;
      const line = view + window.innerHeight * 0.3;
      const list = sectionsIn(container);
      let index = -1;
      list.forEach((el, i) => { if (topIn(el, container) <= line) index = i; });
      if (index < 0) return { index, into: view };
      return { index, into: view - topIn(list[index], container) };
    }

    // Distance from the container's top, so it works both while the page
    // is a fixed layer in the crossfade and once it is in the flow.
    function offsetIn(container, entry) {
      const el = sectionsIn(container)[entry.index];
      return Math.max(0, (el ? topIn(el, container) : 0) + entry.into);
    }

    function scrollTo(y) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const target = Math.min(Math.max(0, y), Math.max(0, max));
      window.scrollTo(0, target);
      if (hasLenis && lenis) lenis.scrollTo(target, { immediate: true, force: true });
    }

    return {
      leave(data) {
        const trigger = data?.trigger;
        const current = data?.current;
        if (current?.container && current.url?.href) {
          const key = keyOf(current.url.href);
          if (trigger instanceof Element && trigger.closest(MENU)) delete saved[key];
          else saved[key] = capture(current.container);
          persist();
        }
        const next = data?.next?.url?.href;
        const isHistory = typeof trigger === 'string' && trigger !== 'barba';
        pending = isHistory && next ? saved[keyOf(next)] || null : null;
      },
      // For the incoming layer during the crossfade, so the fade lands on
      // the section instead of on the top of the page.
      layerOffset(container) {
        return pending ? offsetIn(container, pending) : 0;
      },
      apply(container) {
        if (!pending || !container) return;
        const docTop = container.getBoundingClientRect().top + window.scrollY;
        scrollTo(docTop + offsetIn(container, pending));
      },
      // Again once the page's triggers have refreshed: pin spacers arrive
      // then, and move every section below the first pin.
      settle(container) {
        if (!pending) return;
        this.apply(container);
        pending = null;
        if (hasScrollTrigger) ScrollTrigger.update();
        document.dispatchEvent(new CustomEvent('page:restored', { detail: { container } }));
      }
    };
  })();


  /* ===== BARBA ===== */

  const root = document.documentElement;

  barba.hooks.beforeLeave((data) => {
    root.classList.add('is-transitioning');
    ScrollMemory.leave(data);
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
    requestAnimationFrame(clearTransitionLeftovers);
  });

  barba.hooks.after((data) => {
  FooterReveal.sync();
  ScrollMemory.settle(data?.next?.container);
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
