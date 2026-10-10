/**
 * The closing page's calculations and wording: the cash count, the
 * difference from the expected cash, the review steps and the month names.
 */

const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

/** 1800 → "1,800.00": closings always show two decimals. */
export function closingMoney(amount) {
    return Number(amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * The shekels the counted notes and coins add up to: { '200': 4, '50': 1 } → 850.
 * `agorot` is the part of a shekel counted beyond them (55 → 0.55), added in
 * whole agorot so the sum has no floating-point drift.
 */
export function countedCash(denominations) {
    const agorot = Object.entries(denominations ?? {}).reduce(
        (sum, [value, count]) => sum + (value === 'agorot' ? 1 : Number(value) * 100) * (Number(count) || 0),
        0,
    );

    return agorot / 100;
}

/** Whether any note or coin has been counted. */
export function hasCount(denominations) {
    return Object.values(denominations ?? {}).some((count) => Number(count) > 0);
}

/**
 * The counted cash against the expected: `difference` is counted − expected
 * in shekels, negative for a shortage. `tone` is 'ok' when they match.
 */
export function cashCheck(counted, expected) {
    const difference = Math.round((Number(counted) - Number(expected)) * 100) / 100;

    if (difference === 0) {
        return { difference, tone: 'ok', label: '✓ مطابق للمتوقع' };
    }

    return { difference, tone: 'bad', label: `${difference < 0 ? 'نقص' : 'زيادة'} ${closingMoney(Math.abs(difference))} ₪` };
}

/** The status pill's class for a closing status. */
export function statusClass(status) {
    return { submitted: 'sent' }[status] ?? status;
}

/**
 * The four steps along the top of a daily closing — linking its payments,
 * counting and matching, the review, the approval — as 'done', 'cur'
 * (the one it is at), 'bad' (sent back) or ''.
 */
export function closingSteps(status) {
    const at = { draft: 1, returned: 1, submitted: 2, approved: 4 }[status] ?? 1;

    return [
        { label: 'ربط الدفعات', state: 'done' },
        { label: status === 'returned' ? 'معاد للتصحيح' : 'العدّ والمطابقة', state: status === 'returned' ? 'bad' : at > 1 ? 'done' : 'cur' },
        { label: 'مراجعة الفرع', state: at > 2 ? 'done' : at === 2 ? 'cur' : '' },
        { label: 'اعتماد إقفال الفرع', state: at > 3 ? 'done' : '' },
    ];
}

/** "2026-09-30" → "أيلول 2026". */
export function monthName(isoDate) {
    const [year, month] = isoDate.split('-');

    return `${MONTHS[Number(month) - 1]} ${year}`;
}

/** "2026-09-30" → "30/09", or with the year → "30/09/2026". */
export function shortDate(isoDate, withYear = false) {
    const [year, month, day] = isoDate.split('-');

    return withYear ? `${day}/${month}/${year}` : `${day}/${month}`;
}

/** The Y-m-d date `days` days from the given one. */
export function addDays(isoDate, days) {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
}

/** "1 دفعة", "2 دفعتان"… the count with the right Arabic word. */
export function paymentsCount(count) {
    return count === 1 ? '1 دفعة' : count === 2 ? 'دفعتان' : `${count} دفعات`;
}

/**
 * Which hours a business day covers with the given cut-off: the whole day
 * at midnight (00:00), otherwise from the cut-off the evening before.
 */
export function businessDayHours(cutoff) {
    return cutoff === '00:00' ? 'من بداية اليوم حتى منتصف الليل' : `من الساعة ${cutoff} في اليوم السابق حتى الساعة ${cutoff}`;
}

/** The first and last Y-m-d dates of the calendar month containing `isoDate`. */
export function monthOf(isoDate) {
    const [year, month] = isoDate.split('-').map(Number);
    const pad = (number) => String(number).padStart(2, '0');

    return [`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`];
}

/** The seven Y-m-d dates of the week containing `isoDate`, starting on weekday `startsOn` (0 = Sunday … 6 = Saturday). */
export function weekOf(isoDate, startsOn) {
    const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
    const first = addDays(isoDate, -((weekday - startsOn + 7) % 7));

    return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}
