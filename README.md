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
https://raw.githack.com/aquaNeon/artbox-page-code/main/kugiri.global.js
```

`kugiri.global.js` is the text splitter, vendored: it ships as an ES module and
`page-transition.js` is a classic script, so the file in this repo is the
jsDelivr `+esm` build with its one export hung off `window.kugiri`. Its banner
carries the one-line command that regenerates it for a new version. It is
vendored rather than imported at runtime because a dynamic `import()` resolves
after parse, and the headings would flash unsplit before the reveal could hide
them. It replaces SplitText — remove that tag.

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

`_fixture-text-anim.html` is a standalone page for the text reveal — every
role, every split level, a stagger row, an inline heading image — served by the
same dev server:

```
http://localhost:5173/_fixture-text-anim.html?textdebug=1
```

It is plain http end to end, with no Webflow around it, so it is also the one
way to put this code in front of **Safari**, which blocks a localhost script on
an https page.

## Install

Two paste-ins, both under **Webflow → Site Settings → Custom Code**:

| File | Goes in |
| --- | --- |
| `webflow-head.html` | Head Code — three stylesheets |
| `webflow-footer.html` | Footer Code — libraries, `kugiri.global.js`, then `page-transition.js` |

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

## Easing

Every curve the site uses is declared in one place, near the top of
`page-transition.js`. Nothing else in the file names a curve directly.

`EASE` holds the three custom curves, written as the four numbers of a CSS
`cubic-bezier`:

| name | numbers | used for |
| --- | --- | --- |
| `EASE.brand` (`osmo`) | `0.625, 0.05, 0, 1` | the site default, via `gsap.defaults` |
| `EASE.page` (`pageFade`) | `0.25, 0.46, 0.45, 0.94` | the page crossfade |
| `EASE.menu` (`menuSwipe`) | `0.05, 0.7, 0.1, 1` | the meganav sheet |

`E` maps a *kind* of motion to a curve. Modules reference the role, so
retuning one kind of movement across the whole site is a single line:

| role | current | applies to |
| --- | --- | --- |
| `E.heading` | `power4.out` | heading lines rising out of their mask |
| `E.body` | `power3.out` | paragraphs, `-solo` elements, `[data-swap]`, tab stack, services follower, menu rows |
| `E.small` | `power2.out` | list items, inline heading images, hero bump, nav hide, menu close |
| `E.panel` | `power3` | tab crossfades |
| `E.open` | `osmo` | things opening in place: FAQ, the services colour fill |
| `E.travel` | `power2.inOut` | long journeys: the video takeover, the services row dissolve |
| `E.hover` | `power3` | pointer-following |
| `E.hoverOut` | `power3.inOut` | the services follower scaling away |
| `E.label` | `power1.out` | the burger label swapping under the button |
| `E.page` | `pageFade` | the crossfade, via `FADE` |
| `E.menuSheet` | `menuSwipe` | the meganav sheet clip |

To put one curve on everything, point every role at `EASE.brand`.

Scrubbed motion — parallax, the CTA images, both sticky stacks, the
marquee — stays on `ease: 'none'` at the call site and is deliberately not
a role. Scroll position is the timing there; easing on top of it reads as
lag.

Durations are not centralised: they sit in each module's own config object
(`TEXT`, `TABS`, `SERVICES`, `MENU`, …) because they are paced against that
module's distances, not against each other.

## Modules

Modules are registered with `Modules.add(name, init)` and mounted per container.
`init(root)` may return a teardown function, which runs on `afterLeave` for that
container. Because the transition uses `sync: true`, the incoming page mounts
while the outgoing one is still animating — so cleanup is keyed by container
rather than shared globally. A module that registers global listeners, a `rAF`
loop or an observer must return a teardown, or it will leak on every navigation.

Registered: `caseRowGrid`, `collectionRatio`, `testimonialColours`,
`cardHoverColours`, `textAnim`, `parallax`, `stickyStack`, `tabs`, `faq`, `servicesHover`,
`filterSingle`, `eyebrowIcon`,
`homeHero`,
`slider` (Swiper), `marquee`, `baseLib`.

### textAnim — `[data-text-anim]`

Site-wide text reveal. [kugiri](https://github.com/edoardolunardi/kugiri) cuts
the text into units, the Web Animations API moves them. **No gsap in this
module** — the rest of the site still uses it, the text does not.

| Attribute | Effect |
| --- | --- |
| `data-text-anim` | Group root. One trigger, its steps run in DOM order |
| `data-text-anim-heading` | Split into painted lines; each rises out of its own clip |
| `data-text-anim-body` | Body copy, same line reveal, gentler timing |
| `data-text-anim-solo` | Breaks an element out into its own step |
| `data-text-anim-list` | Repeated list, its lines wave in as a single step |
| `data-text-anim-stagger` | On a shared ancestor: one trigger for every `[data-text-anim]` under it, plus a per-card delay (default `0.15`) |
| `data-text-anim-with` | On a step: run it alongside the previous step instead of after it |
| `data-text-anim-fade` | On a step, or on the root for all of them: opacity only, no travel and no clip |
| `data-text-anim-split` | On a step: `lines` (default), `words`, `chars`, or `none` for an unsplit block rise |
| `data-text-anim-icon` | On a non-text child of a step (an eyebrow square, a bullet): give it the step's own cue instead of letting it appear whole |
| `data-text-anim-ignore` | On anything inside a marked element: never cut into, never a unit |

Timing knobs, all optional:

| Where | Attribute | Meaning |
| --- | --- | --- |
| root | `data-text-anim="0.7"` | speed of the whole group. `1` normal, lower slower |
| root | `data-text-anim-delay="0.4"` | dead air after the trigger fires, before the group starts |
| step | `data-text-anim-solo="0.2"` | the step attribute's own value is the **overlap** in seconds against the previous step's end. Default `0.4`; `0` is strictly sequential, higher means more overlap |
| step | `data-text-anim-speed="0.6"` | that one step's rate, on top of the group's |
| step | `data-text-anim-delay="0.3"` | extra gap before that one step |
| ancestor | `data-text-anim-stagger="0.12"` | spacing between the `[data-text-anim]` groups under it |

`data-text-anim-with` starts a step at the same time as the one before it, so
two cells sharing a grid row read as one move while staying separate elements —
which they have to be when each carries its own border. A step carrying both
`-with` and a delay starts that many seconds after the step it joins.

`data-text-anim-fade` swaps that step's keyframes for opacity alone. It keeps
the split, so lines or words still come in one after another on the usual
stagger — they just do not move — and it drops the mask clip up front, since a
clip that hides nothing still shears descenders for the length of the fade.
With `-split="none"` the whole element fades as one block. On the group root it
covers every step. Orthogonal to `-with`: one sets the keyframes, the other
sets when the step starts, so two cells can fade in together.

`data-text-anim-icon` is for the square beside an eyebrow and anything else in
a step that holds no text: kugiri cuts text nodes, so it is never a unit and
would otherwise appear whole while the text staggers. `data-text-anim-icon="x"` wipes it across from the left edge instead, the move
the tab progress bar makes; any other value scales both ways. It scales up from
`iconFrom` on its own timing — separate from the inline-image knobs, since
`imgFrom: 0` is that one's off switch and `iconFrom: 0` is a real scale — or
fades where the step fades. It does not rise — the lines rise out
of a mask, and an element cannot clip its own travel, so a rise would need a
wrapper to clip.

Neither `-fade` nor `-with` makes a step — they only modify one, so the
element still needs its role marker. Carrying just those, it is not a
candidate at all, and a group of nothing else is skipped whole; the console
names the elements when that happens.

Overlap pulls a step earlier and delay pushes it later; a step carrying both
resolves to one signed offset. The group's own number is a rate, so it scales
the gaps between steps as well as the steps themselves; the group delay and the
`-stagger` card offset are dead air in front of all that and stay as written.
Under a `-stagger` ancestor, card *i* starts at `i × stagger + its own delay`.

Base durations, eases and the optional blur live in the `TEXT` object above the
module. Eases are `cubic-bezier()` strings, not gsap names — WAAPI reads CSS
easing. `?blur=1` / `?blur=0` overrides the blur on a live URL, and
`?textdebug=1` logs what was split and what fired when.

Pieces are marked explicitly rather than guessed from the tag, because Webflow
text and link components are div-based and tag detection finds nothing on the
real markup.

**Why kugiri and not SplitText.** kugiri reads the lines the browser actually
painted, with `Range.getClientRects()`, instead of re-measuring words and
predicting where they break. Three things follow, all of which used to need
code here:

- **The mask is a clip, not an overflow.** Each unit is wrapped in
  `clip-path: inset(0)`, opened past the box by `TEXT.reach` (`0.3em`) so
  descenders, accents and Å are not shorn at rest. The old build padded every
  line and cancelled the padding with an equal negative margin; that is gone,
  along with `maskPad`, `maskPadTop` and the measuring around them. A split
  heading now measures **exactly** the same height as the unsplit one.
  A parked unit clears that window by the reach *and* `TEXT.parkCushion`
  (`0.3em`): the same ink the reach exists for hangs above the unit's own box, so
  clearing the window alone leaves an Å ring along the mask edge before the
  line has moved.
- **Block containers are split inside themselves.** Webflow marks a wrapper
  div with an `<h1>` embedded in it, and SplitText hoisted the lines out of
  that `<h1>` and never put them back, emptying the heading for good. kugiri
  cuts inside the block, so list numbers survive too and teardown is lossless.
  The `splitTarget` descent that worked around it is gone.
- **Only text is cut.** An inline image, an icon, a chip or an
  `[data-text-anim-ignore]` element rides along inside its line untouched, and
  a block-level one — a media tile, a button row, a table — is left where it is
  and is no unit at all. The heading images still scale up from `imgFrom` as
  their own line arrives, since the line mask already carries them.

**Triggering.** One `IntersectionObserver`, fired at `TEXT.start` (`-20%`, which
is the old `top 80%`). Its root reaches far above the viewport on purpose: an
observer reports threshold crossings, not positions, so a group that goes from
below the fold to above it in one move — an anchor link, a restored scroll, a
flick on a phone, a background tab that painted no frame in between — crosses
nothing and would stay invisible for good. Reaching upwards makes passing a
group a crossing too, and geometry says which of the two it was: still coming
plays, already past is put at rest.

**Fonts.** The split waits on `document.fonts.ready`, capped at `TEXT.fontWait`
seconds. A webfont that swaps after the split re-wraps text that has already
been cut, and the lines land on top of each other — the failure was Safari's to
show, since it swaps latest.

**Resize.** A split is a snapshot of one layout; kugiri watches for nothing.
A width change (height alone moves no wrap) reverts every split and cuts again
after `TEXT.resplit` seconds of quiet. Groups that already played come back at
rest rather than replaying under the reader.

Mount hides the marked elements; the intro queue splits them. At mount the
container is still the transition's fixed 100vh rectangle, and lines measured
against that wrap at a width the page never has. Teardown cancels the
animations and reverts every split, so a container is never cut on top of an
old cut.

Reduced motion skips the module outright: nothing is hidden, nothing is split,
the text is simply already there.

Without kugiri on the page every role degrades to one block rise, and the
console says so once. The scramble variant from the ManyChat build is **not**
ported: it needs a `[data-text-anim-scramble]{opacity:0!important}` rule in the
site head plus the scramble util. Ask if you want it.

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
| `data-parallax-start` / `-end` | the moving element | ScrollTrigger positions for the range, overriding `top bottom` / `bottom top`. A sticky group's pinned window is `start="top top" end="bottom bottom"`, which puts all the travel on screen instead of most of it before and after |
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

### designSticky — `.design_sticky_track`

The home page's version of the stack, driven by classes rather than
`[data-sticky-stack]`: two `.design_sticky_item` cards and the `section.work_wrap`
that climbs over them. Sticky is the section's own embed; this adds two things.

**The hold** — `margin-top` on whatever follows a card, `55vh`, retargetable with
`--sticky-hold`. Never `margin-bottom` on the card: a sticky box is constrained by
its containing block *inset by its own margins*, so a bottom margin shortens the
range it can stay stuck for, and the card releases just before the section has
finished covering it — a band of it left across the top of the screen.

**The scrim** — a `.sticky_scrim` in each card, fading to 60% black as `work_wrap`
climbs from the viewport bottom to the top. Driven by the covering section, since
a stuck card's own rect cannot describe the progress.

`work_wrap` also gets `position: relative; z-index: 1`. `position: sticky` always
creates a stacking context, so the cards paint in the positioned layer and a
static section below them in the DOM still renders underneath them.

### slider — `.c_slider_swiper`

The rail is full-bleed and the first card is aligned to the page container
by `slidesOffsetBefore`, measured against the container in the same section
and re-measured on resize. Two things follow from that:

- The same offset is applied as `slidesOffsetAfter`. Without it the track
  stops with the last card against the viewport rather than the page margin,
  so the card reads as cut off — and with loop and rewind both off there is
  nothing left to scroll.
- A `slidesPerView` of exactly **1** is raised to `width / (width - insets)`.
  Swiper divides the rail by the per-view number, and the rail is the whole
  viewport, so one-per-view produces a viewport-wide slide that the left
  offset then pushes off the right edge — the sliver of overflow on phones.
  Fractional values are left alone, since a peek is deliberate.

Cards need the `swiper-slide` class. The module adds it to the wrapper's
children when none of them carry it and logs that it did, but the class
belongs in the Designer.

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

The opening detail's own content rises and fades in as the height animates —
the same move `data-text-anim-solo` makes, but tied to the tab rather than to
the scroll. Do **not** put `data-text-anim-solo` on text inside a detail:
textAnim fires once when the section passes the trigger, so a closed tab
animates text nobody can see and is already at rest when it opens, and a tab
whose group never fires opens onto text still holding its hidden start
state. Knobs: `textShift`, `textDuration`, `textDelay` in the `TABS` object.

In the stacked mobile shape there is no tab to open, so each pair reveals
itself on the way past instead: a 24px rise and fade, once, at `top 85%`.
Same feel as `data-text-anim-solo`, but owned by the module so it exists
only where the stack does — desktop keeps the tab-open reveal and never sees
a hidden start state. Knobs: `stackShift`, `stackDuration`, `stackEase`,
`stackStart`.

The triggers are built from the intro queue on first load, since one measured
while the container is still the transition's fixed rectangle fires at the
wrong scroll position, and directly when the breakpoint is crossed later.
Crossing back to desktop kills them and clears the start state.

**Below 992px the section is a plain stack.** Tabs are a desktop
affordance: on a phone the module moves each visual in beside its own text,
opens every detail, hides the progress bars and leaves autoplay off, so the
content reads as image, text, image, text. The wrapper gets `is-stacked`,
and `page-transition.css` undoes the desktop presentation — a visual column
is usually a pile of absolutely positioned panels, which means nothing once
they are in the flow.

The wrapper is switched to a single column and the emptied visual column is
hidden — otherwise the stack sits in half the width with a blank space
beside it. That column is only hidden when it holds nothing else: a column
that also contains the text items is the wrapper itself, and hiding that
would take the section with it.

Crossing the breakpoint rebuilds the other shape in place, so a rotated
phone is not left with a stack of dead tabs. Each visual leaves a comment
node behind when it moves, and that is what it is put back against: sibling
references do not survive the move, since the next visual has been
relocated too by the time the first one is restored.

Under `prefers-reduced-motion` the tabs still switch, instantly, and autoplay
is off. Teardown kills the progress tween, the switch timeline, the
ScrollTrigger and both listeners, so a group never survives its container.

Opening a tab changes the document height, so the module calls the same
guarded `refreshScrollHeight()` the footer uses once the switch lands.

### faq — `.faq_item_wrap` / `[data-faq-item]`

Accordion. Clicking a question animates its answer from height `0` to `auto`,
rises and fades the answer text in, and rotates the plus icon 45° into a
cross. One answer open at a time by default.

The panel's own padding is animated with the height, and the open height is
measured as a number with that padding in place rather than left to `auto`:
gsap measures an `auto` target while the inline padding is still zero, and
under `border-box` the growing padding then eats into the height as the panel
opens — the content box shrinks and the last line only appears when `auto`
lands at the end, arriving as a pop rather than a reveal. `height: 0` empties the
content box and nothing else, so a panel with padding stayed as tall as that
padding while closed. The authored values are read at mount and cleared again
once the panel is open, so an open answer keeps the Designer's units rather
than the pixels they measured to at mount.

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

**Below 992px it is a pinned crossfade instead.** There is no pointer to
follow, so the rows are lifted into a `.services_stack_viewport` that sticks
to the top of the screen, layered on top of each other, and the list itself
is given the scroll height — one screen per row by default. A scrubbed
Crossing a step boundary **triggers** the dissolve into the next row at its
own pace; it is not scrubbed. Tying the fade to the wheel means a trackpad
flick blinks the rows past half-drawn. Nothing moves, only opacity, and the
container padding is dropped so the rows run edge to edge.

One boundary per gap, positioned a screen apart as a function so a refresh
recomputes it — a phone's viewport changes height when its address bar does.
Scrolling back fires `onLeaveBack`, not `onEnterBack`: the trigger element is
the whole track, so the boundary is crossed by leaving through its start
rather than re-entering from beyond its end.

The section heading rides over the stack rather than standing above it:
`.services_contain` is made sticky — not `.services_heading_wrap`, whose
parent is no taller than the heading itself, and a sticky child only holds
while its own parent is passing. The container's parent is the section, so
the heading arrives with the first row and lets go with the last. It sits
above the viewport in paint order and is pointer-transparent, and takes
`--services-stack-heading-color`, white by default, since it reads against
the rows rather than the section.

The module measures the container into `--services-stack-heading`, and the
CSS spends that number twice: as a negative `margin-bottom`, so the heading
holds no room in the flow and the stack begins at the top of the section —
otherwise the heading is a block of its own above the first image, sliding
down onto it — and as the rows' top padding, so their text centres in the
screen left under it, plus `--services-stack-edge` (1.5rem) off the bottom.
That edge is one number at both ends: it is the container's top padding, so
the measurement carries it, and the rows take the same off the bottom — the
heading sits as far from the top of the screen as the last line sits from
the bottom. Re-measured through a `ResizeObserver`, because the heading is
two lines on one phone and four on the next. Under 480px the
heading drops any width cap and takes the screen.

The type lists are rich text, which gives its paragraphs typography of their
own — the line height of the style on `.services_hover_item_text` never
reached them, so the rows read tighter on the page than in the Designer.
`line-height: inherit` on the children hands it back. Tablet and down they
stack on `--services-types-gap` (8px) and their paragraph margins are
dropped, so one number sets the spacing; on desktop the margins are the
Designer's.

A viewport element is created rather than making each row sticky in flow:
sticky rows stack, with the next sliding up over the last, and this is meant
to be a dissolve with nothing in motion. Every row paints an opaque
background (`--services-stack-bg`) so the one underneath cannot show through
the one fading in over it.

Knobs in `SERVICES_STACK`: `screens` (scroll between one row and the next),
`hold` (screens the last row keeps the screen to itself before the pin
releases), `duration` and `ease`. The track is sized from those — a step per
gap, then the hold, then the screen the viewport itself occupies — because a
sticky child holds only while its container is passing. Without the hold the
final dissolve lands exactly as the section lets go, so the last row is never
seen still.

The shape is chosen on **width alone**, not on hover capability. The CSS half
of the stack is a `max-width: 991px` block, so keying the script on
`hover: none` meant a touchscreen laptop — or a device-emulation window at
desktop width — built the stack while the CSS left the rows in flow: a screen
of white per row and a very long scroll. A wide touch device now gets the
hover build and simply never fires a hover, which is inert rather than broken.

The row icon grows out of its own middle on hover — the move the preview
images make, not the sideways open the link icons use. It keeps its square
whether or not it is showing, so the text beside it holds still: a transform
never reflows. `--services-icon-size` (1.25rem) sets the box; in the stacked
view the icon is always at full size, since there is no pointer to earn it.

The preview itself is square, `--services-follower-ratio` (1 / 1).

The section swaps shape when the viewport crosses the breakpoint: the build
in place is torn down and the other one made, so dragging a window past 992
never leaves a follower with nothing to follow or a stack nobody can
scrub. A rebuild creates its triggers immediately rather than through the
intro queue — that queue has already been played and dropped for this
container, so a callback added then would never run.

The triggers are built from the intro queue, and teardown puts the rows back
in the list and removes the viewport.


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

Finsweet-managed inputs are cleared **silently**. It binds a listener to
each input and updates the field from that input's own state, so a change
event for a box the module cleared is a second update in the same tick as
the visitor's — and the pair resolves to an empty condition, which filters
the list to nothing. Finsweet only needs the box that was actually clicked,
and it hears that one itself. An input counts as managed if it carries
`fs-list-field` or `fs-list-value`, or sits inside
`[fs-list-element="filters"]`; everything else still gets `input` and
`change`, since a Webflow form or a custom handler has no other way to know.

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

Attributes scans the DOM once, on load, so a page reached by navigating had
filters that did nothing — the markup was right and nothing was listening.
The `finsweet` module restarts the list solution for any container that
carries `[fs-list-element="list"]`, which covers every filtered page without
naming them.

Only on a swap: on the first load the solution is still fetching when modules
mount, so `restart` is not there yet and Attributes is about to initialise
itself anyway. Calling it then would either throw or re-run an init that had
not finished.

Keep the Attributes `<script>` in the Webflow footer embed, once, site-wide,
outside the swapped container. The v2 API is `window.FinsweetAttributes` —
`push([key, cb])` to run code once a solution has loaded, `modules.<key>` for
its controls (`restart`, `destroy`, `loading`), and `load(key)` to pull one in
on demand.

Paging controls are excluded from barba. Finsweet pages a list by clicking
Webflow's own pagination anchor (`?…_page=2`) and reading the response —
those are real same-origin links, so barba took them as navigations: pressing
Load more ran a page transition and landed on page two. `prevent` now returns
true for anything inside `.w-pagination-wrapper` or marked
`fs-list-element="load-more" | "pagination-next" | "pagination-previous" |
"page-button"`. Scoped to the controls, not to `[fs-list-element]` at large —
the list itself carries that attribute and the cards inside it are ordinary
links that should still transition.

The load mode itself is Finsweet's: `fs-list-load="more"` on the list or its
wrapper (`more`, `infinite`, `pagination`, `all`), with `fs-list-loadcount`
for how many arrive per click.


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

### textSwap — `[data-swap]`

One statement at a time in the same spot: the one showing leaves upward, the
next arrives from below, on a timer that starts when the section comes into
view. A statement that changed twice before anybody scrolled to it has said
nothing.

| Attribute | Where | Meaning |
| --- | --- | --- |
| `data-swap` | the wrapper | Marks the group |
| `data-swap-item` | each item | Optional. Without it the wrapper's element children are used |
| `data-swap-hold="4000"` | the wrapper | ms each statement holds, default 3500 |
| `data-swap-loop="false"` | the wrapper | Stop on the last one instead of cycling |

The items are laid over each other rather than positioned absolutely:
absolute children would collapse the wrapper and the section would lose its
height, while stacked in the grid the tallest statement still sets the box
and nothing jumps as they take turns.

They stack **where the first one already sits**, not in cell 1/1 — that cell
is a single track, so a statement styled to span half the grid came out a
column wide. The placement is read off the first item and written inline,
because Webflow writes placement against the node id on each child
(`#w-node-…`) and an id outranks any class rule this file could add.
`data-swap-area` on the wrapper overrides the lot, e.g. `1 / 1 / 2 / 7`.

