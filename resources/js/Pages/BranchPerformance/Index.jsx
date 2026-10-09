import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import MeterBar from '@/Components/Charts/MeterBar';
import Sparkline from '@/Components/Charts/Sparkline';
import Icon from '@/Components/Icon';
import KpiTile from '@/Components/KpiTile';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { formatMoney, formatNumber, percentOf, timeAgo } from '@/lib/format';
import BranchMark, { branchPlace } from './BranchMark';

const SORTS = [
    { value: 'collected', label: 'المحصَّل' },
    { value: 'outstanding', label: 'الديون' },
    { value: 'revenue', label: 'المُحمَّل' },
    { value: 'subscriptions', label: 'المشتركون' },
    { value: 'activity', label: 'النشاط' },
];

/** The sort the page opens in; it needs no `?sort=` in the address. */
const DEFAULT_SORT = 'collected';

function MiniStat({ label, value }) {
    return (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-2.5">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-0.5 font-display text-lg font-bold text-gray-900">{formatNumber(value)}</p>
        </div>
    );
}

/**
 * One branch: its place in the order, what it collected this month against
 * what it charged, what its subscriptions still owe, how many of them are
 * active, its entries over two weeks, and its staff. The whole card opens
 * the branch.
 */
function BranchCard({ branch, style }) {
    const activeShare = percentOf(branch.activeSubscriptions, branch.subscriptions);
    const hasRate = branch.collectionRate !== null;

    return (
        <article
            className="rise-in group relative flex min-w-0 flex-col rounded-panel border border-gray-100 bg-surface p-6 shadow-card transition-shadow hover:border-gray-200 hover:shadow-lift focus-within:ring-2 focus-within:ring-gray-900"
            style={style}
        >
            <header className="flex items-start gap-3.5">
                <BranchMark isActive={branch.isActive} />
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-xl font-bold text-gray-900">
                        <Link href={`/branch-performance/${branch.id}`} className="outline-none after:absolute after:inset-0 after:rounded-panel">
                            {branch.name}
                        </Link>
                    </h3>
                    <p className="truncate text-xs text-gray-500">
                        {branchPlace(branch) || '—'}
                        {!branch.isActive && ' · فرع متوقف'}
                    </p>
                </div>
                <span
                    className="shrink-0 rounded-full border border-gray-200 bg-surface px-2.5 py-0.5 font-display text-xs font-bold text-gray-700"
                    title="ترتيبه بين الفروع"
                >
                    #{branch.rank}
                </span>
            </header>

            <div className="mt-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                <div className="min-w-0">
                    <p className="text-xs text-gray-500">المحصَّل هذا الشهر</p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                        <span className="font-display text-3xl font-bold text-gray-900 sm:text-4xl">{formatMoney(branch.monthCollected)}</span>
                        <span className="text-sm text-gray-500">شيكل</span>
                    </p>
                </div>
                <div className="shrink-0 text-end">
                    <Sparkline values={branch.sparkline} label={`إدخالات ${branch.name} في آخر 14 يوم`} />
                    <p className="mt-1 text-[13px] text-gray-500">إدخالات آخر 14 يوم</p>
                </div>
            </div>

            <div className="mt-5">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-gray-500">
                        {hasRate ? (
                            <>
                                نسبة التحصيل · القابل للتحصيل <b className="font-display text-sm text-gray-900">{formatMoney(branch.monthCollectable)}</b>
                            </>
                        ) : (
                            'لا ديون ولا تحميلات بعد'
                        )}
                    </span>
                    <b className="font-display text-gray-700">{hasRate ? `${branch.collectionRate}%` : '—'}</b>
                </div>
                <MeterBar value={Math.min(branch.collectionRate ?? 0, 100)} max={100} className="mt-2" />
            </div>

            <div className="mt-4 flex items-baseline justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs">
                <span className="text-gray-700">الديون المستحقة · {formatNumber(branch.debtors)} مشترك</span>
                <b className="font-display text-sm text-amber-800 dark:text-amber-300">{formatMoney(branch.outstanding)} شيكل</b>
            </div>

            <div className="mt-4">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-gray-500">
                        <b className="font-display text-sm text-gray-900">{formatNumber(branch.activeSubscriptions)}</b> نشط من{' '}
                        {formatNumber(branch.subscriptions)}
                    </span>
                    <b className="font-display text-gray-700">{activeShare}%</b>
                </div>
                <MeterBar value={branch.activeSubscriptions} max={branch.subscriptions} className="mt-2" />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2.5">
                <MiniStat label="اليوم" value={branch.todayEntries} />
                <MiniStat label="آخر 7 أيام" value={branch.weekEntries} />
                <MiniStat label="الموظفون" value={branch.staff} />
            </div>

            <footer className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-4 text-xs">
                <span className="inline-flex items-center gap-1.5 text-gray-500">
                    <Icon name="clock" className="h-4 w-4" />
                    {branch.lastEntryAt ? `آخر إدخال ${timeAgo(branch.lastEntryAt)}` : 'لا إدخالات بعد'}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-gray-900 transition group-hover:text-brand-600" aria-hidden="true">
                    التفاصيل
                    <Icon name="chevron-left" className="h-4 w-4 transition group-hover:-translate-x-0.5" />
                </span>
            </footer>
        </article>
    );
}

