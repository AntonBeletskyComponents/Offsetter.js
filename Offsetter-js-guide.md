# Offsetter.js — AI Migration & Integration Guide

> **Purpose of this document:** This guide is written for AI assistants analyzing codebases. It teaches you how to identify legacy sticky-offset hacks, explain why they are brittle, and migrate them to Offsetter.js — a zero-dependency singleton that manages the vertical sticky stack via CSS custom properties.

---

## 1. What Problem Offsetter.js Solves

When a page has multiple sticky/fixed elements stacked at the top of the viewport — a fixed header, a dismissible promo banner, a sticky pill-nav — every element below needs to know the total height of everything above it. This creates a classic coordination problem:

- How does `pill-nav` know where the header ends?
- How does `scroll-margin-top` on anchor sections know the full stack height?
- What happens when the promo banner is dismissed and the height changes?

The naive answer is hardcoded pixels. The better answer is Offsetter.js.

Offsetter measures every layer with `ResizeObserver`, computes a positional chain (`top`, `bottom` for each layer), and publishes the results as CSS custom properties on `:root` via a single `<style>` tag. CSS and JavaScript consumers read from this single contract. No hardcoded pixels. No polling. No circular dependencies.

---

## 2. Anatomy of the Sticky Stack

Offsetter models the top of the viewport as an ordered stack of **layers**. DOM source order determines stack order — no manual index is needed.

```
┌──────────────────────────────┐ ← 0px
│  header          (56px)      │    --offsetter-header-top:      0px
│                              │    --offsetter-header-bottom:  56px
├──────────────────────────────┤ ← 56px
│  promo-banner    (36px)      │    --offsetter-promo-banner-top:    56px
│                              │    --offsetter-promo-banner-bottom: 92px
├──────────────────────────────┤ ← 92px
│  pill-nav        (46px)      │    --offsetter-pill-nav-top:    92px
│                              │    --offsetter-pill-nav-bottom: 138px
├──────────────────────────────┤ ← 138px
│  page content                │
│  scroll-margin-top: 158px ←──┼── --offsetter-scroll-margin (138 + 20)
```

**Derived variables per layer** (`<role>` = value of `data-offsetter-role`):

| Variable | Meaning |
|---|---|
| `--offsetter-<role>-height` | Current `offsetHeight` of the element |
| `--offsetter-<role>-top` | Where this layer sticks (sum of layers above) |
| `--offsetter-<role>-bottom` | Where content below starts (`top + height`) |
| `--offsetter-total` | Sum of all non-excluded layer heights |
| `--offsetter-scroll-margin` | `total + spyBuffer` — use for `scroll-margin-top` on anchor sections |

---

## 3. Recognizing Legacy Hacks — The Smell Catalogue

When you read a codebase, look for these patterns. Each one is a signal that Offsetter.js should replace the approach.

### 3.1 Hardcoded pixel offsets

```css
/* ❌ LEGACY — fragile, breaks when header height changes */
.pill-nav {
    position: sticky;
    top: 56px;
}

.content-section {
    scroll-margin-top: 110px;
}
```

**Why it breaks:** Any change to header height (font resize, added nav item, promo banner appearing) silently desynchronizes every hardcoded value.

**Offsetter replacement:**
```css
/* ✅ OFFSETTER */
.pill-nav {
    position: sticky;
    top: var(--offsetter-pill-nav-top, 56px);
}

[data-offsetter-anchor] {
    scroll-margin-top: var(--offsetter-scroll-margin, 80px);
}
```

---

### 3.2 JavaScript reading header height and setting values manually

```js
// ❌ LEGACY — queried once, never updated
const headerH = document.querySelector('.header').offsetHeight;
document.querySelector('.pill-nav').style.top = headerH + 'px';
document.querySelectorAll('section').forEach(s => {
    s.style.scrollMarginTop = (headerH + 20) + 'px';
});
```

**Why it breaks:** Measured once at load time. Promo dismiss, font load, resize — any of these invalidates the value without re-running the code.