An item the Designer hid — `display: none` on the second one is how these
usually arrive — is put back into the flow at mount, since it can never take
its turn otherwise. Teardown restores it, along with the transforms.

Timing lives in the `SWAP` object. Under `prefers-reduced-motion` the
statements change without moving.

### homeHero

`.home_wrap` only. The heading is untouched by this module by design — put
`data-text-anim` / `data-text-anim-heading` on it if you want the line rise.
The images fade/scale in, bump toward the pointer, and parallax *against*
the scroll direction (negative `y`).
The grid overlaps its own cells at some widths, so the stacking is pinned in
`page-transition.css`: `.home_img_wrap` takes an explicit `z-index: 0` and the
`h1` a `2`. The cells need the 0 — the parallax transform makes each one a
stacking context, and a transformed cell later in the grid outpaints an
untransformed heading by itself. The heading is `pointer-events: none` (links
inside it excepted) so that, on top, its box does not eat the hover the image
bump binds to.

Tuning lives in the `HERO` object at the top of the module. The two
transforms sit on different elements on purpose: parallax drives
`.home_img_wrap`, the pointer bump drives the `img` inside it.

**Entrance order.** The entrance keyframes stay in the embed — a cell may carry
several, on their own durations, and the module waits for the last of them
before it takes the transform back for the bump. The six delays are overridden
in `page-transition.css`. Spacing is uniform, order is
not — DOM cell 1→2, 2→4, 3→0, 4→3, 5→1, video→5 — so the grid reads as
arriving rather than as counting off. Two variables on `.home_wrap` tune it:

