import FormModal from '@/Components/FormModal';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';
import { useResourceForm } from '@/hooks/useResourceForm';
import { describeBalance, paymentInShekels } from '@/lib/accountStatement';

const BALANCE_TONES = {
    owes: 'text-brand-700',
    credit: 'text-emerald-700',
    settled: 'text-gray-900',
};

function BalanceText({ balance }) {
    return (
        <span className={`font-bold tabular-nums ${BALANCE_TONES[balance.tone]}`}>
            {balance.tone === 'settled' ? '0.00 شيكل — مسدّد' : `${balance.amount} شيكل ${balance.label}`}
        </span>
    );
}

/**
 * Record a payment on a subscriber's account: how much, in which currency
 * and at what rate, and how it was paid. Shows what it takes off the
 * balance before saving.
 */
export default function PaymentModal({ show, onClose, subscriber, balance, currencies, paymentMethods }) {
    const form = useResourceForm(`/subscribers/${subscriber.id}/payments`, null, {
        amount: '',
        currency: 'ILS',
        exchange_rate: '',
        payment_method: 'cash',
        bank_name: '',
        reference_number: '',
        cash_box: '',
        manual_voucher_number: '',
        notes: '',
    });
    const { data, setData, errors } = form;

    const isShekel = data.currency === 'ILS';
    const throughBank = ['bank_transfer', 'cheque'].includes(data.payment_method);
    const inShekels = paymentInShekels(data.amount, data.currency, data.exchange_rate);
    const balanceAfter = inShekels === null ? null : describeBalance(Number(balance) - inShekels);
    const currencyLabel = currencies.find((currency) => currency.value === data.currency)?.label;
    const confirmMessage =
        inShekels === null
            ? null
            : `سيتم تسجيل دفعة بقيمة ${Number(data.amount).toFixed(2)} ${currencyLabel}${isShekel ? '' : ` (${inShekels.toFixed(2)} شيكل)`} على حساب ${subscriber.fullName}، ويصبح الرصيد ${
                  balanceAfter.tone === 'settled' ? 'مسدّدًا' : `${balanceAfter.amount} شيكل ${balanceAfter.label}`
              }. هل تريد المتابعة؟`;

    return (
        <FormModal
            show={show}
            onClose={onClose}
            form={form}
            title="تسجيل دفعة"
            icon="card"
            maxWidth="2xl"
            bodyClassName="space-y-5"
            saveConfirmMessage={confirmMessage}
        >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3 text-sm">
                <div>
                    <p className="font-semibold text-gray-900">{subscriber.fullName}</p>
                    <p className="mt-0.5 text-gray-500">
                        حساب <span dir="ltr">{subscriber.accountNumber}</span>
                    </p>
                </div>
                <p className="text-gray-600">
                    الرصيد الحالي: <BalanceText balance={describeBalance(balance)} />
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <InputLabel htmlFor="amount" value="المبلغ" />
                    <TextInput
                        id="amount"
                        type="number"
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
                    <InputLabel htmlFor="currency" value="العملة" />
                    <select id="currency" className="mt-1 block w-full" value={data.currency} onChange={(e) => setData('currency', e.target.value)}>
                        {currencies.map((currency) => (
                            <option key={currency.value} value={currency.value}>
                                {currency.label}
                            </option>
                        ))}
                    </select>
                    <InputError message={errors.currency} className="mt-2" />
                </div>
                <div>
                    <InputLabel htmlFor="exchange_rate" value="سعر الصرف" />
                    <TextInput
                        id="exchange_rate"
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        inputMode="decimal"
                        dir="ltr"
                        className="mt-1 w-full disabled:bg-gray-50 disabled:text-gray-500"
                        value={isShekel ? '1' : data.exchange_rate}
                        disabled={isShekel}
                        onChange={(e) => setData('exchange_rate', e.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">{isShekel ? 'الشيكل = 1 دائمًا' : `كم شيكل يساوي 1 ${currencyLabel}`}</p>
                    <InputError message={errors.exchange_rate} className="mt-2" />
                </div>
                <div>
                    <InputLabel value="يُخصم من الرصيد" />
                    <p className="mt-1 flex h-11 items-center rounded-control bg-gray-50 px-3 text-sm font-bold tabular-nums text-gray-900">
                        {inShekels === null ? '—' : `${inShekels.toFixed(2)} شيكل`}
                    </p>
                </div>
            </div>

            <fieldset>
                <legend className="text-sm font-medium text-gray-700">طريقة الدفع</legend>
                <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {paymentMethods.map((method) => (
                        <label
                            key={method.value}
                            className={`flex h-11 cursor-pointer items-center justify-center rounded-control border px-2 text-center text-sm font-semibold transition focus-within:ring-2 focus-within:ring-brand-500 ${
                                data.payment_method === method.value
                                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                        >
                            <input
                                type="radio"
                                name="payment_method"
                                value={method.value}
                                checked={data.payment_method === method.value}
                                onChange={(e) => setData('payment_method', e.target.value)}
                                className="sr-only"
                            />
                            {method.label}
                        </label>
                    ))}
                </div>
                <InputError message={errors.payment_method} className="mt-2" />
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
                {data.payment_method === 'cash' && (
                    <div>
                        <InputLabel htmlFor="cash_box" value="رقم الصندوق" />
                        <TextInput
                            id="cash_box"
                            dir="ltr"
                            className="mt-1 w-full"
                            value={data.cash_box}
                            onChange={(e) => setData('cash_box', e.target.value)}
                        />
                        <p className="mt-1 text-xs text-gray-500">الصندوق الذي استلم المبلغ (اختياري)</p>
                        <InputError message={errors.cash_box} className="mt-2" />
                    </div>
                )}
                {throughBank && (
                    <div>
                        <InputLabel htmlFor="bank_name" value="البنك" />
                        <TextInput
                            id="bank_name"
                            className="mt-1 w-full"
                            value={data.bank_name}
                            onChange={(e) => setData('bank_name', e.target.value)}
                        />
                        <InputError message={errors.bank_name} className="mt-2" />
                    </div>
                )}
                {data.payment_method !== 'cash' && (
                    <div>
                        <InputLabel htmlFor="reference_number" value="الرقم المرجعي" />
                        <TextInput
                            id="reference_number"
                            dir="ltr"
                            className="mt-1 w-full"
                            value={data.reference_number}
                            onChange={(e) => setData('reference_number', e.target.value)}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            {data.payment_method === 'cheque'
                                ? 'رقم الشيك'
                                : data.payment_method === 'bank_transfer'
                                  ? 'رقم الحوالة'
                                  : 'رقم العملية (اختياري)'}
                        </p>
                        <InputError message={errors.reference_number} className="mt-2" />
                    </div>
                )}
                <div>
                    <InputLabel htmlFor="manual_voucher_number" value="السند اليدوي" />
                    <TextInput
                        id="manual_voucher_number"
                        dir="ltr"
                        className="mt-1 w-full"
                        value={data.manual_voucher_number}
                        onChange={(e) => setData('manual_voucher_number', e.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">رقم الوصل الورقي (اختياري) — رقم السند يُولّد تلقائيًا</p>
                    <InputError message={errors.manual_voucher_number} className="mt-2" />
                </div>
            </div>

            <div>
                <InputLabel htmlFor="payment_notes" value="ملاحظات" />
                <textarea
                    id="payment_notes"
                    rows={2}
                    className="mt-1 block w-full"
                    value={data.notes}
                    onChange={(e) => setData('notes', e.target.value)}
                />
                <InputError message={errors.notes} className="mt-2" />
            </div>

            <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                الرصيد بعد الدفعة: {balanceAfter ? <BalanceText balance={balanceAfter} /> : <span className="text-gray-400">أدخل المبلغ</span>}
            </p>
        </FormModal>
    );
}
