import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/** Under a corrected or cancelled line: why, who did it and when. */
function CancellationNote({ cancellation, onJump }) {
    return (
        <p className="ledger-description mt-1.5 flex items-start gap-1.5 text-xs font-normal text-gray-600">
            <Icon name={cancellation.wasCorrected ? 'repeat' : 'close'} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span>
                {cancellation.wasCorrected ? (
                    <button type="button" onClick={() => onJump(cancellation.correctionId)} className="font-semibold text-amber-700 hover:underline">
                        ⟲ صُحّحت ← #{cancellation.correctionLineNumber}
                    </button>
                ) : <b className="font-semibold text-gray-700">أُلغيت</b>}
                <>: {cancellation.reasonLabel}</>
                {cancellation.notes && <> — {cancellation.notes}</>}
                <span className="text-gray-500">
                    {' '}
                    · {cancellation.byName} · <bdi dir="ltr">{cancellation.at}</bdi>
                </span>
            </span>
        </p>
    );
}

/** Under a line that replaces a corrected one: which line it corrects, further up the statement. */
function CorrectsNote({ corrects, onJump }) {
    return (
        <p className="ledger-description mt-1.5 flex items-center gap-1.5 text-xs font-normal text-amber-700 dark:text-amber-400">
            <Icon name="repeat" className="h-3.5 w-3.5 shrink-0" />
            <button type="button" onClick={() => onJump(corrects.id)} className="font-semibold hover:underline">
                تصحيح لـ #{corrects.lineNumber} ↑
            </button>
        </p>
    );
}

function ReversalNote({ reverses, onJump }) {
    return (
        <p className="ledger-description mt-1.5 flex items-center gap-1.5 text-xs font-normal text-blue-700">
            <Icon name="repeat" className="h-3.5 w-3.5 shrink-0" />
            <button type="button" onClick={() => onJump(reverses.id)} className="font-semibold hover:underline">
                قيد عكسي لـ #{reverses.lineNumber}
            </button>
        </p>
    );
}

function amendmentValue(value) {
    return value === null || value === '' ? '—' : value;
}

/** The payment's in-place edit badge and its complete old-to-new history. */
function AmendmentBadge({ amendments }) {
    return (
        <span className="group/amend relative inline-flex">
            <button
                type="button"
                aria-label={`سجل تعديلات البيانات، ${amendments.length}`}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
                <Icon name="history" className="h-3.5 w-3.5" />
                معدّلة
            </button>
            <span
                role="tooltip"
                className="pointer-events-none invisible absolute end-0 top-full z-40 mt-2 grid w-[min(360px,calc(100vw-2rem))] gap-3 rounded-2xl border border-gray-200 bg-surface p-4 text-start opacity-0 shadow-lift transition group-hover/amend:visible group-hover/amend:opacity-100 group-focus-within/amend:visible group-focus-within/amend:opacity-100"
            >
                {amendments.map((amendment) => (
                    <span key={amendment.id} className="grid gap-1.5 border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                        {amendment.changes.map((change) => (
                            <span key={change.field} className="text-xs text-gray-700">
                                <b className="font-semibold text-gray-900">{change.label}:</b>{' '}
                                <bdi>{amendmentValue(change.from)}</bdi> <span dir="ltr">→</span> <bdi>{amendmentValue(change.to)}</bdi>
                            </span>
                        ))}
                        <span className="text-[11px] text-gray-500">
                            عدّلها {amendment.userName ?? 'مستخدم محذوف'} · <bdi dir="ltr">{amendment.at}</bdi> · السبب: {amendment.reason}
                        </span>
                    </span>
                ))}
            </span>
        </span>
    );
}

function hasLineActions(entry) {
    return [
        entry.canAmend,
        entry.amendUnavailableReason,
        entry.canCorrect,
        entry.correctUnavailableReason,
        entry.canDelete,
        entry.deleteUnavailableReason,
        entry.canForceDelete,
        entry.forceDeleteUnavailableReason,
    ].some(Boolean);
}

