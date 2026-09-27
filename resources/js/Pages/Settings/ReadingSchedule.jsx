import { useState } from 'react';
import { Head, useForm } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import InputError from '@/Components/InputError';
import ConfirmDialog from '@/Components/ConfirmDialog';
import { WEEK_DAYS, formatWeekDay } from '@/lib/weekDays';

const MODE_HINTS = {
    automatic: 'يُفتح الإدخال تلقائيًا في الأيام المحددة ويُغلق في باقي الأيام.',
    open: 'الإدخال مفتوح الآن بغض النظر عن الأيام، حتى تعيده إلى الوضع التلقائي.',
    closed: 'الإدخال مغلق الآن بغض النظر عن الأيام، حتى تعيده إلى الوضع التلقائي.',
};

/** One weekday as a selectable chip. */
function DayChip({ label, checked, type, name, onChange }) {
    return (
        <label
            className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition ${
                checked ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
        >
            <input type={type} name={name} className="sr-only" checked={checked} onChange={onChange} />
            {label}
        </label>
    );
}

export default function ReadingSchedule({ setting, modes, firstWeeks }) {
    const { data, setData, put, processing, errors, isDirty } = useForm({
        reading_day: setting.reading_day,
        open_days: setting.open_days,
        mode: setting.mode,
    });
    const [confirmingSave, setConfirmingSave] = useState(false);
    const readingDayChanged = data.reading_day !== setting.reading_day;
    const firstWeek = firstWeeks[data.reading_day];

    function toggleDay(day) {
        setData('open_days', data.open_days.includes(day) ? data.open_days.filter((d) => d !== day) : [...data.open_days, day]);
    }

    // Entry that only opened on the old reading day moves with it.
    function changeReadingDay(day) {
        setData((current) => ({
            ...current,
            reading_day: day,
            open_days: current.open_days.length === 1 && current.open_days[0] === current.reading_day ? [day] : current.open_days,
        }));
    }

    function submit(e) {
        e.preventDefault();
        setConfirmingSave(true);
    }

    function save() {
        setConfirmingSave(false);
        put('/settings/reading-schedule', { preserveScroll: true });
    }

    return (
        <SettingsLayout header={<h2 className="text-3xl font-bold text-gray-900">مواعيد القراءات</h2>}>
            <Head title="مواعيد القراءات" />

            <form onSubmit={submit} className="max-w-2xl space-y-6">
                <div
                    className={`flex items-center gap-3 rounded-xl border p-4 ${setting.isOpenNow ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-gray-200 bg-gray-50'}`}
                >
                    <span className={`h-3 w-3 shrink-0 rounded-full ${setting.isOpenNow ? 'bg-emerald-500' : 'bg-gray-400'}`} aria-hidden="true" />
                    <div>
                        <p className="font-semibold text-gray-900">{setting.isOpenNow ? 'إدخال القراءات مفتوح الآن' : 'إدخال القراءات مغلق الآن'}</p>
                        <p className="text-sm text-gray-500">
                            ينطبق على جميع المستخدمين ما عدا المدير العام، الذي يستطيع إدخال القراءات وتصحيحها في أي وقت.
                        </p>
                    </div>
                </div>

                <fieldset className="rounded-xl border border-gray-200 bg-surface p-5">
                    <legend className="px-1 text-sm font-semibold text-gray-900">يوم القراءة الأسبوعي</legend>
                    <p className="text-xs text-gray-500">ينتهي كل أسبوع قراءة في هذا اليوم، ويبدأ الأسبوع التالي في اليوم الذي يليه.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {WEEK_DAYS.map((day) => (
                            <DayChip
                                key={day.value}
                                label={day.label}
                                type="radio"
                                name="reading_day"
                                checked={data.reading_day === day.value}
                                onChange={() => changeReadingDay(day.value)}
                            />
                        ))}
                    </div>
                    <InputError message={errors.reading_day} className="mt-2" />
                    {readingDayChanged && (
                        <p
                            role="status"
                            className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300"
                        >
                            تبقى الأسابيع المنتهية كما هي، وآخرها انتهى في {formatWeekDay(setting.latestWeekEnd)}. أول أسبوع على اليوم الجديد من{' '}
                            {formatWeekDay(firstWeek.start)} إلى {formatWeekDay(firstWeek.end)}، ثم تُحسب الأسابيع كاملة بعده.
                        </p>
                    )}
                </fieldset>

                <fieldset className="rounded-xl border border-gray-200 bg-surface p-5">
                    <legend className="px-1 text-sm font-semibold text-gray-900">طريقة الفتح</legend>
                    <div className="mt-2 space-y-2">
                        {modes.map((mode) => (
                            <label key={mode.value} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-gray-50">
                                <input
                                    type="radio"
                                    name="mode"
                                    value={mode.value}
                                    checked={data.mode === mode.value}
                                    onChange={() => setData('mode', mode.value)}
                                    className="mt-1 text-brand-600"
                                />
                                <span>
                                    <span className="block text-sm font-medium text-gray-900">{mode.label}</span>
                                    <span className="block text-xs text-gray-500">{MODE_HINTS[mode.value]}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                    <InputError message={errors.mode} className="mt-2" />
                </fieldset>

                <fieldset className="rounded-xl border border-gray-200 bg-surface p-5">
                    <legend className="px-1 text-sm font-semibold text-gray-900">أيام فتح الإدخال</legend>
                    <p className="text-xs text-gray-500">تُستخدم في الوضع التلقائي — يكون الإدخال مفتوحًا طوال اليوم المحدد.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {WEEK_DAYS.map((day) => (
                            <DayChip
                                key={day.value}
                                label={day.label}
                                type="checkbox"
                                checked={data.open_days.includes(day.value)}
                                onChange={() => toggleDay(day.value)}
                            />
                        ))}
                    </div>
                    <InputError message={errors.open_days} className="mt-2" />
                </fieldset>

                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-500">
                        {setting.updatedByName ? `آخر تعديل بواسطة ${setting.updatedByName} · ${setting.updatedAt}` : ''}
                    </p>
                    <PrimaryButton disabled={processing || !isDirty}>{processing ? 'جارٍ الحفظ...' : 'حفظ'}</PrimaryButton>
                </div>
            </form>

            <ConfirmDialog
                show={confirmingSave}
                onConfirm={save}
                onCancel={() => setConfirmingSave(false)}
                title="حفظ مواعيد القراءات؟"
                message={
                    readingDayChanged
                        ? `سيصبح يوم القراءة الأسبوعي ${WEEK_DAYS.find((day) => day.value === data.reading_day).label}، وأول أسبوع عليه من ${formatWeekDay(firstWeek.start)} إلى ${formatWeekDay(firstWeek.end)}. هل تريد المتابعة؟`
                        : 'سيتغير موعد فتح إدخال القراءات لمدخلي البيانات حسب ما اخترته. هل تريد المتابعة؟'
                }
                confirmLabel="نعم، احفظ"
                cancelLabel="مراجعة الإعدادات"
                icon="calendar"
            />
        </SettingsLayout>
    );
}
