/**
 * The color of each subscriber status, the same on every screen (the
 * table's pill and avatar dot, the form, the financial log, branch
 * performance): active is green, suspended amber, and disconnected red —
 * the status collectors most need to spot.
 */
export const SUBSCRIBER_STATUS_TONES = {
    active: 'green',
    suspended: 'amber',
    disconnected: 'red',
};

/** The dot drawn for each tone: bright enough to read on light and dark surfaces alike. */
export const TONE_DOT_CLASSES = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    gray: 'bg-gray-400',
};