| Variable | Default | Meaning |
| --- | --- | --- |
| `--hero-in-lead` | `0.15s` | before the first cell moves |
| `--hero-in-step` | `0.1s` | between one cell and the next |
| `--hero-in-video-slot` | `5` | the video's place in the order, 0-5 |

`heroVideo` reads those three for its own delay instead of holding a second
copy of the arithmetic — `HERO_VIDEO.delay` is now only the fallback for a
page where the stylesheet has not loaded.

The video goes last on purpose. Its entrance is a tween off the intro queue,
which runs once the bundle has landed, so its delay is measured from a later
zero than the images' keyframes — by however long the boot took. That drift
only pushes it later, so from any slot but the last it eventually lands on
the beat of whatever follows it. From the last slot there is nothing to
collide with. Give it a middle slot and you need the drift closed instead:
seek the entrance to the elapsed `currentTime` of any image's running
animation, which is the same clock all six keyframes started on.

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

### Named easing — qubic

One curve at two speeds, at the top of `page-transition.js` beside the other
eases. `QUBIC_CURVE` holds the control points once; `QUBIC.css` is the
`cubic-bezier()` string the Web Animations API and any stylesheet take, and
`QUBIC.ease` / `E.qubic` is the same curve registered with `CustomEase` for
gsap — the two engines cannot share one value, so they are cut from one.