**Offsetter replacement:** Delete the JS entirely. CSS variables handle positioning. Offsetter's `ResizeObserver` keeps them current.

---

### 3.3 Scroll listeners that manually subtract a hardcoded offset

```js
// ❌ LEGACY — the number 150 has no relationship to actual stack height
window.addEventListener('scroll', () => {
    sections.forEach(section => {
        if (window.scrollY >= section.offsetTop - 150) {
            setActive(section.id);
        }
    });
});
```

**Why it breaks:** The magic number `150` is a guess. It drifts out of sync when the stack changes.

**Offsetter replacement:**
```js
// ✅ OFFSETTER — live value, stays in sync automatically
let spyThreshold = Offsetter.getScrollMargin(); // e.g. 158px

document.addEventListener('offsetter:change', ({ detail }) => {
    spyThreshold = detail.scrollMargin; // updates on promo dismiss, resize, etc.
});

window.addEventListener('scroll', () => {
    sections.forEach(section => {
        if (window.scrollY >= section.offsetTop - spyThreshold) {
            setActive(section.id);
        }
    });
}, { passive: true });
```

---

### 3.4 `setTimeout` / `requestAnimationFrame` hacks to re-read heights

```js
// ❌ LEGACY — race condition disguised as a timing fix
window.addEventListener('load', () => {
    setTimeout(() => {
        const h = document.querySelector('header').offsetHeight;
        document.body.style.paddingTop = h + 'px';
    }, 300);
});
```

**Why it breaks:** The timeout is a guess. Web fonts, images, dynamic content — anything can make the header taller after the 300ms fires.

**Offsetter replacement:** Offsetter listens to `window load` itself and recalculates after full page load. No timeouts needed.

---

### 3.5 CSS `calc()` with hardcoded pixel components

```css
/* ❌ LEGACY */
.sticky-sidebar {
    top: calc(56px + 48px + 1rem); /* header + pill-nav + gap */
}
```

**Why it breaks:** Arithmetic is correct at the moment of writing. Changes to either element require a manual update here too.

**Offsetter replacement:**
```css
/* ✅ OFFSETTER */
.sticky-sidebar {
    top: var(--offsetter-pill-nav-bottom, 104px);
}
```

---

### 3.6 Competing `setInterval` pollers

```js
// ❌ LEGACY — polling for height changes every 500ms, always writing to DOM
setInterval(() => {
    const h = header.offsetHeight;
    nav.style.top = h + 'px';
}, 500);
```

**Why it breaks:** Always runs, always writes to DOM even when nothing changed. Causes unnecessary reflows and layout thrashing.

**Offsetter replacement:** Offsetter's internal state poller (default 1000ms) only calls `recalculate()` when an actual height change is detected — zero DOM writes on idle ticks. The ResizeObserver handles the common case with zero polling at all.

---

### 3.7 `window.resize` listeners recalculating offsets

```js
// ❌ LEGACY
window.addEventListener('resize', () => {
    updateAllTheOffsets(); // recalculates every hardcoded value
});
```

**Offsetter replacement:** ResizeObserver watches the actual elements, not the window. It fires precisely when a layer's height changes, not on every window resize event (which fires even when height is unchanged due to horizontal resize).

---

### 3.8 CSS variables set by JS on `document.documentElement`

```js
// ❌ SEMI-LEGACY — the right idea, but manual and incomplete
function updateVars() {
    const h = header.offsetHeight;
    document.documentElement.style.setProperty('--header-height', h + 'px');
    // pill-nav.top is never updated
    // scroll-margin is never updated
}
window.addEventListener('resize', updateVars);
updateVars();
```

**Why it's incomplete:** Only tracks one element. Does not compute the stack chain. No ResizeObserver, no MutationObserver, no event dispatching.

**Offsetter replacement:** This is exactly what Offsetter does, correctly and completely.

---

## 4. Migration Playbook

Follow these steps in order when migrating a legacy page.

