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

  gsap.registerPlugin(CustomEase);
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

  const durationDefault = 0.6;
  CustomEase.create('osmo', '0.625, 0.05, 0, 1');
  gsap.defaults({ ease: 'osmo', duration: durationDefault });


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
      }
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
    });
  });


  /* ============================================================
     SWIPER
     ============================================================ */

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

      const gapAttr = el.getAttribute('data-gap');
      if (gapAttr) el.style.setProperty('--slider-gap', gapAttr);

      const measureGap = () => {
        const probe = document.createElement('div');
        probe.className = 'c_slider_gap_probe';
        el.appendChild(probe);
        const px = probe.getBoundingClientRect().width;
        probe.remove();
        return px;
      };

      const wrap = el.closest('.c_slider_wrap');

      const swiper = new Swiper(el, {
        slidesPerView: num('data-slides-per-view', 1.25),
        spaceBetween: measureGap(),
        loop: bool('data-loop', false),
        rewind: bool('data-rewind', true),
        loopAdditionalSlides: num('data-loop-extra', 4),
        speed: num('data-speed', 600),
        navigation: {
          prevEl: wrap ? wrap.querySelector('.c_slider_button_prev') : null,
          nextEl: wrap ? wrap.querySelector('.c_slider_button_next') : null,
          disabledClass: 'is-inactive'
        }
      });

      let t;
      const onResize = () => {
        clearTimeout(t);
        t = setTimeout(() => {
          swiper.params.spaceBetween = measureGap();
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
    const nav = document.querySelector('.meganav');
    if (!nav || !container) return;
    const transparent = container.dataset.navTransparent ?? 'true';
    nav.setAttribute('data-transparent', transparent);
    nav.classList.remove('is-open', 'is-mobile-open');
    if (window.scrollY <= 10) nav.classList.remove('is-scrolled');
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
    // Persistent, non-swapped behaviour goes here (meganav etc)
  }

  function initBeforeEnterFunctions(next) {
    nextPage = next || document;
    reinitWebflow();
    Modules.mount(nextPage);
  }

  function initAfterEnterFunctions(next) {
    nextPage = next || document;
    FooterReveal.sync();
    if (hasLenis && lenis) lenis.resize();
    if (hasScrollTrigger) ScrollTrigger.refresh();
  }


  /* ============================================================
     PAGE TRANSITIONS
     3D side-by-side. Current page pushes back and exits left, new
     page slides in from the right and comes forward.
     ============================================================ */

  function runPageOnceAnimation(next) {
    const tl = gsap.timeline();
    tl.call(() => { resetPage(next); }, null, 0);
    return tl;
  }

  function prepareForTransition(parent, current, next) {
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
      transformStyle: 'preserve-3d',
      overflow: 'clip'
    });

    gsap.set(wrapper, {
      position: 'fixed', top: -offsetY, left: -offsetX,
      width: '100%', height: '100vh', overflow: 'clip',
      zIndex: 2, transformStyle: 'preserve-3d', willChange: 'transform',
      clipPath: 'rect(0% 100% 100% 0% round 0em)'
    });

    gsap.set(current, {
      position: 'absolute', top: -scrollY, left: 0, width: '100%',
      willChange: 'transform, opacity', backfaceVisibility: 'hidden'
    });

    gsap.set(next, {
      position: 'fixed', top: -offsetY, left: -offsetX,
      width: '100%', height: '100vh', overflow: 'clip',
      zIndex: 1, transformStyle: 'preserve-3d',
      willChange: 'transform, opacity', backfaceVisibility: 'hidden',
      xPercent: 175, z: '-100vw', autoAlpha: 1,
      clipPath: 'rect(0% 100% 100% 0% round 0em)'
    });

    return { wrapper, backdrop, scrollY };
  }

  function runPageLeaveAnimation(current, next) {
    const parent = current.parentElement || document.body;
    const { wrapper, backdrop } = prepareForTransition(parent, current, next);

    const tl = gsap.timeline({
      onComplete: () => {
        wrapper.remove();
        backdrop.remove();
        resolveLeave?.();
        gsap.set(parent, {
          clearProps: 'perspective,perspectiveOrigin,transformStyle,overflow'
        });
        gsap.set(next, {
          clearProps: 'position,inset,width,height,zIndex,transformStyle,willChange,backfaceVisibility,transform'
        });
      }
    });

    if (reducedMotion) return tl.set(current, { autoAlpha: 0 });

    tl.to(wrapper, {
      z: '-100vw', duration: 0.9,
      clipPath: 'rect(0% 100% 100% 0% round 0em)'
    }, 0);

    tl.to(wrapper, { xPercent: -175, duration: 1, overwrite: 'auto' }, 0.25);
    tl.to(next, { xPercent: 0, duration: 1, overwrite: 'auto' }, '<');

    tl.to(next, {
      z: 0, duration: 0.9, overwrite: 'auto',
      clipPath: 'rect(0% 100% 100% 0% round 0em)'
    }, '>-=0.4');

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

  barba.hooks.beforeLeave(() => {
    root.classList.add('is-transitioning');
    FooterReveal.collapse();
    leaveDone = new Promise((resolve) => { resolveLeave = resolve; });
  });

  barba.hooks.beforeEnter((data) => {
    gsap.set(data.next.container, { position: 'fixed', top: 0, left: 0, right: 0 });
    if (lenis?.stop) lenis.stop();
    initBeforeEnterFunctions(data.next.container);
    syncNavFrom(data.next.container);
  });

  barba.hooks.enter((data) => {
    initBarbaNavUpdate(data);
  });

  // Runs once the outgoing container is gone, so its Swiper and
  // marquee stay alive and animating through the whole leave.
  barba.hooks.afterLeave((data) => {
    if (hasScrollTrigger) ScrollTrigger.getAll().forEach((t) => t.kill());
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

  barba.hooks.after(() => {
    root.classList.remove('is-transitioning');
    FooterReveal.sync();
  });

  barba.init({
    debug: true, // set false before launch
    timeout: 7000,
    preventRunning: true,

    prevent: ({ el }) => {
      if (!el) return false;
      const href = el.getAttribute('href') || '';
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
