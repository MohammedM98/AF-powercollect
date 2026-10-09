import { useState } from 'react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import Pagination from '@/Components/DataTable/Pagination';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import SortableTh from '@/Components/DataTable/SortableTh';
import StatusPill from '@/Components/DataTable/StatusPill';
import Icon from '@/Components/Icon';
import SecondaryButton from '@/Components/SecondaryButton';
import FinancialBalance, { FinancialLegend } from '@/Components/FinancialBalance';
import { useDataTable } from '@/hooks/useDataTable';
import { formatMoney } from '@/lib/format';
import PaymentModal from '@/Pages/Subscriptions/PaymentModal';
import SplitPaymentModal from './SplitPaymentModal';

const STATUS_TONES = { active: 'green', suspended: 'amber', disconnected: 'gray' };

/** One figure of the day's summary: a quiet title, then the amount. */
function DayFigure({ label, amount, note }) {
    return (
        <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-500">{label}</p>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
                <span className="font-display text-2xl font-bold text-emerald-700 dark:text-emerald-400">{formatMoney(amount)}</span>
                <span className="text-sm text-gray-500">{note ?? 'شيكل'}</span>
            </p>
        </div>
    );
}

/**
 * What the user collected today: a slim strip of figures above the list (the
 * list is what they came for), and their latest payments under it.
 */