/**
 * How every branch is doing, for the Super Admin: the totals across
 * branches, then one card per branch, ranked by what the sort buttons
 * pick. A card opens the branch's own page.
 */
export default function Index({ sort, summary, collection, branches }) {
    function changeSort(next) {
        router.get('/branch-performance', next === DEFAULT_SORT ? {} : { sort: next }, { preserveState: true, preserveScroll: true, replace: true });
    }

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-500">
                            {formatNumber(summary.branches)} فروع · {formatNumber(summary.activeBranches)} نشطة
                        </p>
                        <h1 className="mt-1 text-3xl font-bold text-gray-900">أداء الفروع</h1>
                        <p className="mt-1 text-sm text-gray-500">ما حصّله كل فرع وما بقي عليه، مع نشاطه وفريقه. اضغط على أي فرع لتفاصيل عمله اليومية.</p>
                    </div>
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2.5">
                        <span className="text-sm text-gray-500">ترتيب:</span>
                        <SegmentedTabs options={SORTS} value={sort} onChange={changeSort} label="ترتيب الفروع" />
                    </div>
                </>
            }
        >
            <Head title="أداء الفروع" />

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <KpiTile
                    icon="banknotes"
                    label="المحصَّل هذا الشهر"
                    value={formatMoney(collection.monthCollected)}
                    unit="شيكل"
                    hint={
                        collection.collectionRate === null
                            ? 'لا ديون ولا تحميلات بعد'
                            : `${collection.collectionRate}% من القابل للتحصيل (${formatMoney(collection.monthCollectable)})`
                    }
                    valueClassName="text-emerald-700 dark:text-emerald-400"
                />
                <KpiTile
                    icon="wallet"
                    label="الديون المستحقة"
                    value={formatMoney(collection.outstanding)}
                    unit="شيكل"
                    hint={`${formatNumber(collection.debtors)} مشترك مدين · كل الفروع`}
                    valueClassName="text-amber-700 dark:text-amber-400"
                />
                <KpiTile
                    icon="users"
                    label="المشتركون النشطون"
                    value={formatNumber(summary.activeSubscriptions)}
                    hint={`${percentOf(summary.activeSubscriptions, summary.subscriptions)}% من ${formatNumber(summary.subscriptions)} مشترك`}
                />
                <KpiTile
                    icon="chart"
                    label="إدخالات آخر 7 أيام"
                    value={formatNumber(summary.weekEntries)}
                    hint={`${formatNumber(summary.todayEntries)} اليوم · مشتركون جدد وقراءات`}
                />
            </div>

            {branches.length === 0 ? (
                <p className="mt-5 rounded-panel border border-gray-100 bg-surface p-12 text-center text-sm text-gray-500 shadow-card">
                    لا توجد فروع بعد.
                </p>
            ) : (
                <div className="mt-5 grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                    {branches.map((branch, index) => (
                        <BranchCard key={branch.id} branch={branch} style={{ '--rise-delay': `${Math.min(index, 8) * 60}ms` }} />
                    ))}
                </div>
            )}
        </AuthenticatedLayout>
    );
}
