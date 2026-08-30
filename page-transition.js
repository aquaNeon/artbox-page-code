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
  const BUILD = '2026-08-30-a';
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

  // SMOOTHLY 

 Modules.add('smooothy', function (root) {
  const els = root.querySelectorAll('.work_smoothly_wrap');
  if (!els.length) return;

  const html = document.documentElement;
  const instances = [];
  let rafId = null;
  let killed = false;

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
        instances.push({ slider, el });
      });

      const tick = () => {
        if (!html.classList.contains('is-transitioning')) {
          instances.forEach(({ slider }) => slider.update());
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
      /* Same trick upward. Padding grows the clip box, the negative
         margin cancels it, so nothing in the layout moves either way. */
      if (bleed.top) {
        line.style.paddingTop = `${bleed.top}px`;
        line.style.marginTop = `${-bleed.top}px`;
      }
      pads.push(pad + bleed.top);
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
  function descenderPad(el) {
    let size = parseFloat(getComputedStyle(el).fontSize) || 16;
    el.querySelectorAll('*').forEach((child) => {
      const s = parseFloat(getComputedStyle(child).fontSize);
      if (s > size) size = s;
    });
    return size * TEXT.maskPad;
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
      const from = { yPercent: TEXT.bodyFromY, opacity: 0 };
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
    autoplayMs: 5000
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
        if (!autoplay || dead) return;
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
          const b = bar(i);
          if (b) gsap.set(b, { scaleX: 0, transformOrigin: 'left center' });
          gsap.set(visualItems[i], i === index
            ? { autoAlpha: 1, xPercent: 0 }
            : { autoAlpha: 0, xPercent: TABS.shift });
        });
      }

      function switchTab(index) {
        if (dead || isAnimating || index === currentIndex) return;
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

        switchTl.fromTo(
          visualItems[index],
          { autoAlpha: 0, xPercent: TABS.shift },
          { autoAlpha: 1, xPercent: 0 },
          TABS.outProgress
        );
        const inDetail = detail(index);
        if (inDetail) switchTl.fromTo(inDetail, { height: 0 }, { height: 'auto' }, 0);
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

      setState(0);

      Intro.add(root, () => {
        if (dead || !autoplay) return;
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
        progressTween?.kill();
        switchTl?.kill();
        trigger?.kill();
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
    imgFrom: 0.6,
    imgDuration: 0.9,
    imgStagger: 0.08,
    imgEase: 'power2.out',
    imgDelay: 0.15,
    imgStaggerFrom: 'start',   // 'start' | 'center' | 'edges' | 'random'

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

    /* The section's own CSS embed pre-hides the images so they cannot
       flash at full opacity before gsap owns them. Nothing below is
       allowed to leave that class off: a blank grid is worse than an
       unanimated one. */
    const reveal = () => document.documentElement.classList.add('hero-anim-off');
    if (!imgs.length) { reveal(); return; }

    const watchdog = setTimeout(reveal, 2500);

    if (reducedMotion) {
      reveal();
      gsap.set(imgs, { opacity: 1, scale: 1 });
      clearTimeout(watchdog);
      return;
    }

    const cleanups = [];

    const ctx = gsap.context(() => {
      /* Built paused and handed to the queue. Created here rather than
         inside the callback so the context owns it and revert() takes it
         with everything else. */
      gsap.set(imgs, { opacity: 0, scale: HERO.imgFrom, transformOrigin: 'center center' });

      const intro = gsap.timeline({ paused: true, defaults: { force3D: true } });
      intro.to(imgs, {
        opacity: 1,
        scale: 1,
        duration: HERO.imgDuration,
        ease: HERO.imgEase,
        stagger: { each: HERO.imgStagger, from: HERO.imgStaggerFrom },
        onStart: reveal
      }, HERO.imgDelay);

      Intro.add(root, () => intro.play());

      if (HERO.bump && window.matchMedia('(hover: hover)').matches) {
        wraps.forEach((wrap) => {
          const img = wrap.querySelector('img');
          if (!img) return;

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

    return () => {
      clearTimeout(watchdog);
      cleanups.forEach((fn) => fn());
      ctx.revert();
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

  Modules.add('servicesHover', function (root) {
    const sections = root.querySelectorAll('.services_wrap');
    if (!sections.length) return;

    /* No hover, no preview. The rows keep their Designer background
       and nothing below runs. */
    if (!window.matchMedia('(hover: hover) and (min-width: 992px)').matches) return;

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


  Modules.add('slider', function (root) {
    const instances = [];
    const resizeHandlers = [];

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
      const mq = window.matchMedia('(max-width: 767px)');

      const applyGap = () => {
        const value = mq.matches ? (gapMobileAttr || gapAttr) : gapAttr;
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
      const alignSel = str('data-align-to') || '.u-container';
      const section = el.closest('section') || el.parentElement;

      const measureOffset = () => {
        const target = section && section.querySelector(alignSel);
        if (!target || target.contains(el)) return 0;
        const delta = target.getBoundingClientRect().left - el.getBoundingClientRect().left;
        return delta > 0 ? Math.round(delta) : 0;
      };

      const wrap = el.closest('.c_slider_wrap');

      const loop = bool('data-loop', false);

      const swiper = new Swiper(el, {
        slidesPerView: num('data-slides-mobile', 1),
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

        /* slidesPerView 2.25 divides the container into fractional widths
           (605.778px) and translates the track by fractional amounts. Every
           layer inside a card then rounds independently, so a colour panel
           at inset:0 can land a pixel short of the image beneath it and let
           an edge of it show. Rounding lengths and translates to whole
           pixels removes the seam at the source — padding the panel instead
           just makes it overhang the card. */
        roundLengths: true,
        breakpoints: {
          768: {
            slidesPerView: num('data-slides-per-view', 1.25)
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
          if (swiper.params.slidesOffsetBefore !== offset) {
            swiper.params.slidesOffsetBefore = offset;
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

    return function cleanup() {
      resizeHandlers.forEach((fn) => window.removeEventListener('resize', fn));
      instances.forEach((s) => s.destroy(true, true));
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
        overwrite: 'auto'
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
      '.meganav_feature_text, .meganav_feature_wrap .button_main_wrap, ' +
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

    const lock = (on) => {
      document.documentElement.classList.toggle('is-menu-open', on);
      if (!hasLenis || !lenis) return;
      /* Lenis owns the scroll, so overflow:hidden alone does nothing —
         it would keep scrolling the page behind the sheet. */
      if (on) lenis.stop(); else lenis.start();
    };

    /* aria and the bar flip immediately; .is-open is what carries
       visibility on the panel, so on the way out it has to outlive the
       swipe or the sheet disappears instead of leaving. */
    const paint = (instant) => {
      nav.classList.toggle('is-open', open);
      if (open) panel.classList.add('is-open');
      panel.setAttribute('aria-hidden', String(!open));
      toggles.forEach((t) => t.setAttribute('aria-expanded', String(open)));
      setLabels(open, instant);
    };

    function show() {
      if (open) return;
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
        tl.fromTo(content,
          { y: MENU.contentShift, opacity: 0 },
          {
            y: 0, opacity: 1,
            duration: MENU.contentDuration,
            ease: MENU.contentEase,
            stagger: MENU.contentStagger
          },
          MENU.contentDelay
        );
      }
    }

    function hide(instant) {
      if (!open) return;
      open = false;
      paint(instant || reducedMotion);
      lock(false);

      tl?.kill();
      gsap.killTweensOf(content);

      /* Clicks pass through from the first frame of the close, but the
       class stays until the swipe is done. */
      gsap.set(panel, { pointerEvents: 'none' });

      const done = () => {
        panel.classList.remove('is-open');
        /* Back to the CSS's own closed state, so a resize or a theme
           change is not competing with a stale inline clip-path. */
        gsap.set(panel, { clearProps: 'clipPath,pointerEvents' });
        gsap.set(content, { clearProps: 'transform,opacity' });
      };

      if (instant || reducedMotion) { done(); return; }

      tl = gsap.timeline({ onComplete: done });
      tl.to(panel, { clipPath: CLOSED_CLIP, duration: MENU.duration, ease: MENU.ease }, 0);
      tl.to(content, { opacity: 0, duration: 0.25, ease: 'power2.out' }, 0);
    }

    const controller = new AbortController();
    const { signal } = controller;

    toggles.forEach((toggle) => {
      toggle.addEventListener('click', (e) => {
        /* The anchor inside is href="#": left alone it jumps the page to
           the top and, on some templates, adds a history entry. */
        e.preventDefault();
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
    initNavScroll();
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
