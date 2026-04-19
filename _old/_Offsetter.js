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
     * @property {number}  [spyBuffer=20]               - Extra px added to --offsetter-scroll-margin
     *                                                    beyond the total stack height. Prevents the
     *                                                    scroll-spy from firing too early.
     * @property {string}  [styleId='offsetter-vars']   - The `id` of the generated <style> element.
     *                                                    Override when running multiple independent
     *                                                    instances in the same document is needed.
     * @property {boolean} [watchMutations=true]         - Attach a MutationObserver to <body> to
     *                                                    automatically register/unregister layers
     *                                                    added or removed from the DOM at runtime
     *                                                    (React portals, AJAX content, etc.).
     * @property {boolean} [debug=false]                 - Log every recalculation result to the
     *                                                    browser console.
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
        spyBuffer:      20,
        styleId:        'offsetter-vars',
        watchMutations: true,
        debug:          false,
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


    /* ───────────────────────────────────────────────────────────────────────
       SECTION 4 — PUBLIC API
       ─────────────────────────────────────────────────────────────────────── */

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

            // Final recalculate after full page load — web fonts and images may
            // change the header height after DOMContentLoaded.
            window.addEventListener('load', recalculate, { once: true });
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
            resizeObserver?.disconnect();
            mutationObserver?.disconnect();
            styleTag?.remove();

            // Reset all private state so init() can be called again.
            contributors.clear();
            resizeObserver  = null;
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


