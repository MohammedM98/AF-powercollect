import SelectInput from '@/Components/SelectInput';
import { useState } from 'react';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import { AuditPagination, Money, PERIOD_LABELS, STATUS_LABELS, StatusBadge, auditTime } from './Shared';

const ACTION_LABELS = { submitted: 'إرسال الكشف', confirmed: 'تأكيد حركة', returned: 'إرجاع حركة', responded: 'رد الفرع', audited: 'اعتماد التدقيق النهائي' };
const panelClass = 'rounded-2xl border border-gray-200 bg-surface p-5 sm:p-7';
const actionClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold';

export default function Show({ statement, lines, counts, lineStatus, events, canReview, canRespond, centralView, reviewRestriction }) {
    const [action, setAction] = useState(null);
    const { errors } = usePage().props;
    const total = Object.values(counts).reduce((sum, count) => sum + Number(count), 0);
    const confirmed = Number(counts.confirmed ?? 0);
    const unresolved = total - confirmed;
    const report = statement.snapshot.report;
    return (
        <AuthenticatedLayout>
            <Head title={`تدقيق ${statement.number}`} />
            <div className="mx-auto max-w-7xl space-y-8" dir="rtl">
                <Link href={centralView ? '/financial-audit' : '/closings/audit-statements'} className="inline-flex min-h-11 items-center gap-2 text-base text-gray-600 hover:text-blue-700"><Icon name="chevron-right" className="h-5 w-5" />{centralView ? 'العودة إلى التدقيق المالي' : 'العودة إلى كشوف الفرع'}</Link>
                <header className="space-y-6">
                    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold text-gray-900">كشف {statement.branchName}</h1><p className="mt-3 text-base text-gray-600">كشف {PERIOD_LABELS[statement.type]} من <bdi>{statement.first}</bdi> إلى <bdi>{statement.last}</bdi></p></div><StatusBadge status={statement.status} /></div>
                    <dl className="grid gap-5 border-b border-gray-200 pb-6 sm:grid-cols-3">
                        <Detail label="رقم الكشف"><bdi>{statement.number}</bdi></Detail>
                        <Detail label="أرسله من الفرع">{statement.submittedBy}</Detail>
                        <Detail label="وقت الإرسال">{auditTime(statement.submittedAt)}</Detail>
                    </dl>
                </header>
                {reviewRestriction && <p className="rounded-xl bg-amber-50 p-5 text-base leading-8 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">{reviewRestriction}</p>}
                <div className="grid gap-5 md:grid-cols-3">
                    <Metric label="التحصيل المثبت في الكشف" value={<Money value={report.actualCollectionTotal} cash />} icon="banknotes" />
                    <Metric label="الحركات المؤكدة" value={`${confirmed} من ${total}`} icon="check" />
                    <Metric label="بحاجة إلى توضيح من الفرع" value={counts.returned ?? 0} icon="undo" />
                </div>
                <section className={panelClass} aria-labelledby="audit-totals-title">
                    <h2 id="audit-totals-title" className="text-xl font-semibold text-gray-900">تفصيل مبالغ الكشف</h2>
                    <dl className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                        <Detail label="التحصيل النقدي"><Money value={report.cashTotal} cash /></Detail>
                        <Detail label="البنوك"><Money value={report.bankTotal} cash /></Detail>
                        <Detail label="المحافظ"><Money value={report.walletTotal} cash /></Detail>
                        <Detail label="المردودات الفعلية"><Money value={report.refundsTotal} cash /></Detail>
                    </dl>
                </section>
                <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5 dark:border-blue-500/30 dark:bg-blue-500/10 sm:p-7" aria-labelledby="audit-reference-title">
                    <h2 id="audit-reference-title" className="text-lg font-semibold text-gray-900">مراجعة نسخة الكشف وقت الإرسال</h2>
                    <p className="mt-3 max-w-3xl text-base leading-8 text-gray-700">تحقق من الحركات يدويًا مقابل المرجع الموجود لديك. لا يشترط إدخال المرجع أو رفعه إلى الموقع.</p>
                    <dl className="mt-6 grid gap-6 border-t border-blue-100 pt-6 dark:border-blue-500/30 sm:grid-cols-3">
                        <Detail label="النقد المتبقي في صندوق آخر يوم"><Money value={statement.snapshot.retained} /></Detail>
                        <Detail label="تسليمات الفترة قيد التحويل"><Money value={statement.snapshot.inTransit} /></Detail>
                        <Detail label="تسليمات الفترة المؤكد استلامها"><Money value={statement.snapshot.received} /></Detail>
                    </dl>
                    <p className="mt-6 text-sm leading-7 text-gray-600">اختلاف توقيت وصول النقد يحتاج تحققًا، ولا يعني وجود خطأ في التحصيل تلقائيًا.</p>
                </section>
                {errors.audit && <p role="alert" className="rounded-xl bg-rose-50 p-5 text-base text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">{errors.audit}</p>}
                <section className="space-y-6" aria-labelledby="audit-lines-title">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div><h2 id="audit-lines-title" className="text-xl font-semibold text-gray-900">مراجعة الحركات</h2><p className="mt-2 text-base leading-7 text-gray-600">راجع كل حركة على حدة. إرجاع حركة لا يلغي الدفعة ولا يغيّر أرقام الكشف.</p></div>
                        <label className="grid min-w-[180px] gap-2 text-sm font-medium text-gray-700">حالة الحركة<SelectInput className="min-h-12 rounded-xl border-gray-200 bg-surface px-4 py-3 text-base" value={lineStatus} onChange={(e) => router.get(`/financial-audit/statements/${statement.id}`, { line_status: e.target.value || undefined }, { preserveScroll: true })}><option value="">كل الحركات</option>{['pending', 'returned', 'responded', 'confirmed'].map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</SelectInput></label>
                    </div>
                    {!lines.data.length && <p className={`${panelClass} text-base text-gray-600`}>لا توجد حركات بهذه الحالة.</p>}
                    {lines.data.map((line) => <article key={line.id} className={panelClass}>
                        <div className="flex flex-wrap items-start justify-between gap-5">
                            <div className="min-w-0 space-y-3"><h3 className="break-words text-xl font-semibold text-gray-900">{line.details.subscriptionName || `اشتراك رقم ${line.details.subscriptionId}`}</h3><StatusBadge status={line.status} /></div>
                            <div className="space-y-2 text-end"><p className="text-sm text-gray-600">الأثر على التحصيل</p><p className="text-2xl text-gray-900"><Money value={line.details.collectionEffect} cash /></p></div>
                        </div>
                        <dl className="mt-6 grid gap-x-8 gap-y-5 border-t border-gray-200 pt-6 sm:grid-cols-2 xl:grid-cols-3">
                            <Detail label="رقم الحركة والوصل">حركة <bdi>#{line.details.transactionId}</bdi>{line.details.voucherNumber && <span className="mt-1 block">وصل <bdi>{line.details.voucherNumber}</bdi></span>}</Detail>
                            <Detail label="قناة الدفع">{line.details.channel || 'حركة تسوية'}</Detail>
                            <Detail label="وقت التسجيل">{auditTime(line.details.recordedAt)}</Detail>
                            <Detail label="سجلها">{line.details.enteredBy || '—'}</Detail>
                            <Detail label="مرجع الدفعة">{line.details.reference || '—'}</Detail>
                            {['correction', 'reversal'].includes(line.details.classification) && <Detail label="أثر السجل والحركة الأصلية"><Money value={line.details.ledgerEffect} /><span className="mt-1 block">الأصل <bdi>#{line.details.originalId}</bdi></span></Detail>}
                        </dl>
                        {line.details.reason && <div className="mt-6 border-t border-gray-200 pt-5"><p className="text-sm font-medium text-gray-600">سبب الحركة</p><p className="mt-2 whitespace-pre-wrap break-words text-base leading-8 text-gray-800">{line.details.reason}</p></div>}
                        {line.notes && <div className="mt-6 rounded-xl bg-amber-50 p-5 dark:bg-amber-900/30"><p className="font-semibold text-amber-900 dark:text-amber-200">ملاحظة التدقيق</p><p className="mt-2 whitespace-pre-wrap break-words text-base leading-8 text-amber-900 dark:text-amber-200">{line.notes}</p></div>}
                        {line.response && <div className="mt-6 rounded-xl bg-sky-50 p-5 dark:bg-sky-900/30">
                            <p className="font-semibold text-gray-900">رد الفرع</p><p className="mt-2 whitespace-pre-wrap break-words text-base leading-8 text-gray-800">{line.response}</p>
                            {line.correctionId && <p className="mt-4 text-sm font-medium text-gray-700">حركة التصحيح المرتبطة <bdi>#{line.correctionId}</bdi></p>}
                            {line.linkedCorrection && <><dl className="mt-5 grid gap-5 border-t border-sky-200 pt-5 dark:border-sky-800 sm:grid-cols-2"><Detail label="أثر التصحيح في السجل"><Money value={line.linkedCorrection.ledgerEffect} /></Detail><Detail label="أثر التصحيح النقدي"><Money value={line.linkedCorrection.collectionEffect} /></Detail><Detail label="وقت تسجيل التصحيح">{auditTime(line.linkedCorrection.recordedAt)}</Detail></dl><p className="mt-4 text-sm leading-7 text-gray-600">يظهر التصحيح منفصلًا عن أرقام الكشف الأصلية.</p></>}
                        </div>}
                        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 pt-5">
                            <div className="flex flex-wrap gap-3">
                                {canReview && ['pending', 'responded'].includes(line.status) && <button type="button" onClick={() => setAction({ kind: 'confirm', line })} className={`${actionClass} bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-200`}><Icon name="check" className="h-5 w-5" />تأكيد المطابقة</button>}
                                {canReview && line.status !== 'returned' && <button type="button" onClick={() => setAction({ kind: 'return', line })} className={`${actionClass} bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-200`}><Icon name="undo" className="h-5 w-5" />إرجاع للتوضيح</button>}
                                {canRespond && line.status === 'returned' && <button type="button" onClick={() => setAction({ kind: 'respond', line })} className={`${actionClass} bg-blue-700 text-white hover:bg-blue-800`}>إرسال رد للتدقيق</button>}
                            </div>
                            {line.reviewedBy && <p className="text-sm leading-7 text-gray-600">راجعها {line.reviewedBy}<br />{auditTime(line.reviewedAt)}</p>}
                        </div>
                    </article>)}
                    <AuditPagination links={lines.links} />
                </section>
                <section className={`${panelClass} flex flex-wrap items-center justify-between gap-6`}>
                    <div><h2 className="text-xl font-semibold text-gray-900">اعتماد التدقيق النهائي</h2><p className="mt-3 max-w-2xl text-base leading-8 text-gray-600">{statement.status === 'audited' ? `اعتمده ${statement.reviewedBy} بتاريخ ${auditTime(statement.reviewedAt)}` : unresolved ? `بقيت ${unresolved} حركة تحتاج معالجة وتأكيدًا قبل الاعتماد.` : 'اكتملت مراجعة جميع الحركات. يمكن اعتماد نتيجة التدقيق.'}</p></div>
                    {canReview && <button type="button" disabled={unresolved > 0} onClick={() => setAction({ kind: 'approve' })} className={`${actionClass} bg-emerald-700 px-5 text-base text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40`}><Icon name="shield" className="h-5 w-5" />اعتماد التدقيق</button>}
                </section>
                <section className={panelClass}>
                    <h2 className="text-xl font-semibold text-gray-900">سجل إجراءات التدقيق</h2>
                    <ol className="mt-6 space-y-6">{events.map((event) => <li key={event.id} className="space-y-2 border-s-2 border-blue-200 ps-5 dark:border-blue-500/30"><p className="text-base font-semibold text-gray-900">{ACTION_LABELS[event.action]}{event.lineId ? ` · سطر المراجعة #${event.lineId}` : ''}</p><p className="text-sm text-gray-600">{event.by} · {auditTime(event.at)}</p>{event.notes && <p className="whitespace-pre-wrap break-words text-base leading-8 text-gray-700">{event.notes}</p>}{event.correctionId && <p className="text-sm text-gray-600">التصحيح <bdi>#{event.correctionId}</bdi></p>}</li>)}</ol>
                    {events.length === 100 && <p className="mt-6 text-sm text-gray-600">يعرض آخر 100 إجراء؛ تبقى الإجراءات السابقة محفوظة.</p>}
                </section>
            </div>
            {action && <ReviewDialog key={`${action.kind}-${action.line?.id ?? 'final'}`} action={action} statementId={statement.id} onClose={() => setAction(null)} />}
        </AuthenticatedLayout>
    );
}

function Detail({ label, children }) {
    return <div className="min-w-0"><dt className="text-sm leading-6 text-gray-600">{label}</dt><dd className="mt-2 break-words text-base leading-7 text-gray-900">{children}</dd></div>;
}

function Metric({ label, value, icon }) {
    return <div className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-surface p-5 sm:p-6"><Icon name={icon} className="mt-1 h-6 w-6 shrink-0 text-blue-700 dark:text-blue-400" /><div className="min-w-0"><p className="text-sm leading-7 text-gray-600">{label}</p><p className="mt-4 text-2xl font-bold text-gray-900">{value}</p></div></div>;
}

function ReviewDialog({ action, statementId, onClose }) {
    const responding = action.kind === 'respond';
    const returning = action.kind === 'return';
    const final = action.kind === 'approve';
    const form = useForm({ action: action.kind, notes: '', response: '', correction_transaction_id: '' });
    const title = responding ? 'رد الفرع على الحركة المعادة' : returning ? 'إرجاع الحركة للتوضيح' : final ? 'اعتماد التدقيق النهائي' : 'تأكيد مطابقة الحركة';
    function submit(e) {
        e.preventDefault();
        const base = `/financial-audit/statements/${statementId}`;
        const options = { preserveScroll: true, onSuccess: onClose };
        if (responding) form.post(`${base}/lines/${action.line.id}/response`, options);
        else if (final) form.post(`${base}/approve`, options);
        else form.put(`${base}/lines/${action.line.id}`, options);
    }
    return <Modal show centered onClose={() => !form.processing && onClose()}>
        <form onSubmit={submit} className="space-y-6 p-6 sm:p-8" dir="rtl">
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <p className="text-base leading-8 text-gray-600">{responding ? 'وضح المعالجة. إذا احتاجت الحركة تصحيحًا ماليًا، استخدم مسار التصحيح الحالي ثم اربط رقمه هنا.' : returning ? 'اذكر موضع اللبس وما يحتاجه التدقيق. الإرجاع لا يلغي الدفعة ولا يفتح الفترة المقفلة.' : final ? 'تثبيت نتيجة مراجعة هذا الكشف بعد تأكيد جميع حركاته.' : 'أكد الحركة بعد مراجعتها مقابل المرجع الموجود لديك. لا يشترط إدخال المرجع أو رفعه.'}</p>
            <label className="grid gap-3 text-base font-medium text-gray-700">{responding ? 'الرد والمعالجة' : returning ? 'سبب الإرجاع' : 'ملاحظة اختيارية'}<textarea autoFocus rows={5} required={responding || returning} maxLength={2000} className="w-full rounded-xl border-gray-200 p-4 text-base leading-8" value={responding ? form.data.response : form.data.notes} onChange={(e) => form.setData(responding ? 'response' : 'notes', e.target.value)} /></label>
            {responding && <label className="grid gap-3 text-base font-medium text-gray-700">رقم حركة التصحيح المرتبطة (اختياري)<input type="number" min="1" value={form.data.correction_transaction_id} onChange={(e) => form.setData('correction_transaction_id', e.target.value)} className="min-h-12 w-full rounded-xl border-gray-200 p-3 text-base" /></label>}
            {Object.entries(form.errors).map(([key, error]) => <p role="alert" key={key} className="text-base text-rose-700">{error}</p>)}
            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-6"><button type="button" disabled={form.processing} onClick={onClose} className={`${actionClass} border border-gray-200 text-gray-700`}>إلغاء</button><button type="submit" disabled={form.processing} className={`${actionClass} bg-blue-700 text-white disabled:opacity-50`}>{form.processing ? 'جارٍ الحفظ…' : title}</button></div>
        </form>
    </Modal>;
}
