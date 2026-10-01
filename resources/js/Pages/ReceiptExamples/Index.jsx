import { useEffect, useState } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import Pagination from '@/Components/DataTable/Pagination';
import ExampleFields, { emptyFields, purposes } from './ExampleFields';

const percent = (matched, total) => total ? Math.round(matched / total * 100) + '%' : 'لم يُقَس بعد';

export default function Index({ examples, providers, summary, filters, urls, ocrConfigured }) {
    const [adding, setAdding] = useState(examples.total === 0);
    const [preview, setPreview] = useState(null);
    const form = useForm({ title: '', layout: '', provider_id: providers[0]?.id ?? '', purpose: 'tuning', image: null, verified_fields: { ...emptyFields } });
    const filterForm = useForm({ search: filters.search ?? '', provider_id: filters.provider_id ?? '', purpose: filters.purpose ?? '' });
    useEffect(() => {
        if (!form.data.image) { setPreview(null); return; }
        const url = URL.createObjectURL(form.data.image);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [form.data.image]);
    function save(event) { event.preventDefault(); form.post(urls.store); }
    const evaluated = summary.filter((group) => group.purpose === 'evaluation');
    const tested = evaluated.reduce((count, group) => count + group.tested, 0);
    const matched = evaluated.reduce((count, group) => count + group.matched, 0);
    const total = evaluated.reduce((count, group) => count + group.total, 0);
    return (
        <SettingsLayout header={<h2 className="text-3xl font-bold text-gray-900">أمثلة الإيصالات</h2>}>
            <Head title="أمثلة الإيصالات" />
            <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl space-y-1">
                        <p className="text-gray-900">مكتبة خاصة لاختبار قراءة الإيصالات ومقارنتها بالقيم الصحيحة.</p>
                        <p className="text-sm text-gray-500">الأمثلة لا تُسجل دفعات، ولا تدخل في تدريب نموذج تلقائيًا.</p>
                    </div>
                    <PrimaryButton type="button" onClick={() => setAdding(!adding)}>{adding ? 'إغلاق نموذج الإضافة' : 'إضافة مثال'}</PrimaryButton>
                </div>
                {!ocrConfigured && <p role="status" className="rounded-control border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">خدمة قراءة الصور لم تُفعّل بعد. يمكنك حفظ الأمثلة والقيم الصحيحة الآن، ثم اختبارها عند تفعيل الخدمة على الخادم.</p>}
                {adding && <section className="rounded-card border border-gray-200 bg-surface p-5 sm:p-6">
                    <h3 className="mb-5 text-xl font-bold text-gray-900">إضافة مثال مرجعي</h3>
                    <div className="grid items-start gap-6 lg:grid-cols-2">
                        <form onSubmit={save} className="space-y-5">
                            <ExampleFields form={form} providers={providers} uploading />
                            {form.progress && <p role="status" className="text-sm text-gray-500">جاري الرفع: {form.progress.percentage}%</p>}
                            <PrimaryButton disabled={form.processing}>{form.processing ? 'جاري الحفظ…' : 'حفظ المثال المرجعي'}</PrimaryButton>
                        </form>
                        <div className="rounded-control border border-gray-200 bg-gray-50 p-3 lg:sticky lg:top-6">
                            {preview ? <img src={preview} alt="معاينة صورة الإيصال قبل الرفع" className="max-h-[720px] w-full object-contain" /> : <div className="flex min-h-[300px] items-center justify-center p-8 text-center text-sm text-gray-500">اختر صورة الإيصال لعرضها هنا أثناء إدخال القيم الصحيحة.</div>}
                        </div>
                    </div>
                </section>}
                <section className="rounded-card border border-gray-200 bg-surface p-5 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-xl font-bold text-gray-900">نتائج قياس الدقة</h3>
                        <span className="text-sm text-gray-500">{tested} مثال تقييم مختبر · تطابق الحقول: <b className="text-gray-900">{percent(matched, total)}</b></span>
                    </div>
                    <p className="mt-2 text-sm text-gray-500">تُحسب أحدث النتائج المكتملة فقط، بالقيم المرجعية وقواعد القراءة الحالية. النسبة تقيس تطابق الحقول، لا تقدير ثقة خدمة القراءة.</p>
                    {summary.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">أضف أمثلة لكل نوع إيصال، واحتفظ بأمثلة منفصلة لقياس الدقة.</p> : <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-start text-sm">
                            <thead className="border-b border-gray-200 text-gray-500"><tr>{['المزود / النوع', 'الاستخدام', 'اختُبرت', 'تطابق الحقول'].map((label) => <th key={label} className="px-3 py-3 text-start font-semibold">{label}</th>)}</tr></thead>
                            <tbody>{summary.map((group, index) => <tr key={index} className="border-b border-gray-100 align-top">
                                <td className="px-3 py-4 text-gray-900"><b>{group.provider}</b><span className="block text-gray-500">{group.layout}</span></td>
                                <td className="px-3 py-4 text-gray-600">{purposes[group.purpose]}</td>
                                <td className="px-3 py-4 text-gray-900">{group.tested} من {group.examples}</td>
                                <td className="px-3 py-4 text-gray-900"><b>{percent(group.matched, group.total)}</b>
                                    {group.total > 0 && <details className="mt-2"><summary className="cursor-pointer text-xs text-gray-500">دقة كل حقل</summary><dl className="mt-2 space-y-1">{Object.values(group.fields).map((field) => <div key={field.label} className="flex justify-between gap-4"><dt>{field.label}</dt><dd>{field.matched}/{field.total}</dd></div>)}</dl></details>}
                                </td>
                            </tr>)}</tbody>
                        </table>
                    </div>}
                </section>
                <section className="rounded-card border border-gray-200 bg-surface p-5 sm:p-6">
                    <h3 className="text-xl font-bold text-gray-900">الأمثلة المحفوظة</h3>
                    <form onSubmit={(event) => { event.preventDefault(); filterForm.get(urls.index, { preserveState: true, preserveScroll: true }); }} className="my-4 flex flex-wrap gap-3">
                        <input aria-label="البحث في الأمثلة" placeholder="اسم المثال أو نوع الإيصال" value={filterForm.data.search} onChange={(event) => filterForm.setData('search', event.target.value)} className="min-w-0 flex-1" />
                        <select aria-label="تصفية حسب المزود" value={filterForm.data.provider_id} onChange={(event) => filterForm.setData('provider_id', event.target.value)}><option value="">جميع المزودين</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name_ar}</option>)}</select>
                        <select aria-label="تصفية حسب الاستخدام" value={filterForm.data.purpose} onChange={(event) => filterForm.setData('purpose', event.target.value)}><option value="">كل الاستخدامات</option>{Object.entries(purposes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                        <SecondaryButton type="submit" disabled={filterForm.processing}>بحث</SecondaryButton>
                    </form>
                    <div className="divide-y divide-gray-100">{examples.data.map((example) => <Link key={example.id} href={example.url} className="flex flex-wrap items-center justify-between gap-3 rounded-control px-3 py-4 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
                        <span><b className="text-gray-900">{example.title}</b><small className="block text-gray-500">{example.provider} · {example.layout} · {purposes[example.purpose]}</small></span>
                        <span className="text-sm text-gray-500">{example.status === 'untested' ? 'لم يُختبر بعد' : example.status === 'failed' ? 'تعذر الاختبار' : example.status === 'pending' ? 'قيد الاختبار' : example.current ? example.matched + ' / ' + example.total + ' حقول مطابقة' : 'يحتاج إعادة اختبار'}</span>
                    </Link>)}</div>
                    {examples.data.length === 0 && <p className="py-8 text-center text-sm text-gray-500">لا توجد أمثلة بهذه التصفية.</p>}
                    <div className="mt-4"><Pagination meta={examples} filters={filters} baseUrl={urls.index} /></div>
                </section>
            </div>
        </SettingsLayout>
    );
}
