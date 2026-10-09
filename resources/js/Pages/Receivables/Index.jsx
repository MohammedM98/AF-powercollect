import { Head, Link, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import MeterBar from '@/Components/Charts/MeterBar';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import Icon from '@/Components/Icon';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import Pagination from '@/Components/DataTable/Pagination';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import SortableTh from '@/Components/DataTable/SortableTh';
import KpiTile from '@/Components/KpiTile';
import { useDataTable } from '@/hooks/useDataTable';
import { useRowClick } from '@/hooks/useRowClick';
import { useStatementWindow } from '@/hooks/useStatementWindow';
import { formatMoney, formatNumber, formatShortDay } from '@/lib/format';
import StatementModal from '@/Pages/Subscriptions/StatementModal';

const STATUS_DOTS = { active: 'green', suspended: 'amber', disconnected: 'gray' };

/** Each age bucket's amount color in the table: older debt reads more urgent. */
const BUCKET_TONES = {
    current: 'text-gray-900',
    days_60: 'text-amber-700 dark:text-amber-400',
    days_90: 'text-orange-700 dark:text-orange-400',
    older: 'text-brand-600',
};

/** Each age bucket's column title: short, so the table fits beside the menu; the page says they are days. */
const BUCKET_COLUMNS = { current: 'حتى 30', days_60: '31–60', days_90: '61–90', older: 'فوق 90' };

function Shekels({ amount, className = 'text-gray-900' }) {
    return (
        <span className={`whitespace-nowrap ${className}`}>
            <b className="font-display font-bold">{formatMoney(amount)}</b> <span className="text-xs font-normal text-gray-500">شيكل</span>
        </span>
    );
}

/** The message page, open on a balance reminder to this one subscription (whatever their status). */
function reminderUrl(subscriptionId) {
    return `/messages/create?${new URLSearchParams({ kind: 'balance_reminder', status: '', 'subscription_ids[]': subscriptionId })}`;
}

function Dash() {
    return <span className="text-gray-300">—</span>;
}

/** "منذ 45 يومًا", or "اليوم". */
function daysAgo(days) {
    return days === 0 ? 'اليوم' : `منذ ${formatNumber(days)} يوم`;
}

/** The debt split by age: each bucket's amount, how many owe in it, and its share of the total. */
function AgeBreakdown({ buckets, summary }) {
    const max = Math.max(1, ...buckets.map((bucket) => summary.buckets[bucket.key].amount));

    return (
        <section className="rise-in rounded-panel border border-gray-100 bg-surface p-6 shadow-card">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-bold text-gray-900">توزيع الديون حسب العمر</h3>
                <span className="text-xs text-gray-500">الدفعات تسدّد أقدم الديون أولًا</span>
            </div>

            {summary.count === 0 ? (
                <p className="py-12 text-center text-sm text-gray-500">لا توجد ديون مطابقة.</p>
            ) : (
                <ul className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                    {buckets.map((bucket) => {
                        const figures = summary.buckets[bucket.key];

                        return (
                            <li key={bucket.key}>
                                <span className="flex items-baseline justify-between gap-3">
                                    <span className="truncate font-semibold text-gray-900">{bucket.label}</span>
                                    <span className="text-xs text-gray-500">{figures.share}%</span>
                                </span>
                                <span className="mt-1 block">
                                    <Shekels amount={figures.amount} className={BUCKET_TONES[bucket.key]} />
                                </span>
                                <MeterBar value={figures.amount} max={max} className="mt-2" />
                                <span className="mt-1 block text-xs text-gray-500">{formatNumber(figures.count)} مشترك</span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

/**
 * The debts report: every subscription who owes money, with their debt
 * split by how old it is, the totals per age, and the oldest debt and
 * last payment of each. Every figure follows the search and the filters;
 * a row opens the subscription's statement over the page.
 */
export default function Index({ debtors, summary, buckets, scopeLabel, filters, filterOptions, statement }) {
    const { can } = usePage().props;
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, setFilters, clearFilters } = useDataTable('/receivables', filters);
    const rowClick = useRowClick();
    const statementWindow = useStatementWindow(statement);
    const canRemind = Boolean(can?.sendMessages);
    const columnCount = 4 + buckets.length + (canRemind ? 1 : 0);
    const pageTotal = debtors.data.reduce((total, debtor) => total + Number(debtor.balance), 0);
    const overdue = summary.buckets.older;

    /** A debtor, in the shape the statement window's header reads. */
    function openStatement(debtor) {
        statementWindow.open({
            id: debtor.id,
            fullName: debtor.name,
            accountNumber: debtor.accountNumber,
            status: debtor.status,
            statusLabel: debtor.statusLabel,
            branchName: debtor.branchName,
        });
    }

    return (
        <AuthenticatedLayout
            header={
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-500">{scopeLabel}</p>
                    <h1 className="mt-1 text-3xl font-bold text-gray-900">أعمار الديون</h1>
                    <p className="mt-1 text-sm text-gray-500">المشتركون المدينون، وكم يمضي على ما عليهم منذ تحميله. المبالغ بالشيكل والأعمار بالأيام.</p>
                </div>
            }
        >
            <Head title="أعمار الديون" />

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <KpiTile
                    hero
                    className="sm:col-span-2"
                    label="إجمالي الديون المستحقة"
                    value={formatMoney(summary.total)}
                    unit="شيكل"
                    hint={`${formatNumber(summary.count)} مشترك مدين`}
                />
                <KpiTile
                    icon="alert"
                    label="أكثر من 90 يومًا"
                    value={formatMoney(overdue.amount)}
                    unit="شيكل"
                    hint={`${overdue.share}% من الإجمالي · ${formatNumber(overdue.count)} مشترك`}
                />
                <KpiTile
                    icon="wallet"
                    label="متوسط الدين"
                    value={formatMoney(summary.average)}
                    unit="شيكل"
                    hint={`أكبر دين: ${formatMoney(summary.largest)} شيكل`}
                />
            </div>

            <div className="mt-5">
                <AgeBreakdown buckets={buckets} summary={summary} />
            </div>

            <div className="mt-5">
                <DataTableToolbar
                    search={search}
                    onSearchChange={setSearch}
                    placeholder="بحث باسم المشترك أو رقم الحساب أو الطبلون..."
                    perPage={filters.per_page}
                    onPerPageChange={setPerPage}
                    total={debtors.total}
                    filterMenu={
                        <DataTableFilterMenu
                            tableKey="receivables"
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
                                <SortableTh column="name" label="المشترك" sortState={filters} onSort={sort} />
                                <SortableTh column="balance" label="الرصيد المستحق" sortState={filters} onSort={sort} />
                                {buckets.map((bucket) => (
                                    <SortableTh key={bucket.key} column={bucket.key} label={BUCKET_COLUMNS[bucket.key] ?? bucket.label} sortState={filters} onSort={sort} />
                                ))}
                                <SortableTh column="oldest_days" label="أقدم دين" sortState={filters} onSort={sort} />
                                <SortableTh column="last_payment_days" label="آخر دفعة" sortState={filters} onSort={sort} />
                                {canRemind && <ActionsTh />}
                            </tr>
                        </thead>
                        <tbody>
                            {debtors.data.length === 0 ? (
                                <tr>
                                    <td colSpan={columnCount}>لا يوجد مشتركون مدينون مطابقون.</td>
                                </tr>
                            ) : (
                                debtors.data.map((debtor) => (
                                    <tr key={debtor.id} {...rowClick(can?.viewSubscriptions ? () => openStatement(debtor) : null)}>
                                        <td>
                                            <RowIdentity
                                                name={debtor.name}
                                                subtitle={`${debtor.accountNumber} · ${debtor.branchName}`}
                                                status={STATUS_DOTS[debtor.status]}
                                            />
                                            {(debtor.subAreaName || debtor.phone) && (
                                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 ps-[52px] text-xs text-gray-500">
                                                    {debtor.subAreaName && <span>{debtor.subAreaName}</span>}
                                                    {debtor.phone && (
                                                        <a href={`tel:${debtor.phone}`} dir="ltr" className="font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline">
                                                            {debtor.phone}
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <Shekels amount={debtor.balance} />
                                        </td>
                                        {buckets.map((bucket) => (
                                            <td key={bucket.key}>
                                                {debtor.buckets[bucket.key] > 0 ? (
                                                    <b className={`whitespace-nowrap font-display font-bold ${BUCKET_TONES[bucket.key]}`}>
                                                        {formatMoney(debtor.buckets[bucket.key])}
                                                    </b>
                                                ) : (
                                                    <Dash />
                                                )}
                                            </td>
                                        ))}
                                        <td className="whitespace-nowrap">
                                            {debtor.oldestDate ? (
                                                <>
                                                    <span className="font-semibold text-gray-900">{daysAgo(debtor.oldestDays)}</span>
                                                    <span className="block text-xs text-gray-500">{formatShortDay(debtor.oldestDate)}</span>
                                                </>
                                            ) : (
                                                <Dash />
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap">
                                            {debtor.lastPaymentDate ? (
                                                <>
                                                    <span className="font-semibold text-gray-900">{daysAgo(debtor.lastPaymentDays)}</span>
                                                    <span className="block text-xs text-gray-500">{formatShortDay(debtor.lastPaymentDate)}</span>
                                                </>
                                            ) : (
                                                <span className="text-gray-500">لم يدفع بعد</span>
                                            )}
                                        </td>
                                        {canRemind && (
                                            <td className="text-end">
                                                {debtor.phone ? (
                                                    <Link
                                                        href={reminderUrl(debtor.id)}
                                                        aria-label={`إرسال تذكير بالرصيد إلى ${debtor.name}`}
                                                        className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-control border border-gray-200 bg-surface px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                                                    >
                                                        <Icon name="send" className="h-4 w-4" />
                                                        تذكير
                                                    </Link>
                                                ) : (
                                                    <span className="text-xs text-gray-500">لا رقم هاتف</span>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {debtors.data.length > 0 && (
                    <div className="data-table-totals text-sm text-gray-500">
                        <span>
                            مجموع هذه الصفحة: <Shekels amount={pageTotal} />
                        </span>
                        <span>
                            إجمالي الديون: <Shekels amount={summary.total} className="text-brand-600" />
                        </span>
                    </div>
                )}

                <Pagination meta={debtors} filters={filters} baseUrl="/receivables" />
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