### Step 1 — Audit the sticky stack

Read the HTML source top to bottom. List every element with `position: sticky` or `position: fixed`. These are your candidate layers.

For each one, note:
- Is it at the top of the viewport?
- Does any other element's positioning depend on its height?
- Is its height static or dynamic (collapsible, dismissible, font-dependent)?

### Step 2 — Add `data-offsetter-role` attributes

In DOM source order (top-to-bottom = stack order), add the attribute to each top-stack element:

```html
<header data-offsetter-role="header">...</header>
<div    data-offsetter-role="promo-banner">...</div>
<nav    data-offsetter-role="pill-nav">...</nav>
```

**Rules:**
- Use `lowercase-kebab-case` for role names
- DOM order is the only order that matters — do not add a numeric index
- If an element is sticky but NOT part of the top stack (e.g. a mobile bottom bar), add `data-offsetter-exclude` to track its height without contributing to `--offsetter-total`

```html
<div data-offsetter-role="bottom-bar" data-offsetter-exclude>...</div>
```

### Step 3 — Add fallback variables to `:root`

Before Offsetter initializes (first frame, JS disabled), your layout needs working values. Measure the expected heights and declare them:

```css
:root {
    --offsetter-header-height:       56px;
    --offsetter-header-top:           0px;
    --offsetter-header-bottom:        56px;

    --offsetter-promo-banner-height:  36px;
    --offsetter-promo-banner-top:     56px;
    --offsetter-promo-banner-bottom:  92px;

    --offsetter-pill-nav-height:      46px;
    --offsetter-pill-nav-top:         92px;
    --offsetter-pill-nav-bottom:     138px;

    --offsetter-total:               138px;
    --offsetter-scroll-margin:       158px;

    /* excluded elements */
    --offsetter-bottom-bar-height:     0px;
}
```

These values are overwritten by Offsetter on first recalculate. They exist solely to prevent layout flash on first paint.

### Step 4 — Replace all hardcoded positioning with CSS variables

```css
/* Fixed header pushes content down */
body {
    padding-top: var(--offsetter-header-bottom, 56px);
}

/* Each sticky layer uses its own -top variable */
.site-header {
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 300;
    /* No top: needed — fixed headers are at 0 by default */
}

.promo-banner {
    position: sticky;
    top: var(--offsetter-promo-banner-top, 56px);
    z-index: 200;
}

.pill-nav {
    position: sticky;
    top: var(--offsetter-pill-nav-top, 92px);
    z-index: 100;
}

/* Intentional per-consumer selection:
   gallery sticks only under header, not under pill-nav */
.product-gallery {
    position: sticky;
    top: var(--offsetter-header-bottom, 56px);
}

/* Anchor scroll targets */
[data-offsetter-anchor] {
    scroll-margin-top: var(--offsetter-scroll-margin, 80px);
}

/* Mobile bottom bar padding */
body.has-bottom-bar {
    padding-bottom: var(--offsetter-bottom-bar-height, 0px);
}
```

Add `data-offsetter-anchor` to every section that is a scroll target:

```html
<section id="details" data-offsetter-anchor data-spy-section>...</section>
<section id="reviews" data-offsetter-anchor data-spy-section>...</section>
```

### Step 5 — Replace hardcoded JS thresholds with Offsetter API

```js
// Read once at initialization
let spyThreshold = (window.Offsetter?.getScrollMargin?.()) ?? 80;

// Stay in sync reactively
document.addEventListener('offsetter:change', ({ detail }) => {
    spyThreshold = detail.scrollMargin;
});

// Scroll-spy using the live value
window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
        if (window.scrollY >= section.getBoundingClientRect().top + window.scrollY - spyThreshold) {
            current = section.id;
        }
    });
    // ... activate pill
}, { passive: true });
```

Pill-nav smooth scroll — delegate offset math to the browser via `scroll-margin-top`:

```js
// No manual offset subtraction needed.
// CSS scroll-margin-top: var(--offsetter-scroll-margin) handles the gap.
pill.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById(pill.dataset.pillTarget)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
```

