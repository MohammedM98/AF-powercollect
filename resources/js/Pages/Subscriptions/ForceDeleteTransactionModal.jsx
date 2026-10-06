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
export default function ForceDeleteTransactionModal({ onClose, subscription, balance, entry, action = 'delete' }) {
    const isReversalDelete = action === 'delete_reversal';
    const isTreeDelete = action === 'delete_tree';
    const noun = {
        payment: 'الدفعة',
        discount: 'الخصم',
        reading_discount: 'خصم القراءة الأسبوعية',
        credit: 'الرصيد الدائن',
        clearing: 'المقاصة',
    }[entry.type] ?? 'الحركة';
    const reversalNoun = entry.type === 'refund' ? 'الإرجاع' : 'الإلغاء';
    const title = isReversalDelete
        ? `حذف ${reversalNoun} فقط`
        : isTreeDelete
          ? entry.type === 'payment'
              ? 'حذف الدفعة والإرجاع معًا'
              : `حذف ${noun} والإلغاء معًا`
          : `حذف ${noun}`;
    const submitLabel = isTreeDelete ? 'حذف الحركات' : isReversalDelete ? `حذف ${reversalNoun}` : `حذف ${noun}`;
    const form = useForm({ action, correction_notes: '' });
    const eraseForm = { ...form, isEdit: true, save: (options) => form.post(`/subscriptions/${subscription.id}/transactions/${entry.id}/actions`, options) };
    const effect = entry.actionEffects?.[action] ?? entry.eraseEffect;
    const balanceAfter = describeBalance(Number(balance) - Number(effect));
    const balanceText = balanceAfter.tone === 'settled' ? 'مسدّدًا' : `${balanceAfter.amount} شيكل ${balanceAfter.label}`;

    return (
        <FormModal
            show
            onClose={onClose}
            form={eraseForm}
            title={title}
            icon="trash"
            headerTone="danger"
            maxWidth="xl"
            bodyClassName="space-y-5"
            action={{ submitLabel, title: `${title}؟`, confirmLabel: `نعم، ${submitLabel}`, icon: 'trash', tone: 'danger' }}
            saveConfirmMessage={`${title} نهائيًا وإعادة موازنة الحركات اللاحقة، وسيصبح الرصيد ${balanceText}. لا يمكن التراجع. هل تريد المتابعة؟`}
        >
            <OriginalLine entry={entry} tone="erase" />

            {isTreeDelete && entry.linkedReversals?.length > 0 && (
                <div className="grid gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-500">الحركات المرتبطة التي ستُحذف</p>
                    {entry.linkedReversals.map((reversal) => (
                        <div key={reversal.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm">
                            <span>{reversal.description}</span>
                            <bdi dir="ltr" className="font-semibold text-gray-900">{reversal.amount} شيكل</bdi>
                        </div>
                    ))}
                </div>
            )}

            {action === 'delete' && entry.readingDiscount && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-gray-700">
                    لهذه القراءة خصم أسبوعي بقيمة <b className="font-display">{entry.readingDiscount}</b> شيكل. يُحذف معها، لأنه لا يقوم إلا على فاتورة
                    القراءة.
                </p>
            )}

            <p className="rounded-xl bg-brand-500/5 px-4 py-3 text-sm text-brand-700">
                {isReversalDelete
                    ? `ستعود الحركة الأصلية إلى الحالة النشطة، ويُحذف ${reversalNoun} وحده، ثم تُعاد موازنة الحركات اللاحقة.`
                    : isTreeDelete
                      ? 'ستُحذف الحركة الأصلية وجميع حركات الإلغاء أو الإرجاع المرتبطة بها، ثم تُعاد موازنة الحركات اللاحقة.'
                      : 'ستُحذف الحركة نهائيًا من كشف الحساب، ثم تُعاد موازنة الحركات اللاحقة. لا يمكن التراجع.'}
            </p>

            <div>
                <InputLabel htmlFor="correction_notes" value="سبب الحذف النهائي" />
                <textarea
                    id="correction_notes"
                    name="correction_notes"
                    rows={2}
                    required
                    maxLength={1000}
                    className="mt-1 block w-full"
                    placeholder="اكتب سبب الحذف بوضوح"
                    value={form.data.correction_notes}
                    onChange={(e) => form.setData('correction_notes', e.target.value)}
                />
                <InputError message={form.errors.correction_notes} className="mt-2" />
                <p className="mt-2 text-xs text-gray-500">سيُسجَّل اسم المستخدم والوقت والسبب والحركات المتأثرة في سجل التدقيق.</p>
            </div>

            <BalanceAfter label="الرصيد بعد الحذف وإعادة الموازنة" balanceAfter={balanceAfter} />
        </FormModal>
    );
}
