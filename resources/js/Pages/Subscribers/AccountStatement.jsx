import { useState } from 'react';
import StatusPill from '@/Components/DataTable/StatusPill';
import { describeBalance, filterStatementEntries } from '@/lib/accountStatement';
import { formatAmount } from '@/lib/currency';

const BALANCE_PILLS = {
    owes: 'red',
    credit: 'green',
    settled: 'gray',
};

const COLUMNS = [
    'رقم الصندوق',
    'السند اليدوي',
    'رقم السند',
    'الرقم المرجعي',
    'البنك',
    'تاريخ الحركة',
    'البيان',
    'المبلغ',
    'العملة',
    'نوع الحركة',
    'طريقة الدفع',
    'سعر الصرف',
    'الرصيد (شيكل)',
    'اسم المستخدم',
];

const EMPTY_FILTERS = { search: '', type: '', method: '', dateFrom: '', dateTo: '' };

/** Keeps dates like 2026-09-18 reading left to right inside Arabic text. */
function withLtrDates(text) {
    return text.split(/(\d{4}-\d{2}-\d{2})/).map((part, index) =>
        index % 2 === 1 ? (
            <bdi key={index} dir="ltr">
                {part}
            </bdi>
        ) : (
            part
        ),
    );
}

function Dash() {
    return <span className="text-gray-300">—</span>;
}

