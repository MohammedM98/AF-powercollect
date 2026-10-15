/**
 * Whether a page's own window (a modal or a dialog) is open, so the bar's
 * shortcuts stay out of its way. The bar's own windows (search, keys, the
 * phone menu) carry data-top-bar-layer and do not count.
 */
export function pageWindowOpen() {
    return Boolean(document.querySelector('.modal-scroll, [aria-modal="true"]:not([data-top-bar-layer])'));
}
