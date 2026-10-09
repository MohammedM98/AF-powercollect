/** The shortest search worth sending to the server (it answers nothing for less). */
export const MIN_SEARCH_LENGTH = 2;

/** Whether what was typed is long enough to look for subscribers. */
export function isSearchable(query) {
    return String(query ?? '').trim().length >= MIN_SEARCH_LENGTH;
}

/** The address that finds subscribers matching what was typed. */
export function subscriberSearchUrl(query) {
    return `/search/subscriptions?${new URLSearchParams({ q: String(query ?? '').trim() })}`;
}

/**
 * The palette's rows in the order the arrow keys walk them: the pages, then
 * the subscribers found. Each row keeps its kind so the list can tell them
 * apart.
 */
export function paletteItems(pages, subscribers) {
    return [
        ...pages.map((page) => ({ kind: 'page', key: `page:${page.href}`, ...page })),
        ...subscribers.map((subscriber) => ({ kind: 'subscriber', key: `subscriber:${subscriber.id}`, ...subscriber })),
    ];
}

/** The row an arrow key moves to from `index`, stopping at either end (-1 for an empty list). */
export function moveActive(index, step, count) {
    return count === 0 ? -1 : Math.min(Math.max(index + step, 0), count - 1);
}
