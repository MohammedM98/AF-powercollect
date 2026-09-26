/**
 * The logic behind a row's "More" menu (RowMoreMenu), kept apart from
 * React so it can be tested on its own.
 *
 * A menu is a list of groups, `{ title, items }`. An item is
 * `{ key, label, icon, shortcut?, keywords?, disabled?, disabledLabel?,
 * disabledReason?, onSelect? | href?, download?, children?, hint? }`;
 * `children` makes it open a submenu of further items instead of acting
 * itself, and a child's `hint` (e.g. "PDF") is listed on its parent.
 */

export const RECENT_TITLE = 'آخر استخدام';

/**
 * Folds the spellings people mix up when typing Arabic (أ إ آ → ا, ة → ه,
 * ى → ي) and letter case, one character for one character so positions in
 * the result still line up with the original text.
 */
export function foldSearchText(text) {
    return Array.from(String(text ?? ''))
        .map((character) => {
            if ('أإآ'.includes(character)) {
                return 'ا';
            }

            if (character === 'ة') {
                return 'ه';
            }

            if (character === 'ى') {
                return 'ي';
            }

            const lower = character.toLowerCase();

            return lower.length === character.length ? lower : character;
        })
        .join('');
}

/** Where `query` appears in `label`, as [start, end), or null. */
export function matchRange(label, query) {
    const needle = foldSearchText(query).trim();

    if (!needle) {
        return null;
    }

    const start = foldSearchText(label).indexOf(needle);

    return start === -1 ? null : [start, start + needle.length];
}

/** Whether an item answers to the query: by its label, its keywords, or a submenu entry's label. */
function itemMatches(item, query) {
    const needle = foldSearchText(query).trim();
    const haystacks = [item.label, ...(item.keywords ?? []), ...(item.children ?? []).map((child) => child.label)];

    return haystacks.some((text) => foldSearchText(text).includes(needle));
}

/** Every item of the menu, submenu entries included, with the item it sits under. */
export function allItems(groups) {
    return groups.flatMap((group) =>
        group.items.flatMap((item) => [{ item, parent: null }, ...(item.children ?? []).map((child) => ({ item: child, parent: item }))]),
    );
}

/**
 * The sections the menu shows, each `{ title, items }`. Without a query:
 * the action used last (if it can still be used), then the groups. With a
 * query: one section of the matching items.
 */
export function menuSections(groups, query = '', recentKey = null) {
    if (foldSearchText(query).trim()) {
        const matches = groups.flatMap((group) => group.items).filter((item) => itemMatches(item, query));

        return matches.length ? [{ title: `نتائج "${query.trim()}"`, items: matches }] : [];
    }

    const sections = groups.filter((group) => group.items.length > 0).map((group) => ({ title: group.title, items: group.items }));
    const recent = recentKey ? allItems(groups).find(({ item }) => item.key === recentKey) : null;

    if (recent && !recent.item.disabled && !recent.item.children) {
        return [{ title: RECENT_TITLE, items: [recent.item] }, ...sections];
    }

    return sections;
}

/**
 * The usable item whose shortcut letter matches a key press, looked up by
 * the physical key (`event.code`, e.g. "KeyV") so it works whatever
 * keyboard language is active. Submenu entries count too.
 */
export function itemForShortcut(groups, code) {
    const letter = /^Key([A-Z])$/.exec(code ?? '')?.[1];

    if (!letter) {
        return null;
    }

    return allItems(groups).find(({ item }) => item.shortcut === letter && !item.disabled && !item.children) ?? null;
}
