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
| `data-transition-bg` | `main.page_main` | Colour behind both pages while navigating *to* this page. Accepts a literal (`#111`, `black`) or a variable name (`--swatch--brand`) |
| `data-barba-update` | nav links | `class` and `aria-current` are synced from the incoming page |
| `data-barba-prevent` | any link | Opt that link out of the transition |

Links are also skipped automatically for `target="_blank"`, `download`,
`mailto:`/`tel:`, and same-page `#` hashes.

## The transition

A crossfade. Both pages occupy the same rectangle for one second: the
outgoing page blurs to 5px and fades out underneath, while the incoming
page sharpens from 5px and fades in on top. Both tweens start at position
0 — the overlap is the whole effect, and a sequential version reads as two
separate fades with a flat gap between them. Timing, blur radius and ease
live in the `FADE` object; the curve is the CSS `cubic-bezier(0.25, 0.46,
0.45, 0.94)` handed to `CustomEase` as the same four numbers.

The layer machinery underneath it is not decoration. Both containers are
lifted into fixed, viewport-sized wrappers so they can overlap at all —
the same thing swup's parallel plugin does by keeping the old and new
containers in the DOM together. Barba is already running `sync: true`, so
the incoming page is mounted while the outgoing one is still animating,
which is what makes the overlap possible without a second router.

The outgoing wrapper sits at `z-index: 1` with `pointer-events: none` and
the incoming one at `z-index: 2` — it is in the DOM for a full second with
live links otherwise, exactly what swup's `#swup.is-previous-container`
rule is for.

**Not ported from the swup version:** the nested `#swup` scroll container.
This site scrolls on `window`, and Lenis, ScrollTrigger, the sticky
sections, the footer reveal and the nav state all measure against it. A
`100dvh` shell with `overflow-y: auto` on the container would mean
rewriting all five. The visual result is the same either way, since the
crossfade only needs the two containers to overlap.

### Transition background

The colour behind both pages while they crossfade comes from
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
`cardHoverColours`, `textAnim`, `parallax`, `stickyStack`, `tabs`, `faq`, `servicesHover`,
`filterSingle`,
`homeHero`,
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

**Inline images in a heading.** A hero that sets a square photo between
the words — `<span class="hero-h1__img"><img></span>` inside the `<h1>` —
gets three things without any extra attribute:

- The line masks are padded above as well as below. `maskPad` only ever
  cleared the descenders; an image at `height: 2em` stands proud of the
  line box at both ends and the mask sliced its top off. Each line now
  measures how far its tallest child pokes out and pads that much, with an
  equal negative margin, so the clip box grows and the layout does not
  move. The start offset grows with the pads, or the image would show
  above the mask before its line rises.
- The image scales up from `0.6` as its own line arrives. The **wrapper**
  scales, not the `img`: the frame is an `aspect-ratio` box with
  `object-fit: cover` inside, so scaling the picture alone would just show
  the frame's background around a shrunken photo. Scale never reflows, so
  the words on either side hold their positions the whole way — measured,
  not assumed. Knobs: `imgFrom` (`0` turns it off), `imgDuration`,
  `imgEase`, `imgOffset` after the line, `imgStagger` between images
  sharing a line.
- The split runs on the innermost element that holds the text, not on the
  marked wrapper. Webflow marks the wrapper — a div with the style class
  and an embedded `<h1>` inside — and SplitText hoists the lines out of
  that `<h1>` and does not put them back on revert, so the first mount
  used to leave the page with an empty `<h1>` for good. Splitting the
  heading itself keeps the lines inside it and makes teardown lossless.
  It also splits per line rather than treating the whole embed as one.

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

### servicesHover — `.services_wrap`

The service rows. Hovering one wipes the neon up behind its text, dims
the other rows, and starts an image preview that follows the cursor.

Driven off the classes the section already has, so there is nothing to
add in the Designer:

| Looked for | Role |
| --- | --- |
| `.services_wrap` | The section. Several per page is fine, each gets its own follower |
| `.services_hover_items` | The list. One leave listener, so crossing a border between rows does not end the preview |
| `.services_hover_item` | One row. Gets the colour layer and the hover listeners |
| `.services_hover_inner` | The text. Lifted over the wipe and dimmed while another row is hovered |
| `.services_hover_img_wrap img` | The preview image. Hidden in the row — it only ever shows in the follower |

| Attribute | Where | Meaning |
| --- | --- | --- |
| `data-services-fill="--_colour---color--color-neon"` | a row | Wipe colour, as a literal or a variable name. Unset, the row's own background colour is used |

The preview is **not** the masked filmstrip from the Osmo reference. Each
new image is stacked on top of the one already showing, starts at 18% and
centred, and grows until it covers it, so the change reads as the next
service landing on the last. A layer is only removed by the tween that
covered it, which is what makes a fast run down the list safe: whichever
clone is on top wins and takes everything under it with it, and the image
underneath is present for the whole grow so nothing flashes through.

The neon in the Designer sits on `.services_hover_item` itself, which
paints it flat and leaves nothing to reveal. The module reads that colour
off, moves it onto a layer of its own, sets the row transparent, and hands
the background back on teardown — so the Designer stays the place the
colour is chosen. The wipe is `clip-path`, not `scaleY`, so reversing it
mid-flight cannot jump: swapping a transform origin under a half-played
scale moves the box, an inset just interpolates.

The follower is appended to `<body>`, not to the section.
`prepareForTransition` puts perspective on `.page_wrap`, and perspective
creates a containing block for fixed-position descendants — a follower
inside the container would stop resolving against the viewport. Its box
(`.services_follower`) is the only part styled in `page-transition.css`;
everything the module puts on a row is inline, where it outranks the
Designer regardless of stylesheet order. It sits at `z-index: 90`, under
the nav.

Desktop pointers only (`(hover: hover) and (min-width: 992px)`) — below
that the module returns before touching anything and the rows keep their
Designer background, so set the mobile appearance there. Under
`prefers-reduced-motion` the states still change, instantly, and images
swap without the grow. Timing lives in the `SERVICES` object above the
module. Teardown aborts every listener, kills the tweens, removes the
follower and restores each row's background, `z-index` and hidden image
wrap, so a container never leaves a follower behind after a swap.

### filterSingle — `.insights_filter_check`

Webflow checkboxes that behave like radios: checking one clears the rest.
Radios would do this for free except they cannot be unchecked by clicking
again, which is what an "all" state needs.

| Looked for | Role |
| --- | --- |
| `[data-filter-single]` or `.insights_filter_check` | A box in the set. Either the real `input` or the div Webflow paints — both resolve to the same pair |
| `data-filter-single="year"` | That box's group name, if the page has more than one filter set |
| `data-filter-single-group="year"` | The same, on a shared ancestor |

Unnamed boxes are all one set. Fewer than two boxes and the module does
nothing.

Two things the obvious version gets wrong. Webflow paints the tick with
`w--redirected-checked` and only toggles it on real user events, so a box
cleared in script keeps its tick. And Finsweet reads its filters off change
events, so a box cleared behind its back stays in the query — the list ends
up filtered by a category whose box is visibly empty. The module removes the
class and fires `input` and `change` on every box it clears, with a guard so
those events do not come back through its own listener.

It is a module rather than a `DOMContentLoaded` snippet in the page because
`DOMContentLoaded` fires once. After the first Barba swap the listeners are
bound to checkboxes that no longer exist.

The module also mirrors each box's state onto its `<label>` as
`filter-single` plus `is-checked`, set on mount and on every change. The
idle styling hangs off that pair in `page-transition.css`:

| | Unselected |
| --- | --- |
| Box border | `--filter-idle-border`, `rgba(25, 25, 21, 0.1)` |
| Label text | `--filter-idle-text`, `rgba(25, 25, 21, 0.6)` |

Only the idle state is declared — the checked state stays whatever the
Designer says it is. Override either colour by redefining the variable on
`.filter-single` or on any ancestor.

Keying off our own class rather than Webflow's `w--redirected-checked`
matters: that class lands on whichever element Webflow decided to own, and
is absent entirely when the box is a plain input.

