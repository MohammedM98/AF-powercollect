const currencyCodes = ['ILS', 'USD', 'JOD'];
const statusOrder = ['pending', 'open', 'received'];

export const activeBoxEntries = (box) => (box.payments ?? []).filter((entry) => !entry.transaction || entry.transaction.status === 'active');
export const boxPersonName = (box) => box.user?.name ?? 'الدفعات المباشرة';

/** Active entries only; currencies stay separate, including old foreign cash. */
export function financialBoxTotals(box) {
    if (!box.payments) {
        return Object.fromEntries(currencyCodes.map((currency) => [currency, Number(box.totals?.[currency] ?? 0)]));
    }

    const entries = activeBoxEntries(box);
    return Object.fromEntries(currencyCodes.map((currency) => [currency, entries.filter((entry) => entry.currency === currency).reduce((sum, entry) => sum + Number(entry.amount), 0)]));
}

export function financialBoxesTotals(boxes) {
    return boxes.reduce((totals, box) => {
        const amounts = financialBoxTotals(box);
        return Object.fromEntries(currencyCodes.map((currency) => [currency, totals[currency] + amounts[currency]]));
    }, { ILS: 0, USD: 0, JOD: 0 });
}

export function filterFinancialBoxes(boxes, { status = 'all', person = '', search = '' } = {}) {
    return boxes.filter((box) => (status === 'all' || box.status === status)
        && (!person || (person === 'direct' ? !box.user : String(box.user?.id) === person))
        && `${box.number} ${boxPersonName(box)}`.includes(search.trim()));
}

export function sortFinancialBoxes(boxes, { key = 'status', direction = 'asc' } = {}) {
    const values = {
        number: (box) => Number(box.number),
        total: (box) => financialBoxTotals(box).ILS,
        dates: (box) => new Date(box.closed_at ?? box.opened_at).getTime() || 0,
        status: (box) => statusOrder.indexOf(box.status),
    };
    const value = values[key] ?? values.status;
    return [...boxes].sort((a, b) => (value(a) - value(b)) * (direction === 'asc' ? 1 : -1)
        || statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || Number(a.number) - Number(b.number));
}

/**
 * A box's status as everyone sees it, with its pill tone: still collecting,
 * closed at the weekly cutoff and waiting for the branch, or closed.
 */
export const boxStatusLabels = {
    open: ['مفتوح', 'blue'],
    pending: ['بانتظار تأكيد الإغلاق', 'amber'],
    received: ['مُغلق', 'green'],
};

/**
 * An entry's status as everyone sees it, with its pill tone: in effect,
 * cancelled on the subscriber's statement, or a transfer or clearing found
 * wrong when it was checked. Confirming transfers and clearings is the
 * auditors' work, so an entry not yet checked simply stays in effect.
 * Takes an entry as the box pages send it (`transactionStatus`) or as the
 * branch's boxes do (`transaction.status`).
 */
export function entryStatus(entry) {
    if ((entry.transactionStatus ?? entry.transaction?.status ?? 'active') !== 'active') {
        return ['ملغاة', 'gray'];
    }
    if (entry.status === 'missing') {
        return ['غير موجودة في البنك', 'red'];
    }
    if (entry.status === 'rejected') {
        return ['مرفوضة', 'red'];
    }

    return ['سارية', 'green'];
}

/** Whether a transfer or clearing was found wrong when it was checked. */
export const isFlaggedEntry = (entry) => ['missing', 'rejected'].includes(entry.status);
