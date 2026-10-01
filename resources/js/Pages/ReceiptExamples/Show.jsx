import { useState } from 'react';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import InputError from '@/Components/InputError';
import ConfirmDialog from '@/Components/ConfirmDialog';
import ExampleFields from './ExampleFields';

const time = (value) => value ? new Intl.DateTimeFormat('ar-PS', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Hebron' }).format(new Date(value)) : 'قيد التنفيذ';

export default function Show({ example, providers, runs, urls, ocrConfigured, canReparse }) {
    const form = useForm({ title: example.title, layout: example.layout, purpose: example.purpose, provider_id: example.provider_id, verified_fields: { ...example.verified_fields } });
    const { errors, status } = usePage().props;
    const [testing, setTesting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const latest = runs[0];
    const busy = form.processing || testing;
    function save(event) {
        event.preventDefault();
        form.put(urls.update, { preserveScroll: true, onSuccess: () => form.defaults() });
    }
    function test(mode) { router.post(urls.test, { mode }, { preserveScroll: true, onStart: () => setTesting(true), onFinish: () => setTesting(false) }); }
    function value(field, content) {
        if (content === null || content === undefined || content === '') return 'لم تُقرأ';
        if (field === 'provider') return providers.find((provider) => provider.code === content)?.name_ar ?? content;
        if (field === 'transferred_at') return content.split('T')[0];
        return content;
    }
    return (
        <SettingsLayout header={<div className="flex flex-wrap items-center gap-4"><Link href={urls.index} className="text-sm font-semibold text-brand-600">أمثلة الإيصالات</Link><h2 className="text-3xl font-bold text-gray-900">{example.title}</h2></div>}>
            <Head title={example.title} />
            <div className="space-y-6">
                {status && <p role="status" className="rounded-control border border-gray-200 bg-surface p-4 text-sm text-gray-900">{status}</p>}
                <div className="grid items-start gap-6 lg:grid-cols-2">
                    <form onSubmit={save} className="space-y-5 rounded-card border border-gray-200 bg-surface p-5 sm:p-6">
                        <h3 className="text-xl font-bold text-gray-900">البيانات المرجعية</h3>
                        <fieldset disabled={testing}><ExampleFields form={form} providers={providers} /></fieldset>
                        <SecondaryButton type="submit" disabled={busy || !form.isDirty}>{form.processing ? 'جاري الحفظ…' : 'حفظ البيانات المرجعية'}</SecondaryButton>
                        {form.isDirty && <p className="text-sm text-amber-800 dark:text-amber-300">احفظ التعديلات قبل اختبار المثال. تغيير القيم الصحيحة يستلزم اختبارًا جديدًا.</p>}
                    </form>
                    <figure className="rounded-card border border-gray-200 bg-gray-50 p-3 lg:sticky lg:top-6">
                        <a href={example.imageUrl} target="_blank" rel="noopener noreferrer" className="block" aria-label="فتح الصورة الأصلية بالحجم الكامل"><img src={example.imageUrl} alt={'الإيصال المرجعي: ' + example.title} className="max-h-[750px] w-full object-contain" /></a>
                        <figcaption className="p-3 text-center text-xs text-gray-500">الصورة الأصلية · أضافها {example.uploadedBy} · اضغط لفتحها بالحجم الكامل</figcaption>
                    </figure>
                </div>
                <section className="space-y-4 rounded-card border border-gray-200 bg-surface p-5 sm:p-6" aria-busy={testing}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-xl font-bold text-gray-900">اختبار القراءة</h3>
                        <div className="flex flex-wrap gap-3">
                            <PrimaryButton type="button" disabled={busy || form.isDirty || !ocrConfigured} onClick={() => test('cloud')}>{testing ? 'جاري الاختبار…' : 'قراءة الصورة ومقارنة النتيجة'}</PrimaryButton>
                            <SecondaryButton disabled={busy || form.isDirty || !canReparse} onClick={() => test('reparse')}>إعادة تحليل النص المحفوظ</SecondaryButton>
                        </div>
                    </div>
                    <p className="text-sm text-gray-500">قراءة الصورة ترسلها إلى خدمة القراءة وتستهلك طلبًا. إعادة تحليل النص المحفوظ تختبر القواعد الجديدة دون إرسال الصورة مجددًا. لا تُنشأ دفعة في أي من الحالتين.</p>
                    {!ocrConfigured && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">خدمة قراءة الصور لم تُفعّل بعد على الخادم.</p>}
                    <InputError message={errors?.test} />
                    {!latest && <p className="py-6 text-center text-gray-500">اختبر المثال لعرض القيم المقروءة بجانب القيم الصحيحة.</p>}
                    {latest?.error && <p role="alert" className="rounded-control bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">{latest.error}</p>}
                    {latest?.comparison && <>
                        <div className="flex flex-wrap justify-between gap-3 text-sm text-gray-600"><span>{latest.comparison.matched} من {latest.comparison.total} حقول مطابقة</span><span>اختبره {latest.testedBy} في {time(latest.testedAt)}</span></div>
                        {!latest.current && <p className="rounded-control bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">هذه النتيجة لا تخص القيم المرجعية أو قواعد القراءة الحالية. أعد الاختبار لتحديث قياس الدقة.</p>}
                        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-gray-200 text-gray-500"><tr>{['الحقل', 'القيمة الصحيحة وقت الاختبار', 'القيمة المقروءة', 'النتيجة'].map((label) => <th key={label} className="px-3 py-3 text-start">{label}</th>)}</tr></thead><tbody>{Object.entries(latest.comparison.fields).map(([field, result]) => <tr key={field} className="border-b border-gray-100">
                            <th scope="row" className="px-3 py-4 text-start font-semibold text-gray-900">{result.label}</th>
                            <td className="max-w-xs break-words px-3 py-4 text-gray-900" dir="auto">{value(field, result.expected)}</td>
                            <td className="max-w-xs break-words px-3 py-4 text-gray-900" dir="auto">{value(field, result.extracted)}</td>
                            <td className={'px-3 py-4 font-semibold ' + (result.matches ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>{result.matches ? 'مطابق' : 'غير مطابق'}</td>
                        </tr>)}</tbody></table></div>
                        {latest.warnings.length > 0 && <details><summary className="cursor-pointer text-sm font-semibold text-gray-900">تنبيهات القراءة ({latest.warnings.length})</summary><ul className="mt-3 list-inside list-disc space-y-2 text-sm text-gray-600">{latest.warnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul></details>}
                        {latest.rawText && <details><summary className="cursor-pointer text-sm font-semibold text-gray-900">النص المقروء من الصورة</summary><pre dir="auto" className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-control bg-gray-50 p-4 font-sans text-sm text-gray-900">{latest.rawText}</pre></details>}
                    </>}
                </section>
                {runs.length > 0 && <section className="rounded-card border border-gray-200 bg-surface p-5 sm:p-6"><h3 className="mb-3 text-xl font-bold text-gray-900">آخر الاختبارات</h3><div className="divide-y divide-gray-100">{runs.map((run) => <div key={run.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm text-gray-600"><span>{time(run.testedAt)} · {run.testedBy} · {run.mode === 'cloud' ? 'قراءة صورة' : 'تحليل نص محفوظ'}</span><span>{run.status === 'failed' ? 'تعذر الاختبار' : run.status === 'pending' ? 'قيد التنفيذ' : run.comparison.matched + '/' + run.comparison.total + ' حقول مطابقة'}</span></div>)}</div></section>}
                <div className="flex justify-end"><SecondaryButton disabled={busy} onClick={() => setDeleting(true)}>حذف المثال المرجعي</SecondaryButton></div>
                <ConfirmDialog show={deleting} onCancel={() => setDeleting(false)} onConfirm={() => { setDeleting(false); router.delete(urls.destroy); }} title="حذف المثال المرجعي؟" message="ستُحذف الصورة الأصلية والقيم المرجعية وجميع نتائج اختبار هذا المثال. لا يتأثر أي سجل دفعات." confirmLabel="حذف المثال" tone="danger" />
            </div>
        </SettingsLayout>
    );
}
