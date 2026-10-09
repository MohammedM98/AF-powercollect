import DatePicker from '@/Components/DatePicker';
import SelectInput from '@/Components/SelectInput';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { usePage } from '@inertiajs/react';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import StatusPill from '@/Components/DataTable/StatusPill';
import Icon from '@/Components/Icon';
import FinancialBalance, { FinancialLegend, transactionMoneyClass } from '@/Components/FinancialBalance';
import { COMPANY_NAME } from '@/Layouts/GuestLayout';
import {
    chainColor,
    compactStatementEntries,
    filterStatementEntries,
    netOfReadingDiscount,
    relatedLineChains,
    rememberStatementView,
    rememberedStatementView,
    STATEMENT_VIEWS,
    statementCsv,
    withReadingDiscounts,
} from '@/lib/accountStatement';
import { downloadCsv } from '@/lib/csv';
import { formatAmount } from '@/lib/currency';
import { formatMoney } from '@/lib/format';
import SplitPaymentBadge from '@/Pages/Payments/SplitPaymentBadge';

const COLUMNS = [
    '#',
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

// The time printed on the statement, in the app's Arabic with Western digits.
const PRINTED_AT_FORMAT = new Intl.DateTimeFormat('ar-SY-u-nu-latn', { dateStyle: 'long', timeStyle: 'short' });

/** The toolbar's quiet buttons, as the table toolbar's print button looks. */
const TOOL_BUTTON =
    'inline-flex h-[34px] items-center gap-1.5 rounded-control border border-gray-100 bg-gray-50 px-3 text-sm font-semibold text-gray-600 transition hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 disabled:cursor-not-allowed disabled:opacity-50';

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
                        صُحّحت بالحركة #{cancellation.correctionLineNumber}
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
                تصحيح للحركة #{corrects.lineNumber} ↑
            </button>
        </p>
    );
}

function ReversalNote({ entry, reverses, onJump }) {
    return (
        <p className="ledger-description mt-1.5 flex items-center gap-1.5 text-xs font-normal text-blue-700">
            <Icon name="repeat" className="h-3.5 w-3.5 shrink-0" />
            <button type="button" onClick={() => onJump(reverses.id)} className="font-semibold hover:underline">
                {entry.type === 'refund' ? 'يُرجع الدفعة' : 'يُلغي الحركة'} #{reverses.lineNumber} ↑
            </button>
        </p>
    );
}

function LinkedReversalNote({ reversal, onJump }) {
    return (
        <p className="ledger-description mt-1.5 flex items-center gap-1.5 text-xs font-normal text-blue-700 dark:text-blue-400">
            <Icon name="repeat" className="h-3.5 w-3.5 shrink-0" />
            <button type="button" onClick={() => onJump(reversal.id)} className="font-semibold hover:underline">
                {reversal.type === 'refund' ? 'أُرجعت بالحركة' : 'أُلغيت بالحركة'} #{reversal.lineNumber} ↓
            </button>
        </p>
    );
}

/**
 * In the compact view, on a line that replaced or outlived cancelled ones:
 * opens them, with their reversals, under it.
 */
function HistoryToggle({ entry, isOpen, onToggle }) {
    const wasCorrected = entry.isCorrection || entry.history.some((line) => line.cancellation?.wasCorrected);

    return (
        <p className="ledger-description mt-1.5 flex items-center gap-1.5 text-xs font-normal">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                className="statement-screen-only inline-flex items-center gap-1.5 font-semibold text-amber-700 hover:underline dark:text-amber-400"
            >
                <Icon name="history" className="h-3.5 w-3.5 shrink-0" />
                {wasCorrected ? 'صُحّحت' : 'لها حركات ملغاة'} · {isOpen ? 'إخفاء السجل' : `السجل (${entry.history.length})`}
            </button>
        </p>
    );
}

