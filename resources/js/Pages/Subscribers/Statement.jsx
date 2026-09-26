import { useEffect, useRef, useState } from 'react';
import { Head, Link } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import SecondaryButton from '@/Components/SecondaryButton';
import StatusPill from '@/Components/DataTable/StatusPill';
import { describeBalance, filterStatementEntries } from '@/lib/accountStatement';
import PaymentModal from './PaymentModal';

const BALANCE_PILLS = {
    owes: 'red',
    credit: 'green',
    settled: 'gray',
};

const COLUMNS = [
    'تاريخ الحركة',
    'رقم السند',
    'السند اليدوي',
    'البيان',
    'نوع الحركة',
    'المبلغ',
    'العملة',
    'سعر الصرف',
    'الرصيد (شيكل)',
    'طريقة الدفع',
    'البنك',
    'الرقم المرجعي',
    'رقم الصندوق',
    'اسم المستخدم',
    'ملاحظات',
];

const EMPTY_FILTERS = { search: '', direction: '', method: '', dateFrom: '', dateTo: '' };

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

/** A line's note, opened from a small button so long notes don't stretch the row. */
function NoteButton({ note }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        function close(event) {
            if (event.type === 'keydown' ? event.key === 'Escape' : !ref.current?.contains(event.target)) {
                setOpen(false);
            }
        }

        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', close);
        };
    }, [open]);

    if (!note) {
        return <Dash />;
    }

    return (
        <div ref={ref} className="relative inline-block">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                aria-label="عرض الملاحظة"
                title={note}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white shadow-glow transition hover:brightness-110"
            >
                <Icon name="note" className="h-4 w-4" strokeWidth={2} />
            </button>
            {open && (
                <div
                    role="status"
                    className="animate-dropdown absolute end-0 top-full z-20 mt-2 w-64 whitespace-normal rounded-xl border border-gray-100 bg-surface p-3 text-sm text-gray-700 shadow-lift"
                >
                    {note}
                </div>
            )}
        </div>
    );
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
            <p className={`mt-1 text-2xl font-bold tabular-nums ${styles[2]}`}>{value}</p>
            {hint && <p className={`mt-1 text-xs ${styles[1]}`}>{hint}</p>}
        </div>
    );
}

/**
 * A subscriber's account statement: every charge (عليه) and payment (له),
 * oldest first, with the balance after each line.
 */
