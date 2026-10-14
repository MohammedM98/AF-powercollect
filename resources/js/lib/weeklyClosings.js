/**
 * The steps a weekly closing goes through, in order, as the page's
 * progress bar names them: the collectors' boxes are closed through the
 * week, the branch confirms the week and sends it to audit in one step,
 * audit reviews it, and audit answers.
 */
export const WEEKLY_STEPS = [
    { key: 'review', label: 'إغلاق الصناديق', hint: 'تُغلق صناديق المحصّلين خلال الأسبوع' },
    { key: 'confirm', label: 'التأكيد والإرسال', hint: 'يراجع المدير ملخص الصناديق ويؤكد الأسبوع ويرسله' },
    { key: 'audit', label: 'قسم التدقيق', hint: 'الأسبوع عند قسم التدقيق' },
    { key: 'answered', label: 'رد التدقيق', hint: 'ردّ قسم التدقيق على الأسبوع' },
];

/** What a week waiting on each step shows as its status: a label and a tone. */
export const WEEKLY_STATUSES = {
    review: ['الأسبوع جارٍ', 'blue'],
    confirm: ['بانتظار التأكيد والإرسال', 'amber'],
    audit: ['مُرسل · بانتظار رد التدقيق', 'gray'],
    answered: ['ردّ التدقيق', 'green'],
};

/**
 * Each step's state for a week waiting on `step`: `done` before it,
 * `current` on it and `upcoming` after; audit's answer is the last step,
 * so once it came every step is done.
 */
export function weeklyStepStates(step) {
    const current = step === 'answered' ? WEEKLY_STEPS.length : WEEKLY_STEPS.findIndex((item) => item.key === step);

    return WEEKLY_STEPS.map((item, index) => ({ ...item, state: index < current ? 'done' : index === current ? 'current' : 'upcoming' }));
}

/** How far along the steps the week is, from 0 to 100. */
export function weeklyProgress(step) {
    const done = weeklyStepStates(step).filter((item) => item.state === 'done').length;

    return Math.round((done / WEEKLY_STEPS.length) * 100);
}
