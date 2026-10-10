import { useState } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import InputError from '@/Components/InputError';
import Icon from '@/Components/Icon';
import ConfirmDialog from '@/Components/ConfirmDialog';
import { WEEK_DAYS, formatWeekDay, weekDayName } from '@/lib/weekDays';
import { businessDayHours, shortDate, weekOf } from '@/lib/closing';
import './ReadingSchedule.css';

const MODES = {
    automatic: { label: 'تلقائي', icon: 'clock', value: true },
    manual: { label: 'يدوي', icon: 'lock', value: false },
};
const QUICK_CUTOFFS = [
    ['00:00', 'منتصف الليل'],
    ['18:00', '6 مساءً'],
    ['20:00', '8 مساءً'],
    ['22:00', '10 مساءً'],
];

function PanelTitle({ icon, children }) {
    return (
        <h2>
            <span className="rs-panel-icon">
                <Icon name={icon} />
            </span>
            {children}
        </h2>
    );
}

/**
 * The closing schedule, set by hand: when the business day closes (later
 * payments count for the next day), which day starts the week, whether
 * each day's closings open by themselves after the cut-off or only when
 * opened here, and opening a closed day's closings now.
 */
export default function ClosingSchedule({ setting, today, latestDay, businessTimezone }) {
    const { data, setData, put, processing, errors, isDirty, resetAndClearErrors, setDefaults } = useForm({
        cutoff_time: setting.cutoff_time,
        week_starts_on: setting.week_starts_on,
        auto_open: setting.auto_open,
    });
    const [confirmingSave, setConfirmingSave] = useState(false);
    const [openDate, setOpenDate] = useState(latestDay);
    const [opening, setOpening] = useState(false);
    const [openErrors, setOpenErrors] = useState({});
    const cutoffError =
        data.cutoff_time !== '00:00' && data.cutoff_time < '12:00' ? 'اختر منتصف الليل (00:00) أو وقتًا من الظهر (12:00) فما بعد.' : null;
    const week = weekOf(today, data.week_starts_on);
    const cutoffLabel = data.cutoff_time === '00:00' ? 'منتصف الليل' : data.cutoff_time;

    function submit(event) {
        event.preventDefault();
        if (isDirty && !cutoffError) {
            setConfirmingSave(true);
        }
    }

    function save() {
        setConfirmingSave(false);
        put('/settings/closing-schedule', { preserveScroll: true, onSuccess: () => setDefaults() });
    }

    function openDay() {
        router.post(
            '/settings/closing-schedule/open',
            { date: openDate },
            {
                preserveScroll: true,
                onStart: () => setOpening(true),
                onFinish: () => setOpening(false),
                onError: (errors) => setOpenErrors(errors),
                onSuccess: () => setOpenErrors({}),
            },
        );
    }

    const confirmation = [
        `يُغلق يوم العمل عند ${cutoffLabel} بتوقيت الشركة؛ ${data.cutoff_time === '00:00' ? 'كل دفعات اليوم تُحسب له.' : `الدفعات بعد ${data.cutoff_time} تُحسب لليوم التالي.`}`,
        `يبدأ الأسبوع يوم ${WEEK_DAYS.find((day) => day.value === data.week_starts_on).label}.`,
        data.auto_open ? 'تُفتح كشوف كل الفروع تلقائيًا بعد وقت القطع.' : 'لا تُفتح الكشوف تلقائيًا؛ تُفتح من هذه الصفحة أو عند فتح الفرع ليومه.',
        'الكشوف المرسلة والمعتمدة تحتفظ بدفعاتها كما هي.',
    ].join(' ');

    return (
        <SettingsLayout>
            <Head title="مواعيد الإغلاق" />
            <form onSubmit={submit} className="reading-schedule" dir="rtl">
                <div className="rs-heading">
                    <h1>مواعيد الإغلاق</h1>
                    <p>متى ينتهي يوم العمل في كل الفروع، ومتى يبدأ الأسبوع، وكيف تُفتح كشوف الإغلاق اليومية.</p>
                </div>

                <section className={`rs-status ${data.auto_open ? 'is-open' : ''}`} aria-live="polite">
                    <span className="rs-status-dot" aria-hidden="true">
                        <i />
                    </span>
                    <div className="rs-status-copy">
                        <b>{data.auto_open ? 'الكشوف تُفتح تلقائيًا' : 'الكشوف تُفتح يدويًا'}</b>
                        <p>
                            {data.auto_open
                                ? `تُفتح كشوف كل الفروع خلال ربع ساعة من وقت القطع (${cutoffLabel}).`
                                : 'تُفتح من هذه الصفحة، أو حين يفتح الفرع يومه في صفحة الإغلاق.'}
                            {isDirty && <span className="rs-preview-note"> · معاينة قبل الحفظ</span>}
                        </p>
                    </div>
                    <div className="rs-modes" role="group" aria-label="فتح الكشوف">
                        {Object.entries(MODES).map(([key, mode]) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={data.auto_open === mode.value}
                                onClick={() => setData('auto_open', mode.value)}
                                disabled={processing}
                            >
                                <Icon name={mode.icon} />
                                {mode.label}
                            </button>
                        ))}
                    </div>
                </section>
                <InputError message={errors.auto_open} className="mt-2" />

                <div className="rs-grid">
                    <div className="rs-column">
                        <section className="rs-panel">
                            <PanelTitle icon="clock">وقت القطع</PanelTitle>
                            <p>يُغلق يوم العمل عند هذه الساعة بتوقيت الشركة. الدفعات المسجّلة بعدها تُحسب لليوم التالي وتدخل في كشفه.</p>
                            <div className="rs-quick">
                                {QUICK_CUTOFFS.map(([time, label]) => (
                                    <button
                                        key={time}
                                        type="button"
                                        disabled={processing}
                                        aria-pressed={data.cutoff_time === time}
                                        onClick={() => setData('cutoff_time', time)}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className="rs-hours">
                                <div className="rs-time-fields">
                                    <div className="rs-time-field">
                                        <label htmlFor="cutoff-time">يُغلق اليوم الساعة</label>
                                        <input
                                            id="cutoff-time"
                                            type="time"
                                            step="60"
                                            required
                                            value={data.cutoff_time}
                                            disabled={processing}
                                            onInput={(event) => setData('cutoff_time', event.currentTarget.value)}
                                            aria-invalid={!!(errors.cutoff_time || cutoffError)}
                                        />
                                        <InputError message={errors.cutoff_time || cutoffError} />
                                    </div>
                                </div>
                                <span className="rs-timezone">
                                    يوم العمل: {businessDayHours(data.cutoff_time)} · بتوقيت الشركة · {businessTimezone}
                                </span>
                            </div>
                        </section>

                        <section className="rs-panel">
                            <PanelTitle icon="calendar">بداية الأسبوع</PanelTitle>
                            <p>يبدأ الإغلاق الأسبوعي في هذا اليوم ويستمر سبعة أيام.</p>
                            <div className="rs-days" role="radiogroup" aria-label="بداية الأسبوع">
                                {WEEK_DAYS.map((day) => (
                                    <label key={day.value} className={`rs-day ${data.week_starts_on === day.value ? 'is-selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="week_starts_on"
                                            checked={data.week_starts_on === day.value}
                                            disabled={processing}
                                            onChange={() => setData('week_starts_on', day.value)}
                                            aria-label={day.label}
                                        />
                                        <span className="rs-check">
                                            <Icon name="check" strokeWidth={3} />
                                        </span>
                                        <b>{day.label}</b>
                                        <small>{day.value === setting.week_starts_on ? 'الحالي' : ' '}</small>
                                    </label>
                                ))}
                            </div>
                            <InputError message={errors.week_starts_on} className="mt-2" />
                        </section>
                    </div>

                    <div className="rs-column">
                        <section className="rs-panel">
                            <PanelTitle icon="eye">معاينة الأسبوع الحالي</PanelTitle>
                            <p>
                                من {weekDayName(week[0])} {shortDate(week[0])} إلى {weekDayName(week[6])} {shortDate(week[6])}
                                {isDirty ? ' · حسب الإعدادات الجديدة' : ''}
                            </p>
                            <div className="rs-week" style={{ '--week-days': 7 }}>
                                {week.map((day) => (
                                    <div key={day} className={`rs-week-day ${day <= latestDay ? 'is-open' : ''} ${day === today ? 'is-today' : ''}`}>
                                        <b>{weekDayName(day)}</b>
                                        <span className="rs-date">{shortDate(day)}</span>
                                        {day === today && <span className="rs-tag rs-today-tag">اليوم</span>}
                                        <span className={`rs-tag ${day <= latestDay ? 'rs-open-tag' : 'rs-closed-tag'}`}>
                                            {day <= latestDay ? 'أُغلق' : day === today ? 'جارٍ' : 'لم يبدأ'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rs-panel">
                            <PanelTitle icon="list">فتح كشوف يوم يدويًا</PanelTitle>
                            <p>
                                يفتح كشف الإغلاق اليومي لكل الفروع النشطة لليوم المختار مع دفعاته، حتى لو كان الفتح التلقائي متوقفًا. لا يُنشئ كشفًا
                                ثانيًا ليوم مفتوح.
                            </p>
                            <div className="rs-time-fields">
                                <div className="rs-time-field">
                                    <label htmlFor="open-date">اليوم</label>
                                    <input
                                        id="open-date"
                                        type="date"
                                        max={latestDay}
                                        value={openDate}
                                        onChange={(event) => setOpenDate(event.target.value)}
                                    />
                                    <InputError message={openErrors.date} />
                                </div>
                            </div>
                            <div className="rs-quick">
                                <button type="button" disabled={opening || !openDate} onClick={openDay}>
                                    {opening ? 'جارٍ الفتح...' : `فتح كشوف ${openDate ? formatWeekDay(openDate) : ''}`}
                                </button>
                            </div>
                        </section>

                        {setting.updatedByName && (
                            <section className="rs-panel">
                                <div className="rs-who">
                                    <span className="rs-avatar">
                                        {setting.updatedByName
                                            .split(' ')
                                            .slice(0, 2)
                                            .map((name) => name[0])
                                            .join('')}
                                    </span>
                                    <span>
                                        آخر تعديل: {setting.updatedByName} · <bdi>{setting.updatedAt}</bdi>
                                    </span>
                                </div>
                            </section>
                        )}
                    </div>
                </div>

                {isDirty && (
                    <div className="rs-savebar">
                        <span role="status">لديك تغييرات غير محفوظة</span>
                        <button type="button" className="rs-revert" disabled={processing} onClick={() => resetAndClearErrors()}>
                            تراجع
                        </button>
                        <button type="submit" className="rs-save" disabled={processing || !!cutoffError}>
                            {processing ? 'جارٍ الحفظ...' : 'حفظ'}
                        </button>
                    </div>
                )}
            </form>
            <ConfirmDialog
                show={confirmingSave}
                onConfirm={save}
                onCancel={() => setConfirmingSave(false)}
                title="حفظ مواعيد الإغلاق؟"
                message={confirmation}
                confirmLabel="نعم، احفظ"
                cancelLabel="مراجعة الإعدادات"
                icon="clock"
            />
        </SettingsLayout>
    );
}
