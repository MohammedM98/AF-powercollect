import DatePicker from '@/Components/DatePicker';
import SelectInput from '@/Components/SelectInput';
import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import { AuditPagination, Money, PERIOD_LABELS, STATUS_LABELS, StatusBadge, auditTime } from './Shared';

export default function Index({ statements, branches, filters, branchView }) {
    const title = branchView ? 'متابعة تدقيق كشوف الفرع' : 'التدقيق المالي';
    const url = branchView ? '/closings/audit-statements' : '/financial-audit';
    const fieldClass = 'min-h-12 w-full rounded-xl border-gray-200 bg-surface px-4 py-3 text-base text-gray-900';
    function filter(key, value) {
        router.get(url, { ...filters, [key]: value || undefined }, { preserveState: true, preserveScroll: true });
    }
    return (
        <AuthenticatedLayout>
            <Head title={title} />
            <div className="mx-auto max-w-7xl space-y-8" dir="rtl">
                <header className="flex flex-wrap items-start justify-between gap-5">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
                        <p className="mt-3 max-w-3xl text-base leading-8 text-gray-600">{branchView ? 'تابع نتائج مراجعة كشوف الفرع، وأجب عن الحركات المعادة للتوضيح.' : 'راجع كشوف الفروع بعد إقفالها واعتمادها. أكد الحركات المطابقة، أو أعد الحركة التي تحتاج توضيحًا.'}</p>
                    </div>
                    {branchView && <Link href="/closings" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-gray-200 bg-surface px-5 py-3 text-base font-medium text-gray-700"><Icon name="wallet" className="h-5 w-5" />الصندوق المالي</Link>}
                </header>
                {!branchView && <div className="flex items-start gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-5 dark:border-blue-500/30 dark:bg-blue-500/10 sm:p-6">
                    <Icon name="shield" className="mt-1 h-6 w-6 shrink-0 text-blue-700 dark:text-blue-400" />
                    <div className="space-y-1"><p className="text-base font-semibold text-gray-900">المراجعة مقابل المرجع الموجود لدى التدقيق</p><p className="text-base leading-8 text-gray-700">يمكن أن يبقى المرجع خارج الموقع. الاعتماد يسجل نتيجة المراجعة؛ تسليم النقد وتأكيد استلامه لهما إجراء مستقل.</p></div>
                </div>}
                <section aria-labelledby="audit-filters-title" className="rounded-2xl border border-gray-200 bg-surface p-5 sm:p-6">
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 id="audit-filters-title" className="text-lg font-semibold text-gray-900">تصفية الكشوف</h2><button type="button" onClick={() => router.get(url)} className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">مسح التصفية</button></div>
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        <label className="grid gap-2 text-sm font-medium text-gray-700">الفرع<SelectInput className={fieldClass} value={filters.branch ?? ''} onChange={(e) => filter('branch', e.target.value)}><option value="">كل الفروع المتاحة</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</SelectInput></label>
                        <label className="grid gap-2 text-sm font-medium text-gray-700">نوع الكشف<SelectInput className={fieldClass} value={filters.type ?? ''} onChange={(e) => filter('type', e.target.value)}><option value="">كل الفترات</option>{Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectInput></label>
                        <label className="grid gap-2 text-sm font-medium text-gray-700">حالة التدقيق<SelectInput className={fieldClass} value={filters.status ?? ''} onChange={(e) => filter('status', e.target.value)}><option value="">كل الحالات</option>{['pending', 'under_audit', 'returned', 'audited'].map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</SelectInput></label>
                        <label className="grid gap-2 text-sm font-medium text-gray-700">من تاريخ<DatePicker type="date" className={fieldClass} value={filters.from ?? ''} onChange={(e) => filter('from', e.target.value)} /></label>
                        <label className="grid gap-2 text-sm font-medium text-gray-700">إلى تاريخ<DatePicker type="date" className={fieldClass} value={filters.to ?? ''} onChange={(e) => filter('to', e.target.value)} /></label>
                    </div>
                </section>
                <section aria-labelledby="audit-statements-title" className="overflow-hidden rounded-2xl border border-gray-200 bg-surface">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 p-5 sm:p-6"><div><h2 id="audit-statements-title" className="text-xl font-semibold text-gray-900">الكشوف المرسلة</h2><p className="mt-2 text-sm leading-7 text-gray-600">افتح الكشف لعرض حركاته وملاحظات التدقيق والردود.</p></div><span className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">{statements.total} كشف</span></div>
                    {statements.data.length ? <>
                        <p className="hidden border-b border-gray-200 px-6 py-3 text-sm leading-7 text-gray-600 md:block">يمكنك تمرير الجدول أفقيًا لعرض جميع الأعمدة وزر فتح الكشف.</p>
                        <div className="hidden overflow-x-auto md:block" tabIndex={0} role="region" aria-label="جدول الكشوف المرسلة">
                            <table className="w-full min-w-[1080px] text-right text-base leading-7">
                                <caption className="sr-only">كشوف الفروع المرسلة وحالة مراجعتها</caption>
                                <thead className="border-b border-gray-200 bg-gray-50 text-sm text-gray-600"><tr>{['الفرع ورقم الكشف', 'الفترة', 'التحصيل المثبت', 'تقدم المراجعة', 'حالة التدقيق', 'الإجراء'].map((label) => <th key={label} scope="col" className="px-6 py-5 text-start font-semibold">{label}</th>)}</tr></thead>
                                <tbody className="divide-y divide-gray-200">{statements.data.map((statement) => <tr key={statement.id} className="align-top hover:bg-gray-50/60">
                                    <td className="min-w-[260px] px-6 py-6"><p className="font-semibold text-gray-900">{statement.branchName}</p><p className="mt-2 text-sm text-gray-600"><bdi>{statement.number}</bdi></p><p className="mt-3 text-sm text-gray-600">أرسله {statement.submittedBy}</p><p className="text-sm text-gray-600">{auditTime(statement.submittedAt)}</p></td>
                                    <td className="min-w-[160px] px-6 py-6"><PeriodDates statement={statement} /></td>
                                    <td className="px-6 py-6 text-lg text-gray-900"><Money value={statement.total} cash /></td>
                                    <td className="min-w-[180px] px-6 py-6"><ReviewProgress statement={statement} /></td>
                                    <td className="min-w-[180px] px-6 py-6"><StatusBadge status={statement.status} /></td>
                                    <td className="px-6 py-6"><StatementLink statement={statement} /></td>
                                </tr>)}</tbody>
                            </table>
                        </div>
                        <div className="divide-y divide-gray-200 md:hidden">{statements.data.map((statement) => <article key={statement.id} className="space-y-5 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-gray-900">{statement.branchName}</h3><p className="mt-2 break-words text-sm text-gray-600"><bdi>{statement.number}</bdi></p></div><StatusBadge status={statement.status} /></div>
                            <dl className="grid gap-5 sm:grid-cols-2">
                                <div><dt className="mb-2 text-sm text-gray-600">الفترة</dt><dd><PeriodDates statement={statement} /></dd></div>
                                <div><dt className="mb-2 text-sm text-gray-600">التحصيل المثبت</dt><dd className="text-xl text-gray-900"><Money value={statement.total} cash /></dd></div>
                                <div><dt className="mb-2 text-sm text-gray-600">تقدم المراجعة</dt><dd><ReviewProgress statement={statement} /></dd></div>
                                <div><dt className="mb-2 text-sm text-gray-600">إرسال الكشف</dt><dd className="text-sm leading-7 text-gray-700">{statement.submittedBy}<br />{auditTime(statement.submittedAt)}</dd></div>
                            </dl>
                            <StatementLink statement={statement} />
                        </article>)}</div>
                    </> : <div className="flex flex-col items-center gap-4 px-6 py-14 text-center"><Icon name="shield" className="h-12 w-12 text-gray-400" /><h3 className="text-lg font-semibold text-gray-900">لا توجد كشوف بهذه التصفية</h3><p className="max-w-lg text-base leading-8 text-gray-600">تظهر الكشوف هنا بعد اعتماد إقفال الفرع وإرسالها من الصندوق المالي. يمكنك تغيير التصفية للبحث عن كشف آخر.</p></div>}
                </section>
                <AuditPagination links={statements.links} />
            </div>
        </AuthenticatedLayout>
    );
}

function PeriodDates({ statement }) {
    return <div className="space-y-2"><p className="font-medium text-gray-900">{PERIOD_LABELS[statement.type]}</p><p className="whitespace-nowrap text-sm text-gray-600">من <bdi>{statement.first}</bdi></p><p className="whitespace-nowrap text-sm text-gray-600">إلى <bdi>{statement.last}</bdi></p></div>;
}

function ReviewProgress({ statement }) {
    const percentage = statement.lines ? Math.round((statement.confirmed / statement.lines) * 100) : 0;
    return <div className="space-y-3"><p className="text-sm text-gray-700">{statement.confirmed} من {statement.lines} حركة مؤكدة</p><div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${percentage}%` }} /></div></div>;
}

function StatementLink({ statement }) {
    return <Link href={`/financial-audit/statements/${statement.id}`} aria-label={`فتح كشف ${statement.branchName} ${statement.number}`} className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-gray-200 bg-surface px-4 py-2.5 text-sm font-semibold text-blue-700 hover:border-blue-500 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10">فتح الكشف<Icon name="chevron-left" className="h-4 w-4" /></Link>;
}
