import FormModal from '@/Components/FormModal';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';
import { useResourceForm } from '@/hooks/useResourceForm';
import { describeBalance, discountAmount } from '@/lib/accountStatement';
import { formatAmount, formatCurrency } from '@/lib/currency';
import { AccountHeader, BalanceAfter } from './AccountSummary';

/** What the value field asks for, and how the discount is worked out, by method. */
const METHOD_FIELDS = {
    percentage: { label: 'النسبة (%)', max: '100', hint: (subscriber, owed) => `من الرصيد المستحق (${formatCurrency(owed)})` },
    kilowatt: { label: 'عدد الكيلوات', max: undefined, hint: (subscriber) => `بسعر الكيلو للمشترك (${formatCurrency(subscriber.kiloPrice)})` },
    shekel: { label: 'المبلغ (شيكل)', max: undefined, hint: () => 'مبلغ ثابت يُخصم من الرصيد' },
};

/**
 * Take a discount (خصم) off what a subscriber owes: a percentage of the
 * balance, kilowatts at their kilo price, or shekels. Shows the discount
 * and the balance it leaves before saving.
 */
export default function DiscountModal({ show, onClose, subscriber, balance, discountMethods }) {
    const form = useResourceForm(`/subscribers/${subscriber.id}/discounts`, null, {
        method: 'shekel',
        value: '',
        notes: '',
    });
    const { data, setData, errors } = form;

    const owed = Math.max(Number(balance), 0);
    const field = METHOD_FIELDS[data.method];
    const discount = discountAmount(data.method, data.value, owed, subscriber.kiloPrice);
    const balanceAfter = discount === null ? null : describeBalance(Number(balance) - discount);
    const confirmMessage =
        discount === null
            ? null
            : `سيتم خصم ${formatAmount(discount)} شيكل من حساب ${subscriber.fullName}، ويصبح الرصيد ${
                  balanceAfter.tone === 'settled' ? 'مسدّدًا' : `${balanceAfter.amount} شيكل ${balanceAfter.label}`
              }. هل تريد المتابعة؟`;

    function changeMethod(method) {
        setData((current) => ({ ...current, method, value: '' }));
        form.clearErrors('value');
    }

    return (
        <FormModal
            show={show}
            onClose={onClose}
            form={form}
            title="إضافة خصم"
            icon="dollar"
            maxWidth="xl"
            bodyClassName="space-y-5"
            saveConfirmMessage={confirmMessage}
        >
            <AccountHeader subscriber={subscriber} balance={balance} />

            <fieldset>
                <legend className="text-sm font-medium text-gray-700">طريقة الخصم</legend>
                <div className="mt-1 grid grid-cols-3 gap-2">
                    {discountMethods.map((method) => (
                        <label
                            key={method.value}
                            className={`flex h-11 cursor-pointer items-center justify-center rounded-control border px-2 text-center text-sm font-semibold transition focus-within:ring-2 focus-within:ring-brand-500 ${
                                data.method === method.value
                                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                        >
                            <input
                                type="radio"
                                name="method"
                                value={method.value}
                                checked={data.method === method.value}
                                onChange={(e) => changeMethod(e.target.value)}
                                className="sr-only"
                            />
                            {method.label}
                        </label>
                    ))}
                </div>
                <InputError message={errors.method} className="mt-2" />
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <InputLabel htmlFor="discount_value" value={field.label} />
                    <TextInput
                        id="discount_value"
                        name="value"
                        type="number"
                        required
                        min="0.01"
                        max={field.max}
                        step="0.01"
                        inputMode="decimal"
                        dir="ltr"
                        className="mt-1 w-full"
                        value={data.value}
                        autoFocus
                        onChange={(e) => setData('value', e.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">{field.hint(subscriber, owed)}</p>
                    <InputError message={errors.value} className="mt-2" />
                </div>
                <div>
                    <InputLabel value="قيمة الخصم" />
                    <p className="mt-1 flex h-11 items-center rounded-control bg-gray-50 px-3 text-sm font-bold tabular-nums text-emerald-700">
                        {discount === null ? '—' : formatCurrency(discount)}
                    </p>
                </div>
            </div>

            <div>
                <InputLabel htmlFor="discount_notes" value="تفاصيل (تظهر في البيان بكشف الحساب)" />
                <textarea
                    id="discount_notes"
                    name="notes"
                    rows={2}
                    className="mt-1 block w-full"
                    placeholder="مثال: تعويض عن انقطاع الكهرباء"
                    value={data.notes}
                    onChange={(e) => setData('notes', e.target.value)}
                />
                <InputError message={errors.notes} className="mt-2" />
            </div>

            <BalanceAfter label="الرصيد بعد الخصم" balanceAfter={balanceAfter} placeholder="أدخل قيمة الخصم" />
        </FormModal>
    );
}
