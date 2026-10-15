import Icon from '@/Components/Icon';
import { formatMoney } from '@/lib/format';
import { dateTime } from '../Closings/ClosingComponents';
import { amountOf, foreignLine, Shekels } from './WeeklyParts';

function SectionCard({ icon, title, hint, children }) {
    return <section className="overflow-hidden rounded-panel border border-gray-100 bg-surface shadow-card">
        <header className="flex items-start gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-gray-100 text-gray-600"><Icon name={icon} className="h-5 w-5" /></span>
            <div><h3 className="text-lg font-bold text-gray-900">{title}</h3>{hint && <p className="text-xs text-gray-500">{hint}</p>}</div>
        </header>
        <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </section>;
}

/** A change between two figures, signed and coloured: up, down, or none. */
function Change({ value }) {
    const amount = Number(value ?? 0);
    if (!amount) return <span className="text-xs text-gray-400">بدون تغيير</span>;

    return <span className={`text-xs font-semibold ${amount > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-brand-600'}`}><bdi dir="ltr" className="font-display">{amount > 0 ? '+' : '−'}{formatMoney(Math.abs(amount))}</bdi> ₪</span>;
}

/** Each version of the week the branch sent, newest first, with what changed from the one before it. */
export function VersionsSection({ versions }) {
    const figures = [['cash', 'الكاش المستلم'], ['bank', 'الحوالات المؤكدة'], ['clearing', 'المقاصات المقبولة']];

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
                <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-control border border-gray-100 bg-gray-100 md:grid-cols-3">{figures.map(([key, label]) => <div key={key} className="bg-surface px-3 py-2.5">
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="font-bold text-gray-900"><Shekels value={version[key]?.ILS ?? 0} /></dd>
                    {foreignLine(version[key] ?? {}) && <dd className="text-xs text-gray-500">{foreignLine(version[key])}</dd>}
                    {previous && <dd><Change value={amountOf(version[key]) - amountOf(previous[key])} /></dd>}
                </div>)}</dl>
            </li>;
        })}</ol>
    </SectionCard>;
}