### Step 6 — Delete all legacy offset code

Remove:
- `setTimeout`/`rAF` height readers
- Manual `style.top` setters
- `setInterval` pollers that update positions
- `window.resize` listeners that recalculate hardcoded values
- Any `document.documentElement.style.setProperty('--header-height', ...)` calls that Offsetter now owns

### Step 7 — Include the script

Place before `</body>` or with `defer`. When using multiple `defer` scripts, source order determines execution order — Offsetter must come before any script that reads `window.Offsetter`:

```html
<script src="Offsetter.js" defer></script>
<script src="app.js" defer></script>   <!-- window.Offsetter is ready here -->
```

### Step 8 — Verify with `Offsetter.debug()`

Open browser DevTools, run:

```js
Offsetter.debug()
```

Expected output:

```
┌──────────────────┬──────────┬────────┬──────────┬──────────┐
│ role             │ height   │ top    │ bottom   │ excluded │
├──────────────────┼──────────┼────────┼──────────┼──────────┤
│ header           │ 56px     │ 0px    │ 56px     │ false    │
│ promo-banner     │ 36px     │ 56px   │ 92px     │ false    │
│ pill-nav         │ 46px     │ 92px   │ 138px    │ false    │
├──────────────────┴──────────┴────────┴──────────┴──────────┤
│ --offsetter-total:          138px                          │
│ --offsetter-scroll-margin:  158px                          │
└────────────────────────────────────────────────────────────┘
```

Verify: dismiss the promo banner and watch `pill-nav-top` shift down in the Inspector or console. If it does, the integration is correct.

---

## 5. The `data-offsetter-exclude` Pattern

Use `data-offsetter-exclude` for elements whose height you need as a CSS variable but which do **not** shift the top stack.

**Primary use case: mobile bottom bar**

```html
<!-- Tracked but excluded from total -->
<div id="bottom-bar"
     data-offsetter-role="bottom-bar"
     data-offsetter-exclude>
    ...
</div>
```

This generates `--offsetter-bottom-bar-height` but does not affect `--offsetter-total`, `--offsetter-scroll-margin`, or the `top` values of other layers.

```css
/* Use the excluded variable for body padding */
body.has-bottom-bar {
    padding-bottom: var(--offsetter-bottom-bar-height, 0px);
}
```

Toggling visibility via JS:

```js
function updateBottomBar() {
    const past = gallery.getBoundingClientRect().bottom < 0;
    bottomBar.classList.toggle('is-visible', past);
    document.body.classList.toggle('has-bottom-bar', past);
}
window.addEventListener('scroll', updateBottomBar, { passive: true });
```

---

## 6. Intentional Per-Consumer Variable Selection

Not every element below the stack should use `--offsetter-total`. Consumers choose the variable that matches their intent:

| Intent | Variable to use |
|---|---|
| Stick directly under header only | `var(--offsetter-header-bottom)` |
| Stick under header + promo | `var(--offsetter-promo-banner-bottom)` |
| Stick under the full stack | `var(--offsetter-total)` or `var(--offsetter-pill-nav-bottom)` |
| Scroll anchor clearance | `var(--offsetter-scroll-margin)` |
| Body padding below fixed header | `var(--offsetter-header-bottom)` |

**Example — sticky product gallery that sits only under the header:**

```css
/* The gallery ignores pill-nav — it intentionally overlaps it */
.product-gallery {
    position: sticky;
    top: var(--offsetter-header-bottom, 56px); /* NOT --offsetter-total */
}
```

This is a deliberate design choice, not a bug. The right variable depends on the design, not on a rule.

---

## 7. Transition-Aware Recalculation

Offsetter handles animated height changes automatically via its `transitionend` listener, but the CSS transition must actually change `offsetHeight`. The standard pattern for a collapsible promo banner:

