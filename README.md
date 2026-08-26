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

## Local development

```bash
node dev-server.js          # http://localhost:5173, no npm install
node dev-server.js 4000     # if 5173 is taken
```

Then swap the two embeds over to localhost — both files have the dev tag
commented out in place, ready to uncomment:

```html
<script src="http://localhost:5173/page-transition.js"></script>
<link rel="stylesheet" href="http://localhost:5173/page-transition.css">
```

Reload the published site or the Designer preview and it runs the file on
disk. Every response is `no-store`, so a plain reload is enough — no push,
no CDN, no build stamp to check.

**Chrome only.** It treats `http://localhost` as a trustworthy origin, so an
https Webflow page loads it. Safari and Firefox block it as mixed content
and the site just runs without the script.

**Swap the tags back before publishing.** A localhost tag on the live site
is a dead script for every visitor: no transitions, no modules, no error
anyone can see.

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
`cardHoverColours`, `textAnim`, `parallax`, `stickyStack`, `tabs`, `faq`, `homeHero`,
`slider` (Swiper), `marquee`, `baseLib`.

### textAnim — `[data-text-anim]`

Site-wide text reveal, ported from the ManyChat *creators-for-creators*
build (`src/modules/text-anim.js`) with the attribute contract unchanged,
so markup moves between the two sites as-is.

| Attribute | Effect |
| --- | --- |
| `data-text-anim` | Group root. One trigger, its steps run in DOM order |
| `data-text-anim-heading` | Split into lines; each line rises out of an overflow mask |
| `data-text-anim-body` | Neighbouring body elements rise and fade as one block |
| `data-text-anim-solo` | Breaks an element out into its own step |
| `data-text-anim-list` | Repeated list, items wave in as a single step |
| `data-text-anim-stagger` | On a shared ancestor: one trigger for every `[data-text-anim]` under it, plus a per-card delay (default `0.15`) |

Timing knobs, all optional:

| Where | Attribute | Meaning |
| --- | --- | --- |
| root | `data-text-anim="0.7"` | speed of the whole group. `1` normal, lower slower |
| root | `data-text-anim-delay="0.4"` | dead air after the trigger fires, before the group starts |
| step | `data-text-anim-solo="0.2"` | the step attribute's own value is the **overlap** in seconds against the previous step's end. Default `0.4`; `0` is strictly sequential, higher means more overlap |
| step | `data-text-anim-speed="0.6"` | that one step's rate, on top of the group's |
| step | `data-text-anim-delay="0.3"` | extra gap before that one step |
| ancestor | `data-text-anim-stagger="0.12"` | spacing between the `[data-text-anim]` groups under it |

Overlap pulls a step earlier and delay pushes it later; a step carrying both
resolves to one signed offset. Under a `-stagger` ancestor, card *i* starts at
`i × stagger + its own delay`. `data-text-anim-delay` on an element that is both
root and step counts once, as the group delay.

Base durations, eases and the optional blur live in the `TEXT` object above the
module; `?blur=1` / `?blur=0` overrides the blur on a live URL, and
`?textdebug=1` logs what each group built and when it fired.

Pieces are marked explicitly rather than guessed from the tag, because
Webflow text and link components are div-based and tag detection finds
nothing on the real markup. A `<br><br>` inside a `-body` element reads as a
paragraph break and its halves become separate staggered steps; a single
`<br>` does not.

Split and hidden start state happen at mount; the ScrollTriggers are created
from the intro queue, since a trigger measured against the fixed 100vh
transition rectangle either fires at the wrong scroll position or fires
immediately and plays the reveal behind the transition. Teardown reverts the
SplitText, so a container is never re-split on top of an old split.

Requires `SplitText` (free since GSAP 3.13, now loaded in the footer embed).
Without it `-heading` degrades to the same block rise as `-solo`. Lines are
split once at mount and not re-split on resize, same as the source project.

The scramble variant from that repo is **not** ported: it needs a
`[data-text-anim-scramble]{opacity:0!important}` rule in the site head plus
the scramble util. Ask if you want it.

### Intro timings

Modules mount on `beforeEnter`, while the incoming container is still a
fixed 100vh rectangle sliding in — an entrance timeline started there is
half over before the page lands. Set the initial state at mount and queue
the timeline with `Intro.add(root, play)`; it runs on `afterEnter`, and
from `once()` on first load, which `afterEnter` does not fire for.

