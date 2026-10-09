/** The key the last method used for a payment is kept under, in this browser. */
export const PAYMENT_METHOD_STORAGE_KEY = 'lastPaymentMethod';

/** What a payment is taken by until someone on this device has chosen otherwise. */
export const DEFAULT_PAYMENT_METHOD = 'bank_transfer';

/** The browser's storage, or null where it is blocked (private mode, a locked-down browser). */
function browserStorage() {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

/**
 * The method a new payment starts on: the one last used on this device, so a
 * collector who takes cash all day is not put back on bank transfer every
 * time. A method that is no longer offered, or nothing remembered, falls back
 * to the default.
 *
 * @param {Array<{value: string}>} offered the methods the form offers
 */
export function rememberedPaymentMethod(offered, storage = browserStorage()) {
    try {
        const remembered = storage?.getItem(PAYMENT_METHOD_STORAGE_KEY);

        return offered.some((method) => method.value === remembered) ? remembered : DEFAULT_PAYMENT_METHOD;
    } catch {
        return DEFAULT_PAYMENT_METHOD;
    }
}

/** Remembers the method just chosen; where storage is blocked the choice simply is not kept. */
export function rememberPaymentMethod(method, storage = browserStorage()) {
    try {
        storage?.setItem(PAYMENT_METHOD_STORAGE_KEY, method);
    } catch {
        // The payment form works the same without the memory.
    }
}