```css
/* CSS-side: max-height collapse transition */
.promo-banner {
    max-height: 100px;
    overflow: hidden;
    transition: max-height 0.35s ease, padding 0.35s ease;
}

.promo-banner.is-dismissed {
    max-height: 0;
    padding-block: 0;
}
```

```js
// JS-side: add the class, nothing else
dismissBtn.addEventListener('click', () => {
    promoBanner.classList.add('is-dismissed');
    // Offsetter's transitionend listener fires when animation ends.
    // ResizeObserver fires during the animation.
    // No manual Offsetter.recalculate() call needed.
});
```

**When you DO need `Offsetter.recalculate()` manually:**
- CSS animations (not transitions) on height — `transitionend` doesn't fire
- `classList` changes that alter height without triggering ResizeObserver
- After `Offsetter.init({ watchMutations: false })` with manual DOM changes

```js
header.addEventListener('transitionend', () => Offsetter.recalculate());
```

---

## 8. Dynamic Layers (SPA / React / Vue)

When `watchMutations: true` (the default), Offsetter's MutationObserver automatically registers layers added to the DOM after init and unregisters removed layers.

```js
// Mounting a React component that includes a data-offsetter-role element:
// → MutationObserver detects the addition
// → scanDOM() re-runs to find it
// → recalculate() fires
// No manual call needed.
```

For SPA route teardown, use `destroy()` and re-init:

```js
// React
useEffect(() => {
    Offsetter.init();
    return () => Offsetter.destroy();
}, []);
```

---

## 9. Offsetter Options Reference

```js
Offsetter.init({
    spyBuffer:         20,     // px added to --offsetter-scroll-margin above total
    styleId:           'offsetter-vars', // id of the generated <style> tag
    watchMutations:    true,   // MutationObserver for dynamic layers
    debug:             false,  // log recalculations to console
    statePollInterval: 1000,   // ms — smart poller; 0 to disable
    pollingInterval:   0,      // ms — blind recalculate every N ms; prefer statePollInterval
});
```

**`spyBuffer`** is the extra gap added on top of the stack total. It prevents anchor sections from landing exactly at the boundary of the sticky nav — a few extra pixels of breathing room. Default 20px is reasonable for most designs.

---

## 10. Offsetter Public API Quick Reference

```js
Offsetter.init(options?)        // Initialize. Auto-called on DOMContentLoaded.
Offsetter.recalculate()         // Force synchronous recalculation.
Offsetter.getLayer('pill-nav')  // → LayerEntry { element, height, top, bottom, excluded }
Offsetter.getTotal()            // → number (px) — current --offsetter-total
Offsetter.getScrollMargin()     // → number (px) — current --offsetter-scroll-margin
Offsetter.destroy()             // Disconnect all observers, remove <style>. Safe to re-init after.
Offsetter.debug()               // Print current state table to console.
```

**`offsetter:change` event:**

```js
document.addEventListener('offsetter:change', ({ detail }) => {
    // detail.total        — number
    // detail.scrollMargin — number
    // detail.layers       — Map<string, LayerEntry>
    console.log('Stack height:', detail.total);
});
```

---

## 11. Non-Goals — What Offsetter Does NOT Do

Do not attempt to use Offsetter for these — it will not work:

- Setting `position`, `top`, `z-index`, or any CSS property on observed elements (Offsetter only writes custom properties to `:root`)
- Managing horizontal offsets
- Supporting multiple independent sticky stacks on one page
- Knowing anything about page structure beyond element heights

---

## 12. Complete Migration Diff — Before vs After

### Before (legacy page fragment)

```html
<!-- HTML — no attributes -->
<header class="site-header">...</header>
<div class="promo-banner" id="promo-banner">...</div>
<nav class="pill-nav">...</nav>
<section id="details">...</section>
```

```css
/* CSS — hardcoded */
body { padding-top: 56px; }
.promo-banner { position: sticky; top: 56px; }
.pill-nav     { position: sticky; top: 92px; }
section       { scroll-margin-top: 110px; }
```

