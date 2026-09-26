// Arabic with Levantine month names (أيلول) and Western digits, as used across the app.
const LOCALE = 'ar-SY-u-nu-latn';

const DAY_FORMAT = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const SHORT_DAY_FORMAT = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', timeZone: 'UTC' });
const RELATIVE_FORMAT = new Intl.RelativeTimeFormat('ar', { numeric: 'always' });

/** A calendar date (Y-m-d) at midnight UTC, so formatting never shifts it by a day. */
function calendarDate(day) {
    return new Date(`${day}T00:00:00Z`);
}

/** The local calendar date (Y-m-d) of a moment. */
export function localDay(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "السبت، 26 أيلول" for a Y-m-d date. */
export function formatDayLabel(day) {
    return DAY_FORMAT.format(calendarDate(day));
}

/** "26 أيلول" for a Y-m-d date. */
export function formatShortDay(day) {
    return SHORT_DAY_FORMAT.format(calendarDate(day));
}

/** "5:24 م" for a 24-hour "17:24" wall-clock time, as the server recorded it. */
export function formatClock(time) {
    const [hours, minutes] = time.split(':').map(Number);

    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'ص' : 'م'}`;
}

/** "قبل 5 ساعات" / "قبل 2 يوم" for an ISO timestamp, or "—" when there is none. */
export function timeAgo(timestamp, now = new Date()) {
    if (!timestamp) {
        return '—';
    }

    // Always in the past: a clock slightly ahead of the viewer's still reads "a minute ago".
    const minutes = Math.min(Math.round((new Date(timestamp) - now) / 60000), -1);

    if (Math.abs(minutes) < 60) {
        return RELATIVE_FORMAT.format(minutes, 'minute');
    }
    if (Math.abs(minutes) < 60 * 24) {
        return RELATIVE_FORMAT.format(Math.round(minutes / 60), 'hour');
    }

    return RELATIVE_FORMAT.format(Math.round(minutes / (60 * 24)), 'day');
}

/**
 * When something happened, as short as a list needs it: "اليوم 10:24 ص",
 * "أمس", or "20/09", for the server's "Y-m-d H:i" wall-clock time.
 */
export function formatActivityTime(dateTime, now = new Date()) {
    const [day, time = '00:00'] = dateTime.split(' ');
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (day === localDay(now)) {
        return `اليوم ${formatClock(time)}`;
    }

    if (day === localDay(yesterday)) {
        return 'أمس';
    }

    const [, month, date] = day.split('-');

    return `${date}/${month}`;
}