| Preset | Duration | Used by |
| --- | --- | --- |
| **qubicL** | `QUBIC.l` — 0.8s | the statements over the pinned video, in and out |
| **qubicXL** | `QUBIC.xl` — 1.2s | nothing yet; ask for it by name |
| **inoutMask** | `INOUT_MASK.duration` — 1.5s | the mask wipe over pictures, `cubic-bezier(0.77, 0, 0.175, 1)` |

`textAnim` runs the qubic curve at its own 0.4s, since a line rising inside a
mask is a shorter move than a whole statement crossing the screen.

The stylesheet holds the same set as CSS variables — `--ease-inout-mask` and
`--ease-qubic` on `:root` — so a keyframe gets the same gesture as a gsap tween.
The home hero's entrance is **not** one of them: curve and duration both stay in
the section embed, which writes them in an `animation` shorthand, and nothing
here overrides it. The corporate hero borrows `--ease-qubic` to match it.

### maskReveal — `[data-mask]`

A wipe down the picture as it arrives. Put `data-mask` on an image, a video, or
the wrapper around one: whatever is marked is clipped to nothing at the top
edge, opening to the full box on **inoutMask** — inOutQuart, 1.5s — when its
trigger crosses `top 85%`.

Marking the wrapper is usually the one to reach for, and it is the only one
that works where a cell holds a video, its poster and an overlay at once — one
clip covers all three, where marking the `video` leaves the poster unwiped.

