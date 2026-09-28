import { useForm } from '@inertiajs/react';
import FormModal from '@/Components/FormModal';
import { describeBalance } from '@/lib/accountStatement';
import { BalanceAfter } from './AccountSummary';
import { CorrectionReasonFields, EMPTY_CORRECTION, OriginalLine } from './CorrectionFields';

/**
 * Delete a payment, charge or discount (a statement line) and say why.
 * Nothing is erased: the line stays in the statement marked deleted, with
 * the reason, and a reversal under it takes its amount back off the
 * balance.
 */
export default function DeleteTransactionModal({ onClose, subscriber, balance, entry, reasons }) {
    const url = `/subscribers/${subscriber.id}/transactions/${entry.id}`;
    const form = useForm(EMPTY_CORRECTION);
    const deleteForm = { ...form, isEdit: true, save: (options) => form.delete(url, options) };
    const balanceAfter = describeBalance(Number(balance) - Number(entry.recorded.effect));
    const balanceText = balanceAfter.tone === 'settled' ? 'مسدّدًا' : `${balanceAfter.amount} شيكل ${balanceAfter.label}`;

    return (
        <FormModal
            show
            onClose={onClose}
            form={deleteForm}
            title="حذف حركة"
            icon="trash"
            maxWidth="xl"
            bodyClassName="space-y-5"
            action={{ submitLabel: 'حذف الحركة', title: 'حذف الحركة؟', confirmLabel: 'نعم، احذف الحركة', icon: 'trash', tone: 'danger' }}
            saveConfirmMessage={`ستُلغى «${entry.description}» ويُضاف تحتها قيد عكسي، ويصبح الرصيد ${balanceText}. هل تريد المتابعة؟`}
        >
            <OriginalLine entry={entry} tone="delete" />

            <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                لا تُمسح الحركة من السجل: تبقى في كشف الحساب مشطوبة مع سبب الحذف، ويُضاف تحتها قيد عكسي يلغي أثرها على الرصيد.
            </p>

            <CorrectionReasonFields form={form} reasons={reasons} action="الحذف" />

            <BalanceAfter label="الرصيد بعد الحذف" balanceAfter={balanceAfter} />
        </FormModal>
    );
}
