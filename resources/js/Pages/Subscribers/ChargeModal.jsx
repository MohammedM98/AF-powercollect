import FormModal from '@/Components/FormModal';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';
import { useResourceForm } from '@/hooks/useResourceForm';
import { describeBalance } from '@/lib/accountStatement';
import { formatAmount } from '@/lib/currency';
import { AccountHeader, BalanceAfter } from './AccountSummary';
import { CorrectionReasonFields, EMPTY_CORRECTION, OriginalLine } from './CorrectionFields';

/**
 * Charge a subscriber by hand (تحميل): a settlement, a financial penalty
 * or a service disconnection fee. Shows the balance it leaves before saving.
 *
 * With `correcting` (a statement line), it corrects that charge instead:
 * the form starts from it, `balance` leaves it out, and saving cancels it
 * and records this one in its place, with one of `correctionReasons`.
 */
export default function ChargeModal({ show, onClose, subscriber, balance, chargeTypes, correcting = null, correctionReasons = [] }) {
    const form = useResourceForm(
        correcting ? `/subscribers/${subscriber.id}/transactions` : `/subscribers/${subscriber.id}/charges`,
        correcting,
        correcting
            ? { type: correcting.recorded.type, amount: correcting.recorded.amount, notes: correcting.recorded.notes, ...EMPTY_CORRECTION }
            : { type: chargeTypes[0]?.value ?? '', amount: '', notes: '' },
    );
    const { data, setData, errors } = form;

    const amount = Number(data.amount);
    const balanceAfter = data.amount !== '' && amount > 0 ? describeBalance(Number(balance) + amount) : null;
    const typeLabel = chargeTypes.find((type) => type.value === data.type)?.label;
    const confirmMessage = !balanceAfter
        ? null
        : correcting
          ? `ستُلغى الحركة الأصلية ويُسجَّل مكانها ${typeLabel} بقيمة ${formatAmount(amount)} شيكل، ويصبح الرصيد ${balanceAfter.amount} شيكل ${balanceAfter.label}. هل تريد المتابعة؟`
          : `سيتم تحميل ${typeLabel} بقيمة ${formatAmount(amount)} شيكل على حساب ${subscriber.fullName}، ويصبح الرصيد ${balanceAfter.amount} شيكل ${balanceAfter.label}. هل تريد المتابعة؟`;

    return (
        <FormModal
            show={show}
            onClose={onClose}
            form={form}
            title={correcting ? 'تعديل تحميل' : 'إضافة تحميل'}
            icon={correcting ? 'pencil' : 'plus'}
            maxWidth="xl"
            bodyClassName="space-y-5"
            saveConfirmMessage={confirmMessage}
        >
            {correcting ? <OriginalLine entry={correcting} /> : <AccountHeader subscriber={subscriber} balance={balance} />}

            <fieldset>
                <legend className="text-sm font-medium text-gray-700">نوع التحميل</legend>
                <div className="mt-1 grid gap-2 sm:grid-cols-3">
                    {chargeTypes.map((type) => (
                        <label
                            key={type.value}
                            className={`flex h-11 cursor-pointer items-center justify-center rounded-control border px-2 text-center text-sm font-semibold transition focus-within:ring-2 focus-within:ring-brand-500 ${
                                data.type === type.value
                                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                        >
                            <input
                                type="radio"
                                name="type"
                                value={type.value}
                                checked={data.type === type.value}
                                onChange={(e) => setData('type', e.target.value)}
                                className="sr-only"
                            />
                            {type.label}
                        </label>
                    ))}
                </div>
                <InputError message={errors.type} className="mt-2" />
            </fieldset>

            <div>
                <InputLabel htmlFor="charge_amount" value="المبلغ (شيكل)" />
                <TextInput
                    id="charge_amount"
                    name="amount"
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    dir="ltr"
                    className="mt-1 w-full"
                    value={data.amount}
                    autoFocus
                    onChange={(e) => setData('amount', e.target.value)}
                />
                <InputError message={errors.amount} className="mt-2" />
            </div>

            <div>
                <InputLabel htmlFor="charge_notes" value="تفاصيل (تظهر في البيان بكشف الحساب)" />
                <textarea
                    id="charge_notes"
                    name="notes"
                    rows={2}
                    className="mt-1 block w-full"
                    placeholder="مثال: غرامة تأخير عن شهر أيلول"
                    value={data.notes}
                    onChange={(e) => setData('notes', e.target.value)}
                />
                <InputError message={errors.notes} className="mt-2" />
            </div>

            {correcting && <CorrectionReasonFields form={form} reasons={correctionReasons} />}

            <BalanceAfter label={correcting ? 'الرصيد بعد التعديل' : 'الرصيد بعد التحميل'} balanceAfter={balanceAfter} placeholder="أدخل المبلغ" />
        </FormModal>
    );
}
