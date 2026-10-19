import { useId } from 'react';
import { useForm } from '@inertiajs/react';
import DialogFrame from '@/Components/DialogFrame';
import FormField from '@/Components/Form/FormField';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { formatMoney } from '@/lib/format';
import { bankAuditReasonChoice, bankAuditReasonPresets } from '@/lib/bankAudit';
import { ledgerOf } from './LedgerColumns';

/** A saved bank review, posted only when the box receives final approval. */
export default function BankTransferAuditForm({ entry, onClose }) {
    const id = useId();
    const ledger = ledgerOf(entry);
    const { data, setData, post, processing, errors } = useForm({ bank_amount: entry.audit?.bank_amount ?? ledger.paidAmount, reason: entry.audit?.reason ?? '' });
    const difference = Math.round((Math.abs(Number(entry.transaction.amount)) - Number(data.bank_amount || 0) * Number(entry.transaction.exchange_rate || 1)) * 100) / 100;

    function submit(event) {
        event.preventDefault();
        post(entry.audit_url, { preserveScroll: true, onSuccess: onClose });
    }

    return <DialogFrame show onClose={onClose} busy={processing} title="تعديل الحوالة البنكية" description={entry.transaction.subscription?.subscription_name || entry.transaction.subscription?.full_name} icon="pencil" maxWidth="2xl" footer={<>
        <SecondaryButton onClick={onClose} disabled={processing}>إلغاء</SecondaryButton>
        <PrimaryButton type="submit" form={`${id}-form`} disabled={processing}>{processing ? 'جارٍ الحفظ…' : 'حفظ تعديل الحوالة'}</PrimaryButton>
    </>}>
        <form id={`${id}-form`} onSubmit={submit} className="space-y-5">
            <dl className="flex flex-wrap justify-between gap-4 border-b border-gray-100 pb-4 text-base">
                <div><dt className="text-gray-600">الرقم المرجعي</dt><dd className="mt-1 font-display font-semibold text-gray-900"><bdi dir="ltr">{ledger.referenceNumber || '—'}</bdi></dd></div>
                <div><dt className="text-gray-600">المبلغ المسجّل</dt><dd className="mt-1 font-display text-xl font-bold text-gray-900"><bdi dir="ltr">{formatMoney(ledger.paidAmount)}</bdi> <span className="text-base font-normal">{ledger.currencyLabel}</span></dd></div>
            </dl>
            <FormField id={`${id}-amount`} label={`المبلغ الذي وصل البنك (${ledger.currencyLabel})`} required error={errors.bank_amount}><TextInput type="number" min="0" max="1000000" step="0.01" value={data.bank_amount} onChange={(event) => setData('bank_amount', event.target.value)} className="block w-full !text-xl" required autoFocus /></FormField>
            <div>
                <InputLabel htmlFor={`${id}-reason`}>{difference ? 'سبب الفرق' : 'ملاحظات (اختياري)'}{difference !== 0 && <span className="text-red-500"> *</span>}</InputLabel>
                <div className="mt-2 overflow-hidden rounded-control border border-gray-200 transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                    <select aria-label="توضيحات التدقيق الجاهزة" value={bankAuditReasonPresets.find((option) => option.label === data.reason)?.value ?? ''} onChange={(event) => setData(bankAuditReasonChoice(data, event.target.value))} disabled={processing} className="block w-full rounded-none border-0 border-b border-gray-200 bg-gray-50 py-3 text-base text-gray-700 focus:ring-0">
                        <option value="">توضيح جاهز (اختياري)</option>
                        {bankAuditReasonPresets.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <textarea id={`${id}-reason`} rows="3" maxLength="1000" value={data.reason} onChange={(event) => setData('reason', event.target.value)} required={difference !== 0} disabled={processing} aria-describedby={`${id}-reason-hint`} aria-invalid={Boolean(errors.reason)} placeholder="اكتب توضيحك هنا، أو اختر من القائمة أعلاه…" className="block w-full rounded-none border-0 p-4 text-base leading-8 focus:ring-0" />
                </div>
                <p id={`${id}-reason-hint`} className="mt-2 text-sm leading-7 text-gray-600">يمكنك تعديل التوضيح المختار أو كتابة نص خاص.</p>
                <InputError message={errors.reason} className="mt-1" />
            </div>
            <div role="status" aria-live="polite" className="rounded-control bg-brand-500/5 p-4">
                <p className="text-base text-gray-600">عند اعتماد الصندوق</p>
                <p className="mt-1 font-semibold text-gray-900">{difference > 0 ? 'يُحمّل على المشترك' : difference < 0 ? 'يُضاف لصالح المشترك' : 'مطابقة · لا يوجد فرق مالي'}</p>
                {difference !== 0 && <p className="mt-2 font-display text-2xl font-bold text-gray-900"><bdi dir="ltr">{formatMoney(Math.abs(difference))}</bdi> <span className="text-base font-normal">شيكل</span></p>}
            </div>
            <p className="text-base text-gray-600">تُحفظ كمسودة. يثبت أثرها المالي عند اعتماد الصندوق.</p>
            <InputError message={errors.action || errors.audit} />
        </form>
    </DialogFrame>;
}