### parallax — `[data-parallax]`

Column drift: each marked element travels against the scroll at its own rate
while its group crosses the viewport, so a grid of images reads as several
columns at different speeds with static text on top.

| Attribute | Where | Meaning |
| --- | --- | --- |
| `data-parallax="0.6"` | the moving element | Strength. `1` = the base distance (120px), negative travels the other way, `0` opts out |
| `data-parallax-group` | ancestor | The element whose pass through the viewport drives the motion. Defaults to the nearest `section` |
| `data-parallax-clip` | the group | Keeps the moving elements inside the group. Uses `clip-path`, never `overflow` — a non-visible overflow becomes the scrollport that `position: sticky` descendants resolve against and would break the pin |
| `data-parallax-axis="x"` | the moving element | Horizontal instead of vertical |
| `data-parallax-distance` | the moving element | px for strength 1 on that element, overriding the 120 default |
| `data-parallax-from` / `-to` | the moving element | Start and end of the range as a length. Given either, strength is ignored and the element travels between them — the rise-from-below form, e.g. `from="60vh" to="0"` |
| `data-parallax-mobile="0.5"` | element or group | Strength multiplier below 768px. **Defaults to 0.5** — a phone shows less of the group at once, so the same travel crosses more screen per scrolled pixel. `1` keeps desktop travel, `0` disables on phones |

Scrubbed, so it reverses on the way back up. The range is the group crossing
the screen — group top at the viewport bottom through to group bottom at the
top — and the element is at its extreme exactly when the group is, so nothing
jumps at either end.

Lengths (`-distance`, `-from`, `-to`) take a bare number as px or accept `vh` /
`vw`, resolved per ScrollTrigger refresh so they follow a resize or an
orientation change rather than freezing at mount.

The default distance is normalised against a 900px-tall reference viewport
(clamped 0.45–1.2), so the same attribute reads the same on a laptop and a tall
desktop window. An explicit `data-parallax-distance` is taken at face value —
you asked for that number.

Alternate the sign between columns for counter-motion. Keep the parallax on a
wrapper and any hover or reveal on the element inside it: two owners of one
transform fight and drift.

### stickyStack — `[data-sticky-stack]`

Cards pin one after another and the next scrolls over the one before it. The
pinning is CSS (`position: sticky` per card) — a ScrollTrigger pin rebuilds
layout on every Barba swap and fights Lenis. The module owns stacking order and
the depth cue: while a card is being covered its content lifts, which is what
makes the new card read as sliding *over* the old one.

| Attribute | Where | Meaning |
| --- | --- | --- |
| `data-sticky-stack` | the track holding the cards | Marks the stack |
| `data-sticky-card` | each card | Optional; without it the track's element children are used |
| `data-sticky-inner` | inside a card | What lifts. Optional; defaults to the card's children, so the card's background holds still while its contents move |
| `data-sticky-lift="80"` | track or card | px of lift, default 80 |
| `data-sticky-fade="0.6"` | track or card | Opacity the covered content reaches |
| `data-sticky-scale="0.96"` | track or card | Scale the covered content reaches |

Each lift is driven by the *covering* card's climb from the viewport bottom to
the top, not by the covered card — a pinned card's own rect stops changing, so
it cannot describe the progress the eye is following.

z-index is assigned in JS, ascending, so adding a third card in the Designer
needs no CSS edit. Cards need an opaque background or they show through each
other. Desktop only (`min-width: 768px`), matching the CSS.

The matching CSS, in the section's embed:

```css
.design_sticky_track { position: relative; }

@media (min-width: 768px) {
  .design_sticky_item {
    position: sticky;
    top: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
  }
  /* every card but the last gets scroll distance behind it */
  .design_sticky_item:not(:last-child) { margin-bottom: 50vh; }
}
```

### tabs — `[data-tabs="wrapper"]`

A content column of clickable items beside a visual column of matching
panels. Opening a tab animates its `item-details` from height `0` to `auto`,
cross-fades the matching visual in from the right, and — with autoplay on —
runs a progress bar that advances to the next tab when it fills.

