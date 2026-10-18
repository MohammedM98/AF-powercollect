import { useForm } from '@inertiajs/react';
import Modal from '@/Components/Modal';
import FormField from '@/Components/Form/FormField';
import InputError from '@/Components/InputError';
import TextInput from '@/Components/TextInput';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { formatMoney } from '@/lib/format';
import { ledgerOf } from './LedgerColumns';

/** A saved bank review, posted only when the box receives final approval. */
export default function BankTransferAuditForm({ entry, onClose }) {
    const ledger = ledgerOf(entry);
    const { data, setData, post, processing, errors } = useForm({ bank_amount: entry.audit?.bank_amount ?? ledger.paidAmount, reason: entry.audit?.reason ?? '' });
    const difference = Math.round((Math.abs(Number(entry.transaction.amount)) - Number(data.bank_amount || 0) * Number(entry.transaction.exchange_rate || 1)) * 100) / 100;

    function submit(event) {
        event.preventDefault();
        post(entry.audit_url, { preserveScroll: true, onSuccess: onClose });
    }

    return <Modal show onClose={onClose} maxWidth="lg" centered>
        <form onSubmit={submit} className="space-y-5 p-6">
            <div><h2 className="text-xl font-bold text-gray-900">مراجعة الحوالة البنكية</h2><p className="mt-2 text-sm text-gray-600">{entry.transaction.subscription?.subscription_name || entry.transaction.subscription?.full_name} · المرجع {ledger.referenceNumber || '—'}</p></div>
            <p className="rounded-control border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">المسجّل: <b dir="ltr">{formatMoney(ledger.paidAmount)}</b> {ledger.currencyLabel}. تُحفظ المراجعة كمسودة قابلة للتعديل؛ يثبت أثرها المالي عند اعتماد الصندوق كاملًا.</p>
            <FormField id="audit-bank-amount" label={`المبلغ المثبت في البنك (${ledger.currencyLabel})`} required error={errors.bank_amount}><TextInput type="number" min="0" max="1000000" step="0.01" value={data.bank_amount} onChange={(event) => setData('bank_amount', event.target.value)} className="block w-full" required autoFocus /></FormField>
            <SecondaryButton type="button" onClick={() => setData('bank_amount', '0')}>لم تصل البنك</SecondaryButton>
            <FormField id="audit-reason" label={difference ? 'سبب فرق التدقيق' : 'ملاحظات المطابقة (اختياري)'} required={difference !== 0} error={errors.reason}><textarea rows="3" maxLength="1000" value={data.reason} onChange={(event) => setData('reason', event.target.value)} required={difference !== 0} className="block w-full rounded-control border-gray-200 text-sm" /></FormField>
            <p role="status" className="rounded-control bg-brand-500/10 p-3 text-sm font-semibold text-gray-900">{difference > 0 ? `عند اعتماد الصندوق سيُحمّل على المشترك ${formatMoney(difference)} شيكل بقيد مستقل.` : difference < 0 ? `عند اعتماد الصندوق سيُضاف لصالح المشترك ${formatMoney(-difference)} شيكل بقيد مستقل.` : 'الحوالة مطابقة؛ لن يُضاف قيد مالي.'}</p>
            <InputError message={errors.action || errors.audit} />
            <div className="flex justify-end gap-3"><SecondaryButton onClick={onClose} disabled={processing}>إلغاء</SecondaryButton><PrimaryButton disabled={processing}>حفظ مراجعة الحوالة</PrimaryButton></div>
        </form>
    </Modal>;
}
