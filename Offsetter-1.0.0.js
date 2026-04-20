/**
 * @file        Offsetter.js
 * @version     1.0.0
 * @license     MIT
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                           OFFSETTER.JS                                  │
 * │              Viewport Sticky-Stack Offset Manager                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Offsetter is a zero-dependency singleton that manages the vertical stack of
 * sticky/fixed elements at the top of the viewport. It measures each layer's
 * height via ResizeObserver, computes positional derivatives for every layer,
 * and publishes the results as CSS custom properties into a single <style> tag.
 *
 * CSS and JavaScript consumers read from this single contract — no hardcoded
 * pixel values, no competing scripts, no circular dependencies.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  CORE CONCEPT — THE LAYER STACK
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  The top of the viewport is occupied by an ordered stack of "layers".
 *  DOM order determines stack order — the topmost element in source order
 *  is layer 0. For each layer at index i:
 *
 *    layer[i].top    = layer[i-1].bottom   (layer[0].top = 0)
 *    layer[i].bottom = layer[i].top + layer[i].height
 *
 *  This eliminates circular dependencies: each layer's `top` is computed
 *  from the layer above it — never from itself.
 *
 *  Viewport layout example:
 *
 *    ┌──────────────────────────────┐ ← 0px
 *    │  header          (70px)      │    --offsetter-header-top:     0px
 *    │                              │    --offsetter-header-bottom: 70px
 *    ├──────────────────────────────┤ ← 70px
 *    │  pill-nav        (48px)      │    --offsetter-pill-nav-top:    70px
 *    │                              │    --offsetter-pill-nav-bottom: 118px
 *    ├──────────────────────────────┤ ← 118px
 *    │  page content                │
 *    │  scroll-margin-top: 138px ←──┼── --offsetter-scroll-margin (118 + 20)
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  QUICK START
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  1. Add data-offsetter-role to every sticky/fixed element in DOM order:
 *
 *     <header data-offsetter-role="header">...</header>
 *     <div    data-offsetter-role="promo-banner">...</div>
 *     <nav    data-offsetter-role="pill-nav">...</nav>
 *
 *  2. Use the generated CSS variables in your stylesheets:
 *
 *     [data-offsetter-role="pill-nav"] {
 *         position: sticky;
 *         top: var(--offsetter-pill-nav-top, 0px);
 *     }
 *
 *     .product-gallery {
 *         position: sticky;
 *         top: var(--offsetter-header-bottom, 0px);
 *     }
 *
 *     [data-offsetter-anchor] {
 *         scroll-margin-top: var(--offsetter-scroll-margin, 80px);
 *     }
 *
 *  3. Include the script before </body> or with defer:
 *
 *     <script src="Offsetter.js" defer></script>
 *
 *  That's it. Offsetter auto-initialises on DOMContentLoaded.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  GENERATED CSS VARIABLES
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Per-layer variables (generated for every data-offsetter-role="<role>"):
 *
 *    --offsetter-<role>-height   The element's current offsetHeight in px.
 *    --offsetter-<role>-top      Where this layer sticks (sum of layers above).
 *    --offsetter-<role>-bottom   Where content below this layer starts
 *                                (top + height). Use this as the `top` value
 *                                for elements that should sit beneath this layer.
 *
 *  Global variables:
 *
 *    --offsetter-total           Sum of all non-excluded layer heights.
 *    --offsetter-scroll-margin   total + spyBuffer. Use for scroll-margin-top
 *                                on anchor sections so they don't hide under
 *                                the sticky stack on hash navigation or
 *                                scrollIntoView().
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  DATA ATTRIBUTES REFERENCE
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  data-offsetter-role="<role>"
 *    Registers the element as a stack layer. The role name becomes part of
 *    the CSS variable names. Use lowercase-kebab-case (e.g. "promo-banner").
 *    DOM order determines stack position — no explicit index needed.
 *
 *  data-offsetter-exclude
 *    The element is observed (its per-layer variables are written) but its
 *    height is NOT added to --offsetter-total and does not shift layers below.
 *    Use for elements that occupy space outside the top stack, e.g. a mobile
 *    sticky bottom bar whose height you need in CSS but which is not "above"
 *    the content.
 *
 *  data-offsetter-anchor  (HTML consumer — not processed by JS)
 *    A semantic marker for CSS. Apply to sections that are scroll targets.
 *    Offsetter.js ignores this attribute; it is solely a CSS hook:
 *
 *      [data-offsetter-anchor] {
 *          scroll-margin-top: var(--offsetter-scroll-margin, 80px);
 *      }
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  JAVASCRIPT API
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Offsetter.init(options?)          Initialise (called automatically).
 *  Offsetter.recalculate()           Force a synchronous recalculation.
 *  Offsetter.getLayer(role)          Returns LayerEntry | null.
 *  Offsetter.getTotal()              Returns --offsetter-total as number.
 *  Offsetter.getScrollMargin()       Returns --offsetter-scroll-margin as number.
 *  Offsetter.destroy()               Disconnect all observers, remove <style>.
 *  Offsetter.debug()                 Print current state to console.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  EVENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  document dispatches 'offsetter:change' after every recalculation.
 *
 *  event.detail: {
 *      total:        number,
 *      scrollMargin: number,
 *      layers:       Map<string, LayerEntry>
 *  }
 *
 *  Use this to re-sync JS widgets without polling or tight coupling:
 *
 *    document.addEventListener('offsetter:change', ({ detail }) => {
 *        this.spyThreshold = detail.scrollMargin;
 *    });
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  OPTIONS
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Offsetter.init({
 *      spyBuffer:      20,               // px added to --offsetter-scroll-margin
 *      styleId:        'offsetter-vars', // id of the generated <style> tag
 *      watchMutations: true,             // observe dynamically added/removed layers
 *      debug:          false,            // log recalculations to console
 *  });
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  NON-GOALS
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Offsetter intentionally does NOT:
 *    • Set position, top, or any CSS property on observed elements.
 *    • Manage z-index.
 *    • Handle horizontal offsets.
 *    • Support multiple independent stacks on one page.
 *    • Manage bottom-of-viewport sticky bars (use data-offsetter-exclude).
 *    • Know anything about the page structure beyond element heights.
 */


