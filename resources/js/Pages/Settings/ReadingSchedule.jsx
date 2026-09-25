import { Head, useForm } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import InputError from '@/Components/InputError';
import { WEEK_DAYS } from '@/lib/weekDays';

const MODE_HINTS = {
    automatic: 'يُفتح الإدخال تلقائيًا في الأيام المحددة ويُغلق في باقي الأيام.',
    open: 'الإدخال مفتوح الآن بغض النظر عن الأيام، حتى تعيده إلى الوضع التلقائي.',
    closed: 'الإدخال مغلق الآن بغض النظر عن الأيام، حتى تعيده إلى الوضع التلقائي.',
};

export default function ReadingSchedule({ setting, modes }) {
    const { data, setData, put, processing, errors, isDirty } = useForm({
        open_days: setting.open_days,
        mode: setting.mode,
    });

    function toggleDay(day) {
        setData('open_days', data.open_days.includes(day) ? data.open_days.filter((d) => d !== day) : [...data.open_days, day]);
    }

    function submit(e) {
        e.preventDefault();
        put('/settings/reading-schedule', { preserveScroll: true });
    }

    return (
        <SettingsLayout header={<h2 className="text-xl font-bold text-gray-900">مواعيد القراءات</h2>}>
            <Head title="مواعيد القراءات" />

            <form onSubmit={submit} className="max-w-2xl space-y-6">
                <div
                    className={`flex items-center gap-3 rounded-xl border p-4 ${setting.isOpenNow ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}
                >
                    <span className={`h-3 w-3 shrink-0 rounded-full ${setting.isOpenNow ? 'bg-emerald-500' : 'bg-gray-400'}`} aria-hidden="true" />
                    <div>
                        <p className="font-semibold text-gray-900">{setting.isOpenNow ? 'إدخال القراءات مفتوح الآن' : 'إدخال القراءات مغلق الآن'}</p>
                        <p className="text-sm text-gray-500">ينطبق على مدخلي البيانات. يستطيع مدير الفرع والمدير العام إدخال القراءات في أي وقت.</p>
                    </div>
                </div>

                <fieldset className="rounded-xl border border-gray-200 bg-white p-5">
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
                                    className="mt-1 text-brand-600 focus:ring-gray-900"
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

                <fieldset className="rounded-xl border border-gray-200 bg-white p-5">
                    <legend className="px-1 text-sm font-semibold text-gray-900">أيام فتح الإدخال</legend>
                    <p className="text-xs text-gray-500">تُستخدم في الوضع التلقائي — يكون الإدخال مفتوحًا طوال اليوم المحدد.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {WEEK_DAYS.map((day) => {
                            const checked = data.open_days.includes(day.value);

                            return (
                                <label
                                    key={day.value}
                                    className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition ${
                                        checked ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleDay(day.value)} />
                                    {day.label}
                                </label>
                            );
                        })}
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
        </SettingsLayout>
    );
}
