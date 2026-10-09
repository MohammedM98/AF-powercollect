export function dateKey(date) {
    return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function parseDateInput(text, type = 'date') {
    if (!text.trim()) return '';
    const normalized = text.trim().replace(/^(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1').replace(' ', 'T');
    const pattern = type === 'datetime-local' ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/ : /^\d{4}-\d{2}-\d{2}$/;
    if (!pattern.test(normalized)) return null;
    if (Number(normalized.slice(0, 4)) < 1) return null;
    const date = new Date(`${normalized.slice(0, 10)}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || dateKey(date) !== normalized.slice(0, 10)) return null;
    if (type === 'datetime-local' && (Number(normalized.slice(11, 13)) > 23 || Number(normalized.slice(14, 16)) > 59 || Number(normalized.slice(17, 19) || 0) > 59)) return null;
    return normalized;
}

export function displayDate(value) {
    if (!value) return '';
    return `${value.slice(0, 10).split('-').reverse().join('/')}${value.includes('T') ? ` ${value.slice(11)}` : ''}`;
}

export function inDateBounds(value, min, max) {
    return (!min || value >= min) && (!max || value <= max);
}

export function calendarDays(month) {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return Array.from({ length: 42 }, () => { const key = dateKey(date); date.setUTCDate(date.getUTCDate() + 1); return key; });
}

export function shiftMonth(month, delta) {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    return dateKey(date).slice(0, 7);
}
