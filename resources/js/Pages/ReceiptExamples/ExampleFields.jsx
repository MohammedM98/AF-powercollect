import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';

export const emptyFields = { transaction_reference: '', sender_name: '', sender_account: '', amount: '', currency: 'ILS', transferred_at: '' };
export const purposes = { tuning: 'لتحسين قواعد القراءة', evaluation: 'لقياس الدقة فقط' };

export default function ExampleFields({ form, providers, uploading = false }) {
    const { data, setData, errors, processing } = form;
    const setField = (key, value) => setData('verified_fields', { ...data.verified_fields, [key]: value });
    return (
        <fieldset disabled={processing} className="grid gap-4 sm:grid-cols-2">
            <div>
                <InputLabel htmlFor="example-title" value="اسم المثال" />
                <TextInput id="example-title" required maxLength={150} value={data.title} onChange={(event) => setData('title', event.target.value)} className="mt-1 w-full" placeholder="مثال: حوالة iBURAQ بالشيكل" />
                <InputError message={errors.title} />
            </div>
            <div>
                <InputLabel htmlFor="example-layout" value="نوع الإيصال / شكل النموذج" />
                <TextInput id="example-layout" required maxLength={100} value={data.layout} onChange={(event) => setData('layout', event.target.value)} className="mt-1 w-full" placeholder="مثال: iBURAQ أو تحويل لمستفيد" />
                <InputError message={errors.layout} />
            </div>
            <div className="sm:col-span-2">
                <InputLabel htmlFor="example-provider" value="البنك أو المحفظة المصدرة للإيصال" />
                <select id="example-provider" required value={data.provider_id} onChange={(event) => setData('provider_id', event.target.value)} className="mt-1 w-full">
                    <option value="">اختر المزود</option>
                    {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name_ar}</option>)}
                </select>
                <InputError message={errors.provider_id} />
            </div>
            <fieldset className="grid gap-2 sm:col-span-2">
                <legend className="mb-2 text-sm font-semibold text-gray-900">استخدام المثال</legend>
                {Object.entries(purposes).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-3 rounded-control border border-gray-200 p-3 text-sm text-gray-900">
                        <input type="radio" name="purpose" value={value} checked={data.purpose === value} onChange={() => setData('purpose', value)} className="text-brand-600" />
                        <span>{label}</span>
                    </label>
                ))}
                <p className="text-xs text-gray-500">أمثلة قياس الدقة تُحجز للتقييم؛ لا تستخدمها لتعديل قواعد القراءة.</p>
                <InputError message={errors.purpose} />
            </fieldset>
            {uploading && <div className="sm:col-span-2">
                <InputLabel htmlFor="example-image" value="صورة الإيصال الأصلية" />
                <input id="example-image" type="file" required accept="image/jpeg,image/png,image/webp" onChange={(event) => setData('image', event.target.files?.[0] ?? null)} className="mt-1 w-full rounded-control border border-gray-200 p-2 text-sm text-gray-900" />
                <p className="mt-1 text-xs text-gray-500">JPG أو PNG أو WebP، حتى 8 ميجابايت. أخفِ أي بيانات شخصية غير لازمة قبل الرفع.</p>
                <InputError message={errors.image} />
            </div>}
            <div className="border-t border-gray-200 pt-4 sm:col-span-2">
                <h3 className="font-semibold text-gray-900">القيم الصحيحة من الإيصال</h3>
                <p className="text-sm text-gray-500">اكتب اسم المرسل، لا اسم المستفيد. هذه القيم هي المرجع الذي تُقارن به نتيجة القراءة.</p>
            </div>
            {[
                ['sender_name', 'اسم المرسل', 'text', false],
                ['transaction_reference', 'رقم التحويل / العملية', 'text', true],
                ['amount', 'المبلغ', 'text', true],
                ['sender_account', 'حساب المرسل (اختياري)', 'text', true],
                ['transferred_at', 'تاريخ التحويل', 'date', true],
            ].map(([key, label, type, ltr]) => (
                <div key={key}>
                    <InputLabel htmlFor={'verified-' + key} value={label} />
                    <TextInput id={'verified-' + key} type={type} dir={ltr ? 'ltr' : 'auto'} required={key !== 'sender_account'}
                        inputMode={key === 'amount' ? 'decimal' : undefined} value={data.verified_fields[key] ?? ''}
                        onChange={(event) => setField(key, event.target.value)} className="mt-1 w-full" />
                    <InputError message={errors['verified_fields.' + key]} />
                </div>
            ))}
            <div>
                <InputLabel htmlFor="verified-currency" value="العملة" />
                <select id="verified-currency" value={data.verified_fields.currency} onChange={(event) => setField('currency', event.target.value)} className="mt-1 w-full">
                    <option value="ILS">شيكل (ILS)</option><option value="USD">دولار أمريكي (USD)</option><option value="JOD">دينار أردني (JOD)</option>
                </select>
                <InputError message={errors['verified_fields.currency']} />
            </div>
            <InputError message={errors.verified_fields} className="sm:col-span-2" />
        </fieldset>
    );
}