| Attribute | Where | Meaning |
| --- | --- | --- |
| `data-tabs="wrapper"` | the section | Marks one tab group. Several per page is fine |
| `data-tabs="content-item"` | each clickable item | Gets `.active`, `aria-selected` and `tabindex` |
| `data-tabs="visual-item"` | each panel | Must match the content items **1:1 and in DOM order**; a mismatch logs a warning and the group is skipped |
| `data-tabs="item-details"` | inside a content item | The part that opens and closes. Needs `overflow: hidden` in CSS |
| `data-tabs="item-progress"` | inside a content item | The autoplay bar. Scaled on X; the module owns `transform-origin` (left filling, right emptying), so do not set it in CSS |
| `data-tabs-autoplay="true"` | the wrapper | Advance on its own |
| `data-tabs-autoplay-duration="7000"` | the wrapper | ms per tab, default `5000` |

Click and `Enter` / `Space` both switch. Timing lives in the `TABS` object
above the module.

Two things differ from the standalone embed version. The first tab is set
with `gsap.set` rather than an animated switch: mount runs on `beforeEnter`,
while the container is still a fixed 100vh rectangle, so an animated open
would play behind the transition and measure `height: auto` against the wrong
box. And the autoplay ScrollTrigger is created from the intro queue, for the
same reason — a trigger measured during the transition fires at the wrong
scroll position.

Under `prefers-reduced-motion` the tabs still switch, instantly, and autoplay
is off. Teardown kills the progress tween, the switch timeline, the
ScrollTrigger and both listeners, so a group never survives its container.

Opening a tab changes the document height, so the module calls the same
guarded `refreshScrollHeight()` the footer uses once the switch lands.

### faq — `.faq_item_wrap` / `[data-faq-item]`

Accordion. Clicking a question animates its answer from height `0` to `auto`,
rises and fades the answer text in, and rotates the plus icon 45° into a
cross. One answer open at a time by default.

Driven off the classes the section already has, so there is nothing to add in
the Designer:

| Looked for | Falls back to | Role |
| --- | --- | --- |
| `[data-faq]` | `.faq_items_wrap` | The group — one delegated listener per group |
| `[data-faq-item]` | `.faq_item_wrap` | One question + answer |
| `[data-faq-toggle]` | `.faq_items_heading_wrap` | The clickable row |
| `[data-faq-panel]` | `.faq_items_info` | What opens. Its first child is the part that rises and fades |
| `[data-faq-icon]` | `.faq_items_heading_icon` | Rotated 45° while open |

Opt-in attributes:

| Attribute | Where | Meaning |
| --- | --- | --- |
| `data-faq-multi="true"` | the group | Let several answers stay open. Default closes the siblings |
| `data-faq-open` | an item | That one starts open |

The Osmo reference does this in CSS (`grid-template-rows: 0fr → 1fr` plus
`data-accordion-*` attributes on a grid wrapper). This markup has neither the
attributes nor the wrapper, so the same motion is done in GSAP against the
existing classes. `height: auto` is measured per open rather than guessed with
a `max-height`, so a long answer never clips, and it is reset to `auto` when
the open animation lands so a resize or a font swap cannot freeze it at the
old pixel height.

The module owns `overflow: hidden` on the panel, `cursor: pointer`, `role`,
`tabindex`, `aria-expanded` / `aria-controls` and an `is-open` class on the
item — style off `.is-open` (or `[data-accordion-status="active"]`, which is
also set, so the reference CSS keeps working). `Enter` / `Space` toggle.

The listener is delegated per group, not per item, so a link inside an answer
does not toggle it shut. Opening changes the document height, so each toggle
ends in the same guarded `refreshScrollHeight()` the footer uses. Under
`prefers-reduced-motion` the state flips instantly.

### homeHero

`.home_wrap` only. The heading is untouched by this module by design — put
`data-text-anim` / `data-text-anim-heading` on it if you want the line rise.
The images fade/scale in, bump toward the pointer, and parallax *against*
the scroll direction (negative `y`).
Tuning lives in the `HERO` object at the top of the module. The two
transforms sit on different elements on purpose: parallax drives
`.home_img_wrap`, the pointer bump drives the `img` inside it.

The section's CSS embed can stay in the Designer — `<style>` in swapped
markup still applies, only `<script>` is dead. It pre-hides the images;
the module adds `hero-anim-off` on `<html>` once GSAP owns their opacity,
with a 2.5s watchdog so a throw can never leave a blank grid.

ScrollTrigger is required for the parallax and is now loaded in the footer
embed. `afterLeave` kills triggers scoped to the outgoing container plus
orphans — never `ScrollTrigger.getAll().kill()`, which under `sync: true`
would take the already-mounted incoming page's triggers with it.

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