The label text is also trimmed to its letters — `text-box: trim-both cap
alphabetic` — so the row centres the box against the type instead of
against the leading, which is what leaves a tick sitting visibly high next
to its own label. Same problem as the descender padding in `textAnim`,
solved from the other end. Behind `@supports`, so a browser without it
keeps the line box it had. Alignment itself stays in the Designer; this
only makes the text box honest about where the letters are.

### Finsweet Attributes

Not wired up here yet, but the same rule applies: Attributes scans the DOM
on load, and a Barba swap replaces the list it scanned. When you add it,
restart it per container rather than re-adding the script:

```js
Modules.add('finsweet', function () {
  window.FinsweetAttributes?.modules?.list?.restart?.();
});
```

The v2 API is `window.FinsweetAttributes` — `push([key, cb])` to run code
once a solution has loaded, `modules.<key>` for that solution's controls
(`restart`, `destroy`, `loading`), and `load(key)` to pull one in on demand.
Keep the Attributes `<script>` itself in the Webflow footer embed, once,
outside the swapped container.

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

## Underline links — `[data-underline-link]`

Hovering wipes the resting line out to the right while a fresh one wipes in
from the left behind it. Two lines, not one: a single line scaling out and
back reads as a retreat and a return, two read as a replacement.

Put the attribute on the element that should carry the line — the text, or
the wrap if the line runs under an icon too. Nothing else to add.

| Attribute | Where | Meaning |
| --- | --- | --- |
| `data-underline-link` | the element with the line | The two-line wipe |
| `data-underline-link="simple"` | same | One line, draws in from the left and retreats the way it came |
| `data-hover` | an ancestor | That element's hover drives the line, for a trigger area bigger than the text |
| `data-underline-keep-border` | the element | Leave its static border alone |

Hover is also picked up from an ancestor `a` or `button`, and from a Webflow
overlay anchor (`.g_clickable_wrap`) covering the component — that anchor is
a **sibling** of the text, so the marked element never sees the pointer and
`:hover` alone would never fire. Keyboard focus on either the element or the
overlay triggers it too.

The static border is turned transparent rather than removed, so the space it
reserves stays and nothing shifts on hover. That rule is written twice over
(`[data-underline-link][data-underline-link]`) because the border is usually
a shorthand on a class, and a shorthand later in the cascade beats a
single-attribute rule on a tie.

Tuning, per element or globally:

| Variable | Default |
| --- | --- |
| `--underline-thickness` | `max(1px, 0.0625em)` — scales with the type |
| `--underline-offset` | `0px` below the box |
| `--underline-duration` | `0.735s` |
| `--underline-delay` | `0.3s` between the two lines |
| `--underline-ease` | `cubic-bezier(0.625, 0.05, 0, 1)` |

Desktop pointers only (`(hover: hover) and (pointer: fine)`), and under
`prefers-reduced-motion` the lines swap instantly.

## Meganav

The Meny button opens a full-viewport sheet that swipes down from the top
edge, with its contents rising in behind the swipe. Init runs once from
`initOnceFunctions`, not per container: the nav is persistent, and a
per-container mount would bind a second set of listeners on every
navigation while `sync: true` keeps the outgoing page alive.

| Looked for | Role |
| --- | --- |
| `[data-nav]` / `.meganav` | the bar. Also the scroll-state target |
| `[data-nav-panel]` / `.meganav_panel` | the sheet |
| `[data-nav-toggle]`, `.meganav_button_nav_open-wrap`, `.meganav_mobile_open` | anything that opens it. The click is caught on the wrapper, so the `href="#"` anchor inside never jumps the page |
| `.meganav_feature_text`, `.button_main_wrap`, `.meganav_heading`, `.footer_link_wrap`, `[data-nav-content]` | the rows that stagger in, in DOM order |

Escape closes it, so does a click on any link inside, and `beforeLeave`
closes it instantly at the start of a navigation — `syncNavFrom` drops the
`is-open` class, but the inline `clip-path` set here would survive that and
leave an invisible sheet over the incoming page.

