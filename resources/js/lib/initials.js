const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'dr']);

/**
 * Up to two letters for an avatar tile: the first letters of the name's
 * first two words, skipping a leading title ("Dr. Joany Upton" → "JU",
 * "karrada.admin" → "KA"), or one letter for a single word. Latin
 * letters are upper-cased.
 */
export function initials(name) {
    let words = (name ?? '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (words.length > 2 && HONORIFICS.has(words[0].toLowerCase())) {
        words = words.slice(1);
    }

    return words
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase();
}