function lineActionsMenu(entry, { onAmend, onCorrect, onDelete, onErase }) {
    const items = [
        (entry.canAmend || entry.amendUnavailableReason) && {
            label: 'تعديل البيانات',
            description: 'البنك والمرجع والمرسل — الرصيد لا يتغيّر',
            icon: 'pencil',
            tone: 'blue',
            disabled: !entry.canAmend,
            hint: entry.amendUnavailableReason,
            onSelect: () => onAmend(entry),
        },
        (entry.canCorrect || entry.correctUnavailableReason) && {
            label: 'تصحيح الحركة',
            description: 'المبلغ أو الطريقة — يُلغى القديم ويُسجّل الصحيح',
            icon: 'repeat',
            tone: 'amber',
            disabled: !entry.canCorrect,
            hint: entry.correctUnavailableReason,
            onSelect: () => onCorrect(entry),
        },
        (entry.canDelete || entry.deleteUnavailableReason) && {
            label: 'إلغاء الحركة',
            description: 'تبقى ظاهرة مشطوبة مع السبب والقيد العكسي',
            icon: 'close',
            tone: 'brand',
            disabled: !entry.canDelete,
            hint: entry.deleteUnavailableReason,
            onSelect: () => onDelete(entry),
        },
        (entry.canForceDelete || entry.forceDeleteUnavailableReason) && {
            label: 'حذف نهائي',
            description: 'آخر حركة فقط — تختفي بلا أي أثر',
            icon: 'trash',
            tone: 'red',
            disabled: !entry.canForceDelete,
            hint: entry.forceDeleteUnavailableReason,
            onSelect: () => onErase(entry),
        },
    ].filter(Boolean);

    return items.length
        ? {
              title: entry.description,
              subtitle: entry.date,
              width: 410,
              groups: [{ label: 'إجراءات الحركة', items }],
          }
        : null;
}

/**
 * Under the reversal of a corrected or deleted line: shows or hides the
 * line it cancels.
 */
function HistoryToggle({ entry, onToggle }) {
    const { hiddenCount, expanded } = entry.history;

    return (
        <button
            type="button"
            aria-expanded={expanded}
            onClick={(event) => onToggle(entry.groupId, event.currentTarget)}
            className="mt-1.5 inline-flex items-center gap-1 rounded-md text-xs font-semibold text-blue-600 transition hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
            <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} strokeWidth={2} />
            {expanded ? 'طي السجل' : `عرض السجل (${hiddenCount + 1})`}
        </button>
    );
}

/** The nearest box around `element` that scrolls up and down: the statement window's body, or the page. */
function scrollingBoxOf(element) {
    for (let box = element.parentElement; box; box = box.parentElement) {
        const { overflowY } = getComputedStyle(box);

        if ((overflowY === 'auto' || overflowY === 'scroll') && box.scrollHeight > box.clientHeight) {
            return box;
        }
    }

    return document.scrollingElement ?? document.documentElement;
}

/** Whether a reversal or replacement shows under the line it follows: not when its group is folded, and it stands alone. */
function followsLineAbove(entry) {
    return entry.isFollowUp && entry.reverses?.lineNumber === entry.lineNumber - 1 && (!entry.history?.isHead || entry.history.expanded);
}

/** The row's look: a cancelled line greyed, a reversal or replacement marked as following the line above. */
function rowClass(entry, highlighted) {
    return [entry.cancellation && 'ledger-cancelled', followsLineAbove(entry) && 'ledger-follow-up', highlighted && 'outline outline-2 outline-offset-[-2px] outline-amber-400']
        .filter(Boolean)
        .join(' ') || undefined;
}

