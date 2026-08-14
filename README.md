# Artbox — Webflow page transitions

Barba.js + GSAP page transition layer for the Artbox Webflow site, plus the
per-container module system that keeps Swiper, the marquee, Webflow IX2 and the
base-lib scripts alive across page swaps.

Served to the live site over jsDelivr, so edits go out on `git push` — no
Webflow republish needed.

## CDN

Development, live on every push, no purge step:

```
https://raw.githack.com/aquaNeon/artbox-page-code/main/page-transition.js
https://raw.githack.com/aquaNeon/artbox-page-code/main/page-transition.css
```

**Do not use jsDelivr `@main` here.** Its branch alias froze several commits
back and kept serving a stale build through repeated purges that all reported
`finished`; the commit-pinned `@<sha>` form stayed correct throughout. If a
change appears not to have taken effect, verify the bytes before touching the
code:

```bash
curl -s <url> | wc -l          # compare against the local file
```

The script logs `[page-transition] build <stamp>` on load. If that stamp does
not match `BUILD` at the top of `page-transition.js`, you are running an old
file and nothing else is worth debugging yet.

`raw.githack.com` is rate-limited and deliberately uncached, so it is a
development URL only. Before launch, pin the full commit SHA:

```
https://rawcdn.githack.com/aquaNeon/artbox-page-code/<full-sha>/page-transition.js
```

That form is immutable and cached hard, which is what production wants anyway.

`purge-cdn.ps1` only applies to the jsDelivr URLs and is kept for that eventual
switch.

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
black.

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

- Set `debug: false` in the `barba.init` config, and drop the two
  `[page-transition]` console lines.
- **Replace both `raw.githack.com/.../main/` URLs with commit-pinned
  `rawcdn.githack.com/.../<full-sha>/` ones.** A mutable branch ref means
  whatever is on `main` executes on the live site, and it cannot be protected
  with SRI because the hash changes on every push. Shipping the dev URL is the
  one thing in this repo that is genuinely unsafe.
- Add `integrity="sha384-..." crossorigin="anonymous"` to the pinned tags once
  they are immutable. Generate with:
  `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`
- Same treatment for the third-party CDN tags (gsap, barba, lenis, swiper,
  base-lib), which are all unpinned or branch-pinned today.