/** Under a reading's line in the compact view: the standing discount it was billed with. */
function ReadingDiscountNote({ discountLine }) {
    return (
        <p className="ledger-description mt-1.5 flex items-center gap-1.5 text-xs font-normal text-emerald-700 dark:text-emerald-400">
            <Icon name="tag" className="h-3.5 w-3.5 shrink-0" />
            <span>
                {withLtrDates(discountLine.description)}: − <bdi dir="ltr">{formatAmount(discountLine.amount)}</bdi>
            </span>
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

/** Whether a line has a menu: actions the user may take on it, its reading to correct, or a receipt to print. */
function hasLineMenu(entry) {
    return entry.available_actions?.length > 0 || Boolean(entry.reading) || Boolean(entry.receiptUrl);
}

function transactionNoun(entry) {
    return {
        payment: 'الدفعة',
        discount: 'الخصم',
        reading_discount: 'خصم القراءة الأسبوعية',
        credit: 'الرصيد الدائن',
        clearing: 'المقاصة',
    }[entry.type] ?? 'الحركة';
}

function actionItem(entry, action) {
    const noun = transactionNoun(entry);

    return {
        edit: {
            label: 'تعديل المبلغ',
            description: 'تعديل مبلغ آخر حركة مؤهلة وإعادة احتساب رصيدها',
            icon: 'pencil',
            tone: 'amber',
        },
        edit_metadata: {
            label: 'تعديل بيانات الدفعة',
            description: 'البنك والمرجع والمرسل والملاحظات — الرصيد لا يتغيّر',
            icon: 'pencil',
            tone: 'blue',
        },
        delete: {
            label: `حذف ${noun}`,
            description: 'حذف نهائي لآخر حركة فقط مع تسجيل السبب في سجل التدقيق',
            icon: 'trash',
            tone: 'red',
        },
        delete_reversal: {
            label: entry.type === 'refund' ? 'حذف الإرجاع فقط' : 'حذف الإلغاء فقط',
            description: 'تعود الحركة الأصلية إلى الحالة النشطة ويُعاد احتساب الرصيد',
            icon: 'trash',
            tone: 'red',
        },
        delete_tree: {
            label: entry.type === 'payment' ? 'حذف الدفعة والإرجاع معًا' : `حذف ${noun} والإلغاء معًا`,
            description: 'حذف الحركة الأصلية وكل الحركات المرتبطة بها وإعادة موازنة السجل',
            icon: 'trash',
            tone: 'red',
        },
        cancel: {
            label: `إلغاء ${noun}`,
            description: `إضافة حركة إلغاء مرتبطة بـ${noun} في نهاية السجل`,
            icon: 'close',
            tone: 'brand',
        },
        refund: {
            label: 'إرجاع الدفعة',
            description: 'إرجاع كامل الدفعة بحركة مرتبطة، ثم تسجيل الدفعة الصحيحة إن لزم',
            icon: 'repeat',
            tone: 'brand',
        },
        correction: { label: 'تصحيح في الأسبوع المفتوح', description: 'تسوية مرتبطة تحفظ الأصل دون تحصيل جديد', icon: 'pencil', tone: 'amber' },
        reverse: { label: 'إلغاء الأثر في الأسبوع المفتوح', description: 'قيد عكسي دون حذف الأصل أو إرجاع أموال', icon: 'repeat', tone: 'brand' },
    }[action];
}

function lineActionsMenu(entry, onAction) {
    const items = (entry.available_actions ?? []).map((action) => ({
        ...actionItem(entry, action),
        onSelect: () => onAction(action, entry),
    }));
    const groups = [
        ...(items.length ? [{ label: 'إجراءات الحركة', items }] : []),
        ...(entry.reading
            ? [
                  {
                      label: 'القراءة الأسبوعية',
                      items: [
                          {
                              label: 'تصحيح القراءة',
                              description: 'أدخل القراءة الصحيحة: تُلغى الحركة بقيد عكسي، وتعود القراءة للاعتماد ثم تُحمَّل من جديد',
                              icon: 'bolt',
                              tone: 'amber',
                              disabled: !entry.reading.canCorrect,
                              hint: entry.reading.correctUnavailableReason ?? undefined,
                              onSelect: () => onAction('correct_reading', entry),
                          },
                      ],
                  },
              ]
            : []),
        ...(entry.receiptUrl
            ? [
                  {
                      label: 'طباعة',
                      items: [
                          {
                              label: 'طباعة سند القبض',
                              description: 'يُفتح السند في نافذة جديدة جاهزًا للطباعة',
                              icon: 'printer',
                              onSelect: () => window.open(entry.receiptUrl, '_blank'),
                          },
                      ],
                  },
              ]
            : []),
    ];

    return groups.length
        ? {
              title: entry.description,
              subtitle: entry.date,
              width: 410,
              groups,
          }
        : null;
}

/** What the printed statement says about the filters it was printed with, or '' when none is set. */
function filtersCaption(filters, transactionTypes, paymentMethods) {
    const typeLabel =
        { debit: 'كل ما عليه (تحميل)', credit: 'كل ما له (تسديد وخصم)' }[filters.type] ??
        transactionTypes.find((type) => type.value === filters.type)?.label;
    const methodLabel = paymentMethods.find((method) => method.value === filters.method)?.label;

    return [
        filters.type && `نوع الحركة: ${typeLabel ?? filters.type}`,
        filters.method && `طريقة الدفع: ${methodLabel ?? filters.method}`,
        filters.dateFrom && `من ${filters.dateFrom}`,
        filters.dateTo && `إلى ${filters.dateTo}`,
        filters.search.trim() && `بحث: «${filters.search.trim()}»`,
    ]
        .filter(Boolean)
        .join(' · ');
}

/** The statement's heading on paper: the company, the subscription, and when it was printed. */
function PrintHeading({ subscription, caption }) {
    const { appName } = usePage().props;

    return (
        <header className="statement-print-only mb-3 border-b-2 border-brand-600 pb-2">
            <div className="flex items-start justify-between gap-6">
                <div className="flex items-center gap-3">
                    <img src="/images/logo-af.webp" alt={appName} className="h-12 w-auto" />
                    <div>
                        <div className="text-base font-bold">{COMPANY_NAME}</div>
                        <div className="text-sm text-gray-600">{subscription.branchName}</div>
                    </div>
                </div>
                <div className="text-end">
                    <h1 className="text-xl font-bold text-brand-600">كشف حساب {subscription.fullName}</h1>
                    <p className="text-sm text-gray-700">
                        {subscription.subscriberNumber && (
                            <>
                                مشترك <bdi dir="ltr">{subscription.subscriberNumber}</bdi> ·{' '}
                            </>
                        )}
                        حساب <bdi dir="ltr">{subscription.accountNumber}</bdi>
                        {subscription.tariffCategoryLabel && ` · ${subscription.tariffCategoryLabel}`}
                        {subscription.tariffSegmentName && ` (${subscription.tariffSegmentName})`}
                        {subscription.meterBoxNumber && ` · طبلون ${subscription.meterBoxNumber}`}
                    </p>
                    <p className="text-xs text-gray-600">طُبع في {PRINTED_AT_FORMAT.format(new Date())}</p>
                </div>
            </div>
            {caption && <p className="mt-2 text-xs text-gray-700">مطبوع حسب: {caption}</p>}
        </header>
    );
}

/** Whether a reversal immediately follows the original line in chronological order. */
function followsLineAbove(entry) {
    return entry.isFollowUp && entry.reverses?.lineNumber === entry.lineNumber - 1;
}

/** The row's look: a cancelled line greyed, a reversal or replacement marked as following the line above, a folded one faded. */
function rowClass(entry, highlighted, isHistory, isRelated) {
    return [
        entry.cancellation && 'ledger-cancelled',
        isRelated && 'ledger-related',
        isHistory ? 'ledger-history' : followsLineAbove(entry) && 'ledger-follow-up',
        highlighted && 'outline outline-2 outline-offset-[-2px] outline-amber-400',
    ]
        .filter(Boolean)
        .join(' ') || undefined;
}

/**
 * One statement line. In the compact view a line may carry its reading's
 * standing discount (`discountLine`, shown as one bill: the amount after
 * the discount) and the cancelled lines folded under it (`history`).
 * A folded line (`isHistory`) shows no balance: with its reversal it
 * changed nothing.
 */
function StatementRow({
    entry,
    chain = null,
    hoveredChain = null,
    onHoverChain,
    isCompact,
    isHistory = false,
    highlighted,
    hasLineMenus,
    historyOpen = false,
    onToggleHistory,
    onJump,
    onAction,
}) {
    const showsHistory = isCompact && !isHistory && entry.history?.length > 0;
    const color = chainColor(chain);

    return (
        <tr
            id={`statement-line-${entry.id}`}
            className={rowClass(entry, highlighted, isHistory, chain !== null && chain === hoveredChain)}
            style={color ? { '--ledger-chain': color } : undefined}
            data-chain={chain ?? undefined}
            onMouseEnter={chain ? () => onHoverChain(chain) : undefined}
            onMouseLeave={chain ? () => onHoverChain(null) : undefined}
        >
            <td data-label="#" className="whitespace-nowrap tabular-nums">
                <span className="inline-flex items-center gap-1.5 font-semibold text-gray-700" title={chain ? 'الحركات المرتبطة بنفس اللون' : undefined}>
                    {color && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: `rgb(${color})` }} />}
                    #{entry.lineNumber}
                    {entry.discountLine && <span className="font-normal text-gray-400">+ #{entry.discountLine.lineNumber}</span>}
                </span>
            </td>
            <td data-label="رقم الصندوق" className="tabular-nums text-gray-700">
                {entry.cashBox ?? <Dash />}
            </td>
            <td data-label="رقم السند" className="font-semibold tabular-nums text-gray-900">
                {entry.voucherNumber ?? <Dash />}
            </td>
            <td data-label="الرقم المرجعي" className="tabular-nums text-gray-700">
                {entry.referenceNumber ? <span dir="ltr">{entry.referenceNumber}</span> : <Dash />}
                {entry.splitPayment && <div className="mt-1"><SplitPaymentBadge split={entry.splitPayment} /></div>}
            </td>
            <td data-label="البنك" className="text-gray-700">
                {entry.bankName ? (
                    <div className="grid gap-1">
                        {entry.senderBankName && <span>من: {entry.senderBankName}</span>}
                        <span>إلى: {entry.bankName}</span>
                    </div>
                ) : <Dash />}
            </td>
            <td data-label="تاريخ الحركة" className="whitespace-nowrap tabular-nums text-gray-600">
                <span dir="ltr">{entry.date}</span>
            </td>
            <td data-label="البيان" className="font-medium text-gray-900">
                <div className="ledger-description">
                    {(isHistory || followsLineAbove(entry)) && <span className="me-1 text-blue-600">↲</span>}
                    <span className="ledger-struck">{withLtrDates(entry.description)}</span>
                </div>
                {entry.details && (
                    <p className="ledger-description mt-1 text-xs font-normal text-gray-500">
                        {withLtrDates(entry.details)}
                    </p>
                )}
                {entry.discountLine && <ReadingDiscountNote discountLine={entry.discountLine} />}
                {entry.closingAdjustment && <p className="ledger-description mt-1 text-xs text-amber-700 dark:text-amber-400">
                    <button type="button" className="font-semibold hover:underline" onClick={() => onJump(entry.closingAdjustment.originalId)}>مرتبطة بالحركة #{entry.closingAdjustment.originalLineNumber ?? entry.closingAdjustment.originalId} ↑</button>
                    {' · '}{Number(entry.closingAdjustment.cashEffect) === 0 ? 'دون حركة أموال فعلية' : 'إرجاع أموال فعلي في الفترة الحالية'}
                </p>}
                {entry.cancellation && <CancellationNote cancellation={entry.cancellation} onJump={onJump} />}
                {entry.reverses && <ReversalNote entry={entry} reverses={entry.reverses} onJump={onJump} />}
                {entry.linkedReversal && <LinkedReversalNote reversal={entry.linkedReversal} onJump={onJump} />}
                {showsHistory ? (
                    <HistoryToggle entry={entry} isOpen={historyOpen} onToggle={onToggleHistory} />
                ) : (
                    entry.corrects && <CorrectsNote corrects={entry.corrects} onJump={onJump} />
                )}
            </td>
            <td
                data-label="المبلغ"
                className={`font-display font-semibold tabular-nums ${transactionMoneyClass(entry)}`}
            >
                {entry.discountLine ? (
                    <span className="grid gap-0.5">
                        <span>{formatAmount(netOfReadingDiscount(entry))}</span>
                        <span className="font-sans text-xs font-normal text-gray-500" title="القراءة − خصم القراءة الأسبوعية">
                            <bdi dir="ltr">
                                {formatAmount(entry.amount)} − {formatAmount(entry.discountLine.amount)}
                            </bdi>
                        </span>
                    </span>
                ) : (
                    <span className="ledger-struck">{formatAmount(entry.amount)}</span>
                )}
            </td>
            <td data-label="العملة" className="text-gray-700">
                {entry.currencyLabel}
            </td>
            <td data-label="نوع الحركة">
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusPill tone="gray" label={entry.isCredit ? 'تخفيض الرصيد' : 'تحميل على الحساب'} />
                    <span className="font-medium text-gray-900">{entry.typeLabel}</span>
                    {entry.discountLine && <span className="text-xs text-emerald-700 dark:text-emerald-400">بعد خصم القراءة الأسبوعية</span>}
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
                {isHistory ? (
                    <span title="أُلغيت مع قيدها العكسي، فلم تغيّر الرصيد">
                        <Dash />
                    </span>
                ) : (
                    <FinancialBalance value={entry.balance} signed />
                )}
            </td>
            <td data-label="اسم المستخدم" className="text-gray-700">
                {entry.recordedByName ?? <Dash />}
            </td>
            {hasLineMenus && (
                <td className="statement-screen-only text-end">
                    {hasLineMenu(entry) && <RowActionsMenu menu={lineActionsMenu(entry, onAction)} />}
                </td>
            )}
        </tr>
    );
}

function SummaryCard({ label, value, hint, tone = 'default', className = '' }) {
    const styles = {
        default: ['border-gray-200 bg-surface', 'text-gray-500', 'text-gray-900'],
        subscriber: ['border-red-500/25 bg-red-500/10', 'text-red-700 dark:text-red-400', 'text-red-700 dark:text-red-400'],
        company: ['border-emerald-500/25 bg-emerald-500/10', 'text-emerald-700 dark:text-emerald-400', 'text-emerald-700 dark:text-emerald-400'],
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
 * The body of a subscription's account statement: the balance and totals,
 * the search and filters, and every line (charges عليه, payments and
 * discounts له) oldest first with the balance after each.
 *
 * It opens compact: a cancelled line and the reversal that takes it back
 * add up to nothing, so both are left out and the balances read as if they
 * were never recorded (ending where the full statement ends); the line
 * that corrected them can open them under it, and a weekly reading shows
 * its standing discount inside its line. "كل الحركات" shows every line as
 * recorded, in chronological order, with links between related lines.
 * The browser remembers the view chosen.
 * `onAction` receives one of the server-provided canonical actions and the
 * line to change. Used by the statement page and the subscriptions-list window.
 *
 * The lines shown, in the view shown, can be saved for Excel or printed — on landscape paper,
 * with the company and `subscription` (the statement's header) above them
 * and only the statement on the page, light whatever the app's theme.
 */
export default function AccountStatement({ subscription, entries, summary, paymentMethods, transactionTypes, onAction }) {
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [view, setView] = useState(rememberedStatementView);
    const [openHistories, setOpenHistories] = useState(() => new Set());
    const [highlightedLineId, setHighlightedLineId] = useState(null);
    const [pendingJump, setPendingJump] = useState(null);
    const [hoveredChain, setHoveredChain] = useState(null);
    const highlightTimer = useRef(null);
    const isCompact = view === 'compact';
    const compact = useMemo(() => compactStatementEntries(entries), [entries]);
    const shownEntries = isCompact ? compact.entries : entries;
    const visibleEntries = filterStatementEntries(shownEntries, filters);
    const rows = isCompact ? withReadingDiscounts(visibleEntries) : visibleEntries;
    const chains = useMemo(() => relatedLineChains(entries), [entries]);
    const entriesById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
    const isFiltered = Object.values(filters).some(Boolean);
    const invalidDates = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);
    const hasLineMenus = entries.some(hasLineMenu);
    const balanceInCents = Math.round(Number(summary.balance) * 100);
    const columns = hasLineMenus ? [...COLUMNS, ''] : COLUMNS;

    function setFilter(key, value) {
        setFilters((current) => ({ ...current, [key]: value }));
    }

    function chooseView(nextView) {
        setView(nextView);
        rememberStatementView(nextView);
    }

    function toggleHistory(lineId) {
        setOpenHistories((current) => {
            const next = new Set(current);
            next.has(lineId) ? next.delete(lineId) : next.add(lineId);

            return next;
        });
    }

    /** Scrolls to a line and marks it; a line folded away in the compact view is opened first. */
    function jumpToLine(lineId) {
        const line = document.getElementById(`statement-line-${lineId}`);

        if (line) {
            line.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedLineId(lineId);
            clearTimeout(highlightTimer.current);
            highlightTimer.current = setTimeout(() => setHighlightedLineId(null), 1800);

            return;
        }

        const holder = rows.find((row) => row.history?.some((folded) => folded.id === lineId));

        if (holder) {
            setOpenHistories((current) => new Set(current).add(holder.id));
        } else if (isCompact) {
            // Only for this visit: following a link shouldn't make the full view the remembered one.
            setView('full');
        } else {
            return;
        }

        setPendingJump(lineId);
    }

    useEffect(() => {
        if (pendingJump !== null) {
            setPendingJump(null);
            jumpToLine(pendingJump);
        }
    }, [pendingJump]);

    useEffect(() => () => clearTimeout(highlightTimer.current), []);

    // The printout is light whatever the app's theme, from the print button or the browser's own print.
    useEffect(() => {
        const root = document.documentElement;
        let wasDark = false;

        function beforePrint() {
            wasDark = root.classList.contains('dark');
            root.classList.remove('dark');
        }

        function afterPrint() {
            if (wasDark) {
                root.classList.add('dark');
            }
        }

        window.addEventListener('beforeprint', beforePrint);
        window.addEventListener('afterprint', afterPrint);

        return () => {
            window.removeEventListener('beforeprint', beforePrint);
            window.removeEventListener('afterprint', afterPrint);
        };
    }, []);

    function exportEntries() {
        downloadCsv(statementCsv(visibleEntries), `statement-${subscription.accountNumber}.csv`);
    }

    /** The modals work on the line as the server sent it, not as the compact view shows it. */
    function actOn(action, entry) {
        onAction(action, entriesById.get(entry.id) ?? entry);
    }

    const printCaption = [
        isCompact && compact.hiddenCount > 0 && 'عرض مختصر دون الحركات الملغاة وقيودها العكسية',
        filtersCaption(filters, transactionTypes, paymentMethods),
    ]
        .filter(Boolean)
        .join(' · ');

    return (
        <div className="account-statement">
            <PrintHeading subscription={subscription} caption={printCaption} />

            <div className="statement-summary mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <SummaryCard
                    label="الرصيد الحالي"
                    value={<><bdi dir="ltr">{formatMoney(summary.balance)}</bdi> شيكل</>}
                    tone={balanceInCents < 0 ? 'subscriber' : balanceInCents > 0 ? 'company' : 'default'}
                    hint={balanceInCents < 0 ? 'رصيد لصالح المشترك' : balanceInCents > 0 ? 'مستحق للشركة، لم يُحصّل بعد' : 'الحساب مسدّد'}
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
                />
                <SummaryCard
                    label="مجموع المقاصات"
                    value={`${formatAmount(summary.cleared)} شيكل`}
                    hint={`عدد المقاصات: ${summary.clearingsCount}`}
                />
            </div>

            <div className="mb-6"><FinancialLegend /></div>
            <div className="data-table-toolbar">
                <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                    <div role="group" aria-label="طريقة العرض" className="me-auto inline-flex rounded-control border border-gray-100 bg-gray-50 p-0.5">
                        {STATEMENT_VIEWS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                aria-pressed={view === option.value}
                                title={option.hint}
                                onClick={() => chooseView(option.value)}
                                className={`h-[30px] rounded-[10px] px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${
                                    view === option.value ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={exportEntries}
                        disabled={visibleEntries.length === 0}
                        title="تنزيل الحركات المعروضة بصيغة CSV المتوافقة مع Excel"
                        className={TOOL_BUTTON}
                    >
                        <Icon name="arrow-down-tray" className="h-4 w-4" />
                        تصدير Excel
                    </button>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        disabled={visibleEntries.length === 0}
                        title="طباعة الحركات المعروضة مع رأس الكشف وملخّصه"
                        className={TOOL_BUTTON}
                    >
                        <Icon name="printer" className="h-4 w-4" />
                        طباعة
                    </button>
                </div>
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
                        <SelectInput value={filters.type} onChange={(e) => setFilter('type', e.target.value)} className="mt-1 block w-full text-sm">
                            <option value="">الكل</option>
                            <option value="debit">كل ما عليه (تحميل)</option>
                            <option value="credit">كل ما له (تسديد وخصم)</option>
                            {transactionTypes.map((type) => (
                                <option key={type.value} value={type.value}>
                                    {type.label}
                                </option>
                            ))}
                        </SelectInput>
                    </label>
                    <label className="block text-sm text-gray-600">
                        طريقة الدفع
                        <SelectInput value={filters.method} onChange={(e) => setFilter('method', e.target.value)} className="mt-1 block w-full text-sm">
                            <option value="">الكل</option>
                            {paymentMethods.map((method) => (
                                <option key={method.value} value={method.value}>
                                    {method.label}
                                </option>
                            ))}
                        </SelectInput>
                    </label>
                    <label className="block text-sm text-gray-600">
                        من تاريخ
                        <DatePicker
                            type="date"
                            value={filters.dateFrom}
                            max={filters.dateTo || undefined}
                            onChange={(e) => setFilter('dateFrom', e.target.value)}
                            className="mt-1 block w-full min-w-0 text-sm"
                        />
                    </label>
                    <label className="block text-sm text-gray-600">
                        إلى تاريخ
                        <DatePicker
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
                                <th key={column} className={column === '' ? 'statement-screen-only' : undefined}>
                                    {column}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length}>
                                    {!entries.length ? (
                                        'لا توجد حركات على هذا الحساب بعد.'
                                    ) : isCompact && !compact.entries.length ? (
                                        <>
                                            كل حركات هذا الحساب ملغاة مع قيودها العكسية (مجموعها صفر) فلا شيء يُعرض في العرض المختصر.{' '}
                                            <button type="button" onClick={() => chooseView('full')} className="font-medium text-brand-600 hover:underline">
                                                عرض كل الحركات
                                            </button>
                                        </>
                                    ) : (
                                        'لا توجد حركات تطابق البحث والتصفية.'
                                    )}
                                </td>
                            </tr>
                        ) : (
                            rows.map((entry) => {
                                const historyOpen = isCompact && openHistories.has(entry.id);
                                const rowProps = { isCompact, hasLineMenus, hoveredChain, onHoverChain: setHoveredChain, onJump: jumpToLine, onAction: actOn };

                                return (
                                    <Fragment key={entry.id}>
                                        <StatementRow
                                            {...rowProps}
                                            entry={entry}
                                            chain={chains.get(entry.id) ?? null}
                                            highlighted={highlightedLineId === entry.id}
                                            historyOpen={historyOpen}
                                            onToggleHistory={() => toggleHistory(entry.id)}
                                        />
                                        {historyOpen &&
                                            entry.history.map((folded) => (
                                                <StatementRow
                                                    key={folded.id}
                                                    {...rowProps}
                                                    entry={folded}
                                                    chain={chains.get(folded.id) ?? null}
                                                    isHistory
                                                    highlighted={highlightedLineId === folded.id}
                                                />
                                            ))}
                                    </Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
                <p aria-live="polite">
                    الحركات المعروضة: {visibleEntries.length} من {entries.length} · الأقدم أولًا، والرصيد بعد كل حركة
                    {isCompact && compact.hiddenCount > 0 && (
                        <>
                            {' '}
                            · أُخفيت {compact.hiddenCount} حركة ملغاة مع قيودها العكسية (مجموعها صفر){' '}
                            <button type="button" onClick={() => chooseView('full')} className="statement-screen-only font-medium text-brand-600 hover:underline">
                                عرض كل الحركات
                            </button>
                        </>
                    )}
                </p>
                {isFiltered && (
                    <button
                        type="button"
                        onClick={() => setFilters(EMPTY_FILTERS)}
                        className="statement-screen-only font-medium text-brand-600 hover:underline"
                    >
                        مسح عوامل التصفية
                    </button>
                )}
            </div>
        </div>
    );
}
