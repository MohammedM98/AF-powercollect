import { useState } from 'react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import Pagination from '@/Components/DataTable/Pagination';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import SortableTh from '@/Components/DataTable/SortableTh';
import StatusPill from '@/Components/DataTable/StatusPill';
import Icon from '@/Components/Icon';
import KpiTile from '@/Components/KpiTile';
import PrimaryButton from '@/Components/PrimaryButton';
import { useDataTable } from '@/hooks/useDataTable';
import { describeBalance } from '@/lib/accountStatement';
import { formatMoney } from '@/lib/format';
import { balanceText, BALANCE_CHIPS } from '@/Pages/Subscriptions/AccountFormParts';
import ChargeModal from '@/Pages/Subscriptions/ChargeModal';
import ClearingModal from '@/Pages/Subscriptions/ClearingModal';
import DiscountModal from '@/Pages/Subscriptions/DiscountModal';
import PaymentModal from '@/Pages/Subscriptions/PaymentModal';
import SplitPaymentModal from './SplitPaymentModal';
import CollectorCashBox, { pendingCount } from './CollectorCashBox';
import CollectionNavigation from './CollectionNavigation';

const STATUS_TONES = { active: 'green', suspended: 'amber', disconnected: 'gray' };

/** Why a menu action is locked: the permission it needs and who grants it. */
function needsPermission(permission) {
    return `تحتاج صلاحية «${permission}» — يمنحها مدير الفرع أو مدير النظام.`;
}

/** What the user collected today, in one wide card at the top of the page: the total, and how much in cash and by transfer. */
function TodaysSummary({ today }) {
    const parts = [
        { icon: 'banknotes', label: 'نقدًا', value: today.cash },
        { icon: 'bank', label: 'تحويلات بنكية', value: today.transfers },
    ];

    return (
        <section aria-label="ما حصّلته اليوم" className="mb-6">
            <KpiTile hero label="ما حصّلته اليوم" value={formatMoney(today.total)} unit="شيكل" hint={`${today.count.toLocaleString('en')} ${today.count === 1 ? 'دفعة' : 'دفعات'}`}>
                <dl className="mt-5 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
                    {parts.map((part) => (
                        <div key={part.label} className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80">
                                <Icon name={part.icon} className="h-[18px] w-[18px]" />
                            </span>
                            <dt className="text-sm text-white/70">{part.label}</dt>
                            <dd className="ms-auto flex items-baseline gap-1.5 sm:ms-0">
                                <span className="font-display text-2xl font-bold">{formatMoney(part.value)}</span>
                                <span className="text-xs text-white/60">شيكل</span>
                            </dd>
                        </div>
                    ))}
                </dl>
            </KpiTile>
        </section>
    );
}

