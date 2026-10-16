/**
 * The disconnection lists' small rules, kept apart from the pages so they
 * can be tested on their own.
 */

/** How long the confirm button must be held, in milliseconds. */
export const HOLD_DURATION = 3000;

/** How far along a hold is, 0 to 100, after `elapsed` milliseconds. */
export function holdProgress(elapsed, duration = HOLD_DURATION) {
    if (!(elapsed > 0)) {
        return 0;
    }

    return Math.min(100, Math.floor((elapsed / duration) * 100));
}

/** Western digits for any Arabic-Indic ones, so «١٢» reads as 12. */
export function westernDigits(text) {
    return String(text ?? '').replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

/**
 * Whether the number typed — the other way to confirm, for someone who
 * cannot hold the button — is exactly how many subscribers are confirmed.
 */
export function typedCountMatches(typed, count) {
    const digits = westernDigits(typed).trim();

    return /^\d+$/.test(digits) && Number(digits) === count && count > 0;
}

/**
 * How many SMS one text takes: an Arabic text fits 70 characters in one
 * message, or 67 in each part of a longer one; a Latin-only one 160 / 153.
 */
export function smsParts(text) {
    const length = [...String(text ?? '')].length;

    if (length === 0) {
        return 0;
    }

    const isGsm = /^[\x20-\x7E\n\r]*$/.test(text);
    const [single, multi] = isGsm ? [160, 153] : [70, 67];

    return length <= single ? 1 : Math.ceil(length / multi);
}

/** The wording with each `{placeholder}` filled in from `values`; unknown ones stay as written. */
export function fillPlaceholders(body, values) {
    return String(body ?? '').replace(/\{([^{}]+)\}/g, (match, name) => values[name.trim()] ?? match);
}

/** The sum of the fees, as a number with two decimals. */
export function totalFees(items) {
    return Math.round(items.reduce((total, item) => total + Number(item.fee || 0), 0) * 100) / 100;
}

/** The first error the server gave for any subscriber's fee (`fees.{id}`), if any. */
export function feeError(errors) {
    const key = Object.keys(errors ?? {}).find((name) => name.startsWith('fees'));

    return key ? errors[key] : undefined;
}

/** The tone a list item's status is shown in. */
export function itemTone(item) {
    if (item.status === 'disconnected') {
        return 'gray';
    }

    if (item.status === 'removed') {
        return 'blue';
    }

    return item.isOverdue ? 'red' : 'amber';
}

/** A new id for one send, so the same send arriving twice goes out once. */
export function operationId() {
    return globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = (Math.random() * 16) | 0;

        return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    });
}
