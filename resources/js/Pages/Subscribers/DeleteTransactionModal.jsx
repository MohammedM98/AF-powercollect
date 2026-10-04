import { useForm } from '@inertiajs/react';
import FormModal from '@/Components/FormModal';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import { describeBalance } from '@/lib/accountStatement';
import { BalanceAfter } from './AccountSummary';
import { CorrectionReasonFields, EMPTY_CORRECTION, OriginalLine } from './CorrectionFields';

/**
 * Cancel a payment, charge or discount (a statement line) and say why.
 * Nothing is erased: the line stays in the statement marked cancelled, with
 * the reason, and a reversal under it takes its amount back off the
 * balance.
 */
export default function DeleteTransactionModal({ onClose, subscriber, balance, entry, action, reasons }) {
    const url = `/subscribers/${subscriber.id}/transactions/${entry.id}`;
    const isRefund = action === 'refund';
    const noun = {
        discount: 'الخصم',
        reading_discount: 'الخصم الدائم',
        credit: 'الرصيد الدائن',
        clearing: 'المقاصة',
    }[entry.type] ?? 'الحركة';
    const label = isRefund ? 'إرجاع الدفعة' : `إلغاء ${noun}`;
    const form = useForm({ ...EMPTY_CORRECTION, action, ...(isRefund ? { amount: entry.refundableAmount ?? entry.amount } : {}) });
    const deleteForm = { ...form, isEdit: true, save: (options) => form.post(`${url}/actions`, options) };
    // Cancelling a weekly reading cancels its standing discount too, which gives that amount back to what is owed.
    const discountReturned = !isRefund && entry.readingDiscount ? Number(entry.readingDiscount) : 0;
    const balanceAfter = describeBalance(
        isRefund ? Number(balance) + Number(form.data.amount || 0) : Number(balance) - Number(entry.recorded.effect) + discountReturned,
    );
    const balanceText = balanceAfter.tone === 'settled' ? 'مسدّدًا' : `${balanceAfter.amount} شيكل ${balanceAfter.label}`;

    return (
        <FormModal
            show
            onClose={onClose}
            form={deleteForm}
            title={label}
            icon={isRefund ? 'repeat' : 'close'}
            maxWidth="xl"
            bodyClassName="space-y-5"
            action={{ submitLabel: label, title: `${label}؟`, confirmLabel: `نعم، ${label}`, icon: isRefund ? 'repeat' : 'close', tone: 'danger' }}
            saveConfirmMessage={`ستُضاف حركة ${label} مرتبطة بـ «${entry.description}»${discountReturned ? `، ويُلغى معها الخصم الدائم (${entry.readingDiscount} شيكل)` : ''}، ويصبح الرصيد ${balanceText}. هل تريد المتابعة؟`}
        >
            <OriginalLine entry={entry} tone="cancel" />

            <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                لا تُمسح الحركة من السجل: تبقى الحركة الأصلية، وتُضاف حركة {label} جديدة في نهاية السجل مع رابط مباشر بينهما.
            </p>

            {discountReturned > 0 && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-gray-700">
                    لهذه القراءة خصم دائم بقيمة <b className="font-display">{entry.readingDiscount}</b> شيكل. يُلغى معها تلقائيًا بالسبب نفسه، لأنه لا يقوم
                    إلا على فاتورة القراءة.
                </p>
            )}

            {isRefund && (
                <div>
                    <InputLabel htmlFor="refund_amount" value="المبلغ المراد إرجاعه" />
                    <input
                        id="refund_amount"
                        name="amount"
                        type="number"
                        min="0.01"
                        max={entry.refundableAmount ?? entry.amount}
                        step="0.01"
                        required
                        className="mt-1 block w-full"
                        value={form.data.amount}
                        onChange={(event) => form.setData('amount', event.target.value)}
                    />
                    <InputError message={form.errors.amount} className="mt-2" />
                </div>
            )}

            <CorrectionReasonFields form={form} reasons={reasons} action={label} />

            <BalanceAfter label={`الرصيد بعد ${label}`} balanceAfter={balanceAfter} />
        </FormModal>
    );
}
