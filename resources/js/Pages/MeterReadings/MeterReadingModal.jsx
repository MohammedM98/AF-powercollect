import FormModal from '@/Components/FormModal';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';
import SearchableSelect from '@/Components/SearchableSelect';
import { useResourceForm } from '@/hooks/useResourceForm';

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
    const form = useResourceForm(
        '/meter-readings',
        reading,
        reading
            ? { current_reading: String(reading.current_reading), notes: reading.notes ?? '' }
            : { subscriber_id: fixedSubscriber?.value ?? '', week_start: weekOptions[0]?.value ?? '', current_reading: '', notes: '' },
    );
    const { data, setData, errors, isEdit } = form;

    const selectedSubscriber = isEdit ? null : (fixedSubscriber ?? subscriberOptions.find((option) => option.value === String(data.subscriber_id)));
    const previousReading = isEdit ? reading.previous_reading : selectedSubscriber?.lastReading;
    const hasPrevious = previousReading !== undefined && previousReading !== null;
    const consumption = hasPrevious && data.current_reading !== '' ? Number(data.current_reading) - previousReading : null;

    return (
        <FormModal
            show={show}
            onClose={onClose}
            form={form}
            title={isEdit ? 'تعديل القراءة' : 'إدخال قراءة'}
            icon="bolt"
            visitOptions={{ preserveState: true }}
            bodyClassName="space-y-4"
        >
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
                            className="mt-1 block w-full"
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
                <textarea id="notes" rows={2} className="mt-1 block w-full" value={data.notes} onChange={(e) => setData('notes', e.target.value)} />
                <InputError message={errors.notes} className="mt-2" />
            </div>
        </FormModal>
    );
}
