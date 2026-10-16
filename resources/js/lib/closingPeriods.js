/**
 * The branch's dates and times, and the name of each closing period,
 * shared by the closing pages. Times are the branch's own (Asia/Gaza).
 */
const TIME_ZONE = 'Asia/Gaza';

export const dateTime = (value) => (value ? new Intl.DateTimeFormat('ar-SY-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(value)) : '—');
export const branchClock = (value) => new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(value));
export const branchDate = (value) => new Intl.DateTimeFormat('ar-SY-u-nu-latn', { day: 'numeric', month: 'long', timeZone: TIME_ZONE }).format(new Date(value));
export const periodRange = (period) => `${branchDate(period.coverage_from)} — ${branchDate(period.coverage_until)}`;

/** The branch's wall-clock reading of a moment, held in a UTC date so its fields can be read and moved without the browser's zone. */
function wallClock(value) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(value)).map((part) => [part.type, part.value]));

    return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)));
}

/** The ISO number of the week a day falls in. */
function isoWeek(day) {
    const date = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));

    return Math.ceil(((date - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

/** When the branch week holding a wall-clock moment began: its first day at the cutoff time. */
function branchWeekStart(clock, startsOn, cutoff) {
    const [hours, minutes] = cutoff.split(':').map(Number);
    const start = new Date(clock);
    start.setUTCHours(hours, minutes, 0, 0);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() - startsOn + 7) % 7));
    if (start > clock) {
        start.setUTCDate(start.getUTCDate() - 7);
    }

    return start;
}

/**
 * A closing period's name, by the branch weeks it covers: «الأسبوع 42»
 * for a week, «تكملة الأسبوع 42» for what was left of a week closed early,
 * and both weeks' numbers when it runs into the next, as after an early
 * close: «تكملة الأسبوع 42 والأسبوع 43».
 */
export function periodLabel(period) {
    if (!period) {
        return '—';
    }
    const settings = period.workflow_settings ?? {};
    if (settings.continuation) {
        return 'تكملة الأسبوع';
    }
    if (settings.frequency === 'daily') {
        return branchDate(period.coverage_from);
    }
    const from = wallClock(period.coverage_from);
    if (settings.week_starts_on === undefined || !settings.cutoff_time || !period.coverage_until) {
        return `الأسبوع ${isoWeek(from)}`;
    }
    const first = branchWeekStart(from, Number(settings.week_starts_on), settings.cutoff_time);
    const last = branchWeekStart(wallClock(new Date(period.coverage_until).getTime() - 1000), Number(settings.week_starts_on), settings.cutoff_time);
    const [start, end] = [isoWeek(first), isoWeek(last)];
    const weeks = start === end ? `الأسبوع ${start}` : end === start + 1 ? `الأسبوع ${start} والأسبوع ${end}` : `الأسبوع ${start} حتى الأسبوع ${end}`;

    return `${first.getTime() === from.getTime() ? '' : 'تكملة '}${weeks}`;
}
