import { useForm } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { formatMoney } from '@/lib/format';
import { dateTime } from '../Closings/ClosingComponents';
import { currencies } from '../Payments/CollectorCashBox';
import { amountOf, foreignLine, Shekels } from './WeeklyParts';

/** The cash ledger's rows, in the order the safe's balance adds up. */
const LEDGER_ROWS = [
    ['opening', 'رصيد أول الفترة'],
    ['received', 'استلام الصناديق'],
    ['repayments', 'تسديد الديون'],
    ['sent', 'ما خرج للشركة (−)'],
    ['adjustments', 'قيود التصحيح'],
    ['safeDifference', 'فرق جرد الخزنة'],
    ['remaining', 'الرصيد الباقي للفترة'],
    ['afterCutoff', 'حركة الفترات التالية'],
    ['actualNow', 'الرصيد الفعلي الآن'],
];
const TOTAL_ROWS = ['remaining', 'actualNow'];

function SectionCard({ icon, title, hint, children }) {
    return <section className="overflow-hidden rounded-panel border border-gray-100 bg-surface shadow-card">
        <header className="flex items-start gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-gray-100 text-gray-600"><Icon name={icon} className="h-5 w-5" /></span>
            <div><h3 className="text-lg font-bold text-gray-900">{title}</h3>{hint && <p className="text-xs text-gray-500">{hint}</p>}</div>
        </header>
        <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </section>;
}

function CurrencyAmount({ value, currency }) {
    return currency === 'ILS' ? <Shekels value={value} /> : <span className="whitespace-nowrap"><bdi dir="ltr" className="font-display">{formatMoney(value)}</bdi> {currencies[currency]}</span>;
}

/** A change between two figures, signed and coloured: up, down, or none. */
function Change({ value }) {
    const amount = Number(value ?? 0);
    if (!amount) return <span className="text-xs text-gray-400">بدون تغيير</span>;

    return <span className={`text-xs font-semibold ${amount > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-brand-600'}`}><bdi dir="ltr" className="font-display">{amount > 0 ? '+' : '−'}{formatMoney(Math.abs(amount))}</bdi> ₪</span>;
}

/**
 * The week's safe: whether it must be counted before the week is sent, the
 * count against what the system expected, and the cash ledger that adds up
 * to the safe's balance.
 */
export function SafeSection({ week, onCount }) {
    const { required, count, ledger } = week.safe;
    const shown = Object.keys(currencies).filter((currency) => currency === 'ILS' || LEDGER_ROWS.some(([key]) => Number(ledger?.[key]?.[currency] ?? 0) !== 0) || Number(count?.counts?.[currency] ?? 0) !== 0);

    return <SectionCard icon="wallet" title="الخزنة ومعادلة الكاش" hint="جرد الخزنة مطلوب قبل الإرسال متى احتفظ الفرع بكاش.">
        {count ? <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><Icon name="check" className="h-3.5 w-3.5" /></span>جُردت الخزنة</p>
                <p className="text-xs text-gray-500">{count.by ?? '—'} · {dateTime(count.at)}</p>
            </div>
            <dl className="grid gap-px overflow-hidden rounded-control border border-gray-100 bg-gray-100 sm:grid-cols-3">{[['المعدود', count.counts], ['المتوقع', count.expected], ['الفرق', count.differences]].map(([label, amounts]) => <div key={label} className="bg-surface px-4 py-3">
                <dt className="text-xs text-gray-500">{label}</dt>
                {shown.map((currency) => <dd key={currency} className={`font-bold ${label === 'الفرق' && amountOf(amounts, currency) ? 'text-amber-700 dark:text-amber-400' : 'text-gray-900'}`}><CurrencyAmount value={amounts?.[currency] ?? 0} currency={currency} /></dd>)}
            </div>)}</dl>
            {count.reason && <p className="rounded-control bg-gray-50 p-3 text-sm text-gray-700">سبب الفرق: {count.reason}</p>}
        </div> : required ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-amber-500/25 bg-amber-500/5 p-4">
            <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400"><Icon name="alert" className="h-4 w-4 shrink-0" />الفرع يحتفظ بكاش، والخزنة لم تُجرد بعد.</p>
            {week.can.countSafe && <PrimaryButton type="button" onClick={onCount}><Icon name="lock" className="h-4 w-4" />جرد الخزنة</PrimaryButton>}
        </div> : <p className="flex items-center gap-2 rounded-control bg-gray-50 p-4 text-sm text-gray-600"><Icon name="info" className="h-4 w-4 shrink-0" />لا يحتفظ الفرع بكاش في الخزنة، فلا يلزم جرد هذا الأسبوع.</p>}

        {ledger && <div className="overflow-x-auto rounded-control border border-gray-200">
            <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-4 py-3 text-start font-semibold">معادلة الكاش</th>{shown.map((currency) => <th key={currency} className="px-4 py-3 text-start font-semibold">{currencies[currency]}</th>)}</tr></thead>
                <tbody>{LEDGER_ROWS.map(([key, label]) => <tr key={key} className={`border-t border-gray-100 ${TOTAL_ROWS.includes(key) ? 'bg-brand-500/5 font-bold text-brand-600' : 'text-gray-700'}`}>
                    <td className="px-4 py-3">{label}</td>
                    {shown.map((currency) => <td key={currency} className="px-4 py-3"><bdi dir="ltr" className="font-display">{formatMoney(ledger[key]?.[currency] ?? 0)}</bdi></td>)}
                </tr>)}</tbody>
            </table>
        </div>}
    </SectionCard>;
}

