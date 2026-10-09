import { useForm } from '@inertiajs/react';
import FormModal from '@/Components/FormModal';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import { OriginalLine } from './CorrectionFields';

export default function ClosingAdjustmentModal({ onClose, subscription, entry, action }) {
    const reversing = action === 'reverse';
    const form = useForm({ action, ...(reversing ? {} : { amount: entry.amount }), amendment_reason: '' });
    const adjustmentForm = { ...form, save: (options) => form.post(`/subscriptions/${subscription.id}/transactions/${entry.id}/actions`, options) };
    return <FormModal show onClose={onClose} form={adjustmentForm} title={reversing ? 'إلغاء أثر حركة مغلقة' : 'تصحيح حركة مغلقة'} icon="repeat" maxWidth="xl" bodyClassName="space-y-5"
        action={{ submitLabel: 'تسجيل الحركة', title: 'تسجيل التسوية؟', confirmLabel: 'نعم، سجّل', icon: 'repeat' }} saveConfirmMessage="ستبقى الحركة الأصلية كما هي. تُسجَّل تسوية مرتبطة بها في الأسبوع المفتوح دون تحصيل أو إرجاع أموال.">
        <OriginalLine entry={entry} />
        <p className="text-sm text-gray-600">التصحيح يؤثر على رصيد المشترك فقط. أي دفعة أو إرجاع حقيقي يُسجَّل كحركة أموال مستقلة.</p>
        {!reversing && <div><InputLabel htmlFor="closing-correction-amount" value="القيمة الصحيحة الكلية بعد التصحيح" /><input id="closing-correction-amount" type="number" min="0" step="0.01" required value={form.data.amount} onChange={(e) => form.setData('amount', e.target.value)} className="block w-full" /><InputError message={form.errors.amount} /></div>}
        <div><InputLabel htmlFor="closing-correction-reason" value="سبب التصحيح أو الإلغاء" /><textarea id="closing-correction-reason" required maxLength={1000} value={form.data.amendment_reason} onChange={(e) => form.setData('amendment_reason', e.target.value)} className="block w-full" /><InputError message={form.errors.amendment_reason ?? form.errors.action ?? form.errors.transaction} /></div>
    </FormModal>;
}
