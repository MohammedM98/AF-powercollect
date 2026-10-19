import { useForm } from '@inertiajs/react';
import Modal from '@/Components/Modal';
import Icon from '@/Components/Icon';
import HoldToConfirm from '@/Components/HoldToConfirm';
import SecondaryButton from '@/Components/SecondaryButton';
import InputError from '@/Components/InputError';
import { formatMoney } from '@/lib/format';

/** Final financial approval, scoped to the full box or branch week shown here. */
export default function AuditApprovalDialog({ title, scope, summary, url, payload = {}, onClose }) {
    const form = useForm({ ...payload, confirmed: false });
    const close = () => { if (!form.processing) onClose(); };

    return <Modal show onClose={close} maxWidth="3xl" centered>
        <div role="alertdialog" aria-modal="true" aria-labelledby="audit-approval-title" className="flex max-h-[90vh] flex-col">
            <header className="flex items-center gap-3 border-b border-gray-100 px-7 py-5"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600"><Icon name="check" /></span><div><h2 id="audit-approval-title" className="text-lg font-bold text-gray-900">{title}</h2><p className="mt-1 text-sm text-gray-600">{scope}</p></div></header>
            <div className="space-y-4 overflow-y-auto px-7 py-5">
                <p className="text-sm leading-7 text-gray-600">سيُعتمد كامل النطاق الموضح هنا، بصرف النظر عن البحث والفلاتر. تُرحّل فروق المراجعات المحفوظة، وتُعتمد بقية الحوالات كمطابقة. بعد الاعتماد تُقفل قرارات التدقيق.</p>
                <dl className="grid grid-cols-2 gap-3 rounded-control border border-gray-100 bg-gray-50 p-4 text-sm">
                    {[['الصناديق', summary.boxes], ['الحوالات', summary.transfers], ['حوالات فيها فروق جديدة', summary.exceptions], ['حوالات ستُطابق تلقائيًا', summary.automaticMatches], ['تحميل على المشتركين', `${formatMoney(summary.debit)} شيكل`], ['إضافة لصالح المشتركين', `${formatMoney(summary.credit)} شيكل`]].map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 font-semibold text-gray-900">{value}</dd></div>)}
                </dl>
                <label className="flex items-start gap-3 rounded-control border border-gray-200 p-3 text-sm leading-6 text-gray-800"><input type="checkbox" checked={form.data.confirmed} onChange={(event) => form.setData('confirmed', event.target.checked)} disabled={form.processing} className="mt-1 rounded border-gray-300 text-brand-600" /><span>أؤكد انتهاء التدقيق وتسجيل جميع الحوالات التي فيها مشاكل، وأن بقية الحوالات مطابقة لكشف البنك.</span></label>
                <InputError message={form.errors.confirmed || form.errors.action || form.errors.snapshot || form.errors.box_ids || form.errors.week || form.errors.branch_id} />
                <HoldToConfirm count={summary.boxes} noun="الصناديق" tone="primary" icon="check" disabled={!form.data.confirmed || summary.boxes === 0} busy={form.processing} label="اضغط مطولًا ٣ ثوانٍ للاعتماد النهائي" confirmLabel="اعتماد التدقيق نهائيًا" onConfirm={() => form.post(url, { preserveScroll: true, onSuccess: onClose })} />
            </div>
            <footer className="flex justify-end border-t border-gray-100 bg-gray-50 px-7 py-4"><SecondaryButton disabled={form.processing} onClick={close}>العودة للمراجعة</SecondaryButton></footer>
        </div>
    </Modal>;
}