/** Each version of the week the branch sent, newest first, with what changed from the one before it. */
export function VersionsSection({ versions }) {
    const figures = [['cash', 'الكاش المستلم'], ['bank', 'الحوالات المؤكدة'], ['clearing', 'المقاصات المقبولة'], ['safe', 'رصيد الخزنة']];

    return <SectionCard icon="history" title="النسخ المرسلة" hint="كل إرسال يحفظ نسخة؛ السحب يُبقي النسخة في السجل، والإرسال التالي ينشئ نسخة جديدة.">
        <ol className="space-y-3">{versions.map((version, index) => {
            const previous = versions[index + 1];

            return <li key={version.id} className="rounded-card border border-gray-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex flex-wrap items-center gap-2"><b className="text-gray-900">النسخة <span className="font-display">{version.version}</span></b>
                        {version.withdrawnAt ? <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">مسحوبة</span> : <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">المرسلة حاليًا</span>}
                    </p>
                    <p className="text-xs text-gray-500">{version.by ?? '—'} · {dateTime(version.at)}</p>
                </div>
                {version.notes && <p className="mt-2 text-sm text-gray-600">ملاحظة الفرع: {version.notes}</p>}
                <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-control border border-gray-100 bg-gray-100 md:grid-cols-4">{figures.map(([key, label]) => <div key={key} className="bg-surface px-3 py-2.5">
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="font-bold text-gray-900"><Shekels value={version[key]?.ILS ?? 0} /></dd>
                    {foreignLine(version[key] ?? {}) && <dd className="text-xs text-gray-500">{foreignLine(version[key])}</dd>}
                    {previous && <dd><Change value={amountOf(version[key]) - amountOf(previous[key])} /></dd>}
                </div>)}</dl>
            </li>;
        })}</ol>
    </SectionCard>;
}

/** Counting the safe: the cash in it, in shekels and in any other currency it holds, and why it differs if it does. */
export function SafeCountModal({ week, branchId, url, onClose }) {
    const form = useForm({ branch_id: branchId, counts: { ILS: '', USD: '0', JOD: '0' }, reason: '' });
    const shown = week.safe.currencies;

    function submit(event) {
        event.preventDefault();
        form.post(`${url}/safe-count/${week.id}`, { preserveScroll: true, onSuccess: onClose });
    }

    return <Modal show onClose={onClose} maxWidth="lg" centered><form onSubmit={submit} className="flex max-h-[90vh] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-5">
            <div><h2 className="text-xl font-bold text-gray-900">جرد الخزنة</h2><p className="text-sm text-gray-500">قبل إرسال الأسبوع لقسم التدقيق</p></div>
            <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-control p-2 text-gray-500 transition hover:bg-gray-100"><Icon name="close" className="h-5 w-5" /></button>
        </header>
        <div className="space-y-4 overflow-y-auto px-6 py-5">
            <p className="flex gap-2 rounded-control bg-sky-500/10 p-3.5 text-sm leading-7 text-sky-700 dark:text-sky-400"><Icon name="info" className="mt-1.5 h-4 w-4 shrink-0" />{shown.length > 1 ? 'عدّ الكاش بالشيكل، وما بقي في الخزنة من عملات أخرى كل عملة وحدها.' : 'عدّ الكاش في الخزنة بالشيكل واكتب المجموع.'}</p>
            <div className={`grid gap-3 ${shown.length > 1 ? 'sm:grid-cols-3' : ''}`}>{shown.map((currency) => <label key={currency} className="grid gap-1.5 text-sm font-semibold text-gray-700">{currencies[currency]}
                <input type="number" required min="0" step="0.01" dir="ltr" autoComplete="off" placeholder="0" value={form.data.counts[currency]} onChange={(event) => form.setData('counts', { ...form.data.counts, [currency]: event.target.value })} className="block w-full py-2.5 font-display text-lg" />
            </label>)}</div>
            <label className="grid gap-1.5 text-sm font-semibold text-gray-700">سبب الفرق، إن وُجد<textarea rows="3" value={form.data.reason} onChange={(event) => form.setData('reason', event.target.value)} className="block w-full text-sm" /></label>
            {Object.values(form.errors).length > 0 && <div role="alert" className="rounded-control bg-brand-500/10 p-4 text-sm text-brand-600">{Object.values(form.errors).map((error) => <p key={error}>{error}</p>)}</div>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4">
            <SecondaryButton type="button" onClick={onClose}>إلغاء</SecondaryButton>
            <PrimaryButton type="submit" disabled={form.processing}><Icon name="check" className="h-4 w-4" />{form.processing ? 'جارٍ الحفظ…' : 'حفظ الجرد'}</PrimaryButton>
        </footer>
    </form></Modal>;
}
