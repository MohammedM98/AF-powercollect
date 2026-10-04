import { useForm } from '@inertiajs/react';
import FormModal from '@/Components/FormModal';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import { describeBalance } from '@/lib/accountStatement';
import { BalanceAfter } from './AccountSummary';
import { OriginalLine } from './CorrectionFields';

/** Edit the amount of the final invoice-like transaction in place. */
export default function EditTransactionAmountModal({ onClose, subscriber, balance, entry }) {
    const form = useForm({ action: 'edit', amount: entry.amount });
    const editForm = {
        ...form,
        isEdit: true,
        save: (options) => form.post(`/subscribers/${subscriber.id}/transactions/${entry.id}/actions`, options),
    };
    const currentEffect = Number(entry.recorded?.effect ?? entry.amount);
    const balanceAfter = describeBalance(Number(balance) - currentEffect + Number(form.data.amount || 0));

    return (
        <FormModal
            show
            onClose={onClose}
            form={editForm}
            title="تعديل الحركة"
            icon="pencil"
            headerTone="amber"
            maxWidth="xl"
            bodyClassName="space-y-5"
            action={{ submitLabel: 'تعديل', title: 'تعديل مبلغ الحركة؟', confirmLabel: 'نعم، عدّل', icon: 'pencil' }}
            saveConfirmMessage="سيُعدّل مبلغ آخر حركة في مكانه ويُعاد احتساب الرصيد بعدها."
        >
            <OriginalLine entry={entry} />

            <div>
                <InputLabel htmlFor="transaction_amount" value="المبلغ الصحيح" />
                <input
                    id="transaction_amount"
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    className="mt-1 block w-full"
                    value={form.data.amount}
                    onChange={(event) => form.setData('amount', event.target.value)}
                />
                <InputError message={form.errors.amount ?? form.errors.action} className="mt-2" />
            </div>

            <BalanceAfter label="الرصيد بعد التعديل" balanceAfter={balanceAfter} />
        </FormModal>
    );
}
