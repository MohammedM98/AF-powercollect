import FormModal from '@/Components/FormModal';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';
import { useResourceForm } from '@/hooks/useResourceForm';
import { allocatePayment, describeBalance, paymentInShekels } from '@/lib/accountStatement';
import { formatAmount, formatCurrency } from '@/lib/currency';
import { AccountHeader, BalanceAfter } from './AccountSummary';

/** What a payment will be recorded against, as its البيان will read. */
function paidForText({ covered, leftover }) {
    const parts = [];

    if (covered.length) {
        parts.push(`عن: ${covered.map((charge) => `${charge.label} (${formatAmount(charge.amount)})`).join('، ')}`);
    }

    if (leftover > 0) {
        parts.push(covered.length ? `والباقي ${formatAmount(leftover)} شيكل رصيد له` : `رصيد له ${formatAmount(leftover)} شيكل`);
    }

    return parts.join(' · ');
}

/**
 * Record a payment on a subscriber's account: what it is for (the unpaid
 * charges ticked, or the oldest ones), how much, in which currency and at
 * what rate, and how it was paid. Shows what it pays for and the balance
 * it leaves before saving; anything paid over what is owed stays as credit.
 */
export default function PaymentModal({ show, onClose, subscriber, balance, unpaidCharges, currencies, paymentMethods, transferBanks }) {
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
        charge_ids: [],
    });
    const { data, setData, errors } = form;

    const isShekel = data.currency === 'ILS';
    const throughBank = data.payment_method === 'bank_transfer';
    const inShekels = paymentInShekels(data.amount, data.currency, data.exchange_rate);
    const balanceAfter = inShekels === null ? null : describeBalance(Number(balance) - inShekels);
    const allocation = inShekels === null ? null : allocatePayment(inShekels, unpaidCharges, data.charge_ids);

    // Ticking what the payment is for fills in their total (in shekels).
    function toggleCharge(chargeId) {
        const chargeIds = data.charge_ids.includes(chargeId) ? data.charge_ids.filter((id) => id !== chargeId) : [...data.charge_ids, chargeId];
        const total = unpaidCharges
            .filter((charge) => chargeIds.includes(charge.id))
            .reduce((sum, charge) => sum + Math.round(Number(charge.remaining) * 100), 0);

        setData((current) => ({
            ...current,
            charge_ids: chargeIds,
            ...(current.currency === 'ILS' && chargeIds.length ? { amount: String(total / 100) } : {}),
        }));
    }
    const currencyLabel = currencies.find((currency) => currency.value === data.currency)?.label;
    const confirmMessage =
        inShekels === null
            ? null
            : `سيتم تسجيل دفعة بقيمة ${formatAmount(data.amount)} ${currencyLabel}${isShekel ? '' : ` (${formatAmount(inShekels)} شيكل)`} على حساب ${subscriber.fullName} (${paidForText(allocation)})، ويصبح الرصيد ${
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
            <AccountHeader subscriber={subscriber} balance={balance} />

            <fieldset>
                <legend className="text-sm font-medium text-gray-700">عن ماذا هذه الدفعة؟</legend>
                {unpaidCharges.length === 0 ? (
                    <p className="mt-1 text-sm text-gray-500">لا توجد مستحقات غير مدفوعة — تُسجَّل الدفعة رصيدًا للمشترك (له).</p>
                ) : (
                    <>
                        <div className="mt-1 max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
                            {unpaidCharges.map((charge) => (
                                <label
                                    key={charge.id}
                                    className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-gray-50"
                                >
                                    <span className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            checked={data.charge_ids.includes(charge.id)}
                                            onChange={() => toggleCharge(charge.id)}
                                        />
                                        <span className="text-gray-900">{charge.label}</span>
                                    </span>
                                    <span className="font-semibold tabular-nums text-gray-700">{formatCurrency(charge.remaining)}</span>
                                </label>
                            ))}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">إذا لم تختر شيئًا تُسدَّد أقدم المستحقات أولًا.</p>
                    </>
                )}
                <InputError
                    message={errors.charge_ids ?? Object.entries(errors).find(([key]) => key.startsWith('charge_ids.'))?.[1]}
                    className="mt-2"
                />
            </fieldset>

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
                        {inShekels === null ? '—' : formatCurrency(inShekels)}
                    </p>
                </div>
            </div>

            <fieldset>
                <legend className="text-sm font-medium text-gray-700">طريقة الدفع</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
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

            {throughBank && (
                <fieldset>
                    <legend className="text-sm font-medium text-gray-700">البنك أو المحفظة</legend>
                    <div className="mt-1 grid grid-cols-3 gap-2">
                        {transferBanks.map((bank) => (
                            <label
                                key={bank}
                                className={`flex h-11 cursor-pointer items-center justify-center rounded-control border px-2 text-center text-sm font-semibold transition focus-within:ring-2 focus-within:ring-brand-500 ${
                                    data.bank_name === bank
                                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="bank_name"
                                    value={bank}
                                    required
                                    checked={data.bank_name === bank}
                                    onChange={(e) => setData('bank_name', e.target.value)}
                                    className="sr-only"
                                />
                                {bank}
                            </label>
                        ))}
                    </div>
                    <InputError message={errors.bank_name} className="mt-2" />
                </fieldset>
            )}

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
                        <InputLabel htmlFor="reference_number" value="الرقم المرجعي" />
                        <TextInput
                            id="reference_number"
                            required
                            dir="ltr"
                            className="mt-1 w-full"
                            value={data.reference_number}
                            onChange={(e) => setData('reference_number', e.target.value)}
                        />
                        <p className="mt-1 text-xs text-gray-500">رقم الحوالة أو العملية</p>
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
                <InputLabel htmlFor="payment_notes" value="تفاصيل (تظهر في البيان بكشف الحساب)" />
                <textarea
                    id="payment_notes"
                    name="notes"
                    rows={2}
                    className="mt-1 block w-full"
                    value={data.notes}
                    onChange={(e) => setData('notes', e.target.value)}
                />
                <InputError message={errors.notes} className="mt-2" />
            </div>

            {allocation && (
                <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
                    تُسجَّل في البيان: {paidForText(allocation)}
                </p>
            )}

            <BalanceAfter label="الرصيد بعد الدفعة" balanceAfter={balanceAfter} placeholder="أدخل المبلغ" />
        </FormModal>
    );
}