| Attribute | On | Meaning |
| --- | --- | --- |
| `data-mask` | the image, video, or its wrapper | Marks it. A value sets the edge the wipe starts at: `top` (default), `bottom`, `left`, `right` |
| `data-mask-group` | a wrapper | Everything marked inside plays as one run off the wrapper's trigger, staggered |
| `data-mask-stagger` | the group | Seconds between them, default `0.12` |
| `data-mask-start` | the group | ScrollTrigger start, default `top 85%` |
| `data-mask-delay` | one element | Extra seconds on top of its place in the run |
| `data-mask-scale` | one element | Overscale settling as the clip lands, default `1` — off. Set it per element (`1.06` is a gentle one), and leave it off wherever the picture already carries a parallax or hover transform, which is the same property |

Ungrouped, each marked element is its own trigger.

**`[data-grow]`** is the same wipe opening sideways from the middle, and
starting part-open rather than shut: the clip runs from 80% of the width out to
both edges. **inoutMask at 1.2s.** A value sets where it starts —
`data-grow="0.6"` — and `[data-grow-group]`, `data-grow-stagger`,
`data-grow-start` and `data-grow-delay` are the group and timing knobs, read the
same way the mask's are.

It is a clip, not a `scaleX`. Scaling a picture to 0.8 on one axis squashes it —
every face in it narrows for the length of the move and springs back — where a
clip only ever shows less of a picture that is already the right shape.

Both attributes write the same `clip-path`, so an element marked with both takes
the wipe and ignores the grow. `data-mask-scale` is the one thing that stacks
with either, being a transform on the picture rather than a clip.

**The clip goes on the marked element; the overscale, where asked for, does
not.** Scaling a wrapper scales the whole cell, padding and captions with it,
so the scale is handed to the first `img` or `video` inside — and to the marked
element only when that is the picture. Nothing to scale, no scale.

**clip-path rather than a wrapper with `overflow` and a moving child.** The pictures already sit in wrappers other modules own — the cards, the
parallax groups — and a second layer inside them is another thing to keep in
step with a layout that changes per breakpoint. A clip touches nothing else.

**The clip is written from a number every frame**, not tweened as a string.
gsap interpolates two clip-paths only when they read as the same shape token
for token, and a border radius breaks that: the browser reports four insets
back as three whenever two of them agree, so `inset(0% 0% 100% round 24px)` and
the four-value end state are different shapes to it — the clip holds still and
snaps at the end. Driving a proxy 0→1 sidesteps the comparison, and it is what
lets the radius ride along at all. Without the `round`, corners square off for
the length of the wipe.

The clip is written at mount, before the first paint and before anything is
measured: the trigger is a frame away at best, and an unclipped first paint is
the whole picture flashing in ahead of its own reveal.

Fixture: `node dev-server.js`, then
`http://localhost:5173/_fixture-mask-reveal.html`.

### Sequence — `[data-slot]`

A composed item is several things arriving one after another — its rule, then
the link, then the heading, then the body. The shape of that lives in one place,
the `SEQUENCE` object at the top of `page-transition.js`:

```js
const SEQUENCE = {
  lead: 0.4,   // after the trigger before the first part moves
  step: 0.05,  // between one part and the next
  item: 0.6,   // between one item of a [data-seq] list and the next
  slots: { rule: 0, text: 1, link: 1, heading: 2, body: 3 }
};
```

**`[data-seq]` on a list** makes it one cascade instead of a row of separate
reveals. Each child is a further `item` along, so the parts interleave — rule,
text, rule, text — rather than every rule going at once and every text after
them:

```
rule 0   0.40    text 0   0.45
rule 1   1.00    text 1   1.05
rule 2   1.60    text 2   1.65
```

`step` is a hair rather than a beat: the text goes **with** its line, not after
it, so an item reads as one gesture and the list marches through the pairs.

The list is also what triggers. A per-item trigger would put the fifth item's
offset after the moment it came into view — five items' worth of waiting for a
reveal already on screen.

`text` and the three names under it share the same ground: a component whose
text is one marked wrapper — the tailored list items carry their heading and
paragraph as a single solo step — has one part, `text`, whatever it holds. The
finer names are for items that mark their parts separately.

The markup only says which part a thing is — `data-slot="heading"` — and its cue
is `lead + slot * step`. Reorder by renumbering the table, retime the whole
cadence by moving `step`, and add a name for a part that does not have one. A
bare number works too (`data-slot="4"`) for a one-off.

A slot places a step **absolutely** within its group rather than chaining it
onto whatever ran before, which is the point of naming places rather than gaps:
`data-text-anim-delay` still wins where it is written, and an unslotted group
behaves exactly as it did.

Read by `textAnim` — on the group root it sets the group delay, on a step it
sets that step's cue — and by `ruleReveal`.

### data-scale — hover lean

`data-scale` on a picture, or on the wrapper around one, and it leans to 1.03
under the pointer — the slow duration is what sells it, not the distance.
`data-scale="1.06"` for a different number. Pure CSS in
`page-transition.css`, no module.

Nothing it adds can take a click: no overlay, no pseudo-element, no
`pointer-events`. A transform moves pixels, not hit-testing, so a link under the
picture keeps every click it had — the fixture has one marked `<a>` to prove it.

Whatever is scaled is clipped by its wrapper (`overflow: clip`, never `hidden` —
a hidden overflow makes the element a scrollport, which is what broke the sticky
sections). No `will-change` either: a permanent compositing layer on every
marked picture is what put the slider's art over its own colour panel in Safari,
and a hover is not worth paying that on load.

`attr()` is read on the element that carries the attribute and inherited down,
because `attr()` only ever sees the element it runs on — a number written on a
wrapper is invisible to a rule targeting the image inside it. Below Chrome 133
every marked picture takes the 1.03 fallback.

Knobs: `--scale-ms` (500ms) and the value itself. Off entirely under
`prefers-reduced-motion`, since the lean is the whole effect.

### data-fade — the picture arrives out of nothing

`data-fade` on a picture or its wrapper: opacity 0 to 1, **power2.out at
0.5s**, fired as the picture begins to enter — `top bottom`.
`data-fade="0.6"` gives one its own duration, `data-fade-start` its own line.

Triggered, not scrubbed to how far the picture has travelled. Scrubbing looks
right on paper and is wrong in the hand: tied to travel, a slow scroll leaves
the picture parked half-lit for as long as you hold there. Triggered, a crawl
reads the way the reference does — the two pixels of picture on screen have
already faded, because the fade ran while there was nothing to see — and a fast
scroll brings the whole frame in mid-fade.