Scroll is locked through the Lenis instance (`lenis.stop()`), with
`html.is-menu-open { overflow: hidden }` as the fallback. `overflow: hidden`
alone does nothing while Lenis owns the scroll — that is the bug in the
nav this was ported from.

`.is-open` lands on both the nav and the panel, and on the way out the
panel keeps it until the swipe finishes: `.is-open` carries `visibility`,
so dropping it at the start made the sheet vanish instead of leaving.
Pointer events go dead from the first frame of the close regardless.

Timing lives in the `MENU` object. The curve is the reference nav's
`cubic-bezier(0.05, 0.7, 0.1, 1)` over 0.89s.

### Mobile

Below 992px the panel is a card, not a sheet: `height: auto` so it opens
only as far as its content needs, with `max-height: var(--meganav-mobile-max,
100dvh)` to keep a long menu on screen and let it scroll rather than run off
the bottom. Same clip-path swipe, same everything else.

### The panel CTA

The button ships its palette per style variant, so on the black sheet the
primary style kept rendering dark on dark whatever theme class the panel
carried. It is stated here against the sheet's own two colours — light pill,
dark label, as drawn — and retargeted with `--meganav-cta-bg` /
`--meganav-cta-text` if the design changes.

### The burger

While the sheet is open the two bars cross into an X and turn the panel
text colour. Each bar travels half the distance between them — the gap plus
one bar's thickness, halved — so they meet on the centre line before they
rotate. `--burger-gap` and `--burger-thickness` default to the values in the
nav embed (5px / 1.5px); set them if the Designer ones change.

Driven off `.meganav.is-open`, not off a class on the burger itself, so
there is one state flag for the whole nav.

### Borders in the open state

The open-state rules used to move only the type, so a link's underline —
a real border carrying its own theme colour — stayed dark on the black sheet.
The bar's bordered elements now take `--meganav-panel-text` as their border
colour while the menu is open, and `[data-nav-border]` on any other element
opts it into the same treatment.

`[data-underline-link]` is excluded on purpose: it holds its border at
transparent and draws the line as a pseudo-element in `currentColor`, which
the colour rules already flip. Painting the border back would leave a static
line sitting under the animated one.

### The toggle label

Opening swaps the toggle text to `Lukk` and closing puts it back, faded
either side of the change — a hard swap mid-swipe reads as a glitch next to
a second of eased motion. The screen-reader label in the overlay anchor is
swapped with it, and each element keeps its own resting string (the visible
one says Meny, the accessible one Menu). Overrides per toggle:
`data-nav-label-open`, `data-nav-label-closed`. The instant close at the
start of a navigation swaps instantly too.

### Why the sheet is absolute, not fixed

It sits inside `<nav class="meganav">`, which is where the Designer put it,
and the nav carries a GSAP transform for the footer hide. Any non-none
transform on an ancestor makes a `position: fixed` descendant resolve
against that ancestor instead of the viewport — the sheet would be the size
of the bar. So the nav is pinned `fixed` to the top edge and the sheet is
`absolute` at `top: 0; right: 0; left: 0; height: 100dvh`, which is the same
rectangle without depending on the transform being the identity. `width:
100%`, not `100vw`: `100vw` counts the scrollbar and would push a
horizontal one onto every page while the sheet sits there clipped.

The same reason `.meganav_root` does **not** get `height: 100vh`. It is a
flow sibling of `.page_wrap`, so a full-height root would push the whole
page down a viewport.

### The container class

`u-container` is on the panel in the Designer, but the sheet has to be
full-bleed for the black to reach the edges — so its `max-width` is
overridden here, and the content lost its margins along with it. On mount
the module moves the container class down to `.meganav_panel_inner`, where
it constrains the content and leaves the sheet alone, and puts it back on
teardown. Moving it in the Designer instead is equally fine; the module
sees it is already there and does nothing.

### Rules to delete from the nav's Webflow embed

The rules in `page-transition.css` outrank the embed on specificity, not on
order — an embed inside the component renders in the body, *after* this
file, so a tie goes to the embed. These are superseded and only confuse the
next reader:

