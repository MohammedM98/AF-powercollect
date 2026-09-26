import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import MetricCard from '@/Components/MetricCard';
import Sparkline from '@/Components/Charts/Sparkline';
import { formatAmount } from '@/lib/currency';
import { timeAgo } from '@/lib/dates';

const SORTS = [
    { value: 'revenue', label: 'الإيرادات' },
    { value: 'subscribers', label: 'المشتركون' },
    { value: 'activity', label: 'النشاط' },
];

function percent(part, total) {
    return total > 0 ? Math.round((part / total) * 100) : 0;
}

function SortSwitch({ sort }) {
    return (
        <div className="inline-flex items-center gap-1 rounded-control border border-gray-100 bg-surface p-[3px] shadow-sm">
            <span className="px-2 text-xs text-gray-400">ترتيب:</span>
            {SORTS.map((option) => (
                <Link
                    key={option.value}
                    href={`/branch-performance?sort=${option.value}`}
                    preserveScroll
                    replace
                    aria-current={sort === option.value ? 'true' : undefined}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        sort === option.value ? 'bg-gray-100 text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                    {option.label}
                </Link>
            ))}
        </div>
    );
}

/** One branch: its ledger total, subscribers, recent entries and staff; the whole card opens its details. */
function BranchCard({ branch, style }) {
    const activePct = percent(branch.activeSubscribers, branch.subscribers);
    const location = [branch.governorateName, branch.areaName].filter(Boolean).join(' · ');

    return (
        <article
            className="rise-in group relative flex cursor-pointer flex-col rounded-hero border border-gray-100 bg-surface p-6 shadow-card transition hover:border-gray-200 hover:shadow-lift"
            style={style}
            onClick={(event) => !event.target.closest('a') && router.visit(`/branch-performance/${branch.id}`)}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-graphite-gradient text-white dark:ring-1 dark:ring-white/10">
                        <Icon name="pin" className="h-5 w-5" />
                        <span
                            className={`absolute -bottom-0.5 -start-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-surface ${branch.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`}
                            aria-label={branch.isActive ? 'فرع نشط' : 'فرع متوقف'}
                        />
                    </span>
                    <div className="min-w-0">
                        <h3 className="truncate text-xl font-bold text-gray-900">{branch.name}</h3>
                        {location && <p className="truncate text-sm text-gray-500">{location}</p>}
                    </div>
                </div>
                <span
                    className="shrink-0 rounded-lg border border-gray-100 bg-gray-50 px-2 py-1 font-display text-xs font-bold text-gray-600"
                    dir="ltr"
                >
                    #{branch.rank}
                </span>
            </div>

            <div className="mt-6 flex items-end justify-between gap-4">
                <div>
                    <p className="text-xs text-gray-500">إجمالي القيود</p>
                    <p className="mt-1">
                        <span className="font-display text-4xl font-bold text-gray-900">{formatAmount(branch.ledgerTotal)}</span>{' '}
                        <span className="text-sm text-gray-500">شيكل</span>
                    </p>
                </div>
                <div className="text-center">
                    <Sparkline values={branch.sparkline} />
                    <p className="mt-1 text-[12px] text-gray-400">إدخالات آخر 14 يوم</p>
                </div>
            </div>

            <div className="mt-5">
                <div className="flex items-baseline justify-between text-xs text-gray-500">
                    <span>
                        <b className="font-display text-sm text-gray-900">{branch.activeSubscribers}</b> نشط من {branch.subscribers}
                    </span>
                    <b className="font-display text-gray-900">{activePct}%</b>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${activePct}%` }} />
                </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2.5">
                {[
                    ['اليوم', branch.todayEntries],
                    ['آخر 7 أيام', branch.weekEntries],
                    ['الموظفون', branch.staff],
                ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                        <div className="text-[12px] text-gray-500">{label}</div>
                        <div className="font-display text-lg font-bold text-gray-900">{value}</div>
                    </div>
                ))}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4 text-sm">
                <span className="inline-flex items-center gap-1.5 text-gray-500">
                    <Icon name="clock" className="h-4 w-4" />
                    آخر إدخال {timeAgo(branch.lastEntryAt)}
                </span>
                <Link
                    href={`/branch-performance/${branch.id}`}
                    prefetch
                    className="inline-flex items-center gap-1 font-semibold text-gray-900 transition group-hover:text-brand-600"
                >
                    التفاصيل
                    <Icon name="chevron-left" className="h-4 w-4" strokeWidth={2} />
                </Link>
            </div>
        </article>
    );
}

export default function Index({ sort, summary, branches }) {
    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-500">
                            {summary.branches} فروع · {summary.activeBranches} نشطة
                        </p>
                        <h2 className="mt-1 text-3xl font-bold text-gray-900">أداء الفروع</h2>
                        <p className="mt-2 text-sm text-gray-500">إيرادات ونشاط وفريق كل فرع، اضغط على أي فرع لتفاصيل عمله اليومية.</p>
                    </div>
                    <SortSwitch sort={sort} />
                </>
            }
        >
            <Head title="أداء الفروع" />

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon="ledger" label="إجمالي القيود" hint="كل الفروع · منذ البداية">
                    {formatAmount(summary.ledgerTotal)} <span className="font-sans text-sm font-normal text-gray-500">شيكل</span>
                </MetricCard>
                <MetricCard
                    icon="users"
                    label="المشتركون النشطون"
                    hint={`${percent(summary.activeSubscribers, summary.subscribers)}% من ${summary.subscribers} مشترك`}
                >
                    {summary.activeSubscribers}
                </MetricCard>
                <MetricCard icon="arrow-trend" label="إدخالات آخر 7 أيام" hint={`${summary.todayEntries} اليوم`}>
                    {summary.weekEntries}
                </MetricCard>
                <MetricCard icon="user" label="الموظفون" hint={`موزعون على ${summary.branches} فروع`}>
                    {summary.staff}
                </MetricCard>
            </div>

            {branches.length === 0 ? (
                <div className="mt-6 rounded-card border border-dashed border-gray-200 bg-surface px-6 py-16 text-center text-sm text-gray-500">
                    لا توجد فروع لعرض أدائها.
                </div>
            ) : (
                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    {branches.map((branch, index) => (
                        <BranchCard key={branch.id} branch={branch} style={{ '--rise-delay': `${index * 70}ms` }} />
                    ))}
                </div>
            )}
        </AuthenticatedLayout>
    );
}
