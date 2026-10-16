/** The branch's dates and times and the name of each week, shared by the closing pages. */
export const dateTime = (value) => value ? new Intl.DateTimeFormat('ar-SY-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Gaza' }).format(new Date(value)) : '—';
export const branchClock = (value) => new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Asia/Gaza' }).format(new Date(value));
export const branchDate = (value) => new Intl.DateTimeFormat('ar-SY-u-nu-latn', { day: 'numeric', month: 'long', timeZone: 'Asia/Gaza' }).format(new Date(value));
export const periodRange = (period) => `${branchDate(period.coverage_from)} — ${branchDate(period.coverage_until)}`;
export function periodLabel(period) {
    if (!period) return '—';
    if (period.workflow_settings?.continuation) return 'تكملة الأسبوع';
    if (period.workflow_settings?.frequency === 'daily') return branchDate(period.coverage_from);
    const date = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(period.coverage_from)));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return `الأسبوع ${Math.ceil((((date - yearStart) / 86400000) + 1) / 7)}`;
}
