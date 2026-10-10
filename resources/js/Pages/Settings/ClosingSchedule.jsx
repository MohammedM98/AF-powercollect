import DatePicker from '@/Components/DatePicker';
import SelectInput from '@/Components/SelectInput';
import { useState } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import InputError from '@/Components/InputError';
import Icon from '@/Components/Icon';
import ConfirmDialog from '@/Components/ConfirmDialog';
import { WEEK_DAYS, formatWeekDay, weekDayName } from '@/lib/weekDays';
import { businessDayHours, monthName, monthOf, shortDate, weekOf } from '@/lib/closing';
import './ReadingSchedule.css';
import './ClosingSchedule.css';

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

/** What one kind of closing is, written out: a label and its answer for each row. */
function Facts({ rows }) {
    return (
        <dl className="cs-facts">
            {rows.map(([label, value]) => (
                <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                </div>
            ))}
        </dl>
    );
}

function TypeCard({ kind, href, tag, main = false, title, children, chips }) {
    return (
        <a href={href} className={`cs-card cs-kind-${kind} ${main ? 'cs-main' : ''}`}>
            <span className="cs-card-top">
                <span className={`cs-tag ${main ? 'is-main' : ''}`}>{tag}</span>
            </span>
            <b>{title}</b>
            <p>{children}</p>
            <span className="cs-chips">
                {chips.map(([label, tone]) => (
                    <span key={label} className={`cs-chip ${tone ? `is-${tone}` : ''}`}>
                        {label}
                    </span>
                ))}
            </span>
        </a>
    );
}

function TypeHeader({ tag, main = false, title, children }) {
    return (
        <header className="cs-type-head">
            <span className={`cs-tag ${main ? 'is-main' : ''}`} style={{ alignSelf: 'flex-start' }}>
                {tag}
            </span>
            <h2>{title}</h2>
            <p>{children}</p>
        </header>
    );
}

/**
 * The closing schedule, set by hand, one section for each kind of closing:
 * the weekly closing (the company's main one), the daily closing every
 * branch prepares for it, and the monthly closing, an extra approval of the
 * calendar month. Also when the business day closes, whether each day's
 * closings open by themselves, and opening a closed day's closings now.
 */