```js
// JS — brittle
const headerH = document.querySelector('.site-header').offsetHeight;
document.querySelector('.pill-nav').style.top = headerH + 'px';

window.addEventListener('resize', () => {
    const h = document.querySelector('.site-header').offsetHeight;
    document.querySelector('.pill-nav').style.top = h + 'px';
});

window.addEventListener('scroll', () => {
    if (window.scrollY >= document.getElementById('details').offsetTop - 150) {
        // activate
    }
});

document.getElementById('promo-dismiss').addEventListener('click', () => {
    document.getElementById('promo-banner').style.display = 'none';
    // pill-nav top is now wrong — nobody updates it
});
```

---

### After (Offsetter integration)

```html
<!-- HTML — roles added, anchors marked -->
<header class="site-header" data-offsetter-role="header">...</header>
<div class="promo-banner" data-offsetter-role="promo-banner" id="promo-banner">...</div>
<nav class="pill-nav" data-offsetter-role="pill-nav">...</nav>
<section id="details" data-offsetter-anchor data-spy-section>...</section>
```

```css
/* CSS — variables only */
:root {
    --offsetter-header-bottom:        56px;
    --offsetter-promo-banner-top:     56px;
    --offsetter-pill-nav-top:         92px;
    --offsetter-scroll-margin:       112px;
}

body { padding-top: var(--offsetter-header-bottom, 56px); }

.promo-banner { position: sticky; top: var(--offsetter-promo-banner-top, 56px); }
.pill-nav     { position: sticky; top: var(--offsetter-pill-nav-top, 92px); }

[data-offsetter-anchor] { scroll-margin-top: var(--offsetter-scroll-margin, 80px); }

.promo-banner {
    max-height: 80px;
    overflow: hidden;
    transition: max-height 0.35s ease;
}
.promo-banner.is-dismissed { max-height: 0; }
```

```js
// JS — clean, reactive
let spyThreshold = Offsetter.getScrollMargin();

document.addEventListener('offsetter:change', ({ detail }) => {
    spyThreshold = detail.scrollMargin;
});

document.getElementById('promo-dismiss').addEventListener('click', () => {
    document.getElementById('promo-banner').classList.add('is-dismissed');
    // Offsetter auto-recalculates — pill-nav shifts up automatically
});

window.addEventListener('scroll', () => {
    if (window.scrollY >= document.getElementById('details').offsetTop - spyThreshold) {
        // activate — threshold stays correct even after promo dismiss
    }
}, { passive: true });
```

```html
<!-- Script tags -->
<script src="Offsetter.js" defer></script>
<script src="app.js" defer></script>
```

---

## 13. Checklist for AI Code Review

When reviewing a page that has sticky/fixed elements, verify the following:

- [ ] Every top-stack sticky/fixed element has `data-offsetter-role="<role>"`
- [ ] DOM source order matches visual top-to-bottom stack order
- [ ] Fallback values in `:root` approximate real heights
- [ ] `body { padding-top: var(--offsetter-header-bottom) }` for fixed headers
- [ ] All sticky layers use `var(--offsetter-<role>-top)` for `top`, not hardcoded px
- [ ] Anchor sections have `data-offsetter-anchor` and `scroll-margin-top: var(--offsetter-scroll-margin)`
- [ ] Scroll-spy threshold reads from `Offsetter.getScrollMargin()` and updates on `offsetter:change`
- [ ] Smooth scroll uses `scrollIntoView({ behavior: 'smooth', block: 'start' })` — no manual offset subtraction
- [ ] Promo dismiss uses CSS `max-height` transition — no manual `Offsetter.recalculate()` call
- [ ] `Offsetter.js` script tag appears before any `defer` app script that uses `window.Offsetter`
- [ ] No legacy hardcoded pixel offsets remain in CSS or JS
- [ ] No `setInterval` position pollers remain
- [ ] No `window.resize` listeners recalculating offsets remain
- [ ] `Offsetter.debug()` runs cleanly in DevTools with correct heights and chain