export default function Statement({ subscriber, entries, summary, canRecordPayment, currencies, paymentMethods }) {
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [recordingPayment, setRecordingPayment] = useState(false);
    const visibleEntries = filterStatementEntries(entries, filters);
    const isFiltered = Object.values(filters).some(Boolean);
    const invalidDates = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);
    const balance = describeBalance(summary.balance);

    function setFilter(key, value) {
        setFilters((current) => ({ ...current, [key]: value }));
    }

    // Opened as "طباعة / PDF" from a subscriber's menu: print once the page is on screen.
    useEffect(() => {
        const url = new URL(window.location.href);

        if (url.searchParams.get('print') !== '1') {
            return;
        }

        url.searchParams.delete('print');
        window.history.replaceState(window.history.state, '', url);
        const timer = window.setTimeout(() => window.print(), 400);

        return () => window.clearTimeout(timer);
    }, []);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <Link
                            href="/subscribers"
                            className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900 print:hidden"
                        >
                            → المشتركون
                        </Link>
                        <h2 className="mt-1 text-3xl font-bold text-gray-900">كشف حساب المشترك</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            {subscriber.fullName} · حساب <span dir="ltr">{subscriber.accountNumber}</span> · {subscriber.tariffCategoryLabel}
                            {subscriber.tariffSegmentName && ` (${subscriber.tariffSegmentName})`}
                            {subscriber.meterBoxNumber && ` · طبلون ${subscriber.meterBoxNumber}`} · {subscriber.branchName}
                        </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">
                        <SecondaryButton onClick={() => window.print()}>
                            <Icon name="printer" className="h-4 w-4" />
                            طباعة / PDF
                        </SecondaryButton>
                        <a
                            href={`/subscribers/${subscriber.id}/statement/export`}
                            className="inline-flex items-center justify-center gap-2 rounded-control border border-gray-200 bg-surface px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                        >
                            <Icon name="download" className="h-4 w-4" />
                            ملف Excel
                        </a>
                        {canRecordPayment && (
                            <button type="button" onClick={() => setRecordingPayment(true)} className="btn-success">
                                <Icon name="cash" className="h-5 w-5" />
                                تسجيل دفعة
                            </button>
                        )}
                    </div>
                </>
            }
        >
            <Head title={`كشف حساب ${subscriber.fullName}`} />

            <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <SummaryCard
                    label="الرصيد الحالي"
                    value={`${balance.amount} شيكل`}
                    hint={
                        balance.tone === 'owes' ? 'عليه — مطلوب منه الدفع' : balance.tone === 'credit' ? 'له — رصيد لصالح المشترك' : 'مسدّد بالكامل'
                    }
                    tone={balance.tone === 'settled' ? 'default' : balance.tone}
                />
                <SummaryCard label="مجموع ما عليه (تحميل)" value={`${summary.charged} شيكل`} hint="رسوم الاشتراك والقراءات المعتمدة" />
                <SummaryCard
                    label="مجموع ما دفعه (تسديد)"
                    value={`${summary.paid} شيكل`}
                    hint={`عدد الدفعات: ${summary.paymentsCount}`}
                    tone="paid"
                />
            </div>

            <div className="data-table-toolbar print:hidden">
                <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <label className="block text-sm text-gray-600 sm:col-span-2">
                        بحث
                        <input
                            type="search"
                            value={filters.search}
                            onChange={(e) => setFilter('search', e.target.value)}
                            placeholder="البيان، رقم السند، المبلغ، البنك أو اسم الموظف..."
                            className="mt-1 block w-full text-sm"
                        />
                    </label>
                    <label className="block text-sm text-gray-600">
                        نوع الحركة
                        <select
                            value={filters.direction}
                            onChange={(e) => setFilter('direction', e.target.value)}
                            className="mt-1 block w-full text-sm"
                        >
                            <option value="">الكل</option>
                            <option value="debit">عليه (تحميل)</option>
                            <option value="credit">له (تسديد)</option>
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
                                        <td data-label="تاريخ الحركة" className="tabular-nums text-gray-600">
                                            <span dir="ltr">{entry.date}</span>
                                        </td>
                                        <td data-label="رقم السند" className="font-semibold tabular-nums text-gray-900">
                                            {entry.voucherNumber ?? <Dash />}
                                        </td>
                                        <td data-label="السند اليدوي" className="tabular-nums text-gray-600">
                                            {entry.manualVoucherNumber ?? <Dash />}
                                        </td>
                                        <td data-label="البيان" className="font-medium text-gray-900">
                                            <div className="ledger-description">{withLtrDates(entry.description)}</div>
                                        </td>
                                        <td data-label="نوع الحركة">
                                            <StatusPill tone={entry.isPayment ? 'green' : 'red'} label={entry.isPayment ? 'له' : 'عليه'} />
                                            <p className="mt-1 text-xs text-gray-500">{entry.kindLabel}</p>
                                        </td>
                                        <td
                                            data-label="المبلغ"
                                            className={`font-semibold tabular-nums ${entry.isPayment ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-900'}`}
                                        >
                                            {entry.amount}
                                        </td>
                                        <td data-label="العملة" className="text-gray-700">
                                            {entry.currencyLabel}
                                        </td>
                                        <td data-label="سعر الصرف" className="tabular-nums text-gray-600">
                                            {entry.exchangeRate}
                                        </td>
                                        <td data-label="الرصيد (شيكل)">
                                            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <b className="tabular-nums text-gray-900">{entryBalance.amount}</b>
                                                <StatusPill tone={BALANCE_PILLS[entryBalance.tone]} label={entryBalance.label} />
                                            </span>
                                        </td>
                                        <td data-label="طريقة الدفع" className="text-gray-700">
                                            {entry.paymentMethodLabel ?? <Dash />}
                                        </td>
                                        <td data-label="البنك" className="text-gray-700">
                                            {entry.bankName ?? <Dash />}
                                        </td>
                                        <td data-label="الرقم المرجعي" className="tabular-nums text-gray-700">
                                            {entry.referenceNumber ? <span dir="ltr">{entry.referenceNumber}</span> : <Dash />}
                                        </td>
                                        <td data-label="رقم الصندوق" className="tabular-nums text-gray-700">
                                            {entry.cashBox ?? <Dash />}
                                        </td>
                                        <td data-label="اسم المستخدم" className="text-gray-700">
                                            {entry.recordedByName ?? <Dash />}
                                        </td>
                                        <td data-label="ملاحظات">
                                            <NoteButton note={entry.notes} />
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

            {canRecordPayment && (
                <PaymentModal
                    show={recordingPayment}
                    onClose={() => setRecordingPayment(false)}
                    subscriber={subscriber}
                    balance={summary.balance}
                    currencies={currencies}
                    paymentMethods={paymentMethods}
                />
            )}
        </AuthenticatedLayout>
    );
}