export default function ClosingSchedule({ setting, today, latestDay, businessTimezone }) {
    const { data, setData, put, processing, errors, isDirty, resetAndClearErrors, setDefaults } = useForm({
        cutoff_time: setting.cutoff_time,
        week_starts_on: setting.week_starts_on,
        auto_open: setting.auto_open,
        allow_early_close: setting.allow_early_close,
        allow_early_weekly_close: setting.allow_early_weekly_close,
        weekly_enabled: setting.weekly_enabled,
        weekly_closing_day: setting.weekly_closing_day,
        weekly_closing_time: setting.weekly_closing_time,
        weekly_timezone: setting.weekly_timezone,
        grace_period_minutes: setting.grace_period_minutes,
        auto_prepare: setting.auto_prepare,
        final_close: 'manual',
        reason: '',
    });
    const [confirmingSave, setConfirmingSave] = useState(false);
    const [openDate, setOpenDate] = useState(latestDay);
    const [opening, setOpening] = useState(false);
    const [openErrors, setOpenErrors] = useState({});
    const cutoffError =
        data.cutoff_time !== '00:00' && data.cutoff_time < '12:00' ? 'اختر منتصف الليل (00:00) أو وقتًا من الظهر (12:00) فما بعد.' : null;
    const week = weekOf(today, data.week_starts_on);
    const [monthFirst, monthLast] = monthOf(today);
    const cutoffLabel = data.cutoff_time === '00:00' ? 'منتصف الليل' : data.cutoff_time;
    const weeklyDay = WEEK_DAYS.find((day) => day.value === data.weekly_closing_day);
    const weeklyTimeLabel = !data.weekly_closing_time || data.weekly_closing_time === '00:00' ? 'منتصف الليل' : data.weekly_closing_time;
    const weeklyReady =
        data.grace_period_minutes > 0 ? `بعد وقت القطع بـ ${data.grace_period_minutes} دقيقة سماح` : 'فور وقت القطع';

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
        data.weekly_enabled
            ? `الإغلاق الأسبوعي: يُقطع كل ${weeklyDay?.label} الساعة ${weeklyTimeLabel}${data.grace_period_minutes > 0 ? ` مع ${data.grace_period_minutes} دقيقة سماح` : ''}، ويُعتمد يدويًا.`
            : 'الإغلاق الأسبوعي متوقف: لا يمكن اعتماد أي أسبوع.',
        data.allow_early_weekly_close
            ? 'يمكن إغلاق الأسبوع يدويًا قبل موعد قطعه؛ فتنتهي الفترة فورًا وتبدأ فترة جديدة في اللحظة نفسها.'
            : 'لا يُغلق الأسبوع قبل موعد قطعه.',
        `يُغلق يوم العمل عند ${cutoffLabel} بتوقيت الشركة؛ ${data.cutoff_time === '00:00' ? 'كل دفعات اليوم تُحسب له.' : `الدفعات بعد ${data.cutoff_time} تُحسب لليوم التالي.`}`,
        data.auto_open ? 'تُفتح كشوف كل الفروع تلقائيًا بعد وقت القطع.' : 'لا تُفتح الكشوف تلقائيًا؛ تُفتح من هذه الصفحة أو عند فتح الفرع ليومه.',
        data.allow_early_close
            ? 'يستطيع الفرع إقفال يومه يدويًا قبل وقت القطع؛ وبعد إرسال الكشف لا تُسجَّل دفعات للفرع حتى وقت القطع.'
            : 'لا يُقفل يوم الفرع إلا بعد وقت القطع.',
        `يبدأ أسبوع التقارير يوم ${WEEK_DAYS.find((day) => day.value === data.week_starts_on).label}.`,
        'الكشوف المرسلة والمعتمدة تحتفظ بدفعاتها كما هي.',
    ].join(' ');

    return (
        <SettingsLayout>
            <Head title="مواعيد الإغلاق" />
            <form onSubmit={submit} className="reading-schedule" dir="rtl">
                <div className="rs-heading">
                    <h1>مواعيد الإغلاق</h1>
                    <p>
                        الإغلاق الأساسي في الشركة أسبوعي. يعتمد على الكشوف اليومية التي يعدّها كل فرع، ويوجد إغلاق شهري إضافي. لكل نوع قسمه
                        أدناه.
                    </p>
                </div>

                <div className="cs-types" aria-label="أنواع الإغلاق">
                    <TypeCard
                        kind="weekly"
                        href="#weekly"
                        main
                        tag="الإغلاق الأساسي"
                        title="الإغلاق الأسبوعي"
                        chips={[
                            [data.weekly_enabled ? 'مفعّل' : 'متوقف', data.weekly_enabled ? 'on' : 'off'],
                            ['اعتماد يدوي'],
                            ...(data.allow_early_weekly_close ? [['الإغلاق المبكر مسموح', 'on']] : []),
                        ]}
                    >
                        {data.weekly_enabled
                            ? `فترة مالية لكل الفروع، تُقطع كل ${weeklyDay?.label} الساعة ${weeklyTimeLabel}.`
                            : 'لا يمكن اعتماد أسبوع حتى يُفعَّل الإغلاق الأسبوعي.'}
                    </TypeCard>
                    <TypeCard
                        kind="daily"
                        href="#daily"
                        tag="يغذّي الأسبوعي"
                        title="الإغلاق اليومي"
                        chips={[
                            [data.auto_open ? 'يُفتح تلقائيًا' : 'يُفتح يدويًا', data.auto_open ? 'on' : null],
                            [data.allow_early_close ? 'الإقفال المبكر مسموح' : 'بعد وقت القطع فقط', data.allow_early_close ? 'on' : null],
                        ]}
                    >
                        كشف لكل فرع عن يوم عمل واحد، يُغلق عند {cutoffLabel}. اعتماده شرط لإغلاق الأسبوع.
                    </TypeCard>
                    <TypeCard
                        kind="monthly"
                        href="#monthly"
                        tag="إغلاق إضافي"
                        title="الإغلاق الشهري"
                        chips={[['بلا إعدادات'], ['اعتماد المدقق']]}
                    >
                        اعتماد الشهر الميلادي كاملًا ({monthName(today)}). لا يُشترط لإغلاق الأسبوع.
                    </TypeCard>
                </div>

                <section id="weekly" className="cs-type cs-kind-weekly" aria-labelledby="weekly-title">
                    <TypeHeader tag="الإغلاق الأساسي" main title={<span id="weekly-title">الإغلاق الأسبوعي</span>}>
                        هو طريقة الإغلاق الرئيسية: يجمع كل الفروع في فترة مالية واحدة وينتهي بلقطة مالية ثابتة لا تُعدَّل.
                    </TypeHeader>
                    <Facts
                        rows={[
                            ['ما هو', 'فترة مالية أسبوعية للشركة كلها، تُبنى من الكشوف اليومية المعتمدة لجميع الفروع.'],
                            [
                                'الفترة',
                                <>
                                    تبدأ بعد قطع <b>{weeklyDay?.label}</b> السابق وتنتهي <b>{weeklyDay?.label}</b> الساعة <bdi>{weeklyTimeLabel}</bdi> ·{' '}
                                    <bdi>{data.weekly_timezone}</bdi>
                                </>,
                            ],
                            ['تصبح جاهزة', `${weeklyReady}، ثم ${data.auto_prepare ? 'تُعدّ تلقائيًا للمراجعة.' : 'يُعدّها المخوّل يدويًا للمراجعة.'}`],
                            ['شرط الإغلاق', 'أن يكون لكل فرع كشف يومي معتمد عن كل يوم فيه دفعات.'],
                            ['من يغلقها', 'من يملك صلاحية «إغلاق الفترات الأسبوعية نهائيًا» أو «تدقيق كشوف الإغلاق». الاعتماد النهائي يدوي دائمًا.'],
                            [
                                'الإغلاق المبكر',
                                data.allow_early_weekly_close
                                    ? 'مسموح لمن مُنح صلاحية «إغلاق الأسبوع قبل موعده»: يغلق الأسبوع الجاري قبل موعد قطعه متى اعتُمدت الإغلاقات اليومية. تنتهي الفترة عندها وتبدأ فترة جديدة في اللحظة نفسها.'
                                    : 'غير مسموح: لا يُغلق الأسبوع إلا بعد موعد قطعه.',
                            ],
                            ['بعد الإغلاق', 'تُحفظ لقطة مالية ثابتة. أي تصحيح لاحق يكون حركة موثّقة في الفترة المفتوحة، ثم يراجعها المدققون.'],
                        ]}
                    />
                    {!data.weekly_enabled && (
                        <div className="rs-hint rs-warn" role="status">
                            <Icon name="alert" />
                            <span>الإغلاق الأسبوعي متوقف: لا يمكن اعتماد أي أسبوع حتى تفعّله.</span>
                        </div>
                    )}
                    <div className="rs-grid cs-even">
                        <div className="rs-column">
                            <section className="rs-panel">
                                <PanelTitle icon="lock">إعدادات الإغلاق الأسبوعي</PanelTitle>
                                <p>تُطبَّق على الفترات الجديدة؛ الفترات المسجّلة تحتفظ بحدودها.</p>
                                <label className="cs-check">
                                    <input
                                        type="checkbox"
                                        checked={data.weekly_enabled}
                                        onChange={(e) => setData('weekly_enabled', e.target.checked)}
                                        disabled={processing}
                                    />
                                    تفعيل الإغلاق الأسبوعي
                                </label>
                                <div className="rs-time-fields">
                                    <div className="rs-time-field">
                                        <label htmlFor="weekly-day">يوم القطع الأسبوعي</label>
                                        <SelectInput
                                            id="weekly-day"
                                            value={data.weekly_closing_day}
                                            onChange={(e) => setData('weekly_closing_day', Number(e.target.value))}
                                            disabled={processing}
                                        >
                                            {WEEK_DAYS.map((day) => (
                                                <option key={day.value} value={day.value}>
                                                    {day.label}
                                                </option>
                                            ))}
                                        </SelectInput>
                                        <InputError message={errors.weekly_closing_day} />
                                    </div>
                                    <div className="rs-time-field">
                                        <label htmlFor="weekly-time">وقت القطع</label>
                                        <input
                                            id="weekly-time"
                                            type="time"
                                            value={data.weekly_closing_time}
                                            onChange={(e) => setData('weekly_closing_time', e.target.value)}
                                            disabled={processing}
                                            required
                                        />
                                        <InputError message={errors.weekly_closing_time} />
                                    </div>
                                </div>
                                <div className="rs-time-fields">
                                    <div className="rs-time-field">
                                        <label htmlFor="weekly-timezone">المنطقة الزمنية</label>
                                        <input
                                            id="weekly-timezone"
                                            value={data.weekly_timezone}
                                            onChange={(e) => setData('weekly_timezone', e.target.value)}
                                            disabled={processing}
                                            required
                                            dir="ltr"
                                        />
                                        <InputError message={errors.weekly_timezone} />
                                    </div>
                                    <div className="rs-time-field">
                                        <label htmlFor="weekly-grace">فترة السماح بالدقائق</label>
                                        <input
                                            id="weekly-grace"
                                            type="number"
                                            min="0"
                                            max="1440"
                                            value={data.grace_period_minutes}
                                            onChange={(e) => setData('grace_period_minutes', Number(e.target.value))}
                                            disabled={processing}
                                        />
                                        <InputError message={errors.grace_period_minutes} />
                                    </div>
                                </div>
                                <label className="cs-check">
                                    <input
                                        type="checkbox"
                                        checked={data.auto_prepare}
                                        onChange={(e) => setData('auto_prepare', e.target.checked)}
                                        disabled={processing}
                                    />
                                    إعداد الأسبوع تلقائيًا للمراجعة عند وقت القطع
                                </label>
                                <label className="cs-check">
                                    <input
                                        type="checkbox"
                                        checked={data.allow_early_weekly_close}
                                        onChange={(e) => setData('allow_early_weekly_close', e.target.checked)}
                                        disabled={processing}
                                    />
                                    السماح بإغلاق الأسبوع يدويًا قبل موعد قطعه
                                </label>
                                <p className="cs-note">
                                    عند التفعيل يستطيع من تمنحه صلاحية «إغلاق الأسبوع قبل موعده» من صفحة الصلاحيات (موظف فرع أو غيره) إغلاق الأسبوع الجاري قبل
                                    موعده، بعد اعتماد الإغلاق اليومي لكل فرع فيه دفعات (اليوم الجاري أيضًا، ويلزم لذلك تفعيل «إقفال اليوم قبل وقت القطع»).
                                    تنتهي الفترة فورًا وتبدأ فترة جديدة في اللحظة نفسها.
                                </p>
                                <InputError message={errors.allow_early_weekly_close} />
                                <p className="cs-note">الاعتماد النهائي يدوي دائمًا، ولا يتم قبل اعتماد كشوف الفروع اليومية.</p>
                            </section>
                        </div>
                        <div className="rs-column">
                            <section className="rs-panel">
                                <PanelTitle icon="calendar">بداية أسبوع التقارير</PanelTitle>
                                <p>
                                    للتقارير ولوحة المعلومات فقط. لا يغيّر يوم قطع الإغلاق الأسبوعي المحدد في «إعدادات الإغلاق الأسبوعي».
                                </p>
                                <div className="rs-days" role="radiogroup" aria-label="بداية أسبوع التقارير">
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
                                            <small>{day.value === setting.week_starts_on ? 'الحالي' : ' '}</small>
                                        </label>
                                    ))}
                                </div>
                                <InputError message={errors.week_starts_on} className="mt-2" />
                            </section>
                        </div>
                    </div>
                </section>

                <section id="daily" className="cs-type cs-kind-daily" aria-labelledby="daily-title">
                    <TypeHeader tag="يغذّي الإغلاق الأسبوعي" title={<span id="daily-title">الإغلاق اليومي</span>}>
                        كشف لكل فرع عن يوم عمل واحد. لا يُغلق الأسبوع قبل أن يعتمد كل فرع كشوفه اليومية.
                    </TypeHeader>
                    <Facts
                        rows={[
                            ['ما هو', 'كشف لكل فرع ليوم عمل واحد: دفعات اليوم، وعدّ النقد، ومطابقة التحويلات البنكية.'],
                            [
                                'متى يُغلق',
                                <>
                                    عند وقت القطع اليومي (<bdi>{cutoffLabel}</bdi>){data.allow_early_close ? '، أو قبله يدويًا من الفرع.' : '.'}
                                </>,
                            ],
                            ['من يعدّه', 'صاحب صلاحية «إعداد كشوف الإغلاق» في الفرع. وقبل وقت القطع لا يرسله إلا من مُنح أيضًا «إقفال اليوم قبل وقت القطع».'],
                            ['من يعتمده', 'شخص آخر مخوّل في الفرع؛ لا يعتمد المُعِدّ كشفه بنفسه.'],
                            ['بعد الاعتماد', 'يُقفل الكشف، ثم يُسلَّم النقد للشركة بعد وقت القطع، ويُرسل الكشف إلى التدقيق المالي.'],
                        ]}
                    />

                    <section className={`rs-status ${data.auto_open ? 'is-open' : ''}`} style={{ marginTop: 14 }} aria-live="polite">
                        <span className="rs-status-dot" aria-hidden="true">
                            <i />
                        </span>
                        <div className="rs-status-copy">
                            <b>{data.auto_open ? 'الكشوف اليومية تُفتح تلقائيًا' : 'الكشوف اليومية تُفتح يدويًا'}</b>
                            <p>
                                {data.auto_open
                                    ? `تُفتح كشوف كل الفروع خلال ربع ساعة من وقت القطع (${cutoffLabel}).`
                                    : 'تُفتح من هذه الصفحة، أو حين يفتح الفرع يومه في صفحة الإغلاق.'}
                                {isDirty && <span className="rs-preview-note"> · معاينة قبل الحفظ</span>}
                            </p>
                        </div>
                        <div className="rs-modes" role="group" aria-label="فتح الكشوف اليومية">
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

                    <div className="rs-grid cs-even">
                        <div className="rs-column">
                            <section className="rs-panel">
                                <PanelTitle icon="clock">وقت القطع اليومي</PanelTitle>
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
                                <PanelTitle icon="send">إقفال اليوم قبل وقت القطع</PanelTitle>
                                <label className="cs-check">
                                    <input
                                        type="checkbox"
                                        checked={data.allow_early_close}
                                        onChange={(e) => setData('allow_early_close', e.target.checked)}
                                        disabled={processing}
                                    />
                                    السماح للفرع بإقفال يومه يدويًا قبل وقت القطع
                                </label>
                                <p className="cs-note">
                                    عند التفعيل يستطيع من يملك صلاحيتي «إعداد كشوف الإغلاق» و«إقفال اليوم قبل وقت القطع» عدّ الصندوق وإرسال كشف اليوم قبل
                                    وقت القطع. وبعد الإرسال لا يسجّل
                                    الفرع دفعات أو مبالغ مستردة ولا يسلّم نقدًا حتى وقت القطع، إلا إذا أُعيد الكشف للتصحيح.
                                </p>
                                <InputError message={errors.allow_early_close} />
                            </section>
                        </div>

                        <div className="rs-column">
                            <section className="rs-panel">
                                <PanelTitle icon="eye">حالة أيام الأسبوع الحالي</PanelTitle>
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
                                    يفتح كشف الإغلاق اليومي لكل الفروع النشطة لليوم المختار مع دفعاته، حتى لو كان الفتح التلقائي متوقفًا. لا يُنشئ
                                    كشفًا ثانيًا ليوم مفتوح.
                                </p>
                                <div className="rs-time-fields">
                                    <div className="rs-time-field">
                                        <label htmlFor="open-date">اليوم</label>
                                        <DatePicker
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
                        </div>
                    </div>
                </section>

                <section id="monthly" className="cs-type cs-kind-monthly" aria-labelledby="monthly-title">
                    <TypeHeader tag="إغلاق إضافي" title={<span id="monthly-title">الإغلاق الشهري</span>}>
                        اعتماد مساند للشهر الميلادي كاملًا. وجوده لا يغيّر الإغلاق الأسبوعي ولا يُشترط له.
                    </TypeHeader>
                    <Facts
                        rows={[
                            [
                                'ما هو',
                                <>
                                    اعتماد للشهر الميلادي من أول يوم فيه إلى آخره. الشهر الحالي: <b>{monthName(today)}</b>، من{' '}
                                    <bdi>{shortDate(monthFirst)}</bdi> إلى <bdi>{shortDate(monthLast)}</bdi>.
                                </>,
                            ],
                            ['الأسبوع بين شهرين', 'يُقسَّم بين الشهرين بالتاريخ ولا يُضاف كاملًا إلى أحدهما.'],
                            [
                                'متى يُغلق',
                                <>
                                    بعد انتهاء آخر يوم في الشهر، عند وقت القطع اليومي (<bdi>{cutoffLabel}</bdi>).
                                </>,
                            ],
                            ['من يعتمده', 'صاحب صلاحية «تدقيق كشوف الإغلاق»، بعد اعتماد كل الكشوف اليومية التي فيها دفعات في الشهر.'],
                            ['الإعدادات', 'لا يحتاج إعدادات: يتبع وقت القطع اليومي. اعتماده لا يجمع كشوفًا ولا يسجّل دفعات.'],
                        ]}
                    />
                </section>

                <section className="cs-type" aria-label="سبب التغيير وآخر تعديل">
                    <div className="rs-grid">
                        <section className="rs-panel cs-reason">
                            <PanelTitle icon="history">سبب تغيير الإعدادات</PanelTitle>
                            <p>يُسجَّل مع التعديل في سجل تغييرات مواعيد الإغلاق.</p>
                            <div className="rs-time-field" style={{ marginTop: 10 }}>
                                <label htmlFor="closing-setting-reason" className="sr-only">
                                    سبب تغيير الإعدادات
                                </label>
                                <textarea
                                    id="closing-setting-reason"
                                    value={data.reason}
                                    onChange={(e) => setData('reason', e.target.value)}
                                    maxLength={1000}
                                    disabled={processing}
                                />
                                <InputError message={errors.reason} />
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
                </section>

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
