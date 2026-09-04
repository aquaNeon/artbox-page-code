/* ============================================================
   Artbox — Barba page transitions

   Load AFTER gsap, CustomEase, @barba/core, lenis and swiper,
   and place it before </body>. This file runs immediately: it
   queries .footer_wrap / .page_wrap and calls barba.init(), so
   the DOM has to exist by the time it parses.

   Required structure:

   body                     data-barba="wrapper"
     .global_embeds         CSS embeds, u-hide class dump
     .meganav_root          persists, never swapped
     .page_wrap             gets perspective during transition
       main.page_main       data-barba="container"
                            data-barba-namespace="home"
                            data-nav-transparent="true"   (per template)
     .footer_wrap           MUST be a sibling of .page_wrap, not inside it

   The footer placement is not cosmetic. prepareForTransition puts
   perspective on .page_wrap, and perspective creates a containing
   block for fixed-position descendants. A footer inside .page_wrap
   would stop resolving against the viewport.
   ============================================================ */

(function () {
  'use strict';

  /* Bump on every push. jsDelivr sends max-age=604800, so a plain reload
     serves the browser's week-old copy without revalidating and it is
     otherwise impossible to tell which build is running. Check the
     console line against the repo before debugging anything else. */
  const BUILD = '2026-09-04-bu';
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

  const durationDefault = 0.6;
  CustomEase.create('osmo', '0.625, 0.05, 0, 1');
  gsap.defaults({ ease: 'osmo', duration: durationDefault });

  /* The page transition itself: the outgoing page blurs and fades out
     while the incoming one sharpens and fades in, both at once, both
     filling the same rectangle. CustomEase takes the four numbers of a
     CSS cubic-bezier as-is, so this is the same curve the reference CSS
     used. */
  CustomEase.create('pageFade', '0.25, 0.46, 0.45, 0.94');

  const FADE = {
    duration: 1,
    blur: 5,          // px, on both layers
    ease: 'pageFade'
  };


  /* ============================================================
     MODULE REGISTRY

     Keyed by container, because sync:true means the incoming page
     mounts while the outgoing one is still on screen animating.
     A single shared cleanup list would tear down the wrong page.
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
        /* barba fires beforeEnter on the initial load as well as on
           navigations, so this used to run twice for the first page: once
           from the hook and once from the transition's own once(). Two
           mounts meant two Swiper instances on one element, two marquee
           rAF loops, and only the second set of teardowns being kept. */
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
     INTRO QUEUE

     Modules mount at beforeEnter, while the incoming page is still a
     fixed 100vh rectangle sliding in from the right. An intro timeline
     started there plays behind the transition and is half over by the
     time the page lands. Modules queue theirs here instead and it runs
     once the container is laid out for real: afterEnter on a navigation,
     and explicitly in once() for the first load, which afterEnter does
     not fire for.
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

      /* The colour panel covers the card, but only to the pixel. Wherever
         its edge antialiases — which is most of the time, since card
         heights land on fractions — the card's own background shows as a
         hairline, and that background is near-black behind a light panel.
         Paint the card in the panel's colour so there is nothing
         contrasting left to expose. Read rather than configured, because
         the colour comes from a Webflow variant class that only exists at
         runtime. */
      const panel = card.querySelector('.card_hover_bg_hover');
      if (!panel) return;
      const panelBg = getComputedStyle(panel).backgroundColor;
      if (panelBg && panelBg !== 'rgba(0, 0, 0, 0)' && panelBg !== 'transparent') {
        card.style.backgroundColor = panelBg;
      }

      /* The secondary lines derive their colour from currentColor, and the
         parent already animates colour on hover — so a transition here
         animates an already-animating value and the line lags behind the
         rest of the card. Most visible on the light variants, where the
         text swings the full distance to black.

         Set inline rather than in a stylesheet: the competing rule lives in
         another embed, three levels deep and later in the document, so any
         rule we add ties on specificity and loses on order. An inline style
         outranks every non-important rule regardless of where it sits. */
      card.querySelectorAll(
        '.card_hover_details_name, .card_hover_details_position, .u-color-secondary'
      ).forEach((el) => { el.style.transition = 'none'; });
    });
  });

  /* ============================================================
     SMOOTHLY — .work_smoothly_wrap

       data-autoplay              step a slide every 4000ms
       data-autoplay="6000"       ms between steps
       data-autoplay="drift"      continuous marquee-style motion
       data-autoplay-speed="0.2"  drift only, slides per second
       data-autoplay="false"      off, same as leaving the attribute out

     Two modes because they read differently: stepping lands on a slide
     and holds, which suits a slider somebody is meant to look through;
     drift never settles, which suits a band of logos or images that is
     really just texture.

     Opt-in per slider, because most of them are things you read
     rather than watch. Paused while the pointer is over it, while it
     is being dragged, while it is off screen, while the tab is in the
     background and through a page transition — anything that would
     otherwise advance past a reader or animate where nobody is.

     Driven off the module's own rAF rather than a timer: a setInterval
     keeps firing in a background tab and would queue up a fistful of
     steps to play out the moment somebody came back.
     ============================================================ */

 Modules.add('smooothy', function (root) {
  const els = root.querySelectorAll('.work_smoothly_wrap');
  if (!els.length) return;

  const html = document.documentElement;
  const instances = [];
  let rafId = null;
  let killed = false;

  /* smooothy stores position as a NEGATIVE slide count: goToIndex(i)
     assigns target = -i, and forward travel means target decreasing.
     Reading the index back therefore needs -target, and stepping with
     goToIndex(round(target) + 1) flips the sign on every call — which
     lands on 0, -1, 0, -1, a slide forward and a slide back forever. */
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

  /* Ours rather than the library's isVisible: that flag is internal and
     only set when its own observer is running, and a slider quietly
     advancing off screen is the failure this is meant to prevent. */
  const seen = new WeakMap();
  const visibility = new IntersectionObserver((entries) => {
    entries.forEach((entry) => seen.set(entry.target, entry.isIntersecting));
  }, { threshold: 0 });

  const hoverDetachers = [];

  const advance = (inst, now) => {
    if (!inst.auto) return;

    /* The clock is reset rather than paused, so coming back from a
       background tab or a hover neither jumps a slide nor lurches
       through however much drift the pause was worth. */
    if (inst.hover || inst.slider.isDragging || document.hidden
      || seen.get(inst.el) === false) {
      inst.last = now;
      return;
    }

    if (inst.auto.drift) {
      /* Target is in slides, and current lerps toward it — so nudging
         the target every frame reads as continuous motion rather than
         as very small steps. Capped, because a dropped frame or a tab
         that was hidden a moment ago would otherwise be paid out in
         one jump. */
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

        /* Reduced motion takes the autoplay and leaves the slider: it can
           still be dragged, it just will not move on its own. */
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
        /* Mid-transition every layer is position:fixed, so a slider
           measured or advanced here lands against the wrong box. */
        if (!html.classList.contains('is-transitioning')) {
          const at = now || performance.now();
          instances.forEach((inst) => {
            inst.slider.update();
            advance(inst, at);
          });
        } else {
          /* Held, not accumulating — otherwise the slider jumps as many
             steps as the transition was long the moment it ends. */
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
     SWIPER
     ============================================================ */
  /* ============================================================
     SWIPER
     ============================================================ */

  /* ============================================================
     TEXT REVEAL — [data-text-anim]

     Ported from the ManyChat creators-for-creators build with the
     attribute contract unchanged, so markup moves between the two
     sites as-is. Two things differ, both forced by this repo:

       - it mounts per Barba container instead of a global registry,
         so everything is torn down and the SplitText reverted when
         the page leaves;
       - the ScrollTriggers are created from the Intro queue, not at
         mount. Mount happens at beforeEnter while the container is a
         fixed 100vh rectangle sliding in, and a trigger measured
         against that fires at the wrong scroll position — or fires
         immediately and plays the reveal behind the transition. The
         split and the hidden start state still happen at mount, so
         nothing flashes in the meantime.

     Marked explicitly, never guessed from the tag: Webflow text and
     link components are div-based, so tag detection finds nothing on
     real markup.

       data-text-anim           group root, one trigger
       data-text-anim-heading   splits to lines, each rises out of a mask
       data-text-anim-body      neighbouring body elements rise as one block
       data-text-anim-solo      breaks an element out into its own step
       data-text-anim-list      repeated list, items wave in as one step
       data-text-anim-stagger   on a shared ancestor: ONE trigger for all the
                                [data-text-anim] cards under it, plus a
                                per-card delay (default 0.15)

       data-text-anim-delay     on the group root: seconds to wait after the
                                trigger fires before the group starts.
                                On a step: extra gap before that one step,
                                on top of its overlap. Ignored on an element
                                that is both root and step — there it is the
                                group delay and nothing else.
       data-text-anim-speed     on a step: that step alone runs at this
                                rate. 0.6 slower, 1.5 quicker. The group
                                root's own number still scales everything.

     The group root takes a number too, and it is a speed, not a time:
     data-text-anim="0.6" runs that whole group at 0.6x — slower and
     more deliberate — while 1.5 runs it faster. It scales the tweens
     and the gaps between them together, which is what you want when
     the sequence reads too quick; the per-step value only moves the
     steps closer or further apart and cannot slow anything down.

     Steps run in DOM order, each overlapping the previous step's END
     by the attribute's own value in seconds — data-text-anim-solo="0.7"
     — default 0.4.

     The scramble variant is deliberately not ported: it needs a
     [data-text-anim-scramble]{opacity:0!important} rule in the site
     head and the scramble util, and neither exists here yet.
     ============================================================ */

  const TEXT = {
    stagger: 0.15,          // between cards under [data-text-anim-stagger]
    overlap: 0.4,           // step overlap when the attribute carries no value
    start: 'top 80%',

    /* The mask is overflow:hidden, so it clips whatever sits below the
       line box — the descenders of g, j, p, q, y, and accents on some
       faces. Pad the mask and cancel the pad with an equal negative
       margin: the clip moves down, the layout does not move at all.
       In em, so it scales with the type rather than with a px guess. */
    maskPad: 0.34,

    /* And the same allowance upward. The mask clips whatever rises above
       the line box — the ring on an Å, an accent, a tall ascender in a
       face with a generous cap height — which is not something a line
       box promises to contain. */
    maskPadTop: 0.16,

    headingDuration: 0.75,
    headingStagger: 0.16,
    headingEase: 'power4.out',

    /* Inline images inside a heading — the hero puts square photos
       between the words. They scale rather than travel: the line mask
       already carries them up with the type. */
    imgFrom: 0.6,           // 0 turns the image scaling off
    imgDuration: 0.9,
    imgEase: 'power2.out',
    imgOffset: 0.08,        // after its own line starts
    imgStagger: 0.08,       // between images sharing a line

    bodyDuration: 0.9,
    bodyStagger: 0.08,
    bodyEase: 'power3.out',
    bodyFromY: 30,          // yPercent

    /* -solo is usually one line — an eyebrow, a button, a short
       statement — where 30% of its own height is a bigger move than the
       same number on a paragraph. Its own number. */
    soloFromY: 14,

    listDuration: 0.5,
    listStagger: 0.06,
    listEase: 'power2.out',

    blur: false,            // layers onto the existing tweens, not a separate mode
    headingBlur: 10,        // px per line
    bodyBlur: 8             // px
  };

  /* Dev override, no rebuild: ?blur=1 / ?blur=0 in the URL. */
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

  /* How far the tallest thing on a line pokes out of the line box.
     An inline image sized in em — the hero headings set one between
     the words at 2em, pulled up with a negative margin — stands well
     above the type, and the mask that saves the descenders would
     otherwise slice its top clean off. Measured before the padding
     goes on, so the line box is still the bare one. */
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

  /* Webflow routinely marks the wrapper rather than the heading: a div
     carrying the style class with an embedded <h1> inside it. SplitText
     hoists the lines out of that inner block, and its revert puts them
     back on the wrapper, not into the <h1> — so the first mount empties
     the heading element permanently and the page is left with a hero
     whose <h1> holds nothing. Descend to the element that actually holds
     the text and split that: the lines stay inside it and revert is
     lossless. Stops at anything inline, which cannot be a line box. */
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
      /* Same trick upward, and the same two sources: whatever a child
         element overhangs by, or the type's own allowance — whichever
         is larger. */
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
    /* overflow clips to the PADDING box, so every pad added above is a
       strip the waiting line can show through — including the one that
       clears an inline image's head. Derive the start from each line's
       own pads rather than guessing a flat number: 100% clears the line
       box, the ratio clears the pads, and 5% covers sub-pixel rounding.
       A flat value is either short on a big pad or wastefully far on a
       small one. */
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

  /* The pad has to be measured against the type that is actually being
     clipped, not against the element doing the clipping. Webflow markup
     routinely nests an h2 inside a plain wrapper, so the wrapper sits at
     16px while the glyphs are 60 — an em on the wrapper resolves to about
     3px and clips exactly as before. Take the largest font-size in the
     subtree and return px. */
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

  /* Masks are ours to pad, but a -solo or -body element can be clipped by
     a Webflow class of its own — a clamp, a fixed height, an overflow on
     the wrapper. Same trick, applied to whatever actually clips: grow the
     clip box downward, cancel the growth with an equal negative margin, so
     nothing in the layout moves. Walks up to the group root, since the
     clipper is as often the wrapper as the text element itself. */
  function unclipDescenders(el, stop) {
    for (let node = el; node && node !== stop && node !== document.body; node = node.parentElement) {
      if (node.dataset.textAnimUnclipped) continue;
      const cs = getComputedStyle(node);
      if (cs.overflow === 'visible' && cs.overflowY === 'visible') continue;
      node.dataset.textAnimUnclipped = 'true';
      /* Additive: these elements usually already carry padding from a
         Webflow class, and replacing it would move the text. */
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

  /* role="listitem" is what the CMS emits; data-text-anim-list-item covers
     hand-added extras. Direct children are the last resort for a list built
     by hand in the Designer. */
  function listItems(el) {
    const items = el.querySelectorAll('[role="listitem"], [data-text-anim-list-item]');
    return items.length ? Array.from(items) : Array.from(el.children);
  }

  /* A double <br><br> in a rich text block reads as a paragraph break, so
     split there and let the halves stagger instead of rising fused. */
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

  /* An image inside a heading scales up as its line arrives. The
     wrapper is what scales, not the img: the hero frames are
     aspect-ratio boxes with object-fit:cover inside, so scaling the
     picture alone would just show the frame's own background around a
     shrunken photo. Scale never reflows, so the words on either side
     hold their positions while it grows. */
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
    /* Nested [data-text-anim]: a marked element belongs to its nearest
       group root only, never to both. */
    const own = ['data-text-anim-heading', 'data-text-anim-body',
                 'data-text-anim-solo', 'data-text-anim-list'];
    const selfMarked = own.some((attr) => wrap.hasAttribute(attr)) ? [wrap] : [];
    const marked = [
      ...selfMarked,
      ...Array.from(wrap.querySelectorAll(
        '[data-text-anim-heading], [data-text-anim-body], [data-text-anim-solo], [data-text-anim-list]'
      )).filter((el) => el.closest('[data-text-anim]') === wrap)
        /* Anything inside a [data-swap] belongs to that module. Marked
           for both, an element is animated by both: this one parks it
           at translate(0, 30%) and waits for its own trigger while the
           swap animates the same transform, and whichever writes last
           wins — a statement sitting a third of its height out of
           place, and only the one carrying the attribute. Two
           entrances for one element was never the intent. */
        .filter((el) => !el.closest('[data-swap]'))
    ];
    if (!marked.length) return null;

    const tl = gsap.timeline({ paused: true });
    const speed = parseFloat(wrap.dataset.textAnim);
    if (Number.isFinite(speed) && speed > 0) tl.timeScale(speed);
    /* Held outside the timeline and applied as a delayedCall on play.
       A paused timeline swallows its own delay when something calls
       play() on it, so putting it here would silently do nothing. */
    const rawDelay = parseFloat(wrap.dataset.textAnimDelay);
    const delay = Number.isFinite(rawDelay) && rawDelay > 0 ? rawDelay : 0;
    const splits = [];
    let bodyBuffer = [];
    let isFirst = true;
    /* Where the step that was added last begins, for [data-text-anim-with]
       to line up against. Read off the timeline rather than accumulated by
       hand, so overlaps and delays are already accounted for. */
    let lastStart = 0;
    const remember = () => {
      const step = tl.recent();
      if (step) lastStart = step.startTime();
    };

    /* A step's own rate. Applied as duration / speed rather than a nested
       timeScale, so the value reads the same way as the group root's. */
    const stepSpeed = (el) => {
      const v = parseFloat(el.dataset.textAnimSpeed);
      return Number.isFinite(v) && v > 0 ? v : 1;
    };

    const stepDelay = (el) => {
      if (el === wrap) return 0; // the root's delay is the group delay
      const v = parseFloat(el.dataset.textAnimDelay);
      return Number.isFinite(v) && v > 0 ? v : 0;
    };

    /* Overlap pulls a step earlier, delay pushes it later, and one step can
       carry both — resolve them into a single signed offset rather than
       stacking two position strings, which gsap applies in sequence and
       would leave the timeline dependent on which one was written first. */
    const position = (el) => {
      const delay = stepDelay(el);
      if (isFirst) { isFirst = false; return delay; }
      /* data-text-anim-with: run alongside the previous step instead of
         after it. Two cells sharing a row read as one move that way,
         while staying separate elements — which they have to be when
         each carries its own border. An absolute time, because a
         relative one is measured from the timeline's end and the
         previous step is still running. */
      if (el.hasAttribute('data-text-anim-with')) return lastStart + delay;
      const offset = delay - stepOverlap(el);
      return offset >= 0 ? `+=${offset}` : `-=${-offset}`;
    };

    /* Transforms do not apply to display:inline, and a Webflow Link (as
       opposed to a Link Block) is inline — the element would fade but never
       move, or with opacity already at 1 from a class, do nothing visible at
       all. Promote it rather than fail quietly. */
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
        /* From the heading itself, not its parent. A one-line heading is
           exactly as tall as its single line box, so its own overflow —
           or a Webflow class setting a height in line-height units —
           crops the descenders before the parent ever gets a say. */
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
        /* recent(), because timeline.to() returns the timeline — the
           images need the line tween's own start time to sit on. */
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
        /* -solo, and -heading when SplitText did not load. The fallback is
           deliberate — a heading that never appears is worse than one that
           rises as a block — but it is indistinguishable from a working
           line rise unless it says so. */
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
      /* Staggered delayedCalls rather than nested paused timelines, which
         do not reliably play when added to a parent with .add(). */
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

    /* Triggers wait for the container to be laid out for real. Reduced
       motion has already jumped every timeline to its end state, so it
       needs no trigger at all. */
    if (!reducedMotion && hasScrollTrigger) {
      Intro.add(root, () => {
        instances.forEach((inst) => {
          inst.st = ScrollTrigger.create({
            trigger: inst.trigger,
            start: TEXT.start,
            once: true,
            onEnter: () => {
              /* A group taller than the viewport fires on its own top edge,
                 so its lower steps can finish while still off-screen and read
                 as "never animated". This is what that looks like in the log. */
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

     The section is white on the way in. It sticks, the yellow washes
     up under it, and the images rise out of the fold, up their own
     columns at their own rates, past the text and off the top. It is
     still stuck when the last one leaves; only then does it let go.

     Its own module rather than [data-parallax] because the shape is
     different. That module is symmetric — displaced one way at the
     start, the other at the end, at rest exactly at the midpoint —
     which is a drift, not an arrival. Here every image travels one
     way, from below the fold to above the frame, and the ones with
     the higher numbers travel further in the same scroll, which is
     what reads as speed.

     The strengths already on the markup are reused as those rates, so
     the Designer stays the place they are tuned. The attributes are
     taken off their elements while this module owns them: two owners
     of one transform fight and drift, and the generic module would
     otherwise animate exactly these five.

     The whole thing is scrubbed against the sticky window — the frame
     is on screen for precisely start: top top / end: bottom bottom, so
     nothing happens before it is watchable or after it is gone.
     ============================================================ */

  const CTA = {
    /* Screens of scrolled height for the section, the sticky screen
       included: the pin lasts this minus one. Written to the section
       from here so the number lives with the motion it paces rather
       than in the embed. */
    scroll: 4.7,

    /* Fractions of the pin. The neon is done early — it is the ground
       the images arrive onto, not an event of its own — and the travel
       finishes before the end so the section is still holding when the
       last image leaves, which is the beat the release needs. */
    tint: 0.22,

    /* The fade starts this far into the pin rather than on its first
       pixel. start: 'top top' is the lock by definition, but a scrub
       eases toward its target rather than sitting on it, so the colour
       was already on its way while the section was still arriving. A
       beat of nothing puts it unambiguously after the lock. */
    tintStart: 0.04,

    /* Where the last image is made to finish, as a fraction of the
       pin. The schedule below is scaled to land on it — so the tail of
       dead scrolling after everything has gone is whatever is left of
       the pin past this number, and not an accident of five delays
       adding up to less than the section is long. */
    fit: 0.97,
    travel: 0.92,

    /* Screens below the fold they all start, and past the top where
       they all finish — the same journey for every image. What
       differs is how long each one takes over it and when it sets
       off, which is speed and timing kept apart. Making the fast ones
       travel further tangled the two: further meant starting lower,
       so a fast image was also a late one and neither could be tuned
       without moving the other. */
    lead: 1.1,
    exit: 0.35,

    /* Two speeds, not five. A rate per image reads as noise — the eye
       cannot tell 3 from 3.5 and does not try — while two clearly
       different ones read as depth. The numbers on the markup pick a
       side: at or below the middle of them is the slow lane, above it
       the fast one. Fractions of the pin each lane takes to cross.

       Add a third number here and there are three lanes; the sorting
       follows the length of this list. */
    /* Three lanes: slow, middle, fast. The middle one exists because
       an image can be wrong in both directions — too quick against the
       slow ones, too slow to sit with the fast ones — and rounding it
       to one or the other is how a five-image drift turns back into
       two columns moving in lockstep. */
    lanes: [0.6, 0.47, 0.34],

    /* Spread through the pin by DOM order when nothing says otherwise,
       so five images do not set off together. data-cta-delay on any of
       them overrides its share of this. */
    stagger: 0.16,

    /* One number for how spread out the whole sequence is. Every delay
       below is multiplied by it, so the arrangement — which image is
       early, which is late, and by how much relative to the others —
       survives tightening or loosening the lot. Tune this before
       touching individual numbers. */
    spread: 0.62,

    /* The arrangement, by the combo class each image carries. DOM order
       is not the order they should rise in — the grid puts them where
       the layout wants them, which has nothing to do with the sequence
       — and is-1 to is-5 is how they are already named.

       delay is a fraction of the pin. lane is an index into lanes
       above: 0 is the slow one, 1 the fast one. Anything with
       data-cta-delay or data-parallax on the element itself overrides
       what is written here, so this is the default arrangement rather
       than the only one.

       A late image cannot also be slow — everything has to clear the
       screen by travel — so the slow lane belongs to one that sets off
       early. That is the whole trade: lateness is bought with speed. */
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

    /* Taken off before the parallax module mounts — this one is
       registered above it, so its querySelectorAll finds nothing to
       take over. Restored on teardown, so the markup leaves exactly as
       it arrived. */
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

    /* The neon is a layer, not the section's background. One element
       cannot cross-fade one background into another, so the section
       keeps the page's primary in the Designer and the neon arrives
       over it. Both colours stay named there — this file only fades
       the layer.

       On the section, not inside the sticky frame. The frame is one
       screen of a section several screens tall, so a colour laid in it
       covers the screen while the pin holds and nothing at all once it
       lets go — the neon would fall off the bottom of its own section.
       First child, so the frame paints over it in DOM order. */
    const tint = document.createElement('div');
    tint.className = 'cta_bg_tint';
    section.insertBefore(tint, section.firstChild);

    /* Named in the Designer, resolved here. A var that does not resolve
       in this scope is not an error to the browser — the layer is
       simply transparent, and a fade to nothing is indistinguishable
       from no fade at all. */
    if (!getComputedStyle(tint).backgroundColor ||
        getComputedStyle(tint).backgroundColor === 'rgba(0, 0, 0, 0)') {
      console.warn(
        '[cta] the tint layer has no colour: --cta-tint is unset and ' +
        '--_colour---color--color-neon does not resolve on this element. ' +
        'Set --cta-tint on .cta_wrap to whatever the section should ' +
        'become.', section
      );
    }

    /* The clip is normally the parallax module's, applied to whatever
       carries data-parallax-clip. It has nothing to apply it to any
       more — its items are this module's now, so it returns before it
       gets there — and without it the images are in plain sight below
       the section long before it sticks.

       clip-path rather than overflow: an overflow other than visible
       makes the element the scrollport its sticky descendants resolve
       against, which is the pin this whole section is built on. */
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
      /* No scroll to scrub against, or nobody asking for motion: the
         section is simply what it ends as. */
      tint.style.opacity = '1';
      return restore;
    }

    /* Which lane each image is in. The DISTINCT numbers are what get
       sorted, not all of them: one slow image among four fast ones is
       a set where four fifths of the ranks are the same number, and
       ranking by position in that list put every one of them in the
       slow lane. What the Designer is choosing between is the values,
       so those are what divide up the lanes. */
    const distinct = [...new Set(owned.map((o) => o.speed))].sort((a, b) => a - b);
    const laneOf = (speed) => {
      const at = distinct.length > 1
        ? distinct.indexOf(speed) / (distinct.length - 1)
        : 0;
      const i = Math.round(at * (CTA.lanes.length - 1));
      return CTA.lanes[Math.max(0, Math.min(CTA.lanes.length - 1, i))];
    };

    /* Where the image sits inside the frame, transforms excluded.
       offsetTop is layout, so it is unaffected by the y this module is
       writing — a rect would be measuring its own tween. The frame is
       the screen while the pin holds, so this is the distance from the
       top of the screen. */
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
            /* After anything that pins above it — this module is
               registered above heroVideo and would otherwise be
               measured against a document that has not been given the
               hero's pin spacing yet. */
            refreshPriority: -1
          }
        }
      );

      /* Scaled so the last one lands on fit. Written as fractions the
         schedule ends wherever it happens to end — here 0.90 of a pin
         that runs to 1, which is a third of a screen of scrolling with
         nothing on it before the section lets go. Same shape, same
         order, stretched to fill what it has. */
      const ends = owned.map(({ speed, delay, lane }, i) => {
        const span = lane == null
          ? laneOf(speed)
          : CTA.lanes[Math.max(0, Math.min(CTA.lanes.length - 1, lane))];
        const off = (Number.isFinite(delay) ? delay : i * CTA.stagger) * CTA.spread;
        return off + span;
      });
      /* Never past the release: fit is where the last image is asked to
         land, travel is where it has to be gone by, and a fit beyond it
         means every schedule overruns and gets hurried. */
      const fit = Math.min(CTA.fit, CTA.travel) / Math.max(...ends);

      owned.forEach(({ el, speed, delay, lane }, i) => {
        /* Named lane first, then the number on the markup. Both say
           the same thing; the class is simply the one already there. */
        let span = (lane == null
          ? laneOf(speed)
          : CTA.lanes[Math.max(0, Math.min(CTA.lanes.length - 1, lane))]) * fit;
        const off =
          (Number.isFinite(delay) ? delay : i * CTA.stagger) * CTA.spread * fit;
        let end = off + span;

        /* Nothing is still on screen when the section lets go. A late
           image with a long window would otherwise be cut off by the
           release, halfway up, mid-scroll. It is hurried instead —
           the alternative is holding the pin open for one straggler,
           which changes the section's length out from under every
           other number here. */
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

        /* Both ends are the screen, not the cell. y is relative to
           wherever the grid put this image, and the cells sit at
           different heights — so "up by its own height" cleared the
           top for the ones already near it and left the low ones
           still showing at the release. */
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
              /* Offsets into the pin rather than a shared range: when
                 an image sets off is its delay, how long it takes is
                 its span, and neither touches the other. */
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
     EYEBROW ICON — .icon_eyebrow_wrap

     A square that matches the type beside it. The footer link does this
     in em, which works because the size lives on the wrap there and the
     label inherits it. Here the size class is on the text, so the wrap
     has no idea how big it is — the text's own computed size is read
     and handed back as a variable.
     ============================================================ */

  const EYEBROW = {
    ratio: 0.72,     // of the text's font size
    gap: 0.5,        // of the same, between square and text

    /* Same component, drawn twice in the Designer under different
       names. Add a pair rather than a second module. */
    pairs: [
      { wrap: '.icon_eyebrow_wrap', text: '.icon_eyebrow_text' },
      { wrap: '.design_sticky_eyebrow', text: '.design_sticky_eyebrow_text' },
      /* The footer link's hover icon is em-sized against the wrap,
         which only works while the wrap carries the type size. Once the
         text's own class governs, the wrap has no idea — so it is
         measured here like the rest. */
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

    /* Fluid type changes with the viewport, so the square follows it. */
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
     CORPORATE HERO — mobile images

     The inline images in the heading are hidden below 767 and this
     block takes their place: they fade and scale in on a stagger (the
     keyframes are in page-transition.css) and drift against the scroll.
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

     Column drift: each marked element travels against the scroll at
     its own rate while its group passes the viewport, so a grid of
     images reads as several columns moving at different speeds with
     static text sitting on top of them.

       data-parallax="0.6"       strength. 1 is the base distance,
                                 negative travels the other way, so
                                 alternating signs give the columns
                                 their counter-motion. 0 opts out.
       data-parallax-group       on an ancestor: the element whose
                                 pass through the viewport drives the
                                 motion. Defaults to the nearest
                                 section, which is usually right.
       data-parallax-clip        on the group: keep the moving elements
                                 inside it. Uses clip-path, not overflow:
                                 an overflow other than visible turns the
                                 element into the scrollport that sticky
                                 descendants resolve against, which would
                                 break the pin this section depends on.
                                 clip-path clips without creating one.
       data-parallax-axis="x"    horizontal instead of vertical
       data-parallax-distance    distance for strength 1, overriding the
                                 default on that one element. Accepts a
                                 bare number as px, or vh/vw units, which
                                 are resolved per refresh so they follow
                                 a resize
       data-parallax-mobile      strength multiplier below the mobile
                                 breakpoint. Defaults to half; "1" keeps
                                 the desktop travel, "0" switches the
                                 element off on phones entirely
       data-parallax-start       ScrollTrigger positions for the range,
       data-parallax-end         overriding "top bottom" / "bottom top".
                                 For a sticky group the pinned window is
                                 start="top top" end="bottom bottom" —
                                 the frame is on screen for exactly that
                                 span, so all the travel is visible
                                 instead of most of it happening before
                                 and after.
       data-parallax-from        px at the start of the range, and
       data-parallax-to          px at the end. Given either one, the
                                 element travels between them literally
                                 and strength is ignored — that is how
                                 you get a rise from below the fold
                                 (from="420" to="0") rather than the
                                 symmetric drift the strength form
                                 produces.

     Scrubbed, so it runs backwards on the way up, and the whole range
     is the group crossing the screen — top of the group at the bottom
     edge, through to the bottom of the group at the top edge. Nothing
     jumps at either end because the element is at its extreme exactly
     when the group is.

     The transform stays on the marked wrapper. Put the parallax on a
     wrapper and any hover or reveal on the image inside it, never both
     on one element — two owners of one transform fight and drift.
     ============================================================ */

  const PARALLAX = {
    distance: 120,      // px of travel at strength 1, at the reference viewport
    scrub: 0.6,

    /* The same 120px is a mild drift on a 900px-tall desktop window and a
       lurch on a 600px phone, because what the eye reads is travel
       relative to the screen, not in pixels. Scale the base by the
       viewport against this reference, clamped so a very tall or very
       small window does not go to either extreme. */
    referenceHeight: 900,
    minScale: 0.45,
    maxScale: 1.2,

    mobile: '(max-width: 767px)',
    /* Half by default. A phone shows a fraction of the group at a time, so
       the same travel crosses far more of the screen per scrolled pixel and
       reads as a lurch. Override per element or per group with
       data-parallax-mobile. */
    mobileFactor: 0.5
  };

  /* Bare number = px. vh/vw resolve against the viewport at the moment they
     are read, and every caller passes them to gsap as a function value, so
     invalidateOnRefresh re-reads them after a resize or an orientation
     change instead of freezing the value taken at mount. */
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

      /* A position:sticky element cannot describe its own scroll range —
         while it is stuck its rect stops moving with the page, so
         start/end resolve against a box that is standing still and the
         whole range collapses to a fraction of the intended one. The
         motion then reads as fast and short, which is exactly what a
         sticky group produces. Climb to the first ancestor that actually
         scrolls; that element's pass is the real range. */
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

      /* Mobile multiplier is applied at read time, not at mount, so
         rotating a phone or resizing across the breakpoint lands on the
         right value at the next refresh rather than keeping whatever was
         true when the page loaded. */
      const rawMobile = parseFloat(
        el.dataset.parallaxMobile ?? marked.dataset.parallaxMobile ?? group.dataset.parallaxMobile
      );
      const mobileFactor = Number.isFinite(rawMobile) ? rawMobile : PARALLAX.mobileFactor;
      const isMobile = () => window.matchMedia(PARALLAX.mobile).matches;

      /* An explicit distance is taken at face value — the author asked for
         that number. Only the shared default is normalised, since that is
         the one that has to look the same on every screen. */
      const normalise = el.dataset.parallaxDistance ? () => 1 : viewportScale;

      /* One reduction or the other, never both. The viewport scale already
         shrinks travel on a short screen, so multiplying the mobile factor
         on top of it took a phone to roughly a third and the motion stopped
         reading as parallax at all. Below the breakpoint the explicit
         mobile factor wins outright. */
      const travel = () =>
        isMobile()
          ? baseFn() * strength * mobileFactor
          : baseFn() * strength * normalise();

      /* Two forms. Strength alone is symmetric: displaced one way at the
         start, the other way at the end, so the element sits at its
         designed position exactly at the group's midpoint. from/to is
         literal px and one-directional, for a rise out of the fold that
         has to land at 0 and stay there. */
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

     Cards pin one after another and the next one scrolls over the
     one before it. The pinning itself is CSS — position:sticky on
     each card — because a ScrollTrigger pin rebuilds layout on
     every Barba swap and fights Lenis. This module owns the two
     parts CSS cannot do:

       - stacking order, so a later card always paints over an
         earlier one. Set here rather than in nth-child rules so
         adding a third card in the Designer needs no CSS edit;
       - the depth cue: while a card is being covered, its content
         lifts slightly, which is what makes the new card read as
         sliding over the old one instead of the old one simply
         vanishing under it.

       data-sticky-stack        on the track holding the cards
       data-sticky-card         each card. Optional — without it the
                                track's element children are used
       data-sticky-inner        what actually lifts inside a card.
                                Optional; defaults to the card's
                                element children, so the card's own
                                background stays put while its
                                contents move
       data-sticky-lift="80"    px of lift, on the track or per card
       data-sticky-fade="0.6"   opacity the covered content reaches
       data-sticky-scale="0.96" scale the covered content reaches

     Desktop only, matching the CSS: under 768px the cards are
     static and stacking would just hide content behind content.
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

      /* Ascending, and above whatever sits before the stack. Applied
         even on mobile: it is inert there and costs nothing, and it
         means the order never depends on the media query having run. */
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

          /* Driven by the covering card, not by this one. This card is
             pinned while it is being covered, so its own rect stops
             changing and cannot describe the progress — the next card's
             climb from the bottom edge to the top is the motion the eye
             is actually following. */
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

     One content column of clickable items, one visual column of
     matching panels. The open item's [data-tabs="item-details"]
     animates height 0 <-> auto, its visual cross-fades in from the
     right, and an optional progress bar drives autoplay.

     Ported from the section embed. Two changes for this build:
     the first tab is set with gsap.set instead of an animated
     switch — mount runs on beforeEnter, while the container is
     still a fixed 100vh rectangle, so an animated open would play
     behind the transition and measure height:auto against the
     wrong box — and the autoplay ScrollTrigger is created from the
     intro queue for the same reason.
     ============================================================ */

  const TABS = {
    duration: 0.65,
    ease: 'power3',
    outProgress: 0.3,   // how long the leaving progress bar takes to empty,
                        // and how long the incoming visual waits
    shift: 3,           // xPercent the visual travels while fading
    autoplayMs: 5000,

    /* The opening detail's own content rises as the height animates, the
       same move data-text-anim-solo makes. It belongs here rather than on
       the attribute: textAnim fires once when the section scrolls past,
       which for a closed tab means animating text nobody can see and
       leaving it at rest by the time the tab is opened. */
    textShift: 28,      // px the detail's content rises. Small values are
                        // swallowed by the box expanding underneath them
    textDuration: 0.6,
    textDelay: 0.15,    // after the height starts, so it arrives with the room

    /* The stacked shape has no tab to open, so each pair reveals itself on
       the way past instead — the same rise data-text-anim-solo makes. */
    stackShift: 24,     // px each pair rises
    stackDuration: 0.7,
    stackEase: 'power3.out',
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
      /* What actually moves: the detail itself is the box being resized, so
         animating it as well would fight the height tween. */
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

      /* Below 992 the section is a plain stack: every visual sits with its
         own text, everything open, nothing playing. Tabs are a desktop
         affordance — on a phone the same content reads as image, text,
         image, text, and a progress bar advancing a tab nobody can see the
         rest of is noise. */
      const desktopMQ = window.matchMedia('(min-width: 992px)');
      let stacked = !desktopMQ.matches;

      /* A comment node left in each visual's place, so the desktop layout
         can be restored exactly. Sibling references do not survive the
         move: once the second visual has been relocated too, the first
         one's stored nextSibling is no longer a child of the old parent
         and insertBefore throws. */
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

      /* The column the visuals came out of. Emptied by the stack, it would
         otherwise still hold its half of the layout and leave the cards in
         a narrow strip beside a blank space. Not hidden blindly: a column
         that also holds the text is the wrapper itself, and hiding that
         would take the section with it. */
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
            /* height:auto changed the document height, so every
               ScrollTrigger below this section is now measured against
               the old one. Guarded and rAF'd inside. */
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

      /* Crossing the breakpoint rebuilds the other shape in place, so a
         rotated phone or a dragged window does not leave a stack with dead
         tabs behind it. */
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
        /* The visuals were moved, so put the markup back the way the
           Designer wrote it before the container is discarded. */
        if (stacked) undoStack();
      });
    });

    return () => cleanups.forEach((fn) => fn());
  });

  /* ============================================================
     FAQ / ACCORDION — .faq_item_wrap or [data-faq-item]

     The Osmo reference does this in CSS, with grid-template-rows
     0fr -> 1fr and a transition. That needs the Designer markup to
     carry data-accordion-* attributes and a grid wrapper the answer
     sits inside; this markup has neither, so the same motion is done
     here in GSAP against the classes that already exist. Nothing to
     add in the Designer — attributes below are opt-in overrides.

     Height 0 <-> auto rather than a max-height guess: GSAP measures
     the natural height per open, so a long answer never clips and a
     short one never leaves dead space. The answer's height change
     moves the document, hence refreshScrollHeight() at the end of
     every toggle.
     ============================================================ */

  const FAQ = {
    duration: 0.6,
    ease: 'osmo',
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

      /* Default is the reference's close-siblings behaviour: one answer
         open at a time. data-faq-multi="true" lets them stack. */
      const multi = group.dataset.faqMulti === 'true';
      const gi = groupIndex++;
      const records = [];

      items.forEach((item, i) => {
        const toggle = item.querySelector('[data-faq-toggle]')
          || item.querySelector('.faq_items_heading_wrap');
        const panel = item.querySelector('[data-faq-panel]')
          || item.querySelector('.faq_items_info');
        if (!toggle || !panel) return;

        /* .faq_items_heading_icon is on both the wrapper div and the svg
           inside it. querySelector takes the wrapper, which is what we
           want to rotate — the svg comes along with it. */
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

      /* Mount runs on beforeEnter, while the container is still a fixed
         100vh rectangle sliding in. Set the state, never animate it: an
         animated open here plays behind the transition and measures
         height:auto against the wrong box. */
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
            /* auto, not the measured px, or a resize or a font swap
               leaves the open answer frozen at yesterday's height. */
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

      /* One delegated listener per group rather than one per item: the
         answers can hold links, and a click there must not toggle. */
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
     HOME HERO

     Was an inline embed inside .home_wrap, which never executes once
     the section arrives through a Barba swap. The heading is
     deliberately left alone: text holds still, only the images move.

     Two transforms per cell, on two different elements on purpose. The
     scroll parallax drives .home_img_wrap and the pointer bump drives
     the img inside it, so neither has to read or preserve the other's
     matrix.
     ============================================================ */

  const HERO = {
    /* The entrance is a @keyframes in the .home_wrap section embed, not
       a timeline here — see the note on the module. Its numbers live
       there: 0.9s, 0.6 start scale, 0.08 stagger, 0.15s delay. Change
       them in the embed, there is nothing to keep in sync here. */

    bump: true,
    bumpStrength: 0.12,
    bumpDuration: 0.4,
    bumpEase: 'power2.out',

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

    /* The entrance used to be a gsap timeline here, with the embed
       holding the images at opacity 0 until it started. That made the
       hero wait on this file, and on GSAP, ScrollTrigger and SplitText
       before it — an element at opacity 0 is not painted, so LCP could
       not fire until the whole chain had landed. It is a @keyframes in
       the embed now: same fade, same scale, same stagger, but the paint
       waits on a stylesheet instead of a bundle.

       What stays here is what CSS cannot do — a pointer bump and a
       scrubbed parallax. */

    /* A swapped container is inserted while it is still the transition's
       fixed rectangle. Its keyframes start on insert, run through behind
       the transition, and are finished by the time the page settles —
       replaying them there is what showed the images and then flashed a
       second entrance over them.

       So on a swap the start state is pinned instead, before the browser
       has painted the container, and the keyframes are released once from
       the intro queue. One entrance, at the moment the old timeline used
       to play. Inline opacity holds the images while the animation is
       off; once it is running the animation outranks inline anyway. */
    const swapped = root !== document;

    if (swapped) {
      imgs.forEach((img) => {
        img.style.animation = 'none';
        img.style.opacity = '0';
      });
    }

    /* animation-fill-mode: both keeps the keyframe's end state applied
       after it finishes, and a filled CSS animation outranks an inline
       transform — so anything gsap writes to the img afterwards is
       silently ignored and the bump never moves. The end state is
       scale(1), the img's own base, so dropping the animation once it is
       done looks identical and hands the transform back. */
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

    /* Collected rather than bound inside the context: on a swap the
       animation is still suppressed while the context is built, so
       measuring it there would read `none` and bind the bump against an
       entrance that has not run. Drained when the entrance is live. */
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

      /* Scrubbed, so it runs backwards on the way up too. The triggers
         are created inside the context, which is what lets the teardown
         kill this page's and only this page's. */
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
      /* First load: the keyframes have been running since the stylesheet
         parsed, which is the whole point — nothing here gated the paint. */
      bindBumps();
    }

    return () => {
      dead = true;
      cleanups.forEach((fn) => fn());
      ctx.revert();
      /* The keyframe was cleared inline once it finished. Handing the
         markup back means letting the embed own it again. */
      imgs.forEach((img) => {
        img.style.removeProperty('animation');
        img.style.removeProperty('opacity');
      });
    };
  });


  /* ============================================================
     SERVICES HOVER — .services_wrap

     Two things happen when a row is hovered: the neon wipes up
     behind its text, and a preview follows the cursor.

     The preview does not slide its images past a mask. Each new
     image is stacked on top of the one already showing, starts
     small and centred, and grows until it covers it — so the
     transition reads as the next service landing on the last
     rather than a filmstrip advancing. Layers are removed by the
     tween that covered them, which is what makes a fast run down
     the list safe: whichever clone is on top wins and takes
     everything under it with it.

     The follower is appended to <body>, never to the section.
     prepareForTransition puts perspective on .page_wrap, and
     perspective creates a containing block for fixed-position
     descendants — a follower inside the container would stop
     resolving against the viewport.

     Desktop pointers only, matching the reference CSS. Below that
     the rows are left exactly as the Designer painted them.
     ============================================================ */

  const SERVICES = {
    follow: 0.6,             // pointer smoothing
    followEase: 'power3',
    show: 0.45,              // follower scaling in and out
    showEase: 'power3.out',
    coverFrom: 0.18,         // the incoming image starts this small, centred
    coverDuration: 0.7,
    coverEase: 'power3.out',
    fill: 0.5,               // the colour wipe behind the row
    fillEase: 'osmo',
    dim: 0.45                // the rows that are not hovered
  };

  /* ------------------------------------------------------------
     The tablet-and-down shape of the services section.

     The rows are lifted into a sticky viewport and layered on top of
     each other, and the list itself is given the scroll height — one
     screen per row — so a scrubbed trigger can dissolve row N into row
     N+1. A viewport element is created rather than making each row
     sticky in flow: sticky rows stack, with the next sliding up over
     the last, and this is meant to be a crossfade with nothing moving.
     ------------------------------------------------------------ */

  const SERVICES_STACK = {
    screens: 1,          // screens of scroll between one row and the next
    hold: 1,             // screens the last row keeps the screen to itself
                         // before the pin releases. Without it the final
                         // dissolve lands exactly as the section lets go,
                         // so the last row is never seen still.
    duration: 0.9,       // the dissolve, once it is triggered
    ease: 'power2.inOut'
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
      /* A sticky child holds while its container is passing, so the pinned
         scroll is the track minus one screen. Size the track from what
         happens inside it: a step per gap, then the hold, then the screen
         the viewport itself occupies. */
      const screens = (items.length - 1) * SERVICES_STACK.screens
        + SERVICES_STACK.hold + 1;
      list.style.height = `${screens * 100}svh`;

      /* The first row is the one on screen at rest; the rest wait at zero
         rather than being hidden, so their images are already decoded by
         the time they are needed. */
      gsap.set(items, { opacity: 0 });
      gsap.set(items[0], { opacity: 1 });

      /* Triggered, not scrubbed: crossing a step boundary plays the
         dissolve at its own pace, so the swap reads the same whether the
         visitor eased down or flicked. A scrub ties the fade to the
         scroll wheel, which on a trackpad flick means the rows blink
         past half-drawn. */
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
        /* Built from the intro queue on first mount: a trigger measured
           while the container is still the transition's fixed rectangle
           starts at the wrong scroll position. A rebuild after a resize
           has no such problem — and the queue for this container has
           already been played and dropped, so a callback added now would
           never run. */
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
              /* Leave, not enter: the trigger element is the whole track, so the
                 boundary is crossed by scrolling back out through its start,
                 not by re-entering from beyond its end. */
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
          ease: 'power3.inOut',
          overwrite: 'auto',
          onComplete: () => {
            followerInner.querySelectorAll('*').forEach((el) => gsap.killTweensOf(el));
            followerInner.replaceChildren();
            layer = 0;
          }
        });
      }

      /* The cover. The clone lands on top of whatever is showing and
         grows into it; when it arrives it takes the layers it covered
         with it. Nothing is removed early, so the image underneath is
         there for the whole grow and never flashes through. */
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

        /* The neon is set on the row itself in the Designer, which
           paints it flat and leaves nothing to reveal. Read it off,
           move it onto a layer we own, and hand the row its own
           background back on teardown. data-services-fill overrides,
           taking a literal or a variable name. */
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

        /* The text has to sit over the wipe, and the source image is
           only ever a source — it shows in the follower, not in the row. */
        const innerPos = inner && inner.style.position;
        const innerZ = inner && inner.style.zIndex;
        if (inner) {
          if (getComputedStyle(inner).position === 'static') inner.style.position = 'relative';
          inner.style.zIndex = '1';
        }
        /* Taken out of the row's layout but left in the render tree.
           display:none would stop a loading="lazy" image ever fetching,
           and the clone would then land in the follower with nothing
           decoded to show on the first hover. */
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
          /* Parked back at the bottom edge so the next wipe rises again
             rather than dropping in from the top. */
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

      /* One leave for the whole list. The per-row leaves already put the
         colour back; this is what ends the preview, and it does not fire
         while the pointer is only crossing a border between rows. */
      collection.addEventListener('mouseleave', () => {
        /* The rows close themselves on their own leave, but a pointer
           that jumps straight out of the window can skip that one. */
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

  /* The section has two shapes and the viewport decides which: a pointer
     follows the rows on a desktop, and below that they dissolve into one
     another in a pinned stack. Rebuilt on the way across, so dragging a
     window past the breakpoint does not leave a follower with nothing to
     follow, or a stack nobody can scrub. */
  Modules.add('servicesHover', function (root) {
    if (!root.querySelector('.services_wrap')) return;

    /* Width, not hover capability. The CSS half of the stack lives in a
       max-width: 991px block, so keying the JS on hover:none meant a
       touchscreen laptop — or a device-emulation window at desktop width —
       built the stack while the CSS left the rows in flow: a screen of
       white per row and a very long scroll. Both halves read the same line
       now. A wide touch device gets the hover build and simply never fires
       a hover, which is inert rather than broken. */
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
      /* The stack adds a few screens of height, or gives them back. */
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

     The insights filter is built out of Webflow checkboxes but should
     behave like radios: checking one clears the rest. Radios would do
     this for free, except they cannot be unchecked by clicking again,
     which is what an "all" state needs.

     Two things a naive version gets wrong. Webflow paints the tick with
     a w--redirected-checked class that it only toggles on real user
     events, so a box cleared in script keeps its tick. And Finsweet
     reads its filters off change events, so a box cleared behind its
     back stays in the query — the list ends up filtered by a category
     whose box is visibly empty.

     Groups: put the group's name in data-filter-single on each box, or
     data-filter-single-group on a shared ancestor, if the page has more
     than one filter set. Unnamed boxes are all one set.
     ============================================================ */

  Modules.add('filterSingle', function (root) {
    const nodes = Array.from(new Set([
      ...root.querySelectorAll('[data-filter-single]'),
      ...root.querySelectorAll('.insights_filter_check')
    ]));
    if (!nodes.length) return;

    /* The class can be on the real input or on the div Webflow paints —
       they sit side by side in the same label and either one is a
       reasonable thing to have named in the Designer. Resolve both from
       whichever was matched. */
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

    /* is-checked on the label, mirrored from the input on every change
       including the first paint. The idle border and text colours hang
       off it rather than off w--redirected-checked, which sits on
       whichever element Webflow decided to own and is absent entirely
       when the box is a plain input. */
    const paint = () => boxes.forEach((box) => {
      box.label?.classList.toggle('is-checked', box.input.checked);
    });

    /* Finsweet binds a listener to each input and updates the field from
       that input's own state, so a change event for a box we cleared is a
       second update in the same tick as the user's — and the pair lands on
       an empty condition, which filters the list to nothing. Clear those
       silently: Finsweet only needs the box the visitor actually clicked,
       and it hears that one itself. */
    const finsweetManaged = (input) => input.hasAttribute('fs-list-field')
      || input.hasAttribute('fs-list-value')
      || !!input.closest('[fs-list-element="filters"]');

    const clear = (box) => {
      if (!box.input.checked) return;
      box.input.checked = false;
      box.visual?.classList.remove('w--redirected-checked');
      box.input.classList.remove('w--redirected-checked');
      if (finsweetManaged(box.input)) return;
      /* Anything else listening — a Webflow form, a custom handler — has
         no way to know the box changed unless we say so. */
      box.input.dispatchEvent(new Event('input', { bubbles: true }));
      box.input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    boxes.forEach((box) => {
      box.label?.classList.add('filter-single');

      box.input.addEventListener('change', () => {
        /* syncing guards the change events we fire ourselves, which come
           back through this same listener. */
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

     One statement at a time in the same spot: the one showing leaves
     upward, the next arrives from below. Marked on the wrapper, so the
     items stay whatever the Designer made them.

     The items are laid over each other in a single grid cell rather
     than being positioned absolutely — absolute children collapse the
     wrapper to nothing and the section loses its height. In one cell
     the tallest statement still sets the box, so nothing jumps as they
     take turns.

       data-swap                  the wrapper
       data-swap-item             optional, marks the items. Without it
                                  the wrapper's element children are used
       data-swap-hold="4000"      ms each statement holds, default 3500
       data-swap-loop="false"     stop on the last one instead of cycling

     Starts when the section arrives rather than on load: a statement
     that changed twice before anybody scrolled to it has said nothing.
     ============================================================ */

  const SWAP = {
    hold: 3500,
    duration: 0.7,
    shift: 24,          // px travelled, out upward and in from below
    ease: 'power3.out',
    start: 'top 70%',
    stack: '(max-width: 767px)'   // below this the statements go full width
  };

  /* ============================================================
     FINSWEET ATTRIBUTES

     Attributes scans the DOM once, on load. A barba swap hands it a
     list it has never seen, so a page reached by navigating had filters
     that did nothing — the markup was right and nothing was listening.
     Restart the list solution for each container that carries one.

     Only on a swap: on the first load the solution is still fetching
     when modules mount, so `restart` is not there yet and Attributes is
     about to initialise itself anyway. Calling it then would either
     throw or re-run an init that had not finished.
     ============================================================ */

  Modules.add('finsweet', function (root) {
    if (!root.querySelector || !root.querySelector('[fs-list-element="list"]')) return;

    let dead = false;

    /* Fetched here rather than from the site-wide embed, so a page with
       no list never pays for it. Resolves immediately when it is already
       in the document, which is every visit after the first list. */
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

      /* data-swap-wait hands the start to somebody else — on the home
         page that is heroVideo, which fires it once the video has
         finished growing. Its own trigger would go off while the video
         was still travelling, and the statements would be halfway
         through before there was anything to read them against.

         A swap inside the hero stage is that case whether or not the
         attribute survived the Designer. heroVideo is going to drive
         it either way, and without this the first statement is shown
         at mount and its cue arrives to find it already read. */
      const waits = wrap.hasAttribute('data-swap-wait') ||
        !!wrap.closest('.home_video_wrap');

      wrap.classList.add('is-swapping');

      /* Stack them where the FIRST one already sits, rather than in cell
         1/1: that cell is a single track, so a statement styled to span
         half the grid came out a column wide. The placement is read off
         the first item, which is the one the layout was designed around.

         Set inline, because Webflow writes placement against the node id on
         each child (#w-node-…) and an id outranks any class rule here — by
         class alone the statements keep their own columns and take turns
         side by side. Override the whole thing with data-swap-area. */
      const track = (start, end) => {
        const span = /span\s+(\d+)/.exec(start) || /span\s+(\d+)/.exec(end);
        if (start !== 'auto' && !/span/.test(start)) return `${start} / ${end}`;
        return `1 / span ${span ? span[1] : 1}`;
      };

      const stacked = window.matchMedia(SWAP.stack);

      /* Re-read on every resize. Measured once at mount, the desktop track
         was written inline to each statement, and inline outranks the
         Designer's tablet and mobile rules — so below 992 the text kept a
         column count that breakpoint no longer has. */
      const place = () => {
        /* Cleared first. list[0] is carrying whatever the last pass wrote,
           and measuring that back would only re-freeze it. */
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

        /* Stacked, the wrap is made a grid and every statement takes the
           same cell. grid-column and grid-row were enough only while the
           wrap was still a grid — where the Designer switches it to flex
           below the breakpoint they do nothing, the statements run down
           the page instead of over each other, and the one you see is
           whichever the frame's bottom edge lands on. */
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

      /* A statement the Designer hid — display:none on the second one is how
         these usually arrive — cannot take its turn. Put it back in the flow
         and let opacity decide who is showing, which is the whole point of
         the swap. Recorded so teardown returns the markup as it was. */
      const hidden = list.filter((el) => getComputedStyle(el).display === 'none');
      hidden.forEach((el) => { el.style.display = 'block'; });

      /* data-text-anim-solo on a statement, or on the wrap, asks for
         the -solo entrance instead of the swap's own. It cannot come
         from textAnim: that module skips everything inside a
         [data-swap] on purpose, since an element marked for both gets
         two entrances fighting over one transform. So the swap plays
         the solo motion itself.

         Group-wide rather than per item. The attribute usually lands
         on the first statement only, and statements that arrive
         differently from each other read as a mistake rather than as a
         sequence. */
      const solo = wrap.hasAttribute('data-text-anim-solo') ||
        list.some((el) => el.hasAttribute('data-text-anim-solo'));

      const dur = solo ? TEXT.bodyDuration : SWAP.duration;
      const ease = solo ? TEXT.bodyEase : SWAP.ease;
      /* Both units are written every time. A statement that entered
         under one of them and leaves under the other would otherwise
         keep the first one's leftovers and start from the wrong
         place. */
      const hiddenBelow = solo
        ? { autoAlpha: 0, yPercent: TEXT.bodyFromY, y: 0 }
        : { autoAlpha: 0, yPercent: 0, y: SWAP.shift };
      const hiddenAbove = solo
        ? { autoAlpha: 0, yPercent: -TEXT.bodyFromY, y: 0 }
        : { autoAlpha: 0, yPercent: 0, y: -SWAP.shift };
      const resting = { autoAlpha: 1, yPercent: 0, y: 0 };

      gsap.set(list, hiddenBelow);
      /* Waiting means waiting for the first one too. Shown at mount it
         had already been read by the time the cue arrived, and the only
         thing that looked like an entrance was the SECOND statement —
         a hold later, which is why it read as arriving at the release. */
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

        /* Anything neither leaving nor arriving is put away outright.
           A swap interrupted mid-flight — which is what scrolling
           quickly back and forth through the pin is — leaves its
           outgoing statement wherever the kill caught it, and two of
           them half-showing over each other is the result. Only the
           pair actually changing is ever in motion. */
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

      /* Queued rather than started here: mount runs while the container is
         still the transition's fixed rectangle, and a trigger measured
         against that fires at the wrong scroll position. */
      const onExternalStart = () => {
        if (dead) return;
        if (reducedMotion) gsap.set(list[0], resting);
        else gsap.fromTo(list[0], hiddenBelow, { ...resting, duration: dur, ease });
        queue();
      };

      /* Driven by scroll instead of a clock. Whoever sends swap:to owns
         the sequence from then on — the timer is dropped, because a
         statement changing on its own while another is changing with
         the scroll is two things disagreeing about what is being read. */
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
          /* fromTo, not to. Whoever sends swap:to owns the entrance,
             and a `to` from wherever the statement happens to be is a
             tween with nowhere to travel if it is already showing —
             the first statement appearing without the rise every one
             after it gets. The from state is the same one swap() uses,
             so first and second arrive identically. */
          else gsap.fromTo(list[i], hiddenBelow, { ...resting, duration: dur, ease });
          return;
        }
        swap(i);
      };

      /* Back to before the first cue: hidden, index 0, and the latch
         released so the next swap:to is an entrance again rather than
         a change from wherever it stopped. */
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
     LAZY ASSETS

     Swiper and Finsweet Attributes were loaded from the site-wide
     embeds, so every page paid for them. Home uses neither. Together
     they are about 90 KiB, and Attributes fans out into twenty-odd ESM
     chunks that made the longest critical chain on the page — the
     entry cannot even start resolving them until it has been parsed.

     Fetched here instead, once, and only for a container that has the
     markup. The promise is cached per asset, so a second slider on the
     page, or a swap back to one, reuses the first fetch rather than
     appending a second tag.
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

    /* Resolves either way. A stylesheet that 404s leaves an ugly slider,
       refusing to build one over it leaves no slider at all. */
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

      /* Two attributes that are not decoration. type=module because the
         entry is ESM and opens with a bare import — as a classic script
         it is a syntax error. fs-list because v2 boots the solutions
         named on its own tag: without it Attributes loads, finds nothing
         asked for, and initialises nothing, which reads exactly like a
         filter that has stopped working. */
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
    /* Nothing to build and, more to the point, nothing to fetch. */
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

        /* Three tiers, each falling back to the one above it, so a
           slider that only sets data-gap behaves as it always did. */
        const applyGap = () => {
          const value = mq.matches
            ? (gapMobileAttr || gapTabletAttr || gapAttr)
            : (tabletMq.matches ? (gapTabletAttr || gapAttr) : gapAttr);
          if (value) el.style.setProperty('--slider-gap', value);
        };

        /* Rounded. A rem-based gap measures fractional (23.84px), Swiper
           multiplies it into every slide offset, and the accumulated
           fraction lands slide edges on half pixels — which is the hairline
           of the neighbouring image showing along the edge of a slide. */
        const measureGap = () => {
          const probe = document.createElement('div');
          probe.className = 'c_slider_gap_probe';
          el.appendChild(probe);
          const px = probe.getBoundingClientRect().width;
          probe.remove();
          return Math.round(px);
        };

        applyGap();

        /* Left bleed with a loop, without showing the loop's own machinery.
           The track runs full-bleed and the first slide is pushed in to line
           up with the page text, so the clipping edge is the viewport rather
           than the text margin — a slide leaving to the left stays visible
           all the way out, while the slides Swiper relocates far off-screen
           stay hidden.

           Set data-align-to to a selector inside the section whose left edge
           the first slide should match; defaults to the section's container.
           Requires the track itself to be full width: drop the margin-left
           from .c_slider_offset. */
        /* Several names for the same thing across the site, so all of
           them are candidates and the first that actually describes a
           margin wins. One class was a single rename away from the rail
           running to the edge again. */
        const alignSel = str('data-align-to') || '.u-container, .u-container-full';
        const section = el.closest('section') || el.parentElement;

        const measureOffset = () => {
          if (!section) return 0;
          const rail = el.getBoundingClientRect().left;

          let best = 0;
          section.querySelectorAll(alignSel).forEach((target) => {
            /* A container the rail sits inside already applies its own
               margin — matching it would double the inset. */
            if (target.contains(el)) return;
            const delta = target.getBoundingClientRect().left - rail;
            if (delta > best) best = delta;
          });

          return Math.round(best);
        };

        /* The rail runs edge to edge, so without a matching offset at the far
           end Swiper stops with the last card's right edge against the
           viewport rather than against the page margin — the card reads as
           cut off, and with loop and rewind both off there is nothing left to
           scroll. Symmetry also gives the track somewhere to travel to. */
        const measureOffsetAfter = () => measureOffset();

        /* One-per-view means one WHOLE card. Swiper divides the rail by the
           per-view number, and the rail is the full viewport, so a slide
           comes out viewport-wide and the left offset then pushes its right
           edge off screen — the sliver of overflow on phones. Ask for
           slightly more than one so the card fits between the two margins.
           Fractional values are left alone: a peek is the author's intent. */
        const fitPerView = (authored) => {
          if (authored !== 1) return authored;
          const width = el.clientWidth;
          const inset = measureOffset() + measureOffsetAfter();
          if (!width || inset <= 0 || width - inset <= 0) return authored;
          return width / (width - inset);
        };

        const wrap = el.closest('.c_slider_wrap');

        /* Swiper finds slides by class, and a card component built in the
           Designer arrives without it — the slider then initialises against
           zero slides, so nothing is given a width and the track never
           moves. Tag the wrapper's own children when none of them carry it,
           which is what putting cards in a slider is meant to express. */
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
          /* Mutually exclusive in Swiper 11: with both set the loop
             re-orders slides while rewind also tries to jump the index back
             to the start, and the two fight on the same transition — the
             jump you see at the ends. rewind only applies without loop. */
          rewind: loop ? false : bool('data-rewind', true),
          loopAdditionalSlides: num('data-loop-extra', 4),
          speed: num('data-speed', 600),

          /* The module mounts at beforeEnter, while the container is a fixed
             100vh rectangle mid-transition, so the first measurement is
             taken against a box that is about to change. These make Swiper
             re-measure itself rather than keeping those numbers. */
          observer: true,
          observeParents: true,
          resizeObserver: true,
          watchOverflow: true,

          slidesOffsetBefore: measureOffset(),
          slidesOffsetAfter: measureOffsetAfter(),

          /* slidesPerView 2.25 divides the container into fractional widths
             (605.778px) and translates the track by fractional amounts. Every
             layer inside a card then rounds independently, so a colour panel
             at inset:0 can land a pixel short of the image beneath it and let
             an edge of it show. Rounding lengths and translates to whole
             pixels removes the seam at the source — padding the panel instead
             just makes it overhang the card. */
          roundLengths: true,
          /* Three tiers. data-slides-tablet covers 768 to 991 and falls
             back to the desktop number when it is not set, so a slider
             that never wanted a tablet value behaves as it always did. */
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

        /* loop parks duplicate slides just outside the container on both
           sides and re-orders them as you cross the seam. The container's
           clipping is what keeps that machinery off screen — without it the
           duplicates read as a sliver of the neighbouring image along the
           edges, and the re-order reads as a jump. */
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

        /* Belt and braces on top of the observers: one explicit update once
           the page is actually laid out. Cheap, and it closes the window
           where a slide starts at the wrong offset and snaps on first drag. */
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
            /* Only the base value is ours to set — that is the one below
               the first breakpoint. Above it Swiper owns slidesPerView
               and re-applies the breakpoint's number on every resize;
               writing to params as well left the snap grid describing a
               layout that was no longer current, which is a track that
               scrolls a slide or two past its end. */
            const base = fitPerView(num('data-slides-mobile', 1));
            const tablet = fitPerView(
              num('data-slides-tablet', num('data-slides-per-view', 1.25))
            );
            const desktop = fitPerView(num('data-slides-per-view', 1.25));

            const changed = swiper.params.slidesOffsetBefore !== offset
              || swiper.params.slidesOffsetAfter !== offset
              || (mq.matches && swiper.params.slidesPerView !== base);

            if (swiper.params.breakpoints) {
              if (swiper.params.breakpoints[768]) {
                swiper.params.breakpoints[768].slidesPerView = tablet;
              }
              if (swiper.params.breakpoints[992]) {
                swiper.params.breakpoints[992].slidesPerView = desktop;
              }
            }

            if (changed) {
              swiper.params.slidesOffsetBefore = offset;
              swiper.params.slidesOffsetAfter = offset;
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

       data-share                     the wrapper
       data-share-url                 optional, defaults to the page url
       data-share-open                the trigger
       data-share-menu                the panel, hidden until opened
       data-share-close               closes it
       data-share-copied              "Link copied", shown for a moment
       data-share-action="linkedin"   opens LinkedIn's share dialog
       data-share-action="copy"       copies the url
       data-share-action="native"     the OS share sheet, phones mostly

     A native action with no OS support hides itself rather than
     sitting there doing nothing when tapped.

     Closes on the close button, on Escape, and on a click outside.
     Focus moves into the panel on open and returns to the trigger on
     close, so it can be operated without a pointer.
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

      /* Webflow ships the panel with an inline display:none. Cleared so a
         class can own the state, and restored on teardown. */
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

      /* A third state, not just a message: the menu is gone, the trigger
         is still held back, and the confirmation stands on its own until
         the timer hands the trigger back. Driven from the wrapper so one
         class decides which of the three is showing. */
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

      /* Clipboard needs a secure context, so an http preview or an older
         browser lands on the textarea route rather than on nothing. */
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
            /* Closed on success, so the confirmation is what is left on
               screen. Hunting for a small X to dismiss a menu whose job
               is already done is the worse half of this interaction.

               Focus is not sent back to the trigger here: it is still
               faded out under the confirmation, and a focus ring on
               something invisible is worse than none. */
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

     base-lib drops the poster the moment it decides to play, which is
     before any frame exists. Webflow ships <source> carrying both
     data-src and src, so base-lib's lazyLoadVideo takes its early-out
     and resolves without loading anything; preload="none" means not a
     byte has been fetched. The poster leaves, the video box is still
     empty, and the section background shows through as a grey frame.
     Intermittent, because it is a race the cache sometimes wins.

     So the poster is held here instead and faded on the first PAINTED
     frame — requestVideoFrameCallback, or the playing event plus a rAF
     where that is missing. Nothing else is taken over: base-lib keeps
     its lazy load, its scroll-in play and its pause. If the video never
     arrives — an expired or 404 url — no frame is painted, nothing
     fades, and the poster simply stays. That is the correct fallback
     and the current code has it backwards.

     Registered ahead of baseLib so the poster is under this module's
     control before video-min touches it.
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
        /* No rVFC. `playing` means a frame is presentable, not that it
           has been composited, so wait for the frame after the next. */
        requestAnimationFrame(() => requestAnimationFrame(reveal));
      };

      /* Already running by the time this mounts — a swap back to a page
         whose video kept playing never fires `playing` again. */
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

     The video sits in the last cell of the hero grid. Scrolling out
     of the hero releases it: it travels to the middle of the screen
     and scales to full bleed on its own clock, not the scroll's. The
     stage below it then pins for a screen while the statements play
     over it; after that the whole thing scrolls away as one.

     Triggered rather than scrubbed on purpose — a scrubbed growth is
     only ever as committed as the hand on the wheel, and stopping
     mid-scroll left the video stranded at whatever size the scroll
     had bought. Where it travels *to* is still scroll-bound: p is
     what the video is doing, the scroll term is what the page is
     doing under it.

     It is taken out of flow and fixed for the travel. A transform
     inside the grid would be clipped by the section, and would be
     fighting the hero's own parallax for the same matrix on the same
     element. Fixed, it owns its transform and nothing clips it.

     The cell it leaves behind is given the aspect ratio it had while
     it was still in flow, so the grid keeps its shape rather than
     collapsing around a hole.

     Position is arithmetic off one measurement per refresh, not a
     rect read per frame: the cell travels linearly with the scroll,
     so where it would be at any progress is known without asking the
     layout engine again.
     ============================================================ */

  const HERO_VIDEO = {
    pin: 1.5,          // screens of pin once it is full bleed

    /* The growth is a second long and a flick of the wheel is a
       screen, so it was entirely possible to arrive at the pin having
       seen none of it. On the same scroll that fires the growth the
       page is carried the rest of the way to the pin, locked while it
       goes, so the travel is watched rather than skipped.

       Reduced motion never gets it: taking someone's scroll away is
       exactly what that setting is asking you not to do. */
    takeover: true,
    takeoverDuration: 1,
    z: 5,              // over the hero and the stage, under the nav

    /* The growth is triggered, not scrubbed: a couple of notches of
       scroll out of the hero and the video goes to full bleed on its
       own clock, whatever the scroll does next. In pixels rather than
       a fraction of the screen, because what fires it is the gesture
       — a flick of the wheel is the same flick on any viewport. */
    growAfter: 120,
    growDuration: 1,
    growEase: 'power2.inOut',

    /* Milliseconds a statement holds before the next one can take
       over, however fast the pin is scrolled. */
    dwell: 1300,

    /* Fallback only. The real delay is this cell's slot in the
       entrance order, read off --hero-in-* in page-transition.css. */
    from: 0.6,
    duration: 0.9,
    delay: 0.55,
    ease: 'power2.out',

    /* How much larger than its frame the video is painted, matching
       the resting value in page-transition.css. */
    overspill: 1.02,

    /* A pixel past the viewport on every side. A scaled layer's edges
       land on fractions, and at the seam the compositor rounds the
       other way from the paint — a hairline of whatever is behind,
       flickering as the number changes. It never appears in a
       screenshot, because that captures the composited result after
       the rounding rather than the seam itself. */
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

    /* position:fixed is only relative to the viewport when no ancestor
       carries a transform — and this component's own cell is exactly
       what the hero parallax transforms. Left in place it resolved
       against the parallaxed cell instead, which threw it off to one
       side and let it scroll away with its ancestor.

       So it is moved to the body for the journey, and a comment holds
       its seat so teardown can put it back where the Designer had it. */
    const seat = document.createComment('hero-video');

    /* The statements move INTO the video for the pin. Fixed and living
       on the body, the video paints over the whole stage — every
       section here is its own stacking context, so no number given to
       the text inside one could ever outrank it. As children of the
       video they are simply painted after it, and nothing global has to
       be re-ranked to make that true. Only for the pin, when the scale
       is 1 and their size is their own. */
    const text = stage.querySelector('.home_video_contain');
    const textSeat = document.createComment('hero-video-text');

    /* The theme comes with them. Colour here is a variable the stage
       sets through u-theme-dark, and inside the component they were
       reading whatever the page's default theme said instead — which
       is how white text arrived black. */
    const themed = stage.classList.contains('u-theme-dark');

    /* Where it sits in the stage is the design; anything this module
       decides instead is a guess, and centring it was the wrong guess.
       So the box is measured before the move and reproduced inside the
       video.

       All four edges, not just the top. The frame is no longer the
       viewport — it is the video's own shape, scaled until it covers,
       so on a phone it runs a long way past both sides of the screen.
       The stylesheet's left: 0 / right: 0 spans the frame, which is
       the statements stretched off both edges and centred on something
       nobody can see. Its own left and width put it back where the
       design had it.

       Measured against the frame's resting box rather than its current
       rect: a fast scroll can reach the pin with the growth still
       running, and a rect read mid-flight is a scaled one. Every
       number here is where the frame is about to settle.

       Anchored to the bottom, not the top. The statements sit at the
       foot of the stage, and top plus a measured height only holds
       them there while the height is right — a statement of another
       length, a wrap at another width, and the block drifts up from
       the edge it was aligned to. The gap to the bottom is the design;
       the height is whatever the text needs.

       Its own width and left are reproduced too. Giving it the
       viewport instead sounded structure-proof and threw the padding
       away with the box: what insets the statements is the stage's
       layout around this element, not anything inside it. */
    /* Kept as offsets, not as viewport numbers. A box written once at
       pin entry goes stale the moment the viewport changes size, which
       on a phone is every time the address bar retracts.

       Measured off the stage, but resolved against the VIEWPORT: while
       the pin holds, the stage is the screen. Reading the stage's rect
       at refresh time gives its unpinned position instead — refresh
       reverts pins to measure them — and placing the text against a
       stage that is a page away is the statement leaping into the
       middle of the frame. */
    let textBox = null;

    const placeText = () => {
      if (!text || !textBox || text.parentNode !== comp) return;

      /* Settled, the component is the stage: absolute at inset 0
         inside it, so the gaps measured off the stage are the gaps to
         write, unchanged. Travelling, it is the frame — bigger than
         the screen and hanging off it — so the same gaps have to be
         resolved through where the frame sits. */
      const settled = comp.classList.contains('is-settled');
      if (!settled && !cover) return;

      /* Travelling, the component is laid out at viewport width and
         scaled up to cover — so everything inside it is scaled too,
         which put the statements at four times their size and off the
         screen. The scale is undone here and the offsets are expressed
         in the component's own units, so the text lands at 1:1 over the
         video. Origin at the bottom left, which is the corner the
         placement is anchored to. */
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

      /* Horizontals as fractions of the stage, not pixels. Measured
         once at pin entry, a phone's box stayed a phone's box on a
         desktop window — the statements a narrow column in the middle
         of a wide screen. The vertical stays in pixels: where the text
         sits above the bottom edge is a fixed offset in the design, not
         a share of the height. */
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

    /* Leaving the pin in either direction puts the statements back
       where they started. Without it the sequence is a one-off: the
       statements stay where the last scroll left them, and coming back
       finds them already read — nothing to dispatch, nothing to
       animate, the first one simply present. */
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
      /* The cell carries its own height from the Designer, so measuring
         it gave the cell's shape rather than the video's — a square box
         with a 16/9 component sitting inside it. The ratio the
         component declares is stamped on the cell first, so the cell
         IS that shape and the measurement describes the video. */
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

      /* The box is the viewport, never wider. A frame kept at the
         video's ratio is vh * 16/9 on a phone — four times the screen —
         and a browser scales the whole page to something that size.

         The shape change that costs is undone on the video inside
         instead: see apply(). */
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
        /* What the video has to be scaled to at the end to cover a frame
           of another shape. */
        toCover: Math.max(1, (ch * ratio) / cw),
        x: -b,
        y: -b
      };

      /* The video is laid out in its own ratio inside the frame, not
         stretched to fill it: object-fit against a portrait box crops
         the picture to portrait before any transform gets to it, which
         is a 16/9 video shown as 9/16. Sized here, covered by the
         scale in apply(). */
      if (visual) {
        visual.style.position = 'absolute';
        visual.style.left = '50%';
        visual.style.top = '50%';
        visual.style.width = `${cw}px`;
        visual.style.height = `${cw / ratio}px`;
        visual.style.maxWidth = 'none';
      }

      /* Once only, and only after the first measurement: the cell needs
         the component's own height to be measured at all, and can hold
         the shape itself from then on. */
      if (!lifted) {
        cell.insertBefore(seat, comp);
        document.body.appendChild(comp);
        comp.classList.add('is-travelling');
        lifted = true;
      }

      comp.style.width = `${cover.w}px`;
      comp.style.height = `${cover.h}px`;
    };

    /* Started with the travel rather than left to base-lib's own
       observer: by the time that fires the video is already halfway
       across the screen, and the first thing anyone sees of it is a
       still. Once only — a second play() mid-flight would restart it. */
    /* base-lib pauses this video whenever its own observer says it is
       out of view, and once the component is fixed and living on the
       body that observer's idea of "in view" has nothing to do with
       what is on screen. Taken off its books before it initialises —
       heroVideo mounts first — so nothing else is deciding when this
       one plays. */
    video?.removeAttribute('data-video-scroll-in-play');

    let playing = false;
    const play = () => {
      if (!video) return;
      playing = true;
      /* An autoplay refusal is a decision, not a fault. */
      video.play?.().catch(() => {});
    };

    /* Re-asserted while it travels: something else pausing it is far
       more likely than it having ended, and a paused video mid-flight
       is the one thing nobody would think to look for. */
    const keepPlaying = () => {
      if (playing && video && video.paused) video.play?.().catch(() => {});
    };

    const lerp = (a, b, t) => a + (b - a) * t;

    /* The entrance cannot be a CSS animation on the component: apply()
       writes its transform every frame and the two would overwrite each
       other. So the entrance scale is a number the transform is
       composed from, and they coexist. */
    let intro = HERO_VIDEO.from;
    let lastP = 0;
    let lastScroll = 0;

    /* p 0 is the cell where it sits, p 1 is the screen filled. In
       between it has to keep travelling with the page, or it would
       hang in the viewport while the hero scrolled out from under it —
       hence the scroll term, which is faded out as p rises. */
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

      /* The frame morphs from the cell's shape to the screen's; the
         video is given that difference back, so on screen it is only
         ever scaled by one number. That number walks from filling the
         cell exactly to covering the viewport, which is the whole 16/9
         in the grid and a full screen at the end. */
      if (visual && sx > 0 && sy > 0) {
        const f = lerp(cover.sx, cover.toCover, p) * HERO_VIDEO.overspill;
        visual.style.transform =
          `translate(-50%, -50%) scale(${f / sx}, ${f / sy})`;
      }

      /* The images scale about their middle; the travel scales from the
         top left, which is what keeps the placement arithmetic simple.
         So the centre is held by hand — shrinking by intro leaves half
         the difference on each side. */
      const dx = (cover.w * sx * (1 - intro)) / 2;
      const dy = (cover.h * sy * (1 - intro)) / 2;

      comp.style.transform =
        `translate3d(${x + dx}px, ${y + dy}px, 0) scale(${sx * intro}, ${sy * intro})`;
    };

    /* Measured against the STAGE, not the hero. Tied to the hero's own
       height the travel finished whenever that section happened to end,
       which is unrelated to when the pin takes hold — so the video was
       still partway through its journey, small and off to one side, at
       the moment it was supposed to have arrived.

       From the stage's top entering the viewport to it reaching the
       top is exactly one screen of scroll, and its end is the pin's
       start by definition. */
    /* p used to be the trigger's own progress, so the growth was the
       scroll: a slow scroll grew it slowly, a stopped scroll stopped
       it halfway. It is a tween on its own clock now — once past
       growAt it goes to full bleed and lands there, scroll or no
       scroll.

       The scroll term stays live throughout regardless. p is what the
       video is doing; scroll is what the page is doing under it, and
       until p reaches 1 the video still has to travel with the hero
       rather than hang in the viewport while it leaves. */
    /* Declared before everything that reaches for it. The trigger's
       own callbacks run during its creation, and a const assigned on
       that same line is still in its dead zone when they do — which
       is a ReferenceError, not an undefined. */
    let travel = null;

    const growth = { p: 0 };
    let growing = false;
    let wants = 0;

    /* Driven by its own tween rather than by the trigger's updates:
       once it is going it has to keep going, and a scroll that races
       past the trigger's range — or stops dead inside it — takes the
       trigger's updates with it. The tween is on the ticker, so it
       does not care.

       Reading the scroll live for the same reason. Where the video
       has to be is p plus where the page is, and while it is growing
       both are moving. */
    /* Carrying the page to the pin, not merely blocking it: a lock on
       its own is a page that stops answering, which reads as broken.
       Lenis owns the wheel here and takes a lock for the length of the
       throw; without it the same throw is written frame by frame. */
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

      /* Armed again only once the growth has been let go of entirely,
         so scrolling back up to the hero and down again gets the same
         throw rather than one free pass. */
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

    /* Latched, with the two edges far apart on purpose. One threshold
       for both directions means a scroll that hovers on it flips the
       growth back and forth — it goes at growAfter and only comes back
       at the very top of the range, so there is nothing to sit on. */
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

      /* A refresh lands on every navigation and every footer resize,
         so snapping p to where the scroll says it belongs would put a
         jump in the middle of a growth that is already running. Only
         the settled value is corrected — which is what a reload
         partway down the page needs. */
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

    /* Which step of the entrance this cell takes. The order and the
       spacing are authored in page-transition.css, on .home_wrap,
       alongside the five images' own delays — one place to change the
       sequence, and this reads its slot out of it rather than keeping
       a second copy of the arithmetic. Falls back to the constants
       above if the stylesheet has not loaded. */
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

    /* The entrance is a tween rather than a keyframe: moving an element
       in the DOM restarts its CSS animations, and this one is moved to
       the body to travel and back again on the way up — so the fade
       replayed every time, which is the flash on scrolling back.

       Opacity only. The transform belongs to apply(). */
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
      /* Past the pin the transform is cleared and the stage owns the
         box, so a growth still writing to it would be writing to
         nothing — and would be mid-flight if it ever came back. */
      gsap.killTweensOf(growth);
      growing = false;
      wants = 1;
      growth.p = 1;
      stage.appendChild(comp);
      comp.classList.remove('is-travelling');
      comp.classList.add('is-settled');
      /* Settled, the frame is the stage's own box and the stylesheet's
         object-fit is the right answer again. */
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
      /* Re-placed at once. settle() cleared the transform, so without
         this it sits at the stylesheet's 0,0 — the top left corner —
         until something else happens to move it, and if the travel is
         already behind us nothing ever does. */
      apply(growth.p, travel.scroll());
    };

    /* One statement at a time, and each one gets its moment. Driving
       the index straight off the pin's progress means a flick through
       the pin skips whatever it crosses — on a phone the first
       statement was never seen at all. Advance one step, hold it for
       dwell, then catch up to wherever the scroll now is. */
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

      /* One at a time, so a jump of several still plays as a sequence
         rather than landing on the last and dropping the rest. */
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

      /* Refreshed before anything below it. Pin spacing is real height
         added to the document, so every trigger further down the page
         starts that much later — but only if it is measured after this
         one has laid its spacing out. Measured before, they are early
         by exactly the pin's length, which is a section further down
         playing its whole entrance a screen and a half before it
         arrives. Creation order does not settle this; priority does. */
      refreshPriority: 1,
      onEnter: () => {
        if (dead) return;
        /* A fast scroll can reach the pin while the growth is still
           running. Left to finish rather than snapped to 1 — that snap
           is the jump, the video going from half-grown to full bleed
           in a frame. It is a second at most and the pin holds for a
           screen, so it lands well inside the hold. */
        /* The entrance is over by definition here — whatever it was
           doing, the pin is the destination. Left at its start value it
           renders the video at 60% of the screen with the page showing
           around it, which is not a state anything should be able to
           reach. */
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
        /* Already inside the component if it left through the bottom,
           so bringText has nothing to do — but the gaps now have to be
           resolved against the frame again rather than the stage. */
        bringText();
        placeText();
      },
      /* Out the bottom, the last statement stays where it is. It is
         the one the pin ended on and the page is still showing the
         stage — clearing it there would be the sequence deleting its
         own conclusion. Only going back up above the pin resets, and
         that is somebody asking to see it again. */
      /* Kept inside the component on the way out, not handed back.
         In the stage .home_video_contain is a screen-tall block with
         its content centred, so returning it there is the statement
         jumping to the middle of the video — the layout it has when
         nobody is holding it. Settled, the component is the stage's
         own box, so it keeps sitting exactly where the pin left it and
         scrolls away with everything else. */
      onLeave: () => { settle(); placeText(); },
      onLeaveBack: () => { returnText(); resetSwap(); },

      /* One statement per equal share of the pin, changed on the way in
         and on the way back out. Tied to the scroll rather than a hold,
         so nobody scrolls past a statement that never got its turn. */
      onUpdate: (self) => {
        if (dead || !swap || !statements) return;
        step(Math.min(statements - 1, Math.floor(self.progress * statements)));
      }
    });

    /* A swap collapses the document under the triggers: the footer
       margin goes, both containers become fixed layers, and the scroll
       they are measured against is suddenly somewhere else entirely.
       Left live they read that as the user racing back up the page,
       and play the travel in reverse over the top of the transition —
       the video lifting off the stage and shrinking into a grid nobody
       is looking at any more.

       Hiding it does not answer this: at that scroll position it is
       settled, in flow, part of what the outgoing page still shows.
       So it is frozen instead — whatever it was showing when the
       navigation started is what it shows until it is taken away. */
    const freeze = () => {
      if (dead) return;
      frozen = true;
      gsap.killTweensOf(growth);
      scrollTween?.kill();
      travel?.disable(false);
      held?.disable(false);
    };

    document.addEventListener('page:leaving', freeze);

    /* Re-measured on the resize itself, not on ScrollTrigger's own
       refresh a beat later. The component is sized in pixels off the
       viewport, so between the two it is a desktop-sized box on a phone
       — briefly, but that is the frame a device switch lands on. */
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
     THIRD PARTY (base-lib)

     form-validation, match-container and video-min bind on
     DOMContentLoaded, which only fires once. Until each exposes an
     init(root), video and form validation die after the first swap.
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

  /* The margin below is what the fixed footer is revealed through, so it
     changes the scrollable height. Lenis and ScrollTrigger both cache that
     height, and during a transition every layer is position:fixed, so the
     document briefly measures as almost nothing. Re-measure on the frame
     after the margin lands, or the last footer-height of scroll is gone.

     Never mid-transition though. sync:true resolves enter() at timeline
     position 0, so afterEnter fires while the leave is still playing, and
     resizing Lenis under a running animation visibly disturbs it. The
     after hook drops is-transitioning before its own sync, so the
     re-measure still happens, just once the motion is done. */
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
     NAV SYNC

     The meganav persists, so data-transparent and any active-link
     state have to be copied from the incoming page. Put
     data-nav-transparent="true|false" on each template's container,
     and data-barba-update on nav links you want class/aria synced.
     ============================================================ */

  function syncNavFrom(container) {
    const nav = findNav();
    if (!nav || !container) return;
    const transparent = container.dataset.navTransparent ?? 'true';
    nav.setAttribute('data-transparent', transparent);
    nav.classList.remove('is-open', 'is-mobile-open');
    if (window.scrollY <= 10) nav.classList.remove('is-scrolled');

    /* The nav is persistent, so a menu opened before a navigation is still
       open after it — and the tap that navigated was usually a link inside
       that menu. The nav's own embed cannot close it: it only toggles on
       click and knows nothing about a page change. Clear every piece of
       the open state, including the body overflow lock, which would
       otherwise leave the incoming page unscrollable. */
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
     NAV SCROLL STATE

     is-scrolled on the persistent nav: transparent over the top of the
     page, solid once past the threshold.

     This was briefly left to the nav's own embed, which has the same
     four lines. It should not be: that embed opens with

       const item = document.querySelector('[data-nav-item="industries"]');
       if (!nav || !panel || !item) return;

     and the markup uses data-nav-trigger, so item is null and the whole
     IIFE returns before binding anything — scroll state, burger, panel
     and locale all dead together. A nav state that depends on an
     unrelated mega-panel selector existing is not a nav state. Owning it
     here also means it survives the embed being edited in the Designer.

     Setting the class from two places is still wrong, so delete the
     SCROLL WATCHER block from that embed once this is live.

     .meganav is the name in the published markup; data-nav overrides it
     if the class is ever renamed in the Designer.
     ============================================================ */

  const NAV_SCROLL_AT = 10;

  /* The footer is fixed behind the page and revealed by the page sliding
     up off it, so how much of it is showing is just the distance left to
     the bottom of the document. Once enough of it is out, the nav gets
     out of the way — it is the only thing left overlapping a section that
     is meant to read as a full-bleed panel.

     Two thresholds rather than one. A single line at the same place
     flickers the nav on and off while a scroll rests exactly on it, and
     inertia scrolling rests on things constantly. */
  const NAV_HIDE = {
    hideAt: 0.5,          // fraction of the footer revealed → nav leaves
    showAt: 0.35,         // scrolled back above this → nav returns
    duration: 0.45,
    ease: 'power2.out',

    /* Direction hiding. offset keeps the nav put over the first screen,
       where a small scroll is usually someone settling rather than
       travelling; threshold is the movement needed to count as a
       direction at all, which is what stops an inertia wobble from
       flickering it. */
    offset: 120,          // px from the top before hiding is allowed
    threshold: 6          // px of movement before a direction is read
  };

  let updateNavScroll = () => {};
  /* Navigating from the footer starts with the nav parked off-screen, and
     the scroll check cannot put it back on its own: is-transitioning is
     still set while the pages animate, and it is dropped two frames after
     the last scroll event of the navigation. */
  let resetNav = () => {};

  function footerRevealed() {
    const footer = document.querySelector('.footer_wrap');
    const height = footer ? footer.offsetHeight : 0;
    if (!height) return 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return 0;
    return Math.min(1, Math.max(0, (window.scrollY - (max - height)) / height));
  }

  /* An open mega panel outranks the footer: hiding the nav out from under
     a menu the visitor just opened leaves them with a lock and no way
     back. Same list the nav sync clears on navigation. */
  function navMenuOpen() {
    return !!document.querySelector(
      '[data-nav-mobile].is-open, .meganav_mobile_open.is-open, ' +
      '.meganav_panel.is-open, .meganav_backdrop.is-open'
    );
  }

  /* Chrome carries the page scale across a viewport width change, so a
     desktop window resized to a phone stays magnified by the ratio
     between them — 1745 to 440 is the 4x that looks like the whole site
     blew up. Nothing can set the scale directly; clamping maximum-scale
     for one frame makes the browser recompute it, and restoring the
     meta immediately after leaves pinch-zoom alone.

     Only on a width change, never on a pinch: someone zooming in by
     hand keeps their zoom. */
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
      /* Travel only, no fade. pointer-events goes with it so the nav
         cannot take a click meant for the footer during the slide, when
         it is still overlapping the top of the screen. */
      nav.style.pointerEvents = hide ? 'none' : '';
      gsap.to(nav, {
        yPercent: hide ? -100 : 0,
        duration: reducedMotion ? 0 : NAV_HIDE.duration,
        ease: NAV_HIDE.ease,
        overwrite: 'auto',
        /* Back to no transform at all once it is home. A transform,
           even an identity one, keeps the bar on its own composited
           layer, and a layer whose edge lands on half a device pixel
           leaves whatever is behind it showing through the seam. */
        onComplete: () => {
          if (!hidden) gsap.set(nav, { clearProps: 'transform,translate,rotate,scale' });
        }
      });
    };

    resetNav = () => {
      /* The incoming page starts at the top, so the old reading would
         read as a large scroll up on the next event. */
      lastY = 0;
      setHidden(false);
    };

    /* Coalesced to one read per frame: a Lenis-driven page fires scroll
       continuously and every scrollY read forces layout. */
    const apply = () => {
      queued = false;

      const next = window.scrollY > NAV_SCROLL_AT;
      if (next !== scrolled) {
        scrolled = next;
        nav.classList.toggle('is-scrolled', next);
      }

      /* Mid-transition both pages are fixed and the document height is
         whatever the transition left behind, so the footer fraction is
         meaningless. Hold the nav where it is until the page lands. */
      if (document.documentElement.classList.contains('is-transitioning')) return;

      /* Three inputs, in priority order: an open menu pins the nav on
         screen, the footer reveal takes it away, and otherwise the
         scroll direction decides. Between the two footer thresholds the
         state is held rather than recomputed — that dead band is what
         keeps an inertia scroll resting on the line from flickering it. */
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
     MEGANAV

     The Meny button opens a full-viewport sheet that swipes down from
     the top edge, and its contents rise in behind the swipe.

     The panel lives INSIDE <nav class="meganav">, which is where the
     Designer put it, and the nav carries a GSAP transform for the
     footer hide. Any non-none transform on an ancestor makes a
     position:fixed descendant resolve against that ancestor rather than
     the viewport, so the panel is absolute and sized in viewport units
     instead: same rectangle, no dependency on the nav's transform being
     the identity. The CSS half of this lives in page-transition.css.

     Init runs once, not per container: the nav is persistent, and a
     per-container mount would bind a second set of listeners on every
     navigation while sync:true keeps the outgoing page alive.
     ============================================================ */

  const MENU = {
    duration: 0.89,          // the swipe, matching the reference
    ease: 'menuSwipe',
    contentDelay: 0.18,      // content starts while the sheet is still moving
    contentDuration: 0.6,
    contentStagger: 0.05,
    contentShift: 40,        // px the rows rise
    contentEase: 'power3.out',
    /* The CTA goes last: after the swipe has landed AND after the last
       row has finished rising, whichever of the two ends later. The
       rows rise under the swipe, which is what makes the sheet feel
       like it is carrying them — the button doing it too just looked
       like it had been there all along.
       data-nav-delay on any row adds to its own position. */
    buttonGap: 0.02,

    /* How much of the last row's rise the button starts inside. 1 waits
       for it to finish, 0 leaves with it. */
    buttonOverlap: 0.45,

    /* When the bar takes its own colours back, as a fraction of the
       close. The sheet clips upward, so its top — the strip behind the
       bar — is the last thing to go; waiting for the very end left the
       logo white a beat too long. */
    restore: 0.72,

    labelClosed: 'Meny',
    labelOpen: 'Lukk',
    labelFade: 0.12       // out and back in, either side of the swap
  };

  CustomEase.create('menuSwipe', '0.05, 0.7, 0.1, 1');

  const CLOSED_CLIP = 'inset(0% 0% 100% 0%)';
  const OPEN_CLIP = 'inset(0% 0% 0% 0%)';

  /* Called from beforeLeave. A navigation started from inside the menu
     has to leave nothing behind: syncNavFrom drops the is-open class,
     but the inline clip-path and pointer-events set here would survive
     it and leave an invisible sheet over the incoming page. */
  let closeMeganav = () => {};

  function initMeganav() {
    const nav = findNav();
    const panel = document.querySelector('[data-nav-panel]')
      || document.querySelector('.meganav_panel');
    if (!nav || !panel) return;

    /* The Designer's toggle is a div wrapping an <a href="#">, and the
       mobile burger is another anchor. Both are matched here, and the
       click is intercepted on the wrapper so the inner anchor's default
       is cancelled on the way past. */
    const toggles = Array.from(new Set([
      ...document.querySelectorAll('[data-nav-toggle]'),
      ...document.querySelectorAll('.meganav_button_nav_open-wrap'),
      ...document.querySelectorAll('.meganav_mobile_open')
    ]));
    if (!toggles.length) {
      console.warn('[meganav] no toggle found — add data-nav-toggle to the Meny button');
      return;
    }

    /* In DOM order, so the stagger reads down the sheet: the statement
       and its button first, then each group heading and its links. */
    const content = Array.from(panel.querySelectorAll(
      '.meganav_feature_text, .button_main_wrap, ' +
      '.meganav_heading, .meganav_links_wrap .footer_link_wrap, [data-nav-content]'
    ));

    /* The container class is on the panel in the Designer, but the panel
       has to be full-bleed for the black to reach the edges — so its
       max-width is overridden here and the content lost its margins with
       it. Move the class down to the inner, where it constrains the
       content and leaves the sheet alone. Done in script rather than in
       CSS because the container's own rules (max-width, padding, the
       auto margins) live in the Designer and are not ours to restate. */
    const inner = panel.querySelector('.meganav_panel_inner');
    const containerClass = Array.from(panel.classList)
      .find((c) => c === 'u-container' || c.startsWith('u-container'));
    let movedContainer = null;
    if (inner && containerClass && !inner.classList.contains(containerClass)) {
      panel.classList.remove(containerClass);
      inner.classList.add(containerClass);
      movedContainer = containerClass;
    }

    /* The visible label and the screen-reader one, which live in
       different elements of the Webflow component: the text div is
       aria-hidden and the accessible name comes from the sr-only span
       inside the overlay anchor. Both have to say the same thing.

       Per-toggle overrides: data-nav-label-open / data-nav-label-closed. */
    const labels = [];
    toggles.forEach((toggle) => {
      const els = Array.from(toggle.querySelectorAll(
        '[data-nav-label], .footer_link_text, .u-sr-only'
      ));
      if (!els.length) return;
      const override = toggle.getAttribute('data-nav-label-closed');
      const opened = toggle.getAttribute('data-nav-label-open') || MENU.labelOpen;
      /* Each element keeps its OWN resting text. The two are not the same
         string — the visible label reads Meny and the screen-reader one
         Menu — and taking the first element's text for both quietly
         rewrote the visible label on the first close. */
      els.forEach((el) => labels.push({
        el,
        closed: override || el.textContent.trim() || MENU.labelClosed,
        opened
      }));
    });

    /* Faded rather than swapped outright — a hard text change mid-swipe
       reads as a glitch next to a second of eased motion. */
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
          ease: 'power1.out',
          onComplete: () => {
            el.textContent = next;
            gsap.to(el, { opacity: 1, duration: MENU.labelFade, ease: 'power1.out' });
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
    /* A close finishes in its timeline's onComplete, and kill() does not
       fire that — so an interrupted close left the classes on and the
       state disagreeing with the sheet. Held here and run before
       anything kills the timeline. */
    let pending = null;

    /* The sheet sits under the bar on mobile, so it has to start at the
       bar's real height — --nav--height is a guess that leaves a strip
       of page between them when it is wrong. */
    /* Lenis swallows touchmove while it is stopped, which is the whole
       sheet unscrollable on a phone. This attribute is how it is told to
       keep its hands off an element that scrolls itself. */
    panel.setAttribute('data-lenis-prevent', '');

    const root = nav.closest('.meganav_root') || document.documentElement;
    const syncTop = () => {
      root.style.setProperty('--meganav-top', `${nav.getBoundingClientRect().height}px`);
    };
    syncTop();
    if (window.ResizeObserver) new ResizeObserver(syncTop).observe(nav);

    const lock = (on) => {
      document.documentElement.classList.toggle('is-menu-open', on);

      /* The lock takes the scrollbar with it, so anything measured
         while the menu was open was measured against a wider viewport.
         Re-measure once it is back, and drop anything a cut-short swap
         left on the container while it was covered by the sheet. */
      if (!on) {
        requestAnimationFrame(() => {
          clearTransitionLeftovers();
          if (hasScrollTrigger) ScrollTrigger.refresh();
        });
      }

      if (!hasLenis || !lenis) return;
      /* Lenis owns the scroll, so overflow:hidden alone does nothing —
         it would keep scrolling the page behind the sheet. */
      if (on) lenis.stop(); else lenis.start();
    };

    /* aria and the bar flip immediately; .is-open is what carries
       visibility on the panel, so on the way out it has to outlive the
       swipe or the sheet disappears instead of leaving. */
    const paint = (instant) => {
      /* Added on the way in, dropped when the swipe is done — the bar
         carries the sheet's colour on mobile, and dropping it at the
         start of the close turns the bar white while the sheet is still
         leaving. Same shape as the panel's own class. */
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

      /* Clicks pass through from the first frame of the close, but the
       class stays until the swipe is done. */
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
        /* Back to the CSS's own closed state, so a resize or a theme
           change is not competing with a stale inline clip-path. */
        gsap.set(panel, { clearProps: 'clipPath,pointerEvents' });
        gsap.set(content, { clearProps: 'transform,opacity' });
      };

      if (instant || reducedMotion) { done(); return; }

      pending = done;
      tl = gsap.timeline({ onComplete: done });
      tl.to(panel, { clipPath: CLOSED_CLIP, duration: MENU.duration, ease: MENU.ease }, 0);
      tl.to(content, { opacity: 0, duration: 0.25, ease: 'power2.out' }, 0);
    }

    const controller = new AbortController();
    const { signal } = controller;

    /* One click, one toggle. The Designer nests these — an overlay
       anchor inside a wrapper that is itself a toggle — so a single
       click bubbles through two of them and the menu opened and shut
       again in the same frame, which killed the row stagger and left
       the sheet open with nothing animated. */
    let lastClick = null;

    toggles.forEach((toggle) => {
      toggle.addEventListener('click', (e) => {
        /* The anchor inside is href="#": left alone it jumps the page to
           the top and, on some templates, adds a history entry. */
        e.preventDefault();
        if (lastClick === e) return;
        lastClick = e;
        if (open) hide(); else show();
      }, { signal });
    });

    /* A link inside the sheet is a normal navigation — barba's beforeLeave
       closes the menu — but a link to the current page never fires it. */
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
     PAGE TRANSITIONS
     Crossfade. Both pages occupy the same rectangle for a second:
     the outgoing one blurs and fades out under the incoming one,
     which sharpens and fades in on top of it.

     The layer machinery below is unchanged from the 3D version and
     is not decoration — the two pages have to be lifted out of flow
     to overlap at all, which is the same thing swup's parallel
     plugin does by keeping both containers in the DOM at once.
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

    /* The perspective set below turns parent into the containing block
       for every fixed child here, so their 0,0 is parent's padding box
       and not the viewport. Parent starts under the persistent nav, which
       is exactly how far the whole transition used to sag. Measure the
       gap after the scroll reset and cancel it out. */
    const rect = parent.getBoundingClientRect();
    const offsetX = rect.left;
    const offsetY = rect.top;

    /* Sits behind both pages so the 3D gap has something of its own to
       show. Without it the gap exposed parent's page background, which
       left no way to colour the transition separately. */
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
      /* Default 50% 50% resolves against parent, which is as tall as the
         whole document, dropping the vanishing point way below the fold.
         Pin it to the middle of the viewport instead. */
      perspectiveOrigin: `50% ${window.innerHeight / 2 - offsetY}px`,
      transformStyle: 'preserve-3d'
    });

    /* No overflow:clip on any of these three. A non-visible overflow makes
       the element the scrollport that position:sticky descendants resolve
       against, so every sticky section in the page stuck to the top of a
       100vh box at once and the whole page composited onto itself. The
       clip-path below does the clipping without that side effect;
       html.is-transitioning handles the scrollbars. */
    /* The outgoing page sits UNDER the incoming one and stops taking
       clicks the moment the swap starts — it is still in the DOM for a
       full second and its links are still live otherwise. */
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

    /* Symmetry with the outgoing side, and the reason the home page
       composited onto itself. The outgoing page sits inside a fixed 100vh
       wrapper and keeps its own natural height. The incoming page used to
       BE the box: height:100vh on the container itself, so every
       percentage height and every sticky section inside it resolved
       against one viewport instead of the real page height, and they all
       landed in the same place. Give it a wrapper too and the container
       is left to lay out exactly as it does on a normal load. */
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

    /* Every symptom so far has come down to one of these five facts, and
       none of them is visible from a screenshot. Logged mid-leave so the
       state is the animating one, not the cleaned-up one. */
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

  /* A leave timeline that never reaches onComplete (interrupted
     navigation, barba timeout, a thrown hook) leaves its wrappers in the
     DOM. They are fixed and 100vh and still hold a page, so they read as
     an extra page overlaid on the live one. Both pages now live in one of
     these, so a leftover can be holding markup we still need: lift the
     children out before dropping the wrapper, never delete it wholesale.
     Runs before the parent is resolved, since a stale wrapper would
     otherwise be mistaken for it. */
  /* The footer is fixed and lives outside .page_wrap, so it is not part of
     the outgoing page and the transition used to hide it outright — click
     a link in the footer and the thing you were looking at vanished a
     frame before the page it belongs to started moving.

     Move the real element into the outgoing layer for the duration,
     pinned at the viewport position it already occupied. Inside a fixed
     wrapper an absolute child resolves against the viewport rect, so the
     footer does not move a pixel at the swap — it just stops being fixed
     and starts being part of the card that scales away. Inserted before
     the page, which keeps the page painting over it exactly as z-index 1
     over z-index 0 did.

     The element itself, not a clone: it carries links, a form and IX2
     bindings, and a clone would drop all three. */
  let footerLayer = null;
  let footerAtLeave = null;

  /* Read at beforeLeave, before FooterReveal.collapse() runs. Collapsing
     the reserved space shortens the document, the browser clamps the
     scroll position to the new bottom, and the page slides down over the
     footer — so by the time the leave timeline measures anything, a footer
     that filled half the screen looks like one nobody ever scrolled to. */
  function captureFooterForLeave(current) {
    const footer = document.querySelector('.footer_wrap');
    /* The OUTGOING container, not .page_wrap. sync:true runs beforeEnter
       first, so by the time this fires the incoming container is already
       sitting in .page_wrap and the wrapper measures twice as tall as the
       page anybody is looking at — every navigation then reads as one
       where the footer was nowhere near the screen. */
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
    /* left/right rather than a width, and no height at all. An absolutely
       positioned box with only left set shrinks to fit, and pinning the
       measured offsetHeight as a CSS height adds the padding a second
       time wherever box-sizing is content-box — the footer grew by its
       own padding at the swap. Let it lay out at its natural height. */
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
    /* Before the wrappers are dismantled: a stale layer is holding the
       real footer, and lifting its children out would leave it inside
       .page_wrap wearing the layer's inline styles. */
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

    /* Both at position 0. The overlap is the whole effect: a sequential
       version reads as two separate fades with a flat gap between them. */
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

  /* resetPage strips the fixed positioning and the 100vh box off the
     incoming container, which is what makes it read as a clipped
     rectangle alongside the outgoing one. It used to run at position 0 of
     this timeline, roughly a frame after prepareForTransition set those
     properties, so the incoming page reflowed full-bleed and only the
     outgoing page kept its rectangle. Hold it until the leave is done.
     leaveDone is created in beforeLeave, which barba guarantees runs
     before either leave or enter. */
  function runPageEnterAnimation(next) {
    if (reducedMotion) gsap.set(next, { autoAlpha: 1 });
    return (leaveDone || Promise.resolve()).then(() => resetPage(next));
  }

  /* beforeEnter fixes the container so it can be animated as a layer, and
     the leave timeline clears it again when the transition finishes. On the
     very first load there is no leave timeline, so whichever hook ran last
     could leave the fixed positioning on — and a fixed container contributes
     no height to the document, which collapses the page to one viewport and
     kills scrolling entirely. Idempotent, so calling it more than once is
     free. */
  /* A swap that is cut short — interrupted, errored, or navigated away
     from mid-flight — leaves the container holding the transform it was
     partway through. Under the parent's perspective that renders the
     whole page scaled: smaller with the dark ground showing around it,
     or larger and cropped, depending on which way the z was going.
     Cleared from hooks that run whatever the timeline did. */
  function clearTransitionLeftovers() {
    if (document.documentElement.classList.contains('is-transitioning')) return;

    /* The wrapper is the one that holds the transform, so a container
       left inside one reads as untransformed while the page is visibly
       scaled. Unwrapped back to where a normal load leaves it. */
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
    /* Anything travelling belongs to the page being left — it is fixed
       to the viewport on the body, so it would otherwise hang above
       both pages for the length of the swap. Marked here, before the
       incoming page has mounted anything of its own, so only the
       outgoing one is caught. page-transition.css does the hiding. */
    document.querySelectorAll('[data-video="component"].is-travelling')
      .forEach((el) => el.classList.add('is-page-leaving'));
    /* Before the footer margin collapses two lines down — that is the
       change the outgoing page's scroll triggers would react to. */
    document.dispatchEvent(new CustomEvent('page:leaving'));
    closeMeganav();
    resetNav();
    restoreFooterLayer();
    captureFooterForLeave(data?.current?.container);
    FooterReveal.collapse();
    leaveDone = new Promise((resolve) => { resolveLeave = resolve; });
  });

  /* Barba appends the incoming container to [data-barba="wrapper"], which
     here is body. The published markup nests the container inside
     .page_wrap, so the first load is fine and every navigation after it
     leaves the page one level too high. That breaks three things at once:
     .page_wrap holds the perspective, so a container outside it gets no
     3D and never scales down; the transition backdrop lives inside
     .page_wrap at z-index 0, so a container in body covers it; and once
     the inline styles are cleared the static container loses to the
     positioned z-index 0 footer, which then paints over the page.

     Move it back before anything measures or mounts against it. */
  function reparentContainer(next, current) {
    const parent = current?.parentElement || document.querySelector('.page_wrap');
    if (!parent || !next || next.parentElement === parent) return;
    /* insertBefore, not appendChild. .page_wrap holds siblings besides the
       container, so appending dropped the incoming page to the bottom of
       that stack and changed how it layered against them. Take the slot
       the outgoing page is in and document order is preserved. */
    if (current && current.parentElement === parent) parent.insertBefore(next, current);
    else parent.appendChild(next);
  }

  barba.hooks.beforeEnter((data) => {
    reparentContainer(data.next.container, data.current?.container);

    /* Only a real navigation needs the container lifted into a layer. On the
       initial load there is nothing to animate against, and — with no leave
       timeline to clean up after it — the fixed positioning stayed on. A
       fixed container contributes no height to the document, so the whole
       page collapsed to one viewport and could not be scrolled. */
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
    /* Scoped, not ScrollTrigger.getAll().kill(). sync:true mounts the
       incoming page back at beforeEnter, so by the time this runs its
       triggers already exist and a blanket kill took them out with the
       outgoing page's. Orphans — trigger element gone from the document
       — go too, since nothing will ever refresh them again. */
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
    /* The marked one leaves with its container, so this is for the
       swap that never completes — a cancelled navigation would
       otherwise leave a page holding an invisible video. */
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

      /* Finsweet pages a list by clicking Webflow's own pagination anchor
         (?…_page=2) and reading the response. Those are real same-origin
         links, so barba took them as navigations: pressing Load more ran a
         page transition and landed on page two showing one post. Leave every
         paging control to whoever owns the list.

         Scoped to the controls, not to [fs-list-element] generally — the
         list itself carries that attribute, and the cards inside it are
         ordinary links that should still transition. */
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