function SummaryCard({ label, value, hint, tone = 'default', className = '' }) {
    const styles = {
        default: ['border-gray-200 bg-surface', 'text-gray-500', 'text-gray-900'],
        owes: ['border-brand-100 bg-brand-50', 'text-brand-700', 'text-brand-700'],
        credit: ['border-emerald-500/25 bg-emerald-500/10', 'text-emerald-700 dark:text-emerald-400', 'text-emerald-700 dark:text-emerald-400'],
        paid: ['border-gray-200 bg-surface', 'text-gray-500', 'text-emerald-700 dark:text-emerald-400'],
    }[tone];

    return (
        <div className={`rounded-xl border p-4 ${styles[0]} ${className}`}>
            <p className={`text-sm ${styles[1]}`}>{label}</p>
            <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${styles[2]}`}>{value}</p>
            {hint && <p className={`mt-1 text-xs ${styles[1]}`}>{hint}</p>}
        </div>
    );
}

/**
 * The body of a subscriber's account statement: the balance and totals,
 * the search and filters, and every line (charges عليه, payments and
 * discounts له) oldest first with the balance after each. Corrected and
 * deleted lines, their reversals and any replacements stay visible in
 * chronological order by default. A reversal's button can manually fold
 * its audit pair, while the correction badges jump between related lines.
 * `onCorrect` and
 * `onDelete` (and `onErase`, to erase it for good) get the line to change, for users allowed to. Used by the
 * statement page and by the statement window on the subscribers list.
 */
export default function AccountStatement({ entries, summary, paymentMethods, transactionTypes, onAmend, onCorrect, onDelete, onErase }) {
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
    const [highlightedLineId, setHighlightedLineId] = useState(null);
    // The line (or its button) last pressed to fold or open a group, and where it was on screen.
    const pressedLine = useRef(null);
    const highlightTimer = useRef(null);
    const visibleEntries = foldCorrections(entries, filterStatementEntries(entries, filters), collapsedGroups);
    const isFiltered = Object.values(filters).some(Boolean);
    const invalidDates = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);
    const balance = describeBalance(summary.balance);
    const canChangeLines = entries.some(hasLineActions);
    const columns = canChangeLines ? [...COLUMNS, ''] : COLUMNS;

    function setFilter(key, value) {
        setFilters((current) => ({ ...current, [key]: value }));
    }

    // The older lines of a group open and fold above the line pressed; scroll by as much as they
    // moved it, so it stays under the user's finger and they don't lose their place.
    useLayoutEffect(() => {
        const pressed = pressedLine.current;
        pressedLine.current = null;

        if (!pressed?.element.isConnected) {
            return;
        }

        const moved = pressed.element.getBoundingClientRect().top - pressed.top;

        if (moved !== 0) {
            scrollingBoxOf(pressed.element).scrollBy({ top: moved, behavior: 'instant' });
        }
    }, [collapsedGroups]);

    /** Opens or folds a group; `element` (the line or its button) is kept where it is on screen. */
    function toggleGroup(groupId, element) {
        pressedLine.current = element ? { element, top: element.getBoundingClientRect().top } : null;
        setCollapsedGroups((current) => {
            const next = new Set(current);

            if (!next.delete(groupId)) {
                next.add(groupId);
            }

            return next;
        });
    }

    function jumpToLine(lineId) {
        const line = document.getElementById(`statement-line-${lineId}`);

        if (!line) {
            return;
        }

        line.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedLineId(lineId);
        clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => setHighlightedLineId(null), 1800);
    }

    useEffect(() => () => clearTimeout(highlightTimer.current), []);

    return (
        <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <SummaryCard
                    label="الرصيد الحالي"
                    value={`${balance.amount} شيكل`}
                    hint={
                        balance.tone === 'owes' ? 'عليه — مطلوب منه الدفع' : balance.tone === 'credit' ? 'له — رصيد لصالح المشترك' : 'مسدّد بالكامل'
                    }
                    tone={balance.tone === 'settled' ? 'default' : balance.tone}
                    className="sm:col-span-2 lg:col-span-1"
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
                <SummaryCard
                    label="مجموع المقاصات"
                    value={`${formatAmount(summary.cleared)} شيكل`}
                    hint={`عدد المقاصات: ${summary.clearingsCount}`}
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
                                    <tr
                                        key={entry.id}
                                        id={`statement-line-${entry.id}`}
                                        className={rowClass(entry, highlightedLineId === entry.id)}
                                    >
                                        <td data-label="رقم الصندوق" className="tabular-nums text-gray-700">
                                            {entry.cashBox ?? <Dash />}
                                        </td>
                                        <td data-label="رقم السند" className="font-semibold tabular-nums text-gray-900">
                                            {entry.voucherNumber ?? <Dash />}
                                        </td>
                                        <td data-label="الرقم المرجعي" className="tabular-nums text-gray-700">
                                            {entry.referenceNumber ? <span dir="ltr">{entry.referenceNumber}</span> : <Dash />}
                                        </td>
                                        <td data-label="البنك" className="text-gray-700">
                                            {entry.bankName ? (
                                                <div className="grid gap-1">
                                                    {entry.senderBankName && <span>من: {entry.senderBankName}</span>}
                                                    <span>إلى: {entry.bankName}</span>
                                                </div>
                                            ) : <Dash />}
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
                                            {entry.cancellation && <CancellationNote cancellation={entry.cancellation} onJump={jumpToLine} />}
                                            {entry.reverses && <ReversalNote reverses={entry.reverses} onJump={jumpToLine} />}
                                            {entry.corrects && <CorrectsNote corrects={entry.corrects} onJump={jumpToLine} />}
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
                                                    <StatusPill tone={entry.cancellation.wasCorrected ? 'amber' : 'gray'} label={entry.cancellation.wasCorrected ? 'مُصحّحة' : 'ملغاة'} />
                                                )}
                                                {entry.isCorrection && (
                                                    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                                                        تصحيح
                                                    </span>
                                                )}
                                                {entry.isAmended && <AmendmentBadge amendments={entry.amendments} />}
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
                                                {hasLineActions(entry) && (
                                                    <RowActionsMenu menu={lineActionsMenu(entry, { onAmend, onCorrect, onDelete, onErase })} />
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
