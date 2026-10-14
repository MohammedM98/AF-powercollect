/**
 * The steps a weekly closing goes through, in order, as the page's
 * progress bar names them: the branch reviews the collectors' boxes, closes
 * the week, its collectors confirm their boxes in it, the branch sends it to
 * audit, and audit answers.
 */
export const WEEKLY_STEPS = [
    { key: 'review', label: 'مراجعة الصناديق', hint: 'الأسبوع جارٍ والصناديق تُجمع' },
    { key: 'lock', label: 'تثبيت الإغلاق', hint: 'يراجع مدير الفرع الصناديق ويغلق الأسبوع' },
    { key: 'confirm', label: 'تأكيد المحصّلين', hint: 'يؤكد كل محصّل صناديقه في الأسبوع' },
    { key: 'submit', label: 'الإرسال للتدقيق', hint: 'يرسل الفرع الأسبوع إلى قسم التدقيق' },
    { key: 'audit', label: 'رد التدقيق', hint: 'يصل رد قسم التدقيق لاحقًا' },
];

/** What a week waiting on each step shows as its status: a label and a tone. */
export const WEEKLY_STATUSES = {
    review: ['الأسبوع جارٍ', 'blue'],
    lock: ['بانتظار إغلاق الفرع', 'amber'],
    confirm: ['بانتظار تأكيد المحصّلين', 'amber'],
    submit: ['جاهز للإرسال للتدقيق', 'blue'],
    audit: ['مُرسل · بانتظار رد التدقيق', 'gray'],
    done: ['قبله التدقيق', 'green'],
};

/**
 * Each step's state for a week waiting on `step`: `done` before it,
 * `current` on it and `upcoming` after; every step is done once audit
 * accepted the week (`done`).
 */
export function weeklyStepStates(step) {
    const current = step === 'done' ? WEEKLY_STEPS.length : WEEKLY_STEPS.findIndex((item) => item.key === step);

    return WEEKLY_STEPS.map((item, index) => ({ ...item, state: index < current ? 'done' : index === current ? 'current' : 'upcoming' }));
}

/** How far along the steps the week is, from 0 to 100. */
export function weeklyProgress(step) {
    const done = weeklyStepStates(step).filter((item) => item.state === 'done').length;

    return Math.round((done / WEEKLY_STEPS.length) * 100);
}