- `.meganav_panel` — `position: absolute; top: 100%`, the `opacity` /
  `visibility` transitions, and `background-color: var(--_theme---nav--nav-menu)`
  (the sheet is `#191915`, not the light navbar colour)
- `.meganav_panel_inner` — the fade and lift; GSAP staggers the rows now
- `@media (max-width: 991px) { .meganav_panel { display: none !important } }`
  — the sheet *is* the mobile menu
- `[data-transparent="true"].is-open { background-color: … }` — the bar goes
  transparent over the sheet
- `.meganav { z-index: 999999 }` — the root is at 100 and the page layers at 1–2

Dead with no markup left to match: `.meganav_mobile_dropdown`,
`.meganav_mobile_icon`, `.meganav_locale_*`, `.meganav_card`,
`.meganav_link_sub`, `.meganav_link_group`, `.meganav_backdrop`. So is the
old `.meganav_mobile_wrap` markup, which still holds another project's
links — hidden by this file until it is deleted in the Designer.

### Knobs

| Variable | Default | |
| --- | --- | --- |
| `--meganav-panel-bg` | `--_theme---background--background-primary`, `#191915` | sheet |
| `--meganav-panel-text` | `--_colour---color--color-paper`, `#f7f7f5` | sheet type, and the bar while open |
| `--nav--height` | `5rem` | the sheet's top padding, so its content clears the bar |

## Footer and the transition

The footer is `position: fixed` behind the page and revealed by the page
sliding up off it, so it is not part of the Barba container and the
transition used to hide it outright — click a link in the footer and the
thing you were looking at vanished a frame before the page it belongs to
started moving.

If any of the footer is on screen when a navigation starts, the leave step
now moves the real element into the outgoing layer, pinned at the viewport
position it already occupied. Inside a fixed wrapper an absolute child
resolves against the viewport rect, so nothing moves at the swap: the footer
just stops being fixed and becomes part of the card that scales and rotates
away. It goes back to `<body>` with its inline styles cleared when the
timeline lands, and `sweepStaleLayers` restores it first thing if a
transition is interrupted, so an aborted navigation cannot take the footer
down with the layer.

The element itself moves, never a clone — it carries links, a form and IX2
bindings, and a clone would drop all three. While it is in the layer it
wears `.is-transition-layer`, which is what exempts it from the
`html.is-transitioning .footer_wrap { visibility: hidden }` rule that still
covers the case where no part of it was showing.

Whether it is showing is measured at `beforeLeave`, **before**
`FooterReveal.collapse()` runs. Collapsing the reserved space shortens the
document, the browser clamps the scroll position to the new bottom, and the
page slides down over the footer — measure after that and a footer filling
half the screen looks like one nobody ever scrolled to.

## Nav

The nav is persistent — it is never swapped — so its state is owned here
rather than by an embed in the Designer.

| State | When |
| --- | --- |
| `is-scrolled` | past 10px from the top |
| `is-hidden` | the footer reveal is at least half out |

The footer is fixed behind the page and revealed by the page sliding up
off it, so how much of it is showing is just the distance left to the
bottom of the document. Past `NAV_HIDE.hideAt` (0.5) the nav slides up by
its own height and fades out; scrolling back above `NAV_HIDE.showAt`
(0.35) brings it back. Two thresholds, not one: a single line at the same
place flickers the nav on and off while a scroll rests exactly on it, and
inertia scrolling rests on things constantly.

It travels, it does not fade: opacity stays at 1 the whole way and the nav
simply leaves upward. `pointer-events` goes to `none` with it, so it cannot
take a click meant for the footer while it is still crossing the top of the
screen. `is-hidden` is set alongside the tween if you want to style anything
else off it.

Two things outrank the footer. An open mega panel puts the nav back
immediately — hiding it out from under a menu someone just opened leaves
them with a scroll lock and no way out. And mid-transition the check is
skipped entirely: both pages are `position: fixed` then, so the document
height is whatever the transition left behind and the footer fraction is
meaningless. Under `prefers-reduced-motion` the nav still goes, instantly.

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
