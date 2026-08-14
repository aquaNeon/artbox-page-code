# Artbox — Webflow page transitions

Barba.js + GSAP page transition layer for the Artbox Webflow site, plus the
per-container module system that keeps Swiper, the marquee, Webflow IX2 and the
base-lib scripts alive across page swaps.

Served to the live site over jsDelivr, so edits go out on `git push` — no
Webflow republish needed.

## CDN

```
https://cdn.jsdelivr.net/gh/aquaNeon/artbox-page-code@main/page-transition.js
https://cdn.jsdelivr.net/gh/aquaNeon/artbox-page-code@main/page-transition.css
```

jsDelivr minifies on request — append `.min` before the extension
(`page-transition.min.js`) if you want the smaller build, no build step required.

Branch URLs are edge-cached for roughly 12 hours. After a push, run
`./purge-cdn.ps1` to flush both files, then hard-reload the site.

Pin to an immutable tag instead if you ever need a rollback anchor: tag the
commit and swap `@main` for `@v1.2.3` in the embed.

## Install

Two paste-ins, both under **Webflow → Site Settings → Custom Code**:

| File | Goes in |
| --- | --- |
| `webflow-head.html` | Head Code — three stylesheets |
| `webflow-footer.html` | Footer Code — libraries, then `page-transition.js` |

Publish once. After that the CDN carries changes, and you only re-publish
Webflow if the embeds themselves change.

The split is not stylistic. `page-transition.js` runs on parse — it queries
`.footer_wrap` / `.page_wrap` and calls `barba.init()` immediately. Loaded from
Head Code it would find no body: `FooterReveal` degrades to a silent no-op stub
and Barba logs *no wrapper found*. It has to sit before `</body>`.

Remove the Webflow-hosted GSAP script tag before publishing; two GSAP copies
will fight over the same global.

## Required DOM structure

```
body                     data-barba="wrapper"
  .global_embeds         CSS embeds, u-hide class dump
  .meganav_root          persists, never swapped
  .page_wrap             gets perspective during transition
    main.page_main       data-barba="container"
                         data-barba-namespace="home"
                         data-nav-transparent="true"   (per template)
  .footer_wrap           MUST be a sibling of .page_wrap, not inside it
```

`.footer_wrap` placement is load-bearing. `prepareForTransition` sets
`perspective` on `.page_wrap`, and perspective creates a containing block for
fixed-position descendants — a footer nested inside `.page_wrap` would stop
resolving against the viewport.

## Per-template attributes

| Attribute | Where | Purpose |
| --- | --- | --- |
| `data-barba="container"` | `main.page_main` | The swapped element |
| `data-barba-namespace` | `main.page_main` | Template identity |
| `data-nav-transparent` | `main.page_main` | Copied to the persistent nav as `data-transparent`; defaults to `true` |
| `data-transition-bg` | `main.page_main` | Colour of the 3D gap while navigating *to* this page. Accepts a literal (`#111`, `black`) or a variable name (`--swatch--brand`) |
| `data-barba-update` | nav links | `class` and `aria-current` are synced from the incoming page |
| `data-barba-prevent` | any link | Opt that link out of the transition |

Links are also skipped automatically for `target="_blank"`, `download`,
`mailto:`/`tel:`, and same-page `#` hashes.

## Transition background

The colour visible in the gap between the two pages comes from
`.page-transition__backdrop`, a div that exists only for the duration of a
navigation. It is separate from the page background on purpose — changing it
does not affect `.page_wrap`.

Site-wide, set the variable on a global class or on `body`:

```css
--transition-bg: #0b0b0b;
```

Per template, put `data-transition-bg` on the Barba container; it wins over the
site-wide value for navigations landing on that page. Unset, it falls back to
`--_theme---background--bg-primary`, which is what the gap showed before.

## Modules

Modules are registered with `Modules.add(name, init)` and mounted per container.
`init(root)` may return a teardown function, which runs on `afterLeave` for that
container. Because the transition uses `sync: true`, the incoming page mounts
while the outgoing one is still animating — so cleanup is keyed by container
rather than shared globally. A module that registers global listeners, a `rAF`
loop or an observer must return a teardown, or it will leak on every navigation.

Registered: `caseRowGrid`, `collectionRatio`, `testimonialColours`,
`cardHoverColours`, `slider` (Swiper), `marquee`, `baseLib`.

`baseLib` calls `MYL.video.init(root)`, `MYL.formValidation.init(root)` and
`MYL.matchContainer.init(root)`. Those three scripts currently bind on
`DOMContentLoaded`, which fires only once — until each exposes an `init(root)`,
video and form validation stop working after the first swap.

Script tags placed inside the swapped container never execute on a Barba
navigation. The three former inline section embeds now live here as modules —
delete them in the Designer or they run twice on first load.

## Before launch

- Set `debug: false` in the `barba.init` config.
- Consider `integrity` / `crossorigin` on the third-party CDN script tags.
