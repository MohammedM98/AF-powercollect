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

/** Keep employees with waiting boxes first, and direct payments last. */
export function groupFinancialBoxes(boxes) {
    const groups = new Map();
    boxes.forEach((box) => {
        const key = box.user ? String(box.user.id) : 'direct';
        if (!groups.has(key)) {
            groups.set(key, { key, name: boxPersonName(box), boxes: [] });
        }
        groups.get(key).boxes.push(box);
    });
    const waiting = (group) => group.boxes.filter((box) => box.status === 'pending').length;
    return [...groups.values()].sort((a, b) => (a.key === 'direct') - (b.key === 'direct') || waiting(b) - waiting(a) || a.name.localeCompare(b.name, 'ar'));
}

export function financialBoxChecks(box) {
    const entries = activeBoxEntries(box);
    const labels = [box.type === 'clearing' ? 'مقبولة' : 'مؤكدة', 'بانتظار المراجعة', box.type === 'clearing' ? 'مرفوضة' : 'غير موجودة'];
    return ['confirmed', 'pending', 'rejected'].map((status, index) => ({
        color: ['bg-emerald-500', 'bg-amber-500', 'bg-brand-500'][index],
        label: labels[index],
        count: entries.filter((entry) => status === 'rejected' ? ['rejected', 'missing'].includes(entry.status) : entry.status === status).length,
    }));
}
