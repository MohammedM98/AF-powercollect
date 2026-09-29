import { useState } from 'react';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import StatusPill from '@/Components/DataTable/StatusPill';
import Icon from '@/Components/Icon';
import { describeBalance, filterStatementEntries, foldCorrections } from '@/lib/accountStatement';
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

/** Under a corrected or deleted line: why, who did it and when. */
function CancellationNote({ cancellation }) {
    return (
        <p className="ledger-description mt-1.5 flex items-start gap-1.5 text-xs font-normal text-gray-600">
            <Icon name={cancellation.wasCorrected ? 'pencil' : 'trash'} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span>
                <b className="font-semibold text-gray-700">
                    {cancellation.wasCorrected ? 'عُدّلت' : 'حُذفت'}: {cancellation.reasonLabel}
                </b>
                {cancellation.notes && <> — {cancellation.notes}</>}
                <span className="text-gray-500">
                    {' '}
                    · {cancellation.byName} · <bdi dir="ltr">{cancellation.at}</bdi>
                </span>
            </span>
        </p>
    );
}

/**
 * Under the line that stands for a corrected or deleted one: shows or
 * hides the older lines of its group — the cancelled originals and their
 * reversals.
 */
function HistoryToggle({ entry, onToggle }) {
    const { hiddenCount, expanded } = entry.history;
    // A deleted line's group follows it; a replacement's comes before it.
    const label =
        hiddenCount === 1
            ? entry.cancellation
                ? 'القيد العكسي'
                : 'الحركة الأصلية'
            : `${entry.cancellation ? 'الحركات التالية' : 'الحركات السابقة'} (${hiddenCount})`;

    return (
        <button
            type="button"
            aria-expanded={expanded}
            onClick={() => onToggle(entry.groupId)}
            className="mt-1.5 inline-flex items-center gap-1 rounded-md text-xs font-semibold text-blue-600 transition hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
            <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} strokeWidth={2} />
            {expanded ? `إخفاء ${label}` : `إظهار ${label}`}
        </button>
    );
}

/** Whether a reversal or replacement shows under the line it follows: not when its group is folded, and it stands alone. */
function followsLineAbove(entry) {
    return entry.isFollowUp && (!entry.history?.isHead || entry.history.expanded);
}

/** The row's look: a cancelled line greyed, a reversal or replacement marked as following the line above. */
function rowClass(entry) {
    return [entry.cancellation && 'ledger-cancelled', followsLineAbove(entry) && 'ledger-follow-up'].filter(Boolean).join(' ') || undefined;
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
 * discounts له) oldest first with the balance after each. A corrected
 * line folds away under the line that replaced it, and a deleted one keeps
 * its reversal folded under it; each can be opened again to show the line
 * struck through with its reversal and replacement under it. `onCorrect`
 * and `onDelete` get the line to change, for users allowed to. Used by the
 * statement page and by the statement window on the subscribers list.
 */
export default function AccountStatement({ entries, summary, paymentMethods, transactionTypes, onCorrect, onDelete }) {
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [expandedGroups, setExpandedGroups] = useState(() => new Set());
    const visibleEntries = foldCorrections(entries, filterStatementEntries(entries, filters), expandedGroups);
    const isFiltered = Object.values(filters).some(Boolean);
    const invalidDates = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);
    const balance = describeBalance(summary.balance);
    const canChangeLines = entries.some((entry) => entry.canCorrect || entry.canDelete);
    const columns = canChangeLines ? [...COLUMNS, ''] : COLUMNS;

    function setFilter(key, value) {
        setFilters((current) => ({ ...current, [key]: value }));
    }

    function toggleGroup(groupId) {
        setExpandedGroups((current) => {
            const next = new Set(current);

            if (!next.delete(groupId)) {
                next.add(groupId);
            }

            return next;
        });
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
                            {columns.map((column) => (
                                <th key={column}>{column}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleEntries.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length}>
                                    {entries.length ? 'لا توجد حركات تطابق البحث والتصفية.' : 'لا توجد حركات على هذا الحساب بعد.'}
                                </td>
                            </tr>
                        ) : (
                            visibleEntries.map((entry) => {
                                const entryBalance = describeBalance(entry.balance);

                                return (
                                    <tr key={entry.id} className={rowClass(entry)}>
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
                                            <div className="ledger-description">
                                                {followsLineAbove(entry) && <span className="me-1 text-blue-600">↲</span>}
                                                <span className="ledger-struck">{withLtrDates(entry.description)}</span>
                                            </div>
                                            {entry.details && (
                                                <p className="ledger-description mt-1 text-xs font-normal text-gray-500">
                                                    {withLtrDates(entry.details)}
                                                </p>
                                            )}
                                            {entry.cancellation && <CancellationNote cancellation={entry.cancellation} />}
                                            {entry.history?.isHead && <HistoryToggle entry={entry} onToggle={toggleGroup} />}
                                        </td>
                                        <td
                                            data-label="المبلغ"
                                            className={`font-display font-semibold tabular-nums ${entry.isCredit ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-900'}`}
                                        >
                                            <span className="ledger-struck">{formatAmount(entry.amount)}</span>
                                        </td>
                                        <td data-label="العملة" className="text-gray-700">
                                            {entry.currencyLabel}
                                        </td>
                                        <td data-label="نوع الحركة">
                                            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <StatusPill tone={entry.isCredit ? 'green' : 'red'} label={entry.isCredit ? 'له' : 'عليه'} />
                                                <span className="font-medium text-gray-900">{entry.typeLabel}</span>
                                                {entry.cancellation && (
                                                    <StatusPill tone="gray" label={entry.cancellation.wasCorrected ? 'مُعدّلة' : 'محذوفة'} />
                                                )}
                                                {entry.isCorrection && (
                                                    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600">
                                                        تصحيح
                                                    </span>
                                                )}
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
                                        {canChangeLines && (
                                            <td className="text-end">
                                                {(entry.canCorrect || entry.canDelete) && (
                                                    <RowActionsMenu
                                                        onEdit={entry.canCorrect ? () => onCorrect(entry) : undefined}
                                                        onDelete={entry.canDelete ? () => onDelete(entry) : undefined}
                                                    />
                                                )}
                                            </td>
                                        )}
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
