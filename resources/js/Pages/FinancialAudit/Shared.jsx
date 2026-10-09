import { Link, useForm } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import { closingMoney } from '@/lib/closing';
import { cashAmountClass } from '@/Components/FinancialBalance';

export const PERIOD_LABELS = { daily: 'يومي', weekly: 'أسبوعي', monthly: 'شهري' };
export const STATUS_LABELS = { pending: 'بانتظار المراجعة', under_audit: 'قيد التدقيق', returned: 'بحاجة إلى توضيح', responded: 'بانتظار إعادة التحقق', confirmed: 'مؤكدة', audited: 'معتمد من التدقيق' };
const TONES = {
    pending: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
    under_audit: 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    returned: 'bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
    responded: 'bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200',
    confirmed: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
    audited: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
};

export function StatusBadge({ status }) {
    return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold leading-5 ${TONES[status] ?? 'bg-gray-100 text-gray-700'}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function Money({ value, cash = false }) {
    return <span dir="ltr" className={`inline-block whitespace-nowrap font-display font-semibold tabular-nums ${cash ? cashAmountClass(value) : ''}`}>{closingMoney(value ?? '0.00')} ₪</span>;
}

export function auditTime(value) {
    return value ? new Date(value).toLocaleString('ar-PS', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export function AuditPagination({ links }) {
    if (!links || links.length <= 3) return null;
    return <nav aria-label="صفحات الكشوف" className="flex flex-wrap gap-2">{links.map((link, i) => {
        const label = i === 0 ? 'السابق' : i === links.length - 1 ? 'التالي' : link.label;
        const className = `inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-4 py-2.5 text-sm ${link.active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-surface text-gray-700'}`;
        return link.url ? <Link key={i} href={link.url} preserveScroll className={className}>{label}</Link> : <span key={i} className={`${className} opacity-40`}>{label}</span>;
    })}</nav>;
}

export function SendAuditButton({ branchId, type, date, label = 'إرسال الكشف إلى التدقيق' }) {
    const form = useForm({ branch_id: branchId, type, date });
    return <div>
        <button type="button" disabled={form.processing} onClick={() => form.post('/financial-audit/statements', { preserveScroll: true })} className="inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-blue-700 px-5 py-3 text-base font-semibold !text-white hover:bg-blue-800 disabled:opacity-50"><Icon name="send" className="h-5 w-5" />{label}</button>
        {Object.values(form.errors).map((error, i) => <p key={i} role="alert" className="mt-2 text-sm text-rose-700">{error}</p>)}
    </div>;
}