/** The user's latest payments today, each with its receipt. */
function TodaysPayments({ today }) {
    return (
        <section aria-labelledby="todays-payments" className="mt-8 space-y-4">
            <h3 id="todays-payments" className="text-lg font-bold text-gray-900">
                آخر دفعاتك اليوم
            </h3>

            {today.payments.length > 0 ? (
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-panel border border-gray-100 bg-surface shadow-card">
                    {today.payments.map((payment) => (
                        <li key={payment.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-sm">
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
 * The quick payments page: what the user collected today on top, then the
 * subscribers in a table to search and filter, each with a button to record
 * their payment and a menu for the account's other lines (a split transfer,
 * a charge, a discount, a clearing), and a main button for one bank transfer
 * shared between several subscribers.
 */
export default function Index({
    subscriptions,
    scopeLabel,
    filters,
    filterOptions,
    today,
    cashBox,
    collectionUrls,
    paymentMethods,
    transferBanks,
    senderBanks,
    chargeTypes,
    discountMethods,
    discountSegments,
}) {
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, setFilters, clearFilters } = useDataTable('/payments', filters);
    const [paying, setPaying] = useState(null);
    // The split transfer form, open: `{ subscription }` starts it with that subscriber, `{}` empty.
    const [splitting, setSplitting] = useState(null);
    // The account form open over the table: `{ form: 'charge' | 'discount' | 'clearing', subscription }`.
    const [adjusting, setAdjusting] = useState(null);

    /** The row's ⋯ menu: the account's other lines, besides the payment button beside it. */
    function rowMenu(subscription) {
        const adjustLock = subscription.canAdjustBalance ? null : needsPermission('إضافة تحميل وخصم');

        return {
            title: subscription.fullName,
            subtitle: subscription.phone,
            groups: [
                {
                    label: 'الحساب المالي',
                    items: [
                        { label: 'تسجيل دفعة', icon: 'banknotes', tone: 'emerald', shortcut: 'P', onSelect: () => setPaying(subscription) },
                        { label: 'دفعة مقسّمة', icon: 'layers', tone: 'brand', hint: 'تحويل واحد لعدة مشتركين', onSelect: () => setSplitting({ subscription }) },
                        { label: 'تحميل حركة', icon: 'document-plus', tone: 'amber', hint: 'غرامة أو رسوم', onSelect: () => setAdjusting({ form: 'charge', subscription }), lockedReason: adjustLock },
                        { label: 'إضافة خصم', icon: 'discount', tone: 'violet', onSelect: () => setAdjusting({ form: 'discount', subscription }), lockedReason: adjustLock },
                        { label: 'مقاصة', icon: 'scale', tone: 'teal', onSelect: () => setAdjusting({ form: 'clearing', subscription }), lockedReason: adjustLock },
                    ],
                },
            ],
        };
    }

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-500">{scopeLabel}</p>
                        <h2 className="mt-1 text-3xl font-bold text-gray-900">تسجيل الدفعات</h2>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <PrimaryButton type="button" onClick={() => setSplitting({})} className="h-11 px-5">
                            <Icon name="layers" className="h-[18px] w-[18px]" />
                            دفعة مقسّمة على عدة مشتركين
                        </PrimaryButton>
                    </div>
                </>
            }
        >
            <Head title="تسجيل الدفعات" />

            <CollectionNavigation urls={collectionUrls} active="payments" pendingCount={pendingCount(cashBox)} />
            <TodaysSummary today={today} />
            <CollectorCashBox cashBox={cashBox} mode="current" />

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
                                const described = describeBalance(subscription.balance);

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
                                            <span className={`inline-block whitespace-nowrap rounded-[10px] px-2.5 py-0.5 font-display text-[14.5px] font-bold ${BALANCE_CHIPS[described.tone]}`}>
                                                {balanceText(described)}
                                            </span>
                                        </td>
                                        <td>
                                            <StatusPill tone={STATUS_TONES[subscription.status]} label={subscription.statusLabel} />
                                        </td>
                                        <td className="text-end">
                                            <div className="inline-flex items-center gap-2">
                                                <PrimaryButton type="button" onClick={() => setPaying(subscription)} className="px-3.5 py-2">
                                                    <Icon name="banknotes" className="h-4 w-4" />
                                                    تسجيل دفعة
                                                </PrimaryButton>
                                                <RowActionsMenu menu={rowMenu(subscription)} />
                                            </div>
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

            {adjusting?.form === 'charge' && (
                <ChargeModal key={`charge-${adjusting.subscription.id}`} show onClose={() => setAdjusting(null)} subscription={adjusting.subscription} balance={adjusting.subscription.balance} chargeTypes={chargeTypes} />
            )}

            {adjusting?.form === 'discount' && (
                <DiscountModal
                    key={`discount-${adjusting.subscription.id}`}
                    show
                    onClose={() => setAdjusting(null)}
                    subscription={adjusting.subscription}
                    balance={adjusting.subscription.balance}
                    discountMethods={discountMethods}
                    discountSegments={discountSegments}
                />
            )}

            {adjusting?.form === 'clearing' && (
                <ClearingModal key={`clearing-${adjusting.subscription.id}`} show onClose={() => setAdjusting(null)} subscription={adjusting.subscription} balance={adjusting.subscription.balance} />
            )}

            {splitting && (
                <SplitPaymentModal
                    key={splitting.subscription?.id ?? 'split'}
                    onClose={() => setSplitting(null)}
                    transferBanks={transferBanks}
                    senderBanks={senderBanks}
                    initialSubscription={splitting.subscription ?? null}
                />
            )}
        </AuthenticatedLayout>
    );
}