Opacity and nothing else, so it stacks with anything writing a transform —
`data-scale` being the one it will usually meet. It rides the same trigger,
group and stagger plumbing as the other reveals, and hands the property back
(`clearProps`) once it lands so a hover is never fighting a number this module
left behind.

## Trash list

Kept for now, likely to be removed — nothing on the site uses them:

- **`maskReveal` / `[data-mask]`** and its `[data-grow]` variant — the clip wipe
  over pictures, with `_fixture-mask-reveal.html`.
- **`ruleReveal` / `[data-rule]`** — the border drawn left to right.

`SEQUENCE`, `data-fade` and `data-scale` stay whatever happens to those two;
`ruleReveal` is the only thing that reads the `rule` slot.

### testimonialColours — `[data-bg]`

The hex lives on `.c_testimonial_content_wrap` as `data-bg`, `data-text` and
`data-text-secondary`, and becomes `--section-bg`, `--section-text` and
`--section-text-secondary`.

Two paths to the same variables. `page-transition.css` reads the attribute
directly — `attr(data-bg type(<color>))`, Chrome 133+ — so the colour is there
at first paint with no script in the way. `testimonialColours` in the JS writes
the same variables inline for browsers without typed `attr()`. Inline wins, so
the two never disagree; where both work the CSS has already done it.

8-digit hex carries its alpha: `#F7F7F560` resolves to `rgba(247, 247, 245,
0.376)`. An attribute that is missing or empty leaves the Designer's own value
alone. One the CMS got wrong falls back to `transparent` — deliberately loud,
since a section with no colour is a thing you notice, where something
almost-right is not.

**Seeing it in the Designer.** Custom code in the page head does not render on
the canvas, so neither path applies there and the component shows whatever
colour its class carries. An **HTML Embed element does** render live on the
canvas, so a copy of the three rules in an embed inside the component makes the
real colours show while designing:

```html
<style>
.c_testimonial_content_wrap[data-bg]:not([data-bg=""]) { --section-bg: attr(data-bg type(<color>), transparent); }
.c_testimonial_content_wrap[data-text]:not([data-text=""]) { --section-text: attr(data-text type(<color>), currentColor); }
.c_testimonial_content_wrap[data-text-secondary]:not([data-text-secondary=""]) { --section-text-secondary: attr(data-text-secondary type(<color>), currentColor); }
</style>
```

### ruleReveal — `[data-rule]`

The element's own border, drawn on left to right as it comes into view.
**qubic at 1s** — a 1px box scaled from a left origin — cued at the `rule` slot — 0.4s after the trigger. A
`data-slot` on the element itself overrides that, so one rule can run out of
turn.

| Attribute | On | Meaning |
| --- | --- | --- |
| `data-rule` | the element carrying the border | Marks it. `data-rule="bottom"` takes the bottom border instead of the top |
| `data-rule-start` | the same element | ScrollTrigger start, default `top 85%` |

A border cannot be animated across: `border-width` is layout, and growing one
from nothing shifts everything under it by a pixel a frame. So the border stays
where the Designer put it and only its colour goes transparent — the box keeps
its height — while a pseudo of the same weight and colour is drawn over it and
scaled from the left edge. Weight and colour are read off the element at mount,
so whatever the component wears at that breakpoint is what gets drawn.

The pseudo is gated on the `.is-rule` class the module adds. A page the script
never reaches — no ScrollTrigger, reduced motion, a throw above it — keeps its
real border rather than losing the line.

### heroVideo

The last cell of the hero grid is a video. It leaves the grid, travels to the
middle of the screen at full bleed, holds through a pinned screen while the
statements play over it, then scrolls away with the stage.

The growth is **triggered, not scrubbed**. `growAfter` pixels of scroll out of
the hero and the scale runs on its own clock, finishing whether the scroll
continues, stops, or races past — a scrubbed one is only ever as committed as
the hand on the wheel. Where it travels *to* is still scroll-bound: the scroll
term keeps it moving with the hero until it has fully arrived.

The threshold is latched: it fires at `growAfter` and only releases back at the
very top of the range, so a scroll parked on the threshold cannot flip it back
and forth. The tween runs on the ticker rather than on the trigger's updates,
so a scroll that leaves the trigger's range mid-growth doesn't strand it — and
the pin no longer snaps `p` to 1 on entry, which was the jump from half-grown
to full bleed in one frame. It finishes inside the pin's hold instead.

| Key in `HERO_VIDEO` | Default | Meaning |
| --- | --- | --- |
| `growAfter` | `120` | px of scroll out of the hero before the growth fires |
| `growDuration` | `1` | seconds to full bleed, its own clock |
| `growEase` | `power2.inOut` | |
| `takeover` | `true` | carry the page to the pin on the scroll that fires the growth |
| `takeoverDuration` | `1` | seconds of that throw |
| `pin` | `1.5` | screens of pin once it is full bleed |
| `bleed` | `2` | px past the viewport on every side |

**One shape the whole way.** The frame keeps the video's own ratio — the cell is
stamped with the component's declared `aspect-ratio` at measure time, 16/9 by
default — and only ever gets bigger. The small state in the grid is the whole
frame, every state after it is that frame closer, and a single scale in both
directions cannot stretch anything.

The end state covers rather than fits: large enough that neither side of the
screen is uncovered, so on a phone the frame runs well past the edges and the
screen does the cropping. Same picture `object-fit: cover` would have drawn,
reached without deforming anything on the way.

It used to end as the viewport exactly, X and Y scaled apart — a frame that
changed shape as it travelled, and a video squashed along with it. `object-fit`
cannot save that: it resolves against the laid-out box, and the transform
squashes its result afterwards. A desktop cell is shaped near enough to the
screen to hide it; a phone is not, which is where it showed.

The statements move into the component for the pin so they sit over the video,
and their box is reproduced on all four edges from where it sat in the stage —
measured against the frame's *resting* box, since a fast scroll can reach the
pin with the growth still running and a rect read mid-flight is a scaled one.
The stylesheet's `left: 0; right: 0` spans the frame, which since the frame
stopped being the viewport would stretch them off both edges of a phone.

A scrim rides in with the pin so the statements stay readable over a bright
frame: a pseudo on `.home_video_contain`, black at the foot fading out
`--hero-video-scrim-rise` (26rem) above it on a five-stop ease curve — a
straight ramp over that height reads as a grey band with a visible top edge. It hangs off the text rather than
the frame — the frame is scaled to cover and its bottom edge is below the
screen, so a gradient anchored there would arrive half spent — and it exists
only while the statements are inside the component, which is exactly the pin.
`--hero-video-scrim` (0.55) is its strength, `--hero-video-scrim-ms` (900ms) and
`--hero-video-scrim-delay` (120ms) its fade — held off the first beat so it does
not compete with the statement's own entrance.