/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: Offsetter
   IIFE singleton. Exposed as window.Offsetter for global access and debugging.
   ═══════════════════════════════════════════════════════════════════════════ */

const Offsetter = (() => {

    'use strict';


    /* ───────────────────────────────────────────────────────────────────────
       SECTION 1 — TYPES (JSDoc)
       ─────────────────────────────────────────────────────────────────────── */

    /**
     * @typedef {Object} OffsetterOptions
     * @property {number}  [spyBuffer=20]                - Extra px added to --offsetter-scroll-margin.
     * @property {string}  [styleId='offsetter-vars']    - id of the generated <style> element.
     * @property {boolean} [watchMutations=true]          - MutationObserver — auto-registers layers
     *                                                     added/removed from DOM at runtime.
     * @property {boolean} [debug=false]                  - Log recalculations to console.
     * @property {number}  [statePollInterval=1000]       - "Virtual world" scanner interval in ms.
     *                                                     Every tick compares cached heights vs real
     *                                                     DOM heights. Recalculates only on change —
     *                                                     zero DOM writes on idle ticks.
     *                                                     Set to 0 to disable.
     * @property {number}  [pollingInterval=0]            - Blind recalculate() every N ms (0 = off).
     *                                                     Prefer statePollInterval instead.
     */

    /**
     * @typedef {Object} LayerEntry
     * @property {Element} element  - The observed DOM element.
     * @property {number}  height   - Cached offsetHeight in px (updated on each recalculate).
     * @property {number}  top      - The `top` value this layer should use for sticky positioning.
     *                               Equals the sum of all non-excluded layer heights above it.
     * @property {number}  bottom   - Where content below this layer starts: top + height.
     * @property {boolean} excluded - True when data-offsetter-exclude is present. Height is
     *                               observed and variables are written, but the layer does not
     *                               contribute to --offsetter-total or shift layers below it.
     */

    /**
     * @typedef {Object} ChangeEventDetail
     * @property {number}              total        - Current value of --offsetter-total.
     * @property {number}              scrollMargin - Current value of --offsetter-scroll-margin.
     * @property {Map<string, LayerEntry>} layers   - Snapshot of the full contributors map.
     */


    /* ───────────────────────────────────────────────────────────────────────
       SECTION 2 — PRIVATE STATE
       ─────────────────────────────────────────────────────────────────────── */

    /**
     * Runtime configuration. Merged with user options in init().
     * @type {Required<OffsetterOptions>}
     */
    const config = {
        spyBuffer:        20,
        styleId:          'offsetter-vars',
        watchMutations:   true,
        debug:            false,
        pollingInterval:  0,     // ms — слепой пересчёт каждые N мс (0 = выключено)
        statePollInterval: 1000, // ms — умный поллер: пересчёт только при изменении высот
    };

    /**
     * Ordered map of registered layer contributors.
     * Insertion order = DOM order (guaranteed by querySelectorAll scan in scanDOM).
     * Key: role string. Value: LayerEntry.
     *
     * @type {Map<string, LayerEntry>}
     */
    const contributors = new Map();

    /** Single ResizeObserver instance shared across all contributors. @type {ResizeObserver|null} */
    let resizeObserver = null;

    /** MutationObserver watching <body> for dynamic contributors. @type {MutationObserver|null} */
    let mutationObserver = null;

    /**
     * The <style> element written by writeVars(). Created once on first write,
     * then only its .textContent is updated — the DOM node is never recreated.
     * @type {HTMLStyleElement|null}
     */
    let styleTag = null;

    /** Guards against double-initialisation. @type {boolean} */
    let initialised = false;

    /**
     * rAF handle used for debouncing resize callbacks.
     * When non-null, a recalculate() is already queued for the next frame.
     * @type {number|null}
     */
    let rafHandle = null;

    /**
     * setInterval handle for polling-based recalculation.
     * Active only when config.pollingInterval > 0.
     * @type {number|null}
     */
    let pollingHandle = null;

    /**
     * setInterval handle for the state poller.
     * Runs every config.statePollInterval ms, compares current heights
     * against cached values — only recalculates when something changed.
     * Zero DOM writes on idle frames.
     * @type {number|null}
     */
    let pollerHandle = null;

    /**
     * Bound reference to the transitionend handler.
     * Stored so it can be removed in destroy().
     * @type {Function|null}
     */
    let transitionHandler = null;


    /* ───────────────────────────────────────────────────────────────────────
       SECTION 3 — PRIVATE HELPERS
       ─────────────────────────────────────────────────────────────────────── */

    /**
     * Scan the entire document for [data-offsetter-role] elements in DOM order
     * and register any that are not already tracked.
     *
     * querySelectorAll guarantees document order, so the Map insertion order
     * reflects the visual top-to-bottom stack without any manual index.
     */
    function scanDOM() {
        document.querySelectorAll('[data-offsetter-role]').forEach(el => {
            const role = el.dataset.offsetterRole.trim();
            if (role && !contributors.has(role)) {
                registerContributor(role, el);
            }
        });
    }

    /**
     * Register a single contributor and start observing its size.
     *
     * @param {string}  role - The data-offsetter-role value.
     * @param {Element} el   - The DOM element to observe.
     */
    function registerContributor(role, el) {
        const excluded = el.hasAttribute('data-offsetter-exclude');
        contributors.set(role, {
            element:  el,
            height:   el.offsetHeight,
            top:      0,
            bottom:   0,
            excluded,
        });
        resizeObserver.observe(el);
    }

    /**
     * Unregister a contributor and stop observing it.
     * Triggers a recalculation so downstream variables are updated immediately.
     *
     * @param {string} role
     */
    function unregisterContributor(role) {
        const entry = contributors.get(role);
        if (!entry) return;
        resizeObserver.unobserve(entry.element);
        contributors.delete(role);
        recalculate();
    }

    /**
     * Core calculation pass. Runs in O(n) where n = number of contributors.
     *
     * Algorithm:
     *   1. Walk contributors in insertion (= DOM) order.
     *   2. Read each element's offsetHeight once (single layout read — no thrash).
     *   3. Compute top = cursor; bottom = cursor + height.
     *   4. Advance cursor only for non-excluded layers.
     *   5. Build CSS variable strings in the same pass.
     *   6. Write everything to the <style> tag in one assignment.
     *   7. Dispatch 'offsetter:change'.
     */
    function recalculate() {
        let cursor = 0;
        const vars = [];

        contributors.forEach((entry, role) => {
            // Single offsetHeight read per element — prevents forced reflow loops.
            entry.height = entry.element.offsetHeight;
            entry.top    = cursor;
            entry.bottom = cursor + entry.height;

            vars.push(`  --offsetter-${role}-height: ${entry.height}px`);
            vars.push(`  --offsetter-${role}-top:    ${entry.top}px`);
            vars.push(`  --offsetter-${role}-bottom: ${entry.bottom}px`);

            // Excluded layers do not shift the cursor — they don't contribute to total.
            if (!entry.excluded) {
                cursor = entry.bottom;
            }
        });

        const total        = cursor;
        const scrollMargin = total + config.spyBuffer;

        vars.push(`  --offsetter-total:         ${total}px`);
        vars.push(`  --offsetter-scroll-margin: ${scrollMargin}px`);

        writeVars(vars);
        dispatchChange(total, scrollMargin);

        if (config.debug) {
            logDebug(total, scrollMargin);
        }
    }

    /**
     * Write all CSS custom property declarations into the managed <style> tag.
     * The tag is created once and appended to <head>; only textContent changes
     * on subsequent calls — no node removal or recreation.
     *
     * @param {string[]} vars - Array of declaration strings ("  --name: value").
     */
    function writeVars(vars) {
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = config.styleId;
            // The comment above the style tag is written once and never changed.
            styleTag.dataset.generator = 'Offsetter.js v1.0.0';
            document.head.appendChild(styleTag);
        }
        styleTag.textContent = `/* Offsetter.js — auto-generated, do not edit */\n:root {\n${vars.join(';\n')};\n}`;
    }

    /**
     * Dispatch the 'offsetter:change' CustomEvent on document.
     *
     * @param {number} total
     * @param {number} scrollMargin
     */
    function dispatchChange(total, scrollMargin) {
        document.dispatchEvent(new CustomEvent('offsetter:change', {
            bubbles: false,
            detail: {
                total,
                scrollMargin,
                // Shallow copy of the Map — consumers get a snapshot, not a live reference.
                layers: new Map(contributors),
            },
        }));
    }

    /**
     * Schedule a recalculate() on the next animation frame.
     * If one is already pending the request is ignored — batching multiple
     * ResizeObserver callbacks into a single recalculation.
     */
    function scheduleRecalculate() {
        if (rafHandle !== null) return;
        rafHandle = requestAnimationFrame(() => {
            rafHandle = null;
            recalculate();
        });
    }

    /**
     * Initialise the single shared ResizeObserver.
     * Every observed element routes through the same debounced handler.
     */
    function initResizeObserver() {
        resizeObserver = new ResizeObserver(scheduleRecalculate);
    }

    /**
     * Initialise the MutationObserver on <body>.
     *
     * Watches for:
     *   - Nodes added to the DOM that carry data-offsetter-role (direct or descendant).
     *   - Nodes removed from the DOM that were registered contributors.
     *
     * This covers React portals, Bootstrap modals, AJAX-injected content, and any
     * other dynamic DOM manipulation without requiring manual register() calls.
     */
    function initMutationObserver() {
        mutationObserver = new MutationObserver(mutations => {
            let needsRescan = false;

            for (const mutation of mutations) {

                // — Added nodes ——————————————————————————————————————————————
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;

                    // The node itself may be a contributor.
                    const directRole = node.dataset?.offsetterRole?.trim();
                    if (directRole && !contributors.has(directRole)) {
                        needsRescan = true;
                        break;
                    }

                    // Or a contributor may be nested inside the added subtree
                    // (e.g. React mounts an entire component tree at once).
                    if (node.querySelector?.('[data-offsetter-role]')) {
                        needsRescan = true;
                        break;
                    }
                }

                if (needsRescan) break;

                // — Removed nodes ————————————————————————————————————————————
                for (const node of mutation.removedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;

                    const directRole = node.dataset?.offsetterRole?.trim();
                    if (directRole && contributors.has(directRole)) {
                        unregisterContributor(directRole);
                    }

                    // Check removed subtree for nested contributors.
                    node.querySelectorAll?.('[data-offsetter-role]').forEach(el => {
                        const role = el.dataset.offsetterRole?.trim();
                        if (role && contributors.has(role)) {
                            unregisterContributor(role);
                        }
                    });
                }
            }

            // Re-scan once for all additions rather than registering one-by-one
            // inside the loop — preserves DOM order.
            if (needsRescan) {
                scanDOM();
                recalculate();
            }
        });

        mutationObserver.observe(document.body, {
            childList: true,
            subtree:   true,
        });
    }

    /**
     * Pretty-print the current stack state to the browser console.
     * Separated from recalculate() to keep the hot path free of string work.
     *
     * @param {number} total
     * @param {number} scrollMargin
     */
    function logDebug(total, scrollMargin) {
        const rows = [];
        contributors.forEach((entry, role) => {
            rows.push({
                role,
                'height (px)':   entry.height,
                'top (px)':      entry.top,
                'bottom (px)':   entry.bottom,
                excluded:        entry.excluded,
            });
        });
        console.groupCollapsed(`[Offsetter] recalculate — total: ${total}px, scroll-margin: ${scrollMargin}px`);
        console.table(rows);
        console.log('--offsetter-total:        ', `${total}px`);
        console.log('--offsetter-scroll-margin:', `${scrollMargin}px`);
        console.log('spyBuffer:', config.spyBuffer, 'px  |  watchMutations:', config.watchMutations);
        console.groupEnd();
    }


    /**
     * State poller — the "virtual world" scanner.
     *
     * Runs every config.statePollInterval ms (default 1000ms).
     * On each tick it reads the current offsetHeight of every registered
     * contributor and compares it to the cached value.
     *
     * If ANY height changed → recalculate() is called.
     * If nothing changed   → no DOM write, no event dispatch. Zero cost.
     *
     * This is the safety net that catches everything else:
     *   - display:none toggled by JS without a transition
     *   - visibility changes driven by scroll or intersection
     *   - external scripts changing contributor height
     *   - browser zoom level changes
     *   - any case where ResizeObserver or transitionend didn't fire
     *
     * "Virtual world" pattern:
     *   snapshot(t)  = { role → height } from cache
     *   realWorld(t) = { role → offsetHeight } from DOM
     *   if snapshot ≠ realWorld → sync and recalculate
     */
    function initStatePoller() {
        if (config.statePollInterval <= 0) return;

        pollerHandle = setInterval(() => {
            let dirty = false;

            contributors.forEach((entry, role) => {
                const current = entry.element.offsetHeight;
                if (current !== entry.height) {
                    if (config.debug) {
                        console.log(
                            `[Offsetter] state poller detected change: ${role} ` +
                            `${entry.height}px → ${current}px`
                        );
                    }
                    dirty = true;
                }
            });

            if (dirty) recalculate();

        }, config.statePollInterval);
    }

    /**
     * Attach a single 'transitionend' listener on document.
     *
     * ResizeObserver fires on every frame during a transition — which is correct
     * for most cases. However, CSS transitions driven by properties that don't
     * directly change offsetHeight (e.g. opacity, transform, visibility toggling
     * that then releases layout space) can be missed.
     *
     * This listener fires exactly once per transition, only when the animated
     * element is (or is inside) a registered contributor — zero cost otherwise.
     *
     * Covers:
     *   - max-height collapse animations (promo banner dismiss)
     *   - Accordion / collapse components in the sticky stack
     *   - Any future contributor with a CSS transition on its height
     */
    function initTransitionObserver() {
        transitionHandler = (e) => {
            if (e.target.closest('[data-offsetter-role]')) {
                scheduleRecalculate();
            }
        };
        document.addEventListener('transitionend', transitionHandler);
    }

    return {

        /**
         * Initialise Offsetter. Called automatically on DOMContentLoaded.
         * Safe to call manually before the DOM event fires if your script is
         * placed after all contributor elements in source order.
         *
         * Calling init() more than once is a no-op with a console warning.
         *
         * @param {OffsetterOptions} [options={}]
         *
         * @example
         * // Default configuration — spyBuffer 20px, MutationObserver enabled.
         * Offsetter.init();
         *
         * @example
         * // Custom spy buffer and disabled mutation watching for static pages.
         * Offsetter.init({ spyBuffer: 32, watchMutations: false });
         *
         * @example
         * // Enable debug logging during development.
         * Offsetter.init({ debug: true });
         */
        init(options = {}) {
            if (initialised) {
                console.warn('[Offsetter] init() called more than once. Ignoring.');
                return;
            }
            initialised = true;

            Object.assign(config, options);

            initResizeObserver();
            scanDOM();
            recalculate();

            if (config.watchMutations) {
                initMutationObserver();
            }

            // transitionend — catches final state of CSS transitions on contributors.
            // Works alongside ResizeObserver: RO fires during the animation,
            // transitionend fires once at the end as a safety net.
            initTransitionObserver();

            // State poller — virtual world scanner, runs every statePollInterval ms.
            // Compares cached heights vs real DOM heights, recalculates only on change.
            // Catches display:none toggles, zoom changes, and anything RO/transitionend missed.
            initStatePoller();

            // Final recalculate after full page load — web fonts and images may
            // change the header height after DOMContentLoaded.
            window.addEventListener('load', recalculate, { once: true });

            // Polling fallback — only if explicitly requested.
            // Prefer transitionend + ResizeObserver for zero-overhead coverage.
            // Enable via: Offsetter.init({ pollingInterval: 500 })
            if (config.pollingInterval > 0) {
                pollingHandle = setInterval(recalculate, config.pollingInterval);
            }
        },

        /**
         * Force an immediate, synchronous recalculation of the entire stack.
         *
         * ResizeObserver handles the vast majority of cases automatically.
         * Use this method only for edge cases that ResizeObserver cannot detect:
         *   - CSS animations that change an element's height over time.
         *   - Programmatic classList changes that alter padding/height without
         *     triggering a resize event (e.g. collapsing an accordion header).
         *   - After calling Offsetter.init({ watchMutations: false }) and manually
         *     modifying the DOM.
         *
         * @example
         * // After a header collapse animation completes.
         * header.addEventListener('transitionend', () => Offsetter.recalculate());
         */
        recalculate,

        /**
         * Retrieve the full LayerEntry for a registered role.
         *
         * @param  {string}          role - The data-offsetter-role value.
         * @returns {LayerEntry|null}      - The entry, or null if not found.
         *
         * @example
         * const pillNav = Offsetter.getLayer('pill-nav');
         * if (pillNav) {
         *     console.log(`pill-nav sticks at ${pillNav.top}px`);
         *     console.log(`content starts at  ${pillNav.bottom}px`);
         * }
         */
        getLayer(role) {
            return contributors.get(role) ?? null;
        },

        /**
         * Return the current value of --offsetter-total as a plain number (px).
         * Equivalent to reading the CSS variable but avoids string parsing.
         *
         * @returns {number}
         *
         * @example
         * // Compute a custom threshold without involving CSS.
         * const threshold = Offsetter.getTotal() + 8;
         */
        getTotal() {
            let total = 0;
            contributors.forEach(entry => {
                if (!entry.excluded) total = entry.bottom;
            });
            return total;
        },

        /**
         * Return the current value of --offsetter-scroll-margin as a plain number (px).
         * Use this in JavaScript scroll-spy logic instead of hardcoded thresholds.
         *
         * @returns {number}
         *
         * @example
         * // Replace a hardcoded -150 threshold with a live value.
         * // Before:  if (scrollY >= sectionTop - 150) activate(id);
         * // After:
         * if (scrollY >= sectionTop - Offsetter.getScrollMargin()) activate(id);
         */
        getScrollMargin() {
            return this.getTotal() + config.spyBuffer;
        },

        /**
         * Disconnect all observers, cancel any pending rAF, and remove the
         * generated <style> tag from the document.
         *
         * Use in single-page applications when the page component that owns the
         * sticky stack is unmounted. After destroy(), init() may be called again.
         *
         * @example
         * // React / Vue component teardown.
         * useEffect(() => {
         *     Offsetter.init();
         *     return () => Offsetter.destroy();
         * }, []);
         */
        destroy() {
            if (rafHandle !== null) {
                cancelAnimationFrame(rafHandle);
                rafHandle = null;
            }
            if (pollingHandle !== null) {
                clearInterval(pollingHandle);
                pollingHandle = null;
            }
            if (pollerHandle !== null) {
                clearInterval(pollerHandle);
                pollerHandle = null;
            }
            if (transitionHandler !== null) {
                document.removeEventListener('transitionend', transitionHandler);
                transitionHandler = null;
            }
            resizeObserver?.disconnect();
            mutationObserver?.disconnect();
            styleTag?.remove();

            // Reset all private state so init() can be called again.
            contributors.clear();
            resizeObserver   = null;
            mutationObserver = null;
            styleTag         = null;
            initialised      = false;
        },

        /**
         * Print a formatted table of the current stack state to the console.
         * Works regardless of whether the debug option is enabled.
         *
         * Open your browser DevTools and call:
         *   Offsetter.debug()
         *
         * Output example:
         *
         *   ┌──────────────────┬──────────┬────────┬──────────┬──────────┐
         *   │ role             │ height   │ top    │ bottom   │ excluded │
         *   ├──────────────────┼──────────┼────────┼──────────┼──────────┤
         *   │ header           │ 70px     │ 0px    │ 70px     │ false    │
         *   │ pill-nav         │ 48px     │ 70px   │ 118px    │ false    │
         *   ├──────────────────┴──────────┴────────┴──────────┴──────────┤
         *   │ --offsetter-total:          118px                          │
         *   │ --offsetter-scroll-margin:  138px                          │
         *   │ spyBuffer: 20px  │ watchMutations: true                    │
         *   └────────────────────────────────────────────────────────────┘
         *
         * @example
         * Offsetter.debug();
         */
        debug() {
            const rows = [];
            contributors.forEach((entry, role) => {
                rows.push({
                    role,
                    'height (px)': entry.height,
                    'top (px)':    entry.top,
                    'bottom (px)': entry.bottom,
                    excluded:      entry.excluded,
                });
            });
            const total        = this.getTotal();
            const scrollMargin = this.getScrollMargin();

            console.group('[Offsetter] Debug — current state');
            if (rows.length === 0) {
                console.warn('No contributors registered. Did you add data-offsetter-role attributes?');
            } else {
                console.table(rows);
            }
            console.log('--offsetter-total:        ', `${total}px`);
            console.log('--offsetter-scroll-margin:', `${scrollMargin}px`);
            console.log('spyBuffer:', config.spyBuffer, 'px');
            console.log('watchMutations:', config.watchMutations);
            console.log('debug:', config.debug);
            console.log('initialised:', initialised);
            console.groupEnd();
        },

    };

})();


/* ═══════════════════════════════════════════════════════════════════════════
   AUTO-INIT
   If the DOM is already parsed (script placed at end of <body> or defer),
   initialise immediately. Otherwise wait for DOMContentLoaded.
   Never use async — scanDOM() must see the full DOM in source order.
   ═══════════════════════════════════════════════════════════════════════════ */

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Offsetter.init(), { once: true });
} else {
    Offsetter.init();
}


/* ═══════════════════════════════════════════════════════════════════════════
   GLOBAL EXPORT
   Attach to window for console debugging and cross-script access.

   Available in DevTools:
     Offsetter.debug()
     Offsetter.getLayer('header')
     Offsetter.getTotal()
     Offsetter.getScrollMargin()
     Offsetter.recalculate()
   ═══════════════════════════════════════════════════════════════════════════ */

window.Offsetter = Offsetter;


