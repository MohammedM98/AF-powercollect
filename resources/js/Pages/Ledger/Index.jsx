import { Fragment } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import BarChart from '@/Components/Charts/BarChart';
import MeterBar from '@/Components/Charts/MeterBar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import Pagination from '@/Components/DataTable/Pagination';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import SortableTh from '@/Components/DataTable/SortableTh';
import Icon from '@/Components/Icon';
import KpiTile from '@/Components/KpiTile';
import PeriodTabs, { periodCaption } from '@/Components/PeriodTabs';
import { useDataTable } from '@/hooks/useDataTable';
import { useRowClick } from '@/hooks/useRowClick';
import { useStatementWindow } from '@/hooks/useStatementWindow';
import { formatClock, formatDayLabel, formatMoney, formatNumber, formatShortDay } from '@/lib/format';
import StatementModal from '@/Pages/Subscriptions/StatementModal';

const STATUS_DOTS = { active: 'green', suspended: 'amber', disconnected: 'gray' };

/** The headline's name for the side of the accounts (and type of line) the figures sum. */
function headlineLabel(side, type) {
    if (side === 'credit') {
        return (
            { payment: 'إجمالي الدفعات', discount: 'إجمالي الخصومات', reading_discount: 'إجمالي خصومات القراءات الأسبوعية' }[type] ?? 'إجمالي التسديد والخصم'
        );
    }

    return 'إجمالي القيود';
}

function Shekels({ amount, className = 'text-gray-900' }) {
    return (
        <span className={`whitespace-nowrap ${className}`}>
            <b className="font-display font-bold">{formatMoney(amount)}</b> <span className="text-xs font-normal text-gray-500">شيكل</span>
        </span>
    );
}