The first statement enters through a `fromTo`, not a `to`. Whoever sends
`swap:to` owns the entrance, and a `to` from wherever the statement happens to
be has nowhere to travel if it is already showing — which is how the first one
appeared without the rise every one after it gets. A swap inside
`.home_video_wrap` also counts as `data-swap-wait` whether or not the attribute
survived the Designer, since `heroVideo` drives it either way.

**Keeping it out of everything else's way.** While it travels the component is
`position: fixed` on the body, so it is outside `.page_wrap`'s stacking context
and outside the container Barba swaps — nothing that covers the page covers it,
and nothing that replaces the page replaces it. That is the video over an open
meganav, and the video hanging above both pages through a transition. Both are
hidden in CSS (`html.is-menu-open`, and `is-page-leaving` which `beforeLeave`
stamps on anything already travelling), with `!important`, since the opacity to
beat is the entrance tween's inline one.

Hiding does not cover the other half of it. Scrolled past the pin the component
is *settled* — in flow, part of what the outgoing page still shows — so it is
never marked, and a swap collapses the document under its triggers: the footer
margin goes, both containers become fixed layers, and the scroll they measure
against is somewhere else entirely. Live, they read that as the user racing
back up the page and play the travel in reverse over the transition. So
`beforeLeave` also dispatches `page:leaving` (before `FooterReveal.collapse()`,
which is the change they would react to) and the module freezes: triggers
disabled, tweens killed, `apply()` inert. Whatever it was showing when the
navigation started is what it shows until it is taken away.

Not `html.is-transitioning` for the swap case: that class is still on through
the incoming page's `afterEnter`, which is exactly when an incoming home page's
own video is entering. `beforeLeave` runs before any new module has lifted a
component, so marking there catches only the outgoing one. `after` unmarks, for
a navigation that never completes.

**The takeover.** A flick of the wheel is a screen and the growth is a second,
so it was possible to reach the pin having seen none of it. The scroll that
fires the growth now carries the page the rest of the way to the pin start,
locked while it goes — `lenis.scrollTo(..., { lock: true })`, or a frame-by-frame
`window.scrollTo` where Lenis is absent. Carried rather than merely blocked: a
page that stops answering reads as broken. It re-arms only once the growth has
been released back at the top of the range, so hero → down → up → down gets the
same throw each time, and `prefers-reduced-motion` never gets it at all — taking
someone's scroll away is the thing that setting asks you not to do.

Lenis does not smooth touch by default here, so on a phone the lock is weaker
than the wheel's; the longer pin is what holds the ground there.

The component is taken out of flow and fixed for the travel — a transform
inside the grid would be clipped by the section and would be fighting the
hero's parallax for the same matrix. The cell it leaves keeps its aspect ratio
so the grid holds its shape around the hole.

`page-transition.css` holds the component at `opacity: 0` from first paint
(`hero-video-hold`), because the module's own pre-hide is JS and the gap before
the bundle lands was a flash of video in the grid. The hold has no fill, so a
page that never gets the script shows the video rather than an empty cell; the
module drops the animation at mount, since a running animation would outrank
the tween's inline opacity.

### smooothy — `.work_smoothly_wrap`

Autoplay for the smooothy sliders. Opt-in per slider, because most of them
are things you read rather than watch.

| Attribute | Effect |
| --- | --- |
| `data-autoplay` | step a slide every 4000ms |
| `data-autoplay="6000"` | ms between steps |
| `data-autoplay="drift"` | continuous marquee-style motion |
| `data-autoplay-speed="0.2"` | drift only, slides per second (default `0.15`) |
| `data-autoplay="false"` | off, same as leaving the attribute out |

Two modes because they read differently. Stepping lands on a slide and
holds, which suits a slider somebody is meant to look through; drift never
settles, which suits a band of logos or images that is really just texture.

Paused while the pointer is over it, while it is being dragged, while it is
off screen, while the tab is in the background, and through a page
transition — anything that would otherwise advance past a reader or animate
where nobody is. The clock is reset rather than paused, so returning from a
background tab neither jumps a slide nor pays out the whole pause at once.

Driven off the module's own rAF rather than a timer: a `setInterval` keeps
firing in a background tab and queues up a fistful of steps to play the
moment somebody comes back.

Reduced motion takes the autoplay and leaves the slider — it can still be
dragged.

### ctaReveal — `.cta_wrap`

The section arrives white. It sticks, the yellow washes up under it, and
the images rise out of the fold up their own columns at their own rates,
past the text and off the top. It is still stuck when the last one leaves;
only then does it let go.

Its own module rather than `[data-parallax]` because the shape is
different. Parallax is symmetric — displaced one way at the start, the
other at the end, at rest at the midpoint — which is a drift, not an
arrival. Here every image travels one way, from below the fold to above the
frame. The `data-parallax` strengths already on the markup are reused as
the rates, so the Designer stays where they are tuned; the attributes are
taken off the elements while this module owns them, since two owners of one
transform fight and drift, and restored on teardown.

Everything is scrubbed against the sticky window (`top top` → `bottom
bottom`), so nothing happens before it is watchable or after it is gone.

Knobs in the `CTA` object:

| Key | Meaning |
| --- | --- |
| `scroll` | screens of scrolled height for the section, sticky screen included — the pin lasts this minus one. Written to the section from JS so the number lives with the motion |
| `tint` / `tintStart` | fractions of the pin for the neon wash. It starts a beat after the lock because a scrub eases toward its target, so at `0` the colour was already moving while the section was still arriving |
| `fit` | fraction of the pin where the last image is made to finish. The whole schedule is scaled to land on it, so the dead tail is a decision rather than five delays adding up short |
| `travel` | fraction of the pin by which everything must have cleared the screen |
| `lead` / `exit` | screens below the fold every image starts, and past the top every image finishes. The journey is the same for all of them; only rate and start time differ |
| `lanes` | fractions of the pin each lane takes to cross — slow, middle, fast. The numbers on the markup pick a lane; the sorting follows the length of this list, so a fourth number is a fourth lane |
| `stagger` | default spread through the pin by DOM order, overridden per image by `data-cta-delay` |
| `spread` | one multiplier over every delay: tightens or loosens the whole sequence while keeping the arrangement. Tune this before touching individual numbers |
| `images` | the arrangement, keyed by the `is-1`…`is-5` combo class. `delay` is a fraction of the pin, `lane` an index into `lanes` |
| `scrub` | ScrollTrigger scrub, in seconds |

Three lanes rather than one rate per image: the eye cannot tell 3 from 3.5
and does not try, while clearly separated speeds read as depth. The middle
lane exists because an image can be wrong in both directions, and rounding
it to one of two lanes is how a five-image drift collapses back into
columns moving in lockstep.

A late image cannot also be slow — everything has to clear by `travel` — so
the slow lane belongs to images that set off early. Lateness is bought with
speed.

Per-element overrides: `data-cta-delay` on an image, or its own
`data-parallax` number, beat the `images` table.

### share — `[data-share]`

A share menu: LinkedIn, copy link, and the OS sheet where there is one.