function SummaryCard({ label, value, hint, tone = 'default' }) {
    const styles = {
        default: ['border-gray-200 bg-surface', 'text-gray-500', 'text-gray-900'],
        owes: ['border-brand-100 bg-brand-50', 'text-brand-700', 'text-brand-700'],
        credit: ['border-emerald-500/25 bg-emerald-500/10', 'text-emerald-700 dark:text-emerald-400', 'text-emerald-700 dark:text-emerald-400'],
        paid: ['border-gray-200 bg-surface', 'text-gray-500', 'text-emerald-700 dark:text-emerald-400'],
    }[tone];

    return (
        <div className={`rounded-xl border p-4 ${styles[0]}`}>
            <p className={`text-sm ${styles[1]}`}>{label}</p>
            <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${styles[2]}`}>{value}</p>
            {hint && <p className={`mt-1 text-xs ${styles[1]}`}>{hint}</p>}
        </div>
    );
}

/**
 * The body of a subscriber's account statement: the balance and totals,
 * the search and filters, and every line (charges عليه, payments and
 * discounts له) oldest first with the balance after each. Used by the
 * statement page and by the statement window on the subscribers list.
 */
export default function AccountStatement({ entries, summary, paymentMethods, transactionTypes }) {
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const visibleEntries = filterStatementEntries(entries, filters);
    const isFiltered = Object.values(filters).some(Boolean);
    const invalidDates = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);
    const balance = describeBalance(summary.balance);

    function setFilter(key, value) {
        setFilters((current) => ({ ...current, [key]: value }));
    }

    return (
        <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                    label="الرصيد الحالي"
                    value={`${balance.amount} شيكل`}
                    hint={
                        balance.tone === 'owes' ? 'عليه — مطلوب منه الدفع' : balance.tone === 'credit' ? 'له — رصيد لصالح المشترك' : 'مسدّد بالكامل'
                    }
                    tone={balance.tone === 'settled' ? 'default' : balance.tone}
                />
                <SummaryCard
                    label="مجموع ما عليه (تحميل)"
                    value={`${formatAmount(summary.charged)} شيكل`}
                    hint="القراءات المعتمدة والرسوم والغرامات"
                />
                <SummaryCard
                    label="مجموع ما دفعه (تسديد)"
                    value={`${formatAmount(summary.paid)} شيكل`}
                    hint={`عدد الدفعات: ${summary.paymentsCount}`}
                    tone="paid"
                />
                <SummaryCard
                    label="مجموع الخصومات"
                    value={`${formatAmount(summary.discounted)} شيكل`}
                    hint={`عدد الخصومات: ${summary.discountsCount}`}
                    tone="paid"
                />
            </div>

            <div className="data-table-toolbar">
                <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <label className="block text-sm text-gray-600 sm:col-span-2">
                        بحث
                        <input
                            type="search"
                            value={filters.search}
                            onChange={(e) => setFilter('search', e.target.value)}
                            placeholder="البيان والتفاصيل، رقم السند، المبلغ، البنك أو اسم الموظف..."
                            className="mt-1 block w-full text-sm"
                        />
                    </label>
                    <label className="block text-sm text-gray-600">
                        نوع الحركة
                        <select value={filters.type} onChange={(e) => setFilter('type', e.target.value)} className="mt-1 block w-full text-sm">
                            <option value="">الكل</option>
                            <option value="debit">كل ما عليه (تحميل)</option>
                            <option value="credit">كل ما له (تسديد وخصم)</option>
                            {transactionTypes.map((type) => (
                                <option key={type.value} value={type.value}>
                                    {type.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-sm text-gray-600">
                        طريقة الدفع
                        <select value={filters.method} onChange={(e) => setFilter('method', e.target.value)} className="mt-1 block w-full text-sm">
                            <option value="">الكل</option>
                            {paymentMethods.map((method) => (
                                <option key={method.value} value={method.value}>
                                    {method.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-sm text-gray-600">
                        من تاريخ
                        <input
                            type="date"
                            value={filters.dateFrom}
                            max={filters.dateTo || undefined}
                            onChange={(e) => setFilter('dateFrom', e.target.value)}
                            className="mt-1 block w-full min-w-0 text-sm"
                        />
                    </label>
                    <label className="block text-sm text-gray-600">
                        إلى تاريخ
                        <input
                            type="date"
                            value={filters.dateTo}
                            min={filters.dateFrom || undefined}
                            onChange={(e) => setFilter('dateTo', e.target.value)}
                            className="mt-1 block w-full min-w-0 text-sm"
                        />
                    </label>
                </div>
                {invalidDates && (
                    <p role="alert" className="mt-2 text-sm text-red-600">
                        تاريخ البداية يجب أن يسبق تاريخ النهاية.
                    </p>
                )}
            </div>

            <div className="data-table-container">
                <table className="data-table data-table-ledger w-full text-start text-sm">
                    <thead>
                        <tr>
                            {COLUMNS.map((column) => (
                                <th key={column}>{column}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleEntries.length === 0 ? (
                            <tr>
                                <td colSpan={COLUMNS.length}>
                                    {entries.length ? 'لا توجد حركات تطابق البحث والتصفية.' : 'لا توجد حركات على هذا الحساب بعد.'}
                                </td>
                            </tr>
                        ) : (
                            visibleEntries.map((entry) => {
                                const entryBalance = describeBalance(entry.balance);

                                return (
                                    <tr key={entry.id}>
                                        <td data-label="رقم الصندوق" className="tabular-nums text-gray-700">
                                            {entry.cashBox ?? <Dash />}
                                        </td>
                                        <td data-label="السند اليدوي" className="tabular-nums text-gray-600">
                                            {entry.manualVoucherNumber ?? <Dash />}
                                        </td>
                                        <td data-label="رقم السند" className="font-semibold tabular-nums text-gray-900">
                                            {entry.voucherNumber ?? <Dash />}
                                        </td>
                                        <td data-label="الرقم المرجعي" className="tabular-nums text-gray-700">
                                            {entry.referenceNumber ? <span dir="ltr">{entry.referenceNumber}</span> : <Dash />}
                                        </td>
                                        <td data-label="البنك" className="text-gray-700">
                                            {entry.bankName ?? <Dash />}
                                        </td>
                                        <td data-label="تاريخ الحركة" className="tabular-nums text-gray-600">
                                            <span dir="ltr">{entry.date}</span>
                                        </td>
                                        <td data-label="البيان" className="font-medium text-gray-900">
                                            <div className="ledger-description">{withLtrDates(entry.description)}</div>
                                            {entry.details && (
                                                <p className="ledger-description mt-1 text-xs font-normal text-gray-500">
                                                    {withLtrDates(entry.details)}
                                                </p>
                                            )}
                                        </td>
                                        <td
                                            data-label="المبلغ"
                                            className={`font-display font-semibold tabular-nums ${entry.isCredit ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-900'}`}
                                        >
                                            {formatAmount(entry.amount)}
                                        </td>
                                        <td data-label="العملة" className="text-gray-700">
                                            {entry.currencyLabel}
                                        </td>
                                        <td data-label="نوع الحركة">
                                            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <StatusPill tone={entry.isCredit ? 'green' : 'red'} label={entry.isCredit ? 'له' : 'عليه'} />
                                                <span className="font-medium text-gray-900">{entry.typeLabel}</span>
                                            </span>
                                        </td>
                                        <td data-label="طريقة الدفع" className="text-gray-700">
                                            {entry.paymentMethodLabel ?? <Dash />}
                                        </td>
                                        <td data-label="سعر الصرف" className="tabular-nums text-gray-600">
                                            {entry.exchangeRate}
                                        </td>
                                        <td data-label="الرصيد (شيكل)">
                                            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <b className="font-display tabular-nums text-gray-900">{entryBalance.amount}</b>
                                                <StatusPill tone={BALANCE_PILLS[entryBalance.tone]} label={entryBalance.label} />
                                            </span>
                                        </td>
                                        <td data-label="اسم المستخدم" className="text-gray-700">
                                            {entry.recordedByName ?? <Dash />}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
                <p aria-live="polite">
                    الحركات المعروضة: {visibleEntries.length} من {entries.length} · الأقدم أولًا، والرصيد بعد كل حركة
                </p>
                {isFiltered && (
                    <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="font-medium text-brand-600 hover:underline">
                        مسح عوامل التصفية
                    </button>
                )}
            </div>
        </>
    );
}