function TodaysPayments({ today, summaryOnly = false }) {
    const headingId = summaryOnly ? 'todays-payments' : 'recent-payments';

    return (
        <section aria-labelledby={headingId} className={summaryOnly ? 'mb-6' : 'mb-8 space-y-5'}>
            <h3 id={headingId} className={summaryOnly ? 'sr-only' : 'text-xl font-bold text-gray-900'}>
                {summaryOnly ? 'ما حصّلته اليوم' : 'آخر دفعاتك اليوم'}
            </h3>
            {summaryOnly ? (
                <div
                    className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-panel border border-gray-100 bg-surface px-6 py-4 shadow-card"
                    title="مقبوضات سجّلتها أنت اليوم. هذا الملخص مستقل عن تصفية قائمة المشتركين أدناه."
                >
                    <DayFigure label="ما حصّلته اليوم" amount={today.total} note={`شيكل · ${today.count.toLocaleString('en')} ${today.count === 1 ? 'دفعة' : 'دفعات'}`} />
                    <span className="hidden h-10 w-px bg-gray-200 sm:block" aria-hidden="true" />
                    <DayFigure label="نقدًا" amount={today.cash} />
                    <DayFigure label="بنوك ومحافظ" amount={today.transfers} />
                </div>
            ) : today.payments.length > 0 ? (
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-panel border border-gray-100 bg-surface shadow-card">
                    {today.payments.map((payment) => (
                        <li key={payment.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-5 text-base">
                            <span className="min-w-0 flex-1 basis-48 font-semibold text-gray-900">{payment.subscriptionName}</span>
                            <span className="text-gray-500">
                                {payment.methodLabel}
                                {payment.bankName && ` · ${payment.bankName}`}
                            </span>
                            {payment.voucherNumber && (
                                <span dir="ltr" className="font-display text-xs text-gray-500">
                                    #{payment.voucherNumber}
                                </span>
                            )}
                            <span dir="ltr" className="font-display text-xs text-gray-500">
                                {payment.time}
                            </span>
                            <b className="font-display text-base text-emerald-700 dark:text-emerald-400">{formatMoney(payment.amount)} ₪</b>
                            <a
                                href={payment.receiptUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-control border border-gray-200 bg-surface px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:text-gray-900"
                            >
                                <Icon name="printer" className="h-4 w-4" />
                                السند
                            </a>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="rounded-panel border border-dashed border-gray-200 bg-surface px-5 py-8 text-center text-sm text-gray-500">لم تسجّل أي دفعة اليوم بعد.</p>
            )}
        </section>
    );
}

/**
 * The quick payments page: the subscribers in a table to search and filter,
 * each with one button to record their payment, and a main button for one
 * bank transfer shared between several subscribers.
 */
export default function Index({ subscriptions, scopeLabel, filters, filterOptions, today, paymentMethods, transferBanks, senderBanks }) {
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, setFilters, clearFilters } = useDataTable('/payments', filters);
    const [paying, setPaying] = useState(null);
    const [splitting, setSplitting] = useState(false);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-500">{scopeLabel}</p>
                        <h1 className="mt-1 text-3xl font-bold text-gray-900">تسجيل الدفعات</h1>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <SecondaryButton type="button" onClick={() => setSplitting(true)} className="min-h-12 px-5">
                            <Icon name="layers" className="h-[18px] w-[18px]" />
                            دفعة مقسّمة على عدة مشتركين
                        </SecondaryButton>
                    </div>
                </>
            }
        >
            <Head title="تسجيل الدفعات" />

            <TodaysPayments today={today} summaryOnly />
            <div className="mb-6"><FinancialLegend /></div>

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو رقم الحساب أو الجوال أو رقم الطبلون..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={subscriptions.total}
                printable={false}
                filterMenu={
                    <DataTableFilterMenu
                        tableKey="payments"
                        primaryKeys={['branch_id', 'balance', 'balance_status', 'outstanding_balance', 'status']}
                        groups={filterOptions}
                        values={filterValues}
                        onChange={setFilter}
                        onChangeMany={setFilters}
                        onClear={clearFilters}
                    />
                }
            />

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start">
                    <thead>
                        <tr>
                            <SortableTh column="account_number" label="رقم الاشتراك" sortState={filters} onSort={sort} />
                            <SortableTh column="display_name" label="اسم الاشتراك" sortState={filters} onSort={sort} />
                            <th>الطبلون</th>
                            <th>منطقة 2</th>
                            <SortableTh column="outstanding_balance" label="الرصيد" sortState={filters} onSort={sort} />
                            <SortableTh column="status" label="الحالة" sortState={filters} onSort={sort} />
                            <ActionsTh />
                        </tr>
                    </thead>
                    <tbody>
                        {subscriptions.data.length === 0 ? (
                            <tr>
                                <td className="text-gray-500" colSpan={7}>
                                    لا توجد نتائج مطابقة.
                                </td>
                            </tr>
                        ) : (
                            subscriptions.data.map((subscription) => {
                                return (
                                    <tr key={subscription.id}>
                                        <td className="text-gray-600">
                                            <span dir="ltr">{subscription.accountNumber}</span>
                                            {subscription.subscriberNumber && (
                                                <span className="mt-1 block text-xs text-gray-400">
                                                    رقم المشترك <bdi dir="ltr">{subscription.subscriberNumber}</bdi>
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <RowIdentity
                                                name={subscription.fullName}
                                                subtitle={subscription.phone}
                                                subtitleDir="ltr"
                                                status={STATUS_TONES[subscription.status]}
                                            />
                                        </td>
                                        <td className="text-gray-600">{subscription.meterBoxNumber ? <span className="data-chip">{subscription.meterBoxNumber}</span> : '—'}</td>
                                        <td className="text-gray-600">{subscription.subAreaName || '—'}</td>
                                        <td>
                                            <FinancialBalance value={subscription.balance} chip />
                                        </td>
                                        <td>
                                            <StatusPill tone={STATUS_TONES[subscription.status]} label={subscription.statusLabel} />
                                        </td>
                                        <td className="text-end">
                                            <button type="button" onClick={() => setPaying(subscription)} className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-emerald-600/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:text-emerald-400">
                                                <Icon name="banknotes" className="h-4 w-4" />
                                                تسجيل دفعة
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={subscriptions} filters={filters} baseUrl="/payments" />

            <TodaysPayments today={today} />

            {paying && (
                <PaymentModal
                    key={paying.id}
                    show
                    onClose={() => setPaying(null)}
                    subscription={paying}
                    balance={paying.balance}
                    paymentMethods={paymentMethods}
                    transferBanks={transferBanks}
                    senderBanks={senderBanks}
                />
            )}

            {splitting && <SplitPaymentModal onClose={() => setSplitting(false)} transferBanks={transferBanks} senderBanks={senderBanks} />}
        </AuthenticatedLayout>
    );
}