/* ═══════════════════════════════════════════════════════════════════════════

   EXAMPLE — example.html
   Full standalone demo: header + promo banner + pill-nav + sticky gallery
   + anchor sections + mobile bottom bar + scroll-spy.
   Copy this block into an .html file to run without a build step.

   ═══════════════════════════════════════════════════════════════════════════

<!DOCTYPE html>
<html lang="en" data-bs-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Offsetter.js — Demo</title>

    <!-- Bootstrap 5 -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">

    <!--
    ┌─────────────────────────────────────────────────────────────────────┐
    │  OFFSETTER CSS CONTRACT                                             │
    │  All sticky positioning uses var(--offsetter-*).                   │
    │  Hardcoded pixel values for `top` are intentionally absent.        │
    │  Fallback values keep the page usable if JS fails to load.         │
    └─────────────────────────────────────────────────────────────────────┘
    -->
    <style>

        /* ── Layer: header ───────────────────────────────────────────── */
        /*
           The header is position:fixed so it does not participate in
           normal document flow. Offsetter measures its height and exposes
           --offsetter-header-bottom so elements below know where to start.
        */
        .demo-header {
            position: fixed;
            top: 0;
            inset-inline: 0;
            z-index: 200;
        }

        /* ── Layer: promo-banner ─────────────────────────────────────── */
        /*
           Promo banner is sticky, sits directly under the header.
           It uses --offsetter-promo-banner-top which equals --offsetter-header-bottom.
           Because both variables describe the same value, either works —
           but -top is the canonical choice for a layer's own positioning.
        */
        .demo-promo {
            position: sticky;
            top: var(--offsetter-promo-banner-top, 0px); /* = header-bottom */
            z-index: 150;
        }

        /* ── Layer: pill-nav ─────────────────────────────────────────── */
        /*
           pill-nav sticks under header + promo-banner.
           It uses its own -top variable, which Offsetter computes as the
           sum of all non-excluded layers above it.
        */
        .demo-pill-nav {
            position: sticky;
            top: var(--offsetter-pill-nav-top, 0px);
            z-index: 100;
        }

        /* ── Consumer: product gallery ───────────────────────────────── */
        /*
           The gallery sticks only under the header, NOT under pill-nav.
           It deliberately uses --offsetter-header-bottom rather than
           --offsetter-total. This is the power of per-layer variables —
           each consumer picks exactly what it needs.
        */
        .demo-gallery {
            position: sticky;
            top: var(--offsetter-header-bottom, 0px);
        }

        /* ── Consumer: anchor sections ───────────────────────────────── */
        /*
           Anchor sections receive scroll-margin-top so that hash navigation
           and scrollIntoView({ block: 'start' }) land below the sticky stack.
           Uses the global --offsetter-scroll-margin which already includes
           the spy buffer.
        */
        [data-offsetter-anchor] {
            scroll-margin-top: var(--offsetter-scroll-margin, 80px);
        }

        /* ── Body top padding ────────────────────────────────────────── */
        /*
           The fixed header removes itself from flow. Without compensation,
           the first content element hides behind it.
           --offsetter-header-bottom gives the exact height needed.
        */
        body {
            padding-top: var(--offsetter-header-bottom, 56px);
        }

        /* ── Mobile bottom bar ───────────────────────────────────────── */
        /*
           The bottom bar is registered with data-offsetter-exclude.
           Its height is exposed as --offsetter-bottom-bar-height but does
           not affect --offsetter-total (it is below content, not above).
           We apply padding-bottom to body so content is never hidden behind it.
        */
        .demo-bottom-bar {
            position: fixed;
            bottom: 0;
            inset-inline: 0;
            transform: translateY(100%);
            transition: transform 0.3s ease;
            z-index: 200;
        }

        .demo-bottom-bar.is-visible {
            transform: translateY(0);
        }

        body.has-bottom-bar {
            padding-bottom: var(--offsetter-bottom-bar-height, 0px);
        }

        /* ── Pill nav pills ──────────────────────────────────────────── */
        .pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 18px;
            border-radius: 999px;
            background: #f0f0f0;
            color: #555;
            text-decoration: none;
            font-weight: 500;
            font-size: .875rem;
            white-space: nowrap;
            border: 2px solid transparent;
            transition: background .2s, color .2s;
        }

        .pill:hover { background: #e0e0e0; color: #111; }

        .pill.active {
            background: #0d6efd;
            color: #fff;
        }

        /* ── Section visual separation ───────────────────────────────── */
        .demo-section {
            min-height: 60vh;
            padding-block: 3rem;
        }

    </style>
</head>

<body>

    <!-- ═══════════════════════════════════════════════════════════════════
         LAYER 0 — HEADER  (position: fixed)
         data-offsetter-role="header"
         Offsetter measures: --offsetter-header-height, -top, -bottom
         ═══════════════════════════════════════════════════════════════════ -->

    <header class="demo-header bg-primary text-white" data-offsetter-role="header">
        <div class="container d-flex align-items-center justify-content-between" style="height:56px">
            <strong>MyStore</strong>
            <nav class="d-flex gap-3">
                <a href="#" class="text-white text-decoration-none small">Shop</a>
                <a href="#" class="text-white text-decoration-none small">About</a>
                <a href="#" class="text-white text-decoration-none small">Cart (0)</a>
            </nav>
        </div>
    </header>


    <!-- ═══════════════════════════════════════════════════════════════════
         LAYER 1 — PROMO BANNER  (position: sticky)
         data-offsetter-role="promo-banner"
         Sticks at: var(--offsetter-promo-banner-top)  ← = header-bottom
         Offsetter measures: --offsetter-promo-banner-height, -top, -bottom
         ═══════════════════════════════════════════════════════════════════ -->

    <div class="demo-promo bg-warning text-dark text-center py-2 small fw-semibold"
         data-offsetter-role="promo-banner">
        🎉 Free shipping on orders over $49 — today only!
        <button class="btn btn-sm btn-link text-dark p-0 ms-2"
                onclick="this.closest('[data-offsetter-role]').style.display='none'; Offsetter.recalculate();">
            ✕ Dismiss
        </button>
    </div>

    <!--
        NOTE ON DISMISS:
        When the promo banner is hidden its offsetHeight becomes 0.
        Offsetter's ResizeObserver will catch this and automatically
        recompute all variables — pill-nav and gallery will shift up.

        If you remove the element from the DOM entirely, MutationObserver
        will unregister it and recalculate as well.

        If you use display:none with a transition that ResizeObserver
        cannot detect, call Offsetter.recalculate() manually (as shown above).
    -->


    <!-- ═══════════════════════════════════════════════════════════════════
         LAYER 2 — PILL NAV  (position: sticky)
         data-offsetter-role="pill-nav"
         Sticks at: var(--offsetter-pill-nav-top)  ← = header + promo height
         Offsetter measures: --offsetter-pill-nav-height, -top, -bottom
         ═══════════════════════════════════════════════════════════════════ -->

    <nav class="demo-pill-nav border-bottom bg-body" data-offsetter-role="pill-nav"
         aria-label="Product sections">
        <div class="container d-flex gap-2 py-2 overflow-auto" style="scrollbar-width:none">
            <a class="pill active" href="#details"       data-target="details">       Details       </a>
            <a class="pill"        href="#specifications" data-target="specifications">Specifications </a>
            <a class="pill"        href="#reviews"        data-target="reviews">       Reviews        </a>
            <a class="pill"        href="#gallery"        data-target="gallery">       Gallery        </a>
        </div>
    </nav>


    <!-- ═══════════════════════════════════════════════════════════════════
         MAIN CONTENT
         ═══════════════════════════════════════════════════════════════════ -->

    <main class="container py-4">
        <div class="row g-4">


            <!-- ── Product image — sticky only under header, ignores pill-nav ── -->
            <!--
                Uses --offsetter-header-bottom, NOT --offsetter-total.
                The gallery should scroll alongside pill-nav, not be pinned under it.
                This is an intentional per-consumer choice made in CSS.
            -->
            <div class="col-lg-5">
                <div class="demo-gallery rounded-3 overflow-hidden" style="max-height: 400px;">
                    <img src="https://picsum.photos/seed/42/800/600"
                         class="img-fluid w-100 rounded-3"
                         alt="Product image">
                </div>
            </div>


            <!-- ── Details column ────────────────────────────────────────── -->
            <div class="col-lg-7">

                <!-- ── ANCHOR SECTION: Details ── -->
                <!--
                    data-offsetter-anchor activates scroll-margin-top via CSS.
                    No JS involvement needed — pure CSS contract.
                -->
                <section id="details" class="demo-section" data-offsetter-anchor data-spy-section>
                    <h2>Product Details</h2>
                    <p class="text-body-secondary">
                        AuraPhone Pro 2025 — titanium frame, 6.7" ProMotion OLED display,
                        A18 Bionic chip, triple 48MP camera. Starting at $749.
                    </p>
                    <p>
                        <strong>Why scroll-margin-top works here:</strong>
                        When you click "Details" in the pill nav, the browser scrolls
                        this section into view. Without scroll-margin-top the section
                        header would hide under the sticky stack. With
                        <code>scroll-margin-top: var(--offsetter-scroll-margin)</code>
                        it lands exactly at the right position — automatically.
                    </p>
                    <div class="alert alert-info">
                        <strong>Open DevTools and run:</strong>
                        <code>Offsetter.debug()</code> to inspect the live stack state.
                    </div>
                </section>


                <!-- ── ANCHOR SECTION: Specifications ── -->
                <section id="specifications" class="demo-section border-top" data-offsetter-anchor data-spy-section>
                    <h2>Specifications</h2>
                    <table class="table table-striped table-sm mt-3">
                        <tbody>
                            <tr><td class="fw-semibold">Display</td>    <td>6.7" Super Retina XDR, 120Hz ProMotion</td></tr>
                            <tr><td class="fw-semibold">Chip</td>       <td>A18 Bionic, 8-core GPU</td></tr>
                            <tr><td class="fw-semibold">RAM</td>        <td>12 GB LPDDR5</td></tr>
                            <tr><td class="fw-semibold">Storage</td>    <td>256 GB / 512 GB / 1 TB</td></tr>
                            <tr><td class="fw-semibold">Camera</td>     <td>48MP wide + 12MP ultra-wide + 12MP tele</td></tr>
                            <tr><td class="fw-semibold">Battery</td>    <td>Up to 28 h video playback</td></tr>
                            <tr><td class="fw-semibold">Connectivity</td><td>5G, Wi-Fi 7, Bluetooth 5.4, UWB, NFC</td></tr>
                            <tr><td class="fw-semibold">Protection</td> <td>IP68, 6 m / 30 min</td></tr>
                        </tbody>
                    </table>
                </section>


                <!-- ── ANCHOR SECTION: Reviews ── -->
                <section id="reviews" class="demo-section border-top" data-offsetter-anchor data-spy-section>
                    <h2>Customer Reviews</h2>
                    <div class="mb-3">
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <strong>⭐⭐⭐⭐⭐</strong>
                            <span class="fw-semibold">Incredible device</span>
                            <span class="text-secondary small">— Sarah K.</span>
                        </div>
                        <p class="text-body-secondary small">
                            Best phone I've owned. Camera is unreal, battery lasts two days.
                        </p>
                    </div>
                    <div class="mb-3">
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <strong>⭐⭐⭐⭐</strong>
                            <span class="fw-semibold">Great but pricey</span>
                            <span class="text-secondary small">— Marcus T.</span>
                        </div>
                        <p class="text-body-secondary small">
                            Performance is flawless. Would give 5 stars if the price were lower.
                        </p>
                    </div>
                </section>


                <!-- ── ANCHOR SECTION: Gallery ── -->
                <section id="gallery" class="demo-section border-top" data-offsetter-anchor data-spy-section>
                    <h2>Gallery</h2>
                    <div class="row g-2">
                        <div class="col-6"><img src="https://picsum.photos/seed/10/400/300" class="img-fluid rounded"></div>
                        <div class="col-6"><img src="https://picsum.photos/seed/20/400/300" class="img-fluid rounded"></div>
                        <div class="col-6"><img src="https://picsum.photos/seed/30/400/300" class="img-fluid rounded"></div>
                        <div class="col-6"><img src="https://picsum.photos/seed/40/400/300" class="img-fluid rounded"></div>
                    </div>
                </section>

            </div><!-- /col -->
        </div><!-- /row -->
    </main>


    <!-- ═══════════════════════════════════════════════════════════════════
         EXCLUDED LAYER — MOBILE BOTTOM BAR
         data-offsetter-role="bottom-bar" data-offsetter-exclude
         Its height IS measured and exposed as --offsetter-bottom-bar-height
         but it does NOT contribute to --offsetter-total or shift pill-nav.
         ═══════════════════════════════════════════════════════════════════ -->

    <div class="demo-bottom-bar border-top bg-body d-lg-none"
         data-offsetter-role="bottom-bar"
         data-offsetter-exclude
         id="demo-bottom-bar">
        <div class="container d-flex gap-2 py-2">
            <button class="btn btn-primary flex-grow-1">Add to Cart</button>
            <button class="btn btn-outline-secondary">♡</button>
        </div>
    </div>


    <!-- Scripts ──────────────────────────────────────────────────────────── -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" defer></script>

    <!--
        Load Offsetter before your application script.
        Place it at end of <body> (or use defer) — NOT async.
        async does not guarantee DOM order at execution time.
    -->
    <script src="Offsetter.js" defer></script>

    <script defer>
    /* ════════════════════════════════════════════════════════════════════
       DEMO APPLICATION SCRIPT
       Shows how JS widgets integrate with Offsetter via:
         a) Direct API call:  Offsetter.getScrollMargin()
         b) Event listener:   'offsetter:change'

       NOTE: this script uses defer — same as Offsetter.js above it.
       defer scripts execute in DOM order after parsing, before
       DOMContentLoaded. So by the time this runs, window.Offsetter
       is already defined and initialised.
       Do NOT use async — async does not guarantee execution order.
       ════════════════════════════════════════════════════════════════════ */

    document.addEventListener('DOMContentLoaded', () => {

        /* ── 1. Scroll-spy ──────────────────────────────────────────────
           Before Offsetter: hardcoded threshold like (top - 150).
           After Offsetter:  live value from Offsetter.getScrollMargin().

           We also subscribe to 'offsetter:change' so the threshold stays
           correct if the promo banner is dismissed or the header resizes.
        ─────────────────────────────────────────────────────────────────── */

        const pills    = document.querySelectorAll('.pill[data-target]');
        const sections = document.querySelectorAll('[data-spy-section]');

        // Cache threshold — updated via offsetter:change event.
        // Optional chaining guards against the rare case where Offsetter
        // failed to load; fallback 80px keeps scroll-spy functional.
        let spyThreshold = (window.Offsetter?.getScrollMargin?.()) ?? 80;

        document.addEventListener('offsetter:change', ({ detail }) => {
            spyThreshold = detail.scrollMargin;
        });

        // Smooth scroll on pill click — scrollIntoView respects scroll-margin-top
        // which is already set by CSS using var(--offsetter-scroll-margin).
        // No manual offset calculation needed in JS at all.
        pills.forEach(pill => {
            pill.addEventListener('click', e => {
                e.preventDefault();
                const target = document.getElementById(pill.dataset.target);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });

        // Scroll-spy: highlight the active pill as user scrolls.
        function updateActivePill() {
            let current = '';
            const scrollY = window.scrollY;

            sections.forEach(section => {
                const top = section.getBoundingClientRect().top + scrollY;
                // spyThreshold replaces every hardcoded value like -100, -150, -120.
                if (scrollY >= top - spyThreshold) {
                    current = section.id;
                }
            });

            pills.forEach(pill => {
                pill.classList.toggle('active', pill.dataset.target === current);
            });
        }

        window.addEventListener('scroll', updateActivePill, { passive: true });
        updateActivePill(); // Run once on load.


        /* ── 2. Mobile bottom bar ───────────────────────────────────────
           Show the bar once the user scrolls past the product details.
           Apply padding-bottom to body equal to bar height so content
           is never covered — height comes from --offsetter-bottom-bar-height
           which Offsetter writes automatically (data-offsetter-exclude).
        ─────────────────────────────────────────────────────────────────── */

        const bottomBar     = document.getElementById('demo-bottom-bar');
        const triggerTarget = document.querySelector('.col-lg-7'); // product details column

        function updateBottomBar() {
            if (!triggerTarget || !bottomBar) return;
            const triggerBottom = triggerTarget.getBoundingClientRect().top
                + window.scrollY
                + triggerTarget.offsetHeight;
            const isVisible = window.scrollY > triggerBottom;
            bottomBar.classList.toggle('is-visible', isVisible);
            document.body.classList.toggle('has-bottom-bar', isVisible);
        }

        window.addEventListener('scroll', updateBottomBar, { passive: true });
        updateBottomBar();


        /* ── 3. Offsetter.debug() reminder ─────────────────────────────
           In a real app you would remove this. It is here to make the
           demo self-documenting.
        ─────────────────────────────────────────────────────────────────── */

        console.info(
            '%c[Offsetter Demo]%c Open DevTools and run: %cOffsetter.debug()',
            'color:#0d6efd;font-weight:bold',
            'color:inherit',
            'color:#198754;font-family:monospace'
        );

    }); // DOMContentLoaded
    </script>

</body>
</html>

   ═══════════════════════════════════════════════════════════════════════════
   END OF EXAMPLE
   ═══════════════════════════════════════════════════════════════════════════ */