/** "+8%" against the period before: green when the total grew. The card behind it is always graphite. */
function ChangeBadge({ pct }) {
    if (pct === null || pct === undefined) {
        return null;
    }

    const grew = pct >= 0;

    return (
        <span
            title="مقارنة بالفترة السابقة"
            dir="ltr"
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-display text-xs font-bold ${
                grew ? 'bg-emerald-500/15 text-emerald-300' : 'bg-brand-500/25 text-[#f3a4a9]'
            }`}
        >
            <Icon name={grew ? 'trend-up' : 'trend-down'} className="h-3.5 w-3.5" strokeWidth={2} />
            {grew ? '+' : '−'}
            {Math.abs(pct)}%
        </span>
    );
}

/** The period's total per branch; the Super Admin can click a branch to narrow the whole page to it. */
function BranchBreakdown({ branches, caption, selectedId, onSelect }) {
    const max = Math.max(1, ...branches.map((branch) => branch.total));

    return (
        <section className="rise-in rounded-panel border border-gray-100 bg-surface p-6 shadow-card lg:col-span-2">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-bold text-gray-900">حسب الفرع</h3>
                <span className="text-xs text-gray-500">{caption}</span>
            </div>

            {branches.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-500">لا توجد قيود في هذه الفترة.</p>
            ) : (
                <ul className="-mx-3 mt-3 space-y-1">
                    {branches.map((branch) => {
                        const selected = String(branch.id) === String(selectedId ?? '');
                        const content = (
                            <>
                                <span className="flex items-baseline justify-between gap-3">
                                    <span className="truncate font-semibold text-gray-900">{branch.name}</span>
                                    <b className="font-display text-gray-900">{formatMoney(branch.total)}</b>
                                </span>
                                <MeterBar value={branch.total} max={max} className="mt-2" />
                                <span className="mt-1 block text-xs text-gray-500">{formatNumber(branch.count)} قيد</span>
                            </>
                        );

                        return (
                            <li key={branch.id}>
                                {onSelect ? (
                                    <button
                                        type="button"
                                        aria-pressed={selected}
                                        title={selected ? 'إظهار كل الفروع' : `عرض قيود ${branch.name} فقط`}
                                        onClick={() => onSelect(selected ? '' : String(branch.id))}
                                        className={`block w-full rounded-xl px-3 py-2.5 text-start transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${
                                            selected ? 'bg-brand-500/10 ring-1 ring-brand-500/25' : 'hover:bg-gray-50'
                                        }`}
                                    >
                                        {content}
                                    </button>
                                ) : (
                                    <div className="px-3 py-2.5">{content}</div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

/** A day's header row: its date (with "اليوم" on today) and its full figures. */
function DayHeader({ day, totals, isToday }) {
    return (
        <tr className="data-table-group">
            <td colSpan={6}>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="flex items-center gap-2 font-bold text-gray-900">
                        {formatDayLabel(day)}
                        {isToday && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[12px] font-bold text-white">اليوم</span>}
                    </span>
                    {totals && (
                        <span className="text-xs text-gray-500">
                            {formatNumber(totals.count)} قيد
                            {totals.charged > 0 && (
                                <>
                                    {' '}
                                    · عليه <Shekels amount={totals.charged} />
                                </>
                            )}
                            {totals.credited > 0 && (
                                <>
                                    {' '}
                                    · له <Shekels amount={totals.credited} className="text-emerald-700 dark:text-emerald-400" />
                                </>
                            )}
                        </span>
                    )}
                </div>
            </td>
        </tr>
    );
}

/**
 * The financial log: every line of the subscriptions' accounts, newest
 * first and grouped by day, with the period's totals, a daily chart and
 * the totals per branch. Every figure follows the period, the search and
 * the filters.
 */
export default function Index({
    entries,
    period,
    side,
    summary,
    dayTotals,
    dailyTotals,
    branchTotals,
    today,
    scopeLabel,
    filters,
    filterOptions,
    statement,
}) {
    const { can } = usePage().props;
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, setFilters, clearFilters } = useDataTable('/ledger', filters, { period });
    const rowClick = useRowClick();
    const statementWindow = useStatementWindow(statement);
    const caption = periodCaption(period);
    const label = headlineLabel(side, filterValues.type);
    const groupedByDay = filters.sort !== 'amount';
    const canPickBranch = filterOptions.some((group) => group.key === 'branch_id');
    // Cancelled lines and their reversals cancel each other out, so the page's totals leave both out.
    const countedEntries = entries.data.filter((entry) => !entry.isCancelled);
    const pageCharged = countedEntries.filter((entry) => !entry.isCredit).reduce((total, entry) => total + Number(entry.amount), 0);
    const pageCredited = countedEntries.filter((entry) => entry.isCredit).reduce((total, entry) => total + Number(entry.amount), 0);

    function changePeriod(next) {
        router.get(
            '/ledger',
            { search, sort: filters.sort, direction: filters.direction, per_page: filters.per_page, filter: filterValues, period: next },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    }

    /** A line's subscription, in the shape the statement window's header reads. */
    function openStatement(entry) {
        statementWindow.open({
            id: entry.subscriptionId,
            fullName: entry.subscriptionName,
            accountNumber: entry.subscriptionAccountNumber,
            status: entry.subscriptionStatus,
            statusLabel: entry.subscriptionStatusLabel,
            branchName: entry.branchName,
        });
    }

    const comparison =
        summary.previousTotal === null
            ? null
            : summary.previousTotal > 0
              ? `مقارنة بالفترة السابقة (${formatMoney(summary.previousTotal)} شيكل)`
              : 'لا قيود في الفترة السابقة';

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-500">{scopeLabel}</p>
                        <h2 className="mt-1 text-3xl font-bold text-gray-900">السجل المالي</h2>
                        <p className="mt-1 text-sm text-gray-500">كل القيود المالية المسجلة على المشتركين، مرتبة حسب اليوم.</p>
                    </div>
                    <PeriodTabs period={period} onChange={changePeriod} />
                </>
            }
        >
            <Head title="السجل المالي" />

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <KpiTile
                    hero
                    className="sm:col-span-2"
                    label={`${label} · ${caption}`}
                    value={formatMoney(summary.total)}
                    unit="شيكل"
                    badge={<ChangeBadge pct={summary.changePct} />}
                    hint={
                        <>
                            {formatNumber(summary.count)} قيد
                            {comparison && ` · ${comparison}`}
                            {side === 'debit' && summary.collected > 0 && (
                                <span className="mt-1 block">المحصّل في الفترة نفسها: {formatMoney(summary.collected)} شيكل</span>
                            )}
                        </>
                    }
                />
                <KpiTile icon="layers" label="متوسط القيد" value={formatMoney(summary.average)} unit="شيكل" hint="المبلغ ÷ عدد القيود" />
                <KpiTile icon="wallet" label="أكبر قيد" value={formatMoney(summary.largest)} unit="شيكل" hint={caption} />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-5">
                <section className="rise-in rounded-panel border border-gray-100 bg-surface p-6 shadow-card lg:col-span-3">
                    <div className="mb-7 flex items-baseline justify-between gap-3">
                        <h3 className="text-lg font-bold text-gray-900">{side === 'credit' ? 'التسديد اليومي' : 'القيود اليومية'}</h3>
                        <span className="text-xs text-gray-500">بالشيكل · آخر {formatNumber(dailyTotals.length)} يوم</span>
                    </div>
                    <BarChart
                        data={dailyTotals}
                        label={`${label} لكل يوم، بالشيكل`}
                        formatValue={(value) => `${formatMoney(value)} شيكل`}
                        countLabel="قيد"
                    />
                </section>
                <BranchBreakdown
                    branches={branchTotals}
                    caption={caption}
                    selectedId={filterValues.branch_id}
                    onSelect={canPickBranch ? (branchId) => setFilter('branch_id', branchId) : null}
                />
            </div>

            <div className="mt-5">
                <DataTableToolbar
                    search={search}
                    onSearchChange={setSearch}
                    placeholder="بحث باسم المشترك أو رقم الهاتف أو رقم الاشتراك..."
                    perPage={filters.per_page}
                    onPerPageChange={setPerPage}
                    total={entries.total}
                    filterMenu={
                        <DataTableFilterMenu
                            tableKey="ledger"
                            groups={filterOptions}
                            values={filterValues}
                            onChange={setFilter}
                            onChangeMany={setFilters}
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
                                entries.data.map((entry, index) => (
                                    <Fragment key={entry.id}>
                                        {groupedByDay && entry.day !== entries.data[index - 1]?.day && (
                                            <DayHeader day={entry.day} totals={dayTotals[entry.day]} isToday={entry.day === today} />
                                        )}
                                        <tr {...rowClick(can?.viewSubscriptions ? () => openStatement(entry) : null)}>
                                            <td className="whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1.5 font-semibold text-gray-900">
                                                    <Icon name="clock" className="h-4 w-4 text-gray-400" />
                                                    {groupedByDay
                                                        ? formatClock(entry.time)
                                                        : `${formatShortDay(entry.day)} · ${formatClock(entry.time)}`}
                                                </span>
                                            </td>
                                            <td>
                                                <RowIdentity
                                                    name={entry.subscriptionName}
                                                    subtitle={entry.subscriptionPhone}
                                                    subtitleDir="ltr"
                                                    status={STATUS_DOTS[entry.subscriptionStatus]}
                                                />
                                            </td>
                                            <td className="text-gray-600">{entry.branchName}</td>
                                            <td>
                                                <span
                                                    className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                                        entry.isCredit
                                                            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                                            : 'border-gray-200 bg-gray-50 text-gray-600'
                                                    }`}
                                                >
                                                    {entry.typeLabel}
                                                </span>
                                                {entry.isCancelled && entry.type !== 'reversal' && (
                                                    <span className="ms-1.5 inline-flex whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-500">
                                                        ملغاة
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-gray-600">{entry.recordedByName ?? '—'}</td>
                                            <td>
                                                <Shekels
                                                    amount={entry.amount}
                                                    className={
                                                        entry.isCancelled
                                                            ? 'text-gray-400 line-through'
                                                            : entry.isCredit
                                                              ? 'text-emerald-700 dark:text-emerald-400'
                                                              : 'text-gray-900'
                                                    }
                                                />
                                            </td>
                                        </tr>
                                    </Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {entries.data.length > 0 && (
                    <div className="data-table-totals text-sm text-gray-500">
                        <span>
                            مجموع هذه الصفحة: عليه <Shekels amount={pageCharged} />
                            {pageCredited > 0 && (
                                <>
                                    {' '}
                                    · له <Shekels amount={pageCredited} className="text-emerald-700 dark:text-emerald-400" />
                                </>
                            )}
                        </span>
                        <span>
                            {label} · {caption}: <Shekels amount={summary.total} className="text-brand-600" />
                        </span>
                    </div>
                )}

                <Pagination meta={entries} filters={filters} baseUrl="/ledger" extraParams={{ period }} />
            </div>

            {statementWindow.subscription && (
                <StatementModal
                    key={statementWindow.subscription.id}
                    subscription={statementWindow.subscription}
                    statement={statementWindow.statement}
                    initialForm={statementWindow.form}
                    onSwitch={(header) => statementWindow.open(header)}
                    onClose={statementWindow.close}
                />
            )}
        </AuthenticatedLayout>
    );
}
