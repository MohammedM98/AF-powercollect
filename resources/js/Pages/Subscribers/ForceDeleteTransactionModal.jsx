import { useForm } from '@inertiajs/react';
import FormModal from '@/Components/FormModal';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import { describeBalance } from '@/lib/accountStatement';
import { BalanceAfter } from './AccountSummary';
import { OriginalLine } from './CorrectionFields';

/**
 * Erase one line for good. Unlike deleting, nothing stays on the
 * statement: the line (and its reversal, if it was cancelled) is gone, and
 * the balance is as if it was never recorded. Only the reason is logged.
 */
export default function ForceDeleteTransactionModal({ onClose, subscriber, balance, entry }) {
    const form = useForm({ correction_notes: '' });
    const eraseForm = { ...form, isEdit: true, save: (options) => form.delete(`/subscribers/${subscriber.id}/transactions/${entry.id}/permanent`, options) };
    const balanceAfter = describeBalance(Number(balance) - Number(entry.eraseEffect));
    const balanceText = balanceAfter.tone === 'settled' ? 'مسدّدًا' : `${balanceAfter.amount} شيكل ${balanceAfter.label}`;

    return (
        <FormModal
            show
            onClose={onClose}
            form={eraseForm}
            title="حذف نهائي للحركة"
            icon="trash"
            maxWidth="xl"
            bodyClassName="space-y-5"
            action={{ submitLabel: 'حذف نهائي', title: 'حذف الحركة نهائيًا؟', confirmLabel: 'نعم، احذفها نهائيًا', icon: 'trash', tone: 'danger' }}
            saveConfirmMessage={`ستُمحى «${entry.description}» من السجل نهائيًا دون أي أثر، ويصبح الرصيد ${balanceText}. لا يمكن التراجع. هل تريد المتابعة؟`}
        >
            <OriginalLine entry={entry} tone="delete" />

            <p className="rounded-xl bg-brand-500/5 px-4 py-3 text-sm text-brand-700">
                تحذير: تُمحى الحركة من كشف الحساب كأنها لم تُسجَّل، ولا يبقى لها قيد عكسي ولا سبب ظاهر. لا يمكن التراجع. إن أردت إبقاء أثرها فاستعمل «حذف» العادي.
            </p>

            <div>
                <InputLabel htmlFor="correction_notes" value="سبب الحذف النهائي (يُحفظ في سجل النظام فقط)" />
                <textarea
                    id="correction_notes"
                    name="correction_notes"
                    rows={2}
                    required
                    maxLength={1000}
                    className="mt-1 block w-full"
                    placeholder="مثال: رسوم اشتراك سُجّلت بالخطأ على مشترك لم يُفعَّل"
                    value={form.data.correction_notes}
                    onChange={(e) => form.setData('correction_notes', e.target.value)}
                />
                <InputError message={form.errors.correction_notes} className="mt-2" />
            </div>

            <BalanceAfter label="الرصيد بعد الحذف النهائي" balanceAfter={balanceAfter} />
        </FormModal>
    );
}
