import { Fragment } from 'react';
import { Head, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import BarChart from '@/Components/Charts/BarChart';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import { formatAmount } from '@/lib/currency';
import { formatClock, formatDayLabel, localDay } from '@/lib/dates';

const PERIODS = [
    { value: 'today', label: 'اليوم' },
    { value: '7', label: '7 أيام' },
    { value: '30', label: '30 يوم' },
    { value: '90', label: '90 يوم' },
    { value: 'all', label: 'الكل' },
];

const PERIOD_CAPTIONS = { today: 'اليوم', 7: 'آخر 7 أيام', 30: 'آخر 30 يوم', 90: 'آخر 90 يوم', all: 'منذ البداية' };

const STATUS_DOTS = { active: 'green', suspended: 'amber', disconnected: 'gray' };

function Shekels({ amount, digits = 2, className = '' }) {
    return (
        <span className={`whitespace-nowrap ${className}`}>
            <b className="font-display font-bold text-gray-900">{formatAmount(amount, digits)}</b> <span className="text-xs text-gray-500">شيكل</span>
        </span>
    );
}

function PeriodTabs({ period, onChange }) {
    return (
        <div role="group" aria-label="الفترة" className="inline-flex gap-0.5 rounded-control border border-gray-100 bg-surface p-[3px] shadow-sm">
            {PERIODS.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={period === option.value}
                    onClick={() => onChange(option.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${
                        period === option.value ? 'bg-gray-100 text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

/** The graphite headline card: the period's total and how it compares with the period before. */
function TotalCard({ summary, caption }) {
    const change = summary.changePct;

    return (
        <div className="rise-in relative overflow-hidden rounded-panel bg-graphite-gradient p-6 text-white shadow-lift lg:col-span-1">
            <div className="pointer-events-none absolute -end-10 -top-16 h-56 w-56 rounded-full bg-brand-500/25 blur-3xl" aria-hidden="true" />
            <div className="relative flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[#c9ced6]">إجمالي القيود · {caption}</p>
                {change !== null && (
                    <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-xs font-bold ${
                            change >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-brand-500/20 text-[#f3a4a9]'
                        }`}
                        dir="ltr"
                    >
                        {change >= 0 ? '+' : ''}
                        {change}%
                    </span>
                )}
            </div>
            <p className="relative mt-4">
                <span className="font-display text-5xl font-bold">{formatAmount(summary.total)}</span>{' '}
                <span className="text-sm text-[#c9ced6]">شيكل</span>
            </p>
            <p className="relative mt-3 text-xs text-[#9aa3ae]">
                {summary.count.toLocaleString('en-US')} قيد
                {summary.previousTotal > 0 && <> · مقارنة بالفترة السابقة ({formatAmount(summary.previousTotal)} شيكل)</>}
                {summary.previousTotal === 0 && <> · لا توجد قيود في الفترة السابقة</>}
                {summary.paid > 0 && <> · المسدَّد {formatAmount(summary.paid)} شيكل</>}
            </p>
            <div className="brand-spectrum absolute inset-x-6 bottom-0" aria-hidden="true" />
        </div>
    );
}

function FigureCard({ icon, label, amount, hint }) {
    return (
        <div className="rise-in rounded-panel border border-gray-100 bg-surface p-6 shadow-card">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-gray-700">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-500">
                    <Icon name={icon} className="h-[18px] w-[18px]" />
                </span>
                {label}
            </div>
            <p className="mt-5">
                <span className="font-display text-3xl font-bold text-gray-900">{formatAmount(amount, 2)}</span>{' '}
                <span className="text-sm text-gray-500">شيكل</span>
            </p>
            <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
        </div>
    );
}

function BranchBreakdown({ branches, caption }) {
    const max = Math.max(1, ...branches.map((branch) => branch.total));

    return (
        <section className="rise-in rounded-panel border border-gray-100 bg-surface p-6 shadow-card">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-bold text-gray-900">حسب الفرع</h3>
                <span className="text-xs text-gray-400">{caption}</span>
            </div>
            {branches.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">لا توجد قيود في هذه الفترة.</p>
            ) : (
                <ul className="mt-5 space-y-4">
                    {branches.map((branch) => (
                        <li key={branch.id}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="truncate font-semibold text-gray-900">{branch.name}</span>
                                <b className="font-display text-gray-900">{formatAmount(branch.total)}</b>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                                <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${(branch.total / max) * 100}%` }} />
                            </div>
                            <p className="mt-1 text-[11px] text-gray-400">{branch.count.toLocaleString('en-US')} قيد</p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default function Index({ entries, period, summary, dayTotals, dailyTotals, branchTotals, scopeLabel, filters, filterOptions }) {
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/financial-log', filters, { period });
    const caption = PERIOD_CAPTIONS[period];
    const today = localDay();
    // Grouping by day only reads right while the list is in date order.
    const groupByDay = filters.sort === 'created_at';
    // Payments are stored as negative amounts; the totals count charges only.
    const pageTotal = entries.data.filter((entry) => !entry.isPayment).reduce((total, entry) => total + Number(entry.amount), 0);

    function changePeriod(next) {
        router.get(
            '/financial-log',
            { search, sort: filters.sort, direction: filters.direction, per_page: filters.per_page, filter: filterValues, period: next },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    }

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-500">{scopeLabel}</p>
                        <h2 className="mt-1 text-3xl font-bold text-gray-900">السجل المالي</h2>
                        <p className="mt-2 text-sm text-gray-500">كل القيود المالية المسجلة على المشتركين، مرتبة حسب اليوم.</p>
                    </div>
                    <PeriodTabs period={period} onChange={changePeriod} />
                </>
            }
        >
            <Head title="السجل المالي" />

            <div className="grid gap-5 lg:grid-cols-3">
                <TotalCard summary={summary} caption={caption} />
                <FigureCard icon="chart" label="متوسط القيد" amount={summary.average} hint="المبلغ ÷ عدد القيود" />
                <FigureCard icon="dollar" label="أكبر قيد" amount={summary.largest} hint={caption} />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <section className="rise-in rounded-panel border border-gray-100 bg-surface p-6 shadow-card lg:col-span-2">
                    <div className="mb-6 flex items-baseline justify-between gap-3">
                        <h3 className="text-lg font-bold text-gray-900">القيود اليومية</h3>
                        <span className="text-xs text-gray-400">بالشيكل · آخر {dailyTotals.length} يوم</span>
                    </div>
                    <BarChart data={dailyTotals} label="مجموع القيود اليومية بالشيكل" formatValue={(value) => `${formatAmount(value)} شيكل`} />
                </section>
                <BranchBreakdown branches={branchTotals} caption={caption} />
            </div>

            <div className="mt-5">
                <DataTableToolbar
                    search={search}
                    onSearchChange={setSearch}
                    placeholder="بحث باسم المشترك أو رقم الهاتف..."
                    perPage={filters.per_page}
                    onPerPageChange={setPerPage}
                    total={entries.total}
                    filterMenu={
                        <DataTableFilterMenu
                            tableKey="financial-log"
                            groups={filterOptions}
                            values={filterValues}
                            onChange={setFilter}
                            onClear={clearFilters}
                        />
                    }
                />

                <div className="data-table-container">
                    <table className="data-table w-full text-start text-sm">
                        <thead>
                            <tr>
                                <SortableTh column="created_at" label="الوقت" sortState={filters} onSort={sort} />
                                <th>المشترك</th>
                                <th>الفرع</th>
                                <th>النوع</th>
                                <th>سجّله</th>
                                <SortableTh column="amount" label="المبلغ" sortState={filters} onSort={sort} />
                            </tr>
                        </thead>
                        <tbody>
                            {entries.data.length === 0 ? (
                                <tr>
                                    <td colSpan={6}>لا توجد قيود مطابقة في هذه الفترة.</td>
                                </tr>
                            ) : (
                                entries.data.map((entry, index) => {
                                    const startsDay = groupByDay && entry.day !== entries.data[index - 1]?.day;
                                    const day = dayTotals[entry.day];

                                    return (
                                        <Fragment key={entry.id}>
                                            {startsDay && (
                                                <tr className="data-table-group">
                                                    <td colSpan={6}>
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <span className="flex items-center gap-2 font-bold text-gray-900">
                                                                {formatDayLabel(entry.day)}
                                                                {entry.day === today && (
                                                                    <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">
                                                                        اليوم
                                                                    </span>
                                                                )}
                                                            </span>
                                                            {day && (
                                                                <span className="text-xs text-gray-500">
                                                                    {day.count} قيد · <Shekels amount={day.total} />
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            <tr>
                                                <td className="whitespace-nowrap text-gray-600">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <Icon name="clock" className="h-4 w-4 text-gray-400" />
                                                        {groupByDay
                                                            ? formatClock(entry.time)
                                                            : `${formatDayLabel(entry.day)} · ${formatClock(entry.time)}`}
                                                    </span>
                                                </td>
                                                <td>
                                                    <RowIdentity
                                                        name={entry.subscriberName}
                                                        subtitle={entry.subscriberPhone}
                                                        subtitleDir="ltr"
                                                        status={STATUS_DOTS[entry.subscriberStatus]}
                                                    />
                                                </td>
                                                <td className="text-gray-600">{entry.branchName}</td>
                                                <td>
                                                    <span className="inline-flex whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                                                        {entry.typeLabel}
                                                    </span>
                                                </td>
                                                <td className="text-gray-600">{entry.recordedByName ?? '—'}</td>
                                                <td>
                                                    {entry.isPayment ? (
                                                        <span className="whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                                                            <b className="font-display font-bold" dir="ltr">
                                                                −{formatAmount(Math.abs(entry.amount), 2)}
                                                            </b>{' '}
                                                            <span className="text-xs">شيكل</span>
                                                        </span>
                                                    ) : (
                                                        <Shekels amount={entry.amount} />
                                                    )}
                                                </td>
                                            </tr>
                                        </Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {entries.data.length > 0 && (
                    <div className="data-table-footer flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
                        <span>
                            مجموع قيود هذه الصفحة: <Shekels amount={pageTotal} />
                        </span>
                        <span>
                            مجموع {caption}: <Shekels amount={summary.total} className="[&>b]:text-brand-600" />
                        </span>
                    </div>
                )}

                <Pagination meta={entries} filters={filters} baseUrl="/financial-log" extraParams={{ period }} />
            </div>
        </AuthenticatedLayout>
    );
}