| Attribute | Role |
| --- | --- |
| `data-share` | the wrapper |
| `data-share-url` | optional, defaults to the page url |
| `data-share-open` | the trigger |
| `data-share-menu` | the panel, hidden until opened |
| `data-share-close` | closes it |
| `data-share-copied` | "Link copied", shown for a moment |
| `data-share-action="linkedin"` | opens LinkedIn's share dialog |
| `data-share-action="copy"` | copies the url |
| `data-share-action="native"` | the OS share sheet, phones mostly |

A native action with no OS support hides itself rather than sitting there
doing nothing when tapped.

Closes on the close button, on Escape, and on a click outside. Focus moves
into the panel on open and back to the trigger on close, so it can be
operated without a pointer — except after a copy, where the menu closes and
the confirmation is what is left on screen: the trigger is faded out under
it, and a focus ring on something invisible is worse than none.

Knobs in `SHARE`: `copiedFor` (ms the confirmation holds, default 3000) and
`window` (the popup features string).

At 991px and down the menu lays out as a wrapping row rather than a
column — a stacked panel is tall over a short trigger, and a phone has the
width to spare. Gap from `--share-menu-gap`, default `1rem`. The
confirmation gets the same row, so "Lenke kopiert" reads where the actions
were rather than a line under them. It carries `white-space: nowrap` at
every width, desktop included — the swapped confirmation sits in the
trigger's grid cell, and a second line would grow it.

Under 768px the menu and the confirmation are taken out of flow, so a
wrapper is only as tall as its trigger — a hidden panel still reserves its
full height otherwise, which on a phone is a menu-sized hole in the page.
Out of flow they also shrink to their content, so a menu that was full
width in flow needs a width of its own there.

### videoPoster — `[data-video="component"]`

Holds the poster over a base-lib video until the first frame is actually
painted.

base-lib drops the poster the moment it decides to play, which is before
any frame exists. Webflow ships `<source>` carrying both `data-src` and
`src`, so base-lib's `lazyLoadVideo` takes its early-out and resolves
without loading anything, and `preload="none"` means not a byte has been
fetched. The poster leaves, the video box is still empty, and the section
background shows through as a grey frame — intermittently, since it is a
race the cache sometimes wins.

So the poster is faded on the first painted frame instead:
`requestVideoFrameCallback`, or the `playing` event plus a rAF where that
is missing. Nothing else is taken over — base-lib keeps its lazy load, its
scroll-in play and its pause. If the video never arrives (an expired or 404
url) no frame is painted, nothing fades, and the poster stays, which is the
correct fallback.

Registered ahead of `baseLib`, so the poster is under this module's control
before video-min touches it.

## Article grids — case and insight templates

CSS only, no attributes. Below 992px the stacked grids take one row gap, so
the article templates keep the same rhythm on a phone:

| Knob | Default | What it sets |
| --- | --- | --- |
| `--section-row-gap-mobile` | `4rem` | Row gap of `.c_cases_row_grid`, `.c_collection_list`, `.post_contact_grid` |
| `--insight-share-gap-mobile` | `2rem` | Row gap of `.insight_main_grid` — the share block to the article, closer kin than the cards are to each other. The share wrapper's Designer margin is dropped with it, or the two stack |

| Attribute | Where | Meaning |
| --- | --- | --- |
| `data-space-keep` | a section, a container, or one element | Nothing in it is touched — the Designer's spacing stands at every width |

Section spacing is deliberately not touched. The Designer's spacer variants
carry fluid section sizes that already scale with the viewport, and
collapsing them below 992px fought those values rather than the rhythm —
`.g_section_space` is left alone at every width. If a template needs
different section spacing on a phone, it belongs in the Designer, on the
spacer variant.

One more thing the insight template needs below 992px: it carries two
share blocks, the one in the grid above the article and `.is-mobiie` below
it: they take turns at 992px rather than both showing on a phone.

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
| `.meganav_feature_wrap` | the left column. Full height above 992px, so its CTA sits on the floor of the panel rather than under its own sentence — `--meganav-cta-align` (default `start`) sets whether the button hugs the left edge or stretches |
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

Also delete the embed's **SCROLL WATCHER** block. `is-scrolled` is set from
`page-transition.js` now, and two owners of one class is one too many. The
embed's version is dead anyway: its guard reads

```js
const item = document.querySelector('[data-nav-item="industries"]');
if (!nav || !panel || !item) return;
```

and the markup uses `data-nav-trigger`, so `item` is null and the whole IIFE
returns before binding anything — scroll state, burger, panel and locale all
dead together.

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

On desktop the footer is `position: fixed` behind the page and revealed by
the page sliding up off it, so it is not part of the Barba container and the
transition used to hide it outright — click a link in the footer and the
thing you were looking at vanished a frame before the page it belongs to
started moving.

**Desktop only, `min-width: 992px`.** Below that the footer is in flow and
scrolls with the page, so there is nothing to reveal it through. The pin
lives in a media query in `page-transition.css`, and `FooterReveal` writes
the reserved space (`margin-bottom` on `.page_wrap`, the footer's own
height) inside a `gsap.matchMedia` context on the same breakpoint. Crossing
back down tears that context down, which clears the margin to `''` — not
`0px`, so a margin set in the Designer still applies — and disconnects the
`ResizeObserver` that tracked the footer's height. `footerRevealed()`
returns `0` below the breakpoint too, so the nav-hide reads the scroll
direction alone rather than a reveal that is not happening.

Both halves read the same number: `FOOTER_PIN` in the JS and the media query
in the CSS. Change one and change the other, or the file goes back to
reserving space for a footer that no longer moves.

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
| `is-hidden` | scrolling down past `offset`, or the footer reveal at least half out |

It hides on the way down and returns on the way up, at every breakpoint.
Three inputs decide, in priority order: an open menu pins it on screen, the
footer reveal takes it away, and otherwise the scroll direction rules.
`NAV_HIDE.offset` (120px) keeps it put over the first screen, where a small
scroll is usually someone settling rather than travelling, and
`NAV_HIDE.threshold` (6px) is the movement needed to read as a direction at
all — without it an inertia wobble flickers the nav. Negative `scrollY` from
iOS rubber-banding is clamped, and a navigation resets the reference point,
since the incoming page starts at the top and would otherwise read as one
large scroll up.

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
- **Replace all three `raw.githack.com/.../main/` URLs with commit-pinned
  `rawcdn.githack.com/.../<full-sha>/` ones.** A mutable branch ref means
  whatever is on `main` executes on the live site, and it cannot be protected
  with SRI because the hash changes on every push. Shipping the dev URL is the
  one thing in this repo that is genuinely unsafe.
- Add `integrity="sha384-..." crossorigin="anonymous"` to the pinned tags once
  they are immutable. Generate with:
  `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`
- Same treatment for the third-party CDN tags (gsap, barba, lenis, swiper,
  base-lib), which are all unpinned or branch-pinned today. `kugiri.global.js`
  is vendored in this repo, so it pins with the other two files rather than
  separately.
