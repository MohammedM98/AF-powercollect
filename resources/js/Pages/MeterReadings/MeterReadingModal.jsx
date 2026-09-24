import { useForm } from '@inertiajs/react';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';
import SearchableSelect from '@/Components/SearchableSelect';

function Summary({ label, value, tone = 'text-gray-900' }) {
    return (
        <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`mt-1 text-base font-bold tabular-nums ${tone}`} dir="ltr">
                {value}
            </p>
        </div>
    );
}

/**
 * Enter or correct a weekly reading. `fixedSubscriber` (an option shaped
 * like `subscriberOptions` entries) pins the form to one subscriber, as
 * when it is opened from that subscriber's statement.
 */
export default function MeterReadingModal({ show, onClose, reading, subscriberOptions = [], fixedSubscriber = null, weekOptions }) {
    const isEdit = Boolean(reading);

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm(
        isEdit
            ? { current_reading: String(reading.current_reading), notes: reading.notes ?? '' }
            : { subscriber_id: fixedSubscriber?.value ?? '', week_start: weekOptions[0]?.value ?? '', current_reading: '', notes: '' },
    );

    const selectedSubscriber = isEdit ? null : (fixedSubscriber ?? subscriberOptions.find((option) => option.value === String(data.subscriber_id)));
    const previousReading = isEdit ? reading.previous_reading : selectedSubscriber?.lastReading;
    const hasPrevious = previousReading !== undefined && previousReading !== null;
    const consumption = hasPrevious && data.current_reading !== '' ? Number(data.current_reading) - previousReading : null;

    function close() {
        clearErrors();
        reset();
        onClose();
    }

    function submit(e) {
        e.preventDefault();

        const options = { preserveScroll: true, preserveState: true, onSuccess: close };

        if (isEdit) {
            put(`/meter-readings/${reading.id}`, options);
        } else {
            post('/meter-readings', options);
        }
    }

    return (
        <Modal show={show} onClose={close} maxWidth="lg">
            <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                            </svg>
                        </span>
                        <h3 className="text-lg font-bold text-gray-900">{isEdit ? 'تعديل القراءة' : 'إدخال قراءة'}</h3>
                    </div>
                    <button type="button" onClick={close} className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                    {isEdit ? (
                        <div className="rounded-lg border border-gray-100 px-4 py-3 text-sm">
                            <p className="font-semibold text-gray-900">{reading.subscriberName}</p>
                            <p className="mt-1 text-gray-500">
                                <span dir="ltr">{reading.accountNumber}</span> · الأسبوع {reading.weekStart} ← {reading.weekEnd}
                            </p>
                        </div>
                    ) : (
                        <>
                            {fixedSubscriber ? (
                                <div className="rounded-lg border border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">{fixedSubscriber.label}</div>
                            ) : (
                            <div>
                                <InputLabel value="المشترك" />
                                <SearchableSelect
                                    className="mt-1"
                                    value={data.subscriber_id}
                                    onChange={(value) => setData('subscriber_id', value)}
                                    options={subscriberOptions}
                                    placeholder="اختر مشتركًا"
                                    searchPlaceholder="بحث بالاسم أو رقم المشترك..."
                                    emptyLabel="لا يوجد مشتركون مطابقون"
                                />
                                <InputError message={errors.subscriber_id} className="mt-2" />
                            </div>
                            )}

                            <div>
                                <InputLabel htmlFor="week_start" value="الأسبوع (جمعة ← خميس)" />
                                <select
                                    id="week_start"
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                                    value={data.week_start}
                                    onChange={(e) => setData('week_start', e.target.value)}
                                >
                                    {weekOptions.map((week) => (
                                        <option key={week.value} value={week.value}>
                                            {week.label}
                                        </option>
                                    ))}
                                </select>
                                <InputError message={errors.week_start} className="mt-2" />
                                {selectedSubscriber?.lastWeekStart && (
                                    <p className="mt-1 text-xs text-gray-500">آخر قراءة مسجلة لأسبوع يبدأ في {selectedSubscriber.lastWeekStart}</p>
                                )}
                            </div>
                        </>
                    )}

                    <div>
                        <InputLabel htmlFor="current_reading" value="القراءة الحالية" />
                        <TextInput
                            id="current_reading"
                            type="number"
                            min="0"
                            inputMode="numeric"
                            dir="ltr"
                            className="mt-1 block w-full"
                            value={data.current_reading}
                            autoFocus={isEdit}
                            onChange={(e) => setData('current_reading', e.target.value)}
                        />
                        <InputError message={errors.current_reading} className="mt-2" />
                    </div>

                    {hasPrevious && (
                        <div className="grid grid-cols-2 gap-3">
                            <Summary label="القراءة السابقة" value={previousReading} />
                            <Summary
                                label="الاستهلاك (كيلو)"
                                value={consumption ?? '—'}
                                tone={consumption !== null && consumption < 0 ? 'text-red-600' : 'text-brand-700'}
                            />
                        </div>
                    )}

                    <div>
                        <InputLabel htmlFor="notes" value="ملاحظات" />
                        <textarea
                            id="notes"
                            rows={2}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                            value={data.notes}
                            onChange={(e) => setData('notes', e.target.value)}
                        />
                        <InputError message={errors.notes} className="mt-2" />
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <SecondaryButton onClick={close}>إلغاء</SecondaryButton>
                    <PrimaryButton disabled={processing}>{processing ? 'جارٍ الحفظ...' : 'حفظ'}</PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}
