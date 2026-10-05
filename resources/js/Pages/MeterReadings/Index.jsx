import { useEffect, useState, useRef } from 'react';
import { Head, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ConfirmDialog from '@/Components/ConfirmDialog';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import { printFieldsProps, printRowProps } from '@/lib/print';
import { formatCurrency } from '@/lib/currency';
import { consumptionBetween, weeklyCharges } from '@/lib/readings';
import { activeReadingStatus, readingStatusFilters } from '@/lib/readingSheet';
import './ReadingEntry.css';
import { WEEK_DAYS, formatWeekDay } from '@/lib/weekDays';

const SORT_OPTIONS = [
    { value: 'full_name', label: 'الاسم' },
    { value: 'meter_box', label: 'الطبلون (الاسم ثم الرقم)' },
    { value: 'meter_box_number', label: 'رقم الطبلون' },
    { value: 'last_reading', label: 'آخر قراءة' },
    { value: 'current_reading', label: 'القراءة الجديدة' },
    { value: 'consumption', label: 'الفرق (كيلو)' },
    { value: 'amount_due', label: 'المطلوب دفعه' },
    { value: 'account_number', label: 'رقم الاشتراك' },
];

/** The details printing can show as columns of their own (see printFieldsProps). */
const PRINT_FIELDS = [
    { key: 'meterBoxName', label: 'اسم الطبلون' },
    { key: 'meterBoxNumber', label: 'رقم الطبلون' },
    { key: 'fullName', label: 'اسم المشترك' },
    { key: 'phone', label: 'رقم الجوال' },
    { key: 'accountNumber', label: 'رقم الاشتراك' },
    { key: 'subAreaName', label: 'منطقة 2' },
];

const STATUS_TABS = [
    { value: 'all', label: 'الكل', count: 'total' },
    { value: 'missing', label: 'لم تُدخل', count: 'missing' },
    { value: 'pending', label: 'بانتظار الاعتماد', count: 'pending' },
    { value: 'approved', label: 'معتمدة', count: 'approved' },
];
const shortDate = (date) => date.slice(5).split('-').reverse().join('/');

/**
 * The week's cost for a typed reading: consumption × kilowatt price, less
 * the row's standing discount, but never less than the minimum payment.
 */
function calculateCharges(currentReading, row) {
    if (currentReading === '' || Number.isNaN(Number(currentReading))) {
        return null;
    }

    const consumption = consumptionBetween(row.previousReading, currentReading);

    return { consumption, ...weeklyCharges(consumption, row.unitPrice, row.minimumPayment, row.discount) };
}

/**
 * Moves from a reading field to the one `step` rows away (1 down, -1 up),
 * skipping the ones that can't be edited. Down past the last field leaves
 * the field; up past the first stays where it is.
 */
function focusReadingInput(currentInput, step = 1) {
    const inputs = [...document.querySelectorAll('[data-reading-input]:not([disabled])')];
    const target = inputs[inputs.indexOf(currentInput) + step];

    if (target) {
        target.focus();
    } else if (step > 0) {
        currentInput.blur();
    }
}

/**
 * One subscriber's line for the week. `approvable` (the actor may approve
 * readings) adds a tick box, enabled when this row's reading can be approved.
 */
function SheetRow({ row, week, approvable, selected, onToggleSelected }) {
    const savedValue = row.reading ? String(row.reading.currentReading) : '';
    const [value, setValue] = useState(savedValue);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef(null);
    // Set when the field was clicked into and left with nothing entered, until it is entered or clicked again.
    const [leftEmpty, setLeftEmpty] = useState(false);
    // Changing an approved reading sends it back for approval, so it waits on "are you sure?".
    const [confirmingApprovedEdit, setConfirmingApprovedEdit] = useState(false);

    // Pick up the saved value whenever the server sends a fresh row.
    useEffect(() => {
        setValue(savedValue);
    }, [savedValue]);

    // A reading the server refused is entered again: the field gets the focus back, its number selected,
    // unless the user has already moved on to another field.
    useEffect(() => {
        if (error && !saving && (!document.activeElement || document.activeElement === document.body)) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [error, saving]);

    // The reminder to enter the reading fades after a while, still there to click.
    useEffect(() => {
        if (!leftEmpty) {
            return undefined;
        }

        const timer = setTimeout(() => setLeftEmpty(false), 8000);

        return () => clearTimeout(timer);
    }, [leftEmpty]);

    const isDraft = value !== savedValue;
    const charges = !isDraft && row.reading ? { ...row.reading, minimumApplies: Number(row.reading.readingFee) < Number(row.minimumPayment) && !row.discount } : calculateCharges(value, row);
    const belowMinimum = charges?.minimumApplies;

    function save({ confirmed = false } = {}) {
        if (value === '' || value === savedValue || saving) {
            return;
        }

        if (row.reading?.status === 'approved' && !confirmed) {
            setConfirmingApprovedEdit(true);
            return;
        }

        const options = {
            preserveScroll: true,
            preserveState: true,
            onStart: () => setSaving(true),
            onFinish: () => setSaving(false),
            onSuccess: () => setError(null),
            onError: (errors) => setError(Object.values(errors)[0] ?? 'تعذّر حفظ القراءة.'),
        };

        if (row.reading) {
            router.put(`/meter-readings/${row.reading.id}`, { current_reading: value }, options);
        } else {
            router.post('/meter-readings', { subscriber_id: row.id, week_start: week, current_reading: value }, options);
        }
    }

    return (
        <tr
            className={`re-row ${selected ? 'is-selected' : ''} ${error ? 'has-error' : ''} ${isDraft ? 'is-draft' : ''}`}
            {...printRowProps(Object.fromEntries(PRINT_FIELDS.map((field) => [field.key, row[field.key]])))}
        >
            <td className="re-sub">
                <div className="flex items-center gap-3">
                    {approvable && (
                        <input
                            type="checkbox"
                            checked={selected}
                            onChange={onToggleSelected}
                            disabled={!row.canApprove}
                            aria-label={`تحديد قراءة ${row.fullName} للاعتماد`}
                            className={row.canApprove ? '' : 'invisible'}
                        />
                    )}
                    <div>
                        <b>{row.fullName}</b>
                        <p className="text-xs text-gray-500">
                            {[row.accountNumber && `حساب ${row.accountNumber}`, row.meterBoxNumber && `طبلون ${row.meterBoxNumber}`, row.subAreaName].filter(Boolean).join(' · ') || '—'}
                        </p>
                        {row.discount && (
                            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                خصم القراءات الأسبوعية: {row.discount.terms}
                                {row.discount.segment && ` · ${row.discount.segment}`}
                            </p>
                        )}
                    </div>
                </div>
            </td>
            <td className="re-last re-number">{row.previousReading}</td>
            <td className="re-input-cell">
                <div className="re-input"><input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={row.previousReading}
                    dir="ltr"
                    data-reading-input
                    ref={inputRef}
                    aria-label={`القراءة الجديدة لـ ${row.fullName}`}
                    aria-invalid={Boolean(error)}
                    disabled={!row.canEdit || saving}
                    value={value}
                    placeholder={row.canEdit ? 'أدخل القراءة' : '—'}
                    onInput={(e) => {
                        setValue(e.target.value);
                        setLeftEmpty(false);
                    }}
                    onFocus={(e) => {
                        setLeftEmpty(false);
                        e.target.select();
                    }}
                    onBlur={() => {
                        save();
                        setLeftEmpty(value === '' && savedValue === '');
                    }}
                    onKeyDown={(e) => {
                        // Enter and the down arrow go to the next subscriber, the up arrow to the previous one.
                        if (e.key === 'Enter' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            focusReadingInput(e.currentTarget, 1);
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            focusReadingInput(e.currentTarget, -1);
                        }
                    }}
                    className={error ? 'has-error' : ''}
                /></div>
                {error && <p className="mt-1 max-w-[16rem] text-xs text-red-600">{error}</p>}
                {leftEmpty && !error && (
                    <p role="alert" className="re-flash">
                        لم تُدخل قراءة هذا المشترك.{' '}
                        <button type="button" onClick={() => inputRef.current?.focus()}>
                            أدخلها الآن
                        </button>
                    </p>
                )}
                {row.hasLaterWeek && <p className="mt-1 text-xs text-gray-400">توجد قراءة لأسبوع لاحق</p>}
            </td>
            <td className={`re-diff re-number ${charges && charges.consumption < 0 ? 'text-red-600' : 'text-brand-700'}`}>
                {charges ? charges.consumption : '—'}
            </td>
            <td className="re-rate re-number">{formatCurrency(row.unitPrice)}</td>
            <td className={`re-fee re-number ${belowMinimum ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {charges ? formatCurrency(charges.readingFee) : '—'}
            </td>
            <td className={`re-min re-number ${belowMinimum ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                {formatCurrency(row.minimumPayment)}
            </td>
            <td className="re-due re-number">
                {charges && charges.consumption >= 0 ? formatCurrency(charges.amountDue) : '—'}
                {charges?.discountAmount > 0 && charges.consumption >= 0 && (
                    <p className="text-xs font-normal text-emerald-700 dark:text-emerald-400">بعد خصم {formatCurrency(charges.discountAmount)}</p>
                )}
                {belowMinimum && charges.consumption >= 0 && <p className="text-xs font-normal text-gray-500">الحد الأدنى</p>}
            </td>
            <td className="re-status">
                <ConfirmDialog
                    show={confirmingApprovedEdit}
                    onConfirm={() => {
                        setConfirmingApprovedEdit(false);
                        save({ confirmed: true });
                    }}
                    onCancel={() => {
                        setConfirmingApprovedEdit(false);
                        setValue(savedValue);
                    }}
                    title="تعديل قراءة معتمدة؟"
                    message={`قراءة ${row.fullName} معتمدة. تعديلها يعيدها إلى قيد المراجعة ويزيل مبلغها من المعاملات المالية للمشترك حتى يُعاد اعتمادها.`}
                    confirmLabel="نعم، عدّل"
                    cancelLabel="تراجع عن التعديل"
                    icon="alert"
                />
                {saving ? (
                    <span className="text-xs text-gray-500">جارٍ الحفظ...</span>
                ) : row.reading ? (
                    <span className={`re-pill ${row.reading.status}`}><i />{row.reading.status === 'pending' ? 'بانتظار الاعتماد' : row.reading.statusLabel}</span>
                ) : (
                    <span className="re-pill missing"><i />لم تُدخل</span>
                )}
            </td>
            <td className="re-by">
                {row.reading ? <>
                    <b>{row.reading.recordedByName || '—'}</b>
                    <small><Icon name="clock" />{row.reading.recordedAt} · {row.reading.recordedSource === 'app' ? 'التطبيق' : 'الموقع'}</small>
                    {row.reading.approvedByName && <span className="re-approved-by">اعتمدها {row.reading.approvedByName}<small>{row.reading.approvedAt}</small></span>}
                </> : <span>—</span>}
            </td>
        </tr>
    );
}

function EntryWindowNotice({ entryWindow, canRecord, canApprove, weekIsViewOnly, onShowLatestWeek }) {
    if (entryWindow.appliesToActor && !entryWindow.isOpen) {
        const days = WEEK_DAYS.filter((day) => entryWindow.openDays.includes(day.value)).map((day) => day.label);

        return (
            <div role="status" className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
                <p className="font-semibold">إدخال القراءات الجديدة مغلق حاليًا.</p>
                <p className="mt-1">
                    {days.length ? `يُفتح الإدخال يوم ${days.join(' و')} من ${entryWindow.opensAt} إلى ${entryWindow.closesAt} بتوقيت الشركة.` : 'سيُفتح عندما يفتحه المدير.'} حتى ذلك الحين يمكنك تعديل القراءات المُدخلة
                    للأسبوع الأخير فقط.
                </p>
            </div>
        );
    }

    if (!canRecord) {
        // Approvers have their own bar below; for everyone else the sheet is read-only.
        return canApprove ? null : <p className="mb-4 text-sm text-gray-500">يمكنك عرض القراءات فقط.</p>;
    }

    if (weekIsViewOnly) {
        return (
            <div
                role="status"
                className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm"
            >
                <div>
                    <p className="font-semibold text-gray-900">هذا أسبوع سابق — قراءاته للعرض فقط.</p>
                    <p className="mt-1 text-gray-500">يمكن إدخال القراءات وتعديلها للأسبوع الأخير فقط.</p>
                </div>
                <button type="button" onClick={onShowLatestWeek} className="text-sm font-semibold text-brand-600 hover:underline">
                    الانتقال إلى الأسبوع الأخير
                </button>
            </div>
        );
    }

    if (entryWindow.appliesToActor) {
        return <p className="mb-4 text-sm font-medium text-emerald-700 dark:text-emerald-400">إدخال القراءات مفتوح الآن.</p>;
    }

    return null;
}

export default function Index({
    rows,
    week,
    weekEnd,
    weekOptions,
    summary,
    statusSummary,
    canRecord,
    canApprove,
    pendingApproval,
    weekIsViewOnly,
    entryWindow,
    filters,
    filterOptions,
}) {
    const { search, setSearch, sort, sortBy, setPerPage, filterValues, setFilter, setFilters, clearFilters } = useDataTable('/meter-readings', filters, { week });
    // The readings ticked for approval, and which approval is waiting on "are you sure?" ('selected' or 'all').
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [confirming, setConfirming] = useState(null);
    const [approving, setApproving] = useState(false);
    const [showHint, setShowHint] = useState(true);
    const activeStatus = activeReadingStatus(filters.filter ?? {});
    const weekIndex = weekOptions.findIndex((option) => option.value === week);
    const entered = statusSummary.pending + statusSummary.approved;
    const percentage = statusSummary.total ? Math.round(entered / statusSummary.total * 100) : 0;

    function changeStatus(status) {
        setSelectedIds(new Set());
        setFilters(readingStatusFilters(status));
    }

    // Ticks only apply to rows on screen; drop any that left (approved, another page or week).
    useEffect(() => {
        const approvableIds = new Set(rows.data.filter((row) => row.canApprove).map((row) => row.reading.id));
        setSelectedIds((current) => new Set([...current].filter((id) => approvableIds.has(id))));
    }, [rows.data]);

    const approvableRows = rows.data.filter((row) => row.canApprove);
    const selectedRows = approvableRows.filter((row) => selectedIds.has(row.reading.id));
    const selectedTotal = selectedRows.reduce((total, row) => total + Number(row.reading.amountDue), 0);
    const allOnPageSelected = approvableRows.length > 0 && selectedRows.length === approvableRows.length;
    const isFiltered = Boolean(search) || Object.values(filterValues).some(Boolean);

    function toggleSelected(readingId) {
        setSelectedIds((current) => {
            const next = new Set(current);
            next.has(readingId) ? next.delete(readingId) : next.add(readingId);
            return next;
        });
    }

    function toggleAllOnPage() {
        setSelectedIds(allOnPageSelected ? new Set() : new Set(approvableRows.map((row) => row.reading.id)));
    }

    function approve() {
        const payload = confirming === 'all' ? { all: true, week, search, filter: filterValues } : { reading_ids: [...selectedIds] };

        setConfirming(null);
        setApproving(true);
        router.post('/meter-readings/approve', payload, {
            preserveScroll: true,
            preserveState: true,
            onSuccess: () => setSelectedIds(new Set()),
            onFinish: () => setApproving(false),
        });
    }

    function changeWeek(nextWeek) {
        router.get(
            '/meter-readings',
            { week: nextWeek, search, sort: filters.sort, direction: filters.direction, per_page: filters.per_page, filter: filterValues },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    }

    return (
        <AuthenticatedLayout>
            <Head title="القراءات الأسبوعية" />
            <div className="reading-entry" dir="rtl">
                <div className="re-heading">
                    <div><h1>القراءات</h1><p>أدخل القراءة الجديدة بجانب آخر قراءة، واضغط Enter أو السهم لأسفل للحفظ والانتقال للمشترك التالي، والسهم لأعلى للرجوع.</p></div>
                    <div className="re-actions">
                        <span className={`re-open ${entryWindow.isOpen ? 'is-open' : ''}`}><i />الإدخال {entryWindow.isOpen ? 'مفتوح' : 'مغلق'}</span>
                        <div className="re-week">
                            <button type="button" aria-label="الأسبوع السابق" disabled={weekIndex < 0 || weekIndex === weekOptions.length - 1} onClick={() => changeWeek(weekOptions[weekIndex + 1].value)}><Icon name="chevron-right" /></button>
                            <label>أسبوع القراءة <small dir="ltr">{shortDate(week)} – {shortDate(weekEnd)}</small>
                                <select aria-label="تغيير الأسبوع" value={week} onChange={(e) => changeWeek(e.target.value)}>
                                    {weekOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                            <button type="button" aria-label="الأسبوع التالي" disabled={weekIndex <= 0} onClick={() => changeWeek(weekOptions[weekIndex - 1].value)}><Icon name="chevron-left" /></button>
                        </div>
                    </div>
                </div>
                {showHint && <div className="re-hint"><Icon name="info" /><p><b>كل قراءات الأسبوع في مكان واحد.</b> بعد حفظ القراءة تظهر في «بانتظار الاعتماد» حتى يراجعها المسؤول ويعتمدها. ويمكنك عرض القراءات المعتمدة بشكل منفصل.</p><button type="button" aria-label="إخفاء التوضيح" onClick={() => setShowHint(false)}>×</button></div>}
                <div className="re-top">
                    <div className="re-tabs" role="group" aria-label="حالة القراءات">
                        {STATUS_TABS.map((tab) => <button type="button" key={tab.value} aria-pressed={activeStatus === tab.value} onClick={() => changeStatus(tab.value)}>{tab.value !== 'all' && <i className={tab.value} />}{tab.label}<span>{statusSummary[tab.count].toLocaleString('en')}</span></button>)}
                    </div>
                    <div className="re-progress">
                        <div><b>{entered.toLocaleString('en')}</b><span>من {statusSummary.total.toLocaleString('en')} قراءة</span><strong>{percentage}%</strong></div>
                        <div className="re-progress-track" role="progressbar" aria-label="القراءات المدخلة" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}><i className="approved" style={{ width: `${statusSummary.total ? statusSummary.approved / statusSummary.total * 100 : 0}%` }} /><i className="pending" style={{ width: `${statusSummary.total ? statusSummary.pending / statusSummary.total * 100 : 0}%` }} /></div>
                        <div className="re-legend"><span><i className="approved" />معتمدة {statusSummary.approved}</span><span><i className="pending" />بانتظار الاعتماد {statusSummary.pending}</span><span><i className="missing" />لم تُدخل {statusSummary.missing}</span></div>
                    </div>
                </div>
            <EntryWindowNotice
                entryWindow={entryWindow}
                canRecord={canRecord}
                canApprove={canApprove}
                weekIsViewOnly={weekIsViewOnly}
                onShowLatestWeek={() => changeWeek(weekOptions[0].value)}
            />

            {canApprove && pendingApproval.count === 0 && activeStatus === 'pending' && (
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm">
                    <Icon name="check" className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2} />
                    <p className="font-medium text-emerald-800 dark:text-emerald-300">
                        {isFiltered ? 'لا توجد قراءات بانتظار الاعتماد ضمن البحث والتصفية.' : 'لا توجد قراءات بانتظار الاعتماد لهذا الأسبوع.'}
                    </p>
                </div>
            )}

            {canApprove && pendingApproval.count > 0 && (
                <div className="re-approval">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                            <Icon name="check" strokeWidth={2} />
                        </span>
                        <div>
                            <p className="font-semibold text-gray-900">
                                بانتظار الاعتماد: <span className="tabular-nums">{pendingApproval.count.toLocaleString('en')}</span> قراءة
                                {isFiltered && <span className="font-normal text-gray-500"> (حسب البحث والتصفية)</span>}
                            </p>
                            <p className="text-sm text-gray-500">
                                مجموعها <span className="tabular-nums">{formatCurrency(pendingApproval.amountDue)}</span> — تظهر في المعاملات المالية
                                للمشترك بعد اعتمادها.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-gray-600">
                            <input
                                type="checkbox"
                                checked={allOnPageSelected}
                                onChange={toggleAllOnPage}
                                disabled={approvableRows.length === 0 || approving}
                            />
                            تحديد قراءات هذه الصفحة
                        </label>
                        <PrimaryButton type="button" onClick={() => setConfirming('all')} disabled={approving}>
                            <Icon name="check" className="h-4 w-4" strokeWidth={2} />
                            {isFiltered ? 'اعتماد كل النتائج' : 'اعتماد كل قراءات الأسبوع'} ({pendingApproval.count.toLocaleString('en')})
                        </PrimaryButton>
                    </div>
                </div>
            )}

            <section className="re-card">
            <div className="re-sort">
                <label htmlFor="sheet-sort">ترتيب حسب</label>
                <select id="sheet-sort" value={filters.sort} onChange={(e) => sortBy(e.target.value, filters.direction)} className="py-1.5 text-sm">
                    {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={() => sortBy(filters.sort, filters.direction === 'asc' ? 'desc' : 'asc')}
                    className="rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm shadow-sm hover:bg-gray-50"
                >
                    {filters.direction === 'asc' ? 'تصاعدي ↑' : 'تنازلي ↓'}
                </button>
            </div>

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو رقم الاشتراك أو الهاتف..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={rows.total}
                filterMenu={
                    <DataTableFilterMenu
                        tableKey="meter-readings"
                        groups={filterOptions}
                        values={filterValues}
                        onChange={setFilter}
                        onChangeMany={setFilters}
                        onClear={clearFilters}
                    />
                }
            />

            <div className="re-table-wrap">
                <table className="re-table w-full text-sm text-start" {...printFieldsProps(PRINT_FIELDS)}>
                    <thead>
                        <tr>
                            <SortableTh column="full_name" label="المشترك" sortState={filters} onSort={sort} className="re-sub" />
                            <SortableTh column="last_reading" label="آخر قراءة" sortState={filters} onSort={sort} className="re-last" />
                            <SortableTh column="current_reading" label="القراءة الجديدة" sortState={filters} onSort={sort} className="re-input-cell" />
                            <SortableTh column="consumption" label="الفرق (كيلو)" sortState={filters} onSort={sort} className="re-diff" />
                            <th className="re-rate">سعر الكيلو</th>
                            <th className="re-fee">قيمة القراءة</th>
                            <th className="re-min">الحد الأدنى</th>
                            <SortableTh column="amount_due" label="المطلوب دفعه" sortState={filters} onSort={sort} className="re-due" />
                            <th className="re-status">الحالة</th><th className="re-by">سجّلها</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.data.length === 0 ? (
                            <tr>
                                <td className="text-gray-500" colSpan={10}>
                                    لا يوجد مشتركون مطابقون.
                                </td>
                            </tr>
                        ) : (
                            rows.data.map((row) => (
                                <SheetRow
                                    key={`${week}-${row.id}`}
                                    row={row}
                                    week={week}
                                    approvable={canApprove}
                                    selected={row.canApprove && selectedIds.has(row.reading.id)}
                                    onToggleSelected={() => toggleSelected(row.reading.id)}
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="re-footer"><span>مجموع المستحق لهذا الأسبوع <b>{formatCurrency(summary.amountDue)}</b></span><span><Icon name="enter" /> Enter أو ↓ للحفظ والانتقال · ↑ للرجوع · Tab للتنقل</span></div>
            <Pagination meta={rows} filters={filters} baseUrl="/meter-readings" extraParams={{ week }} />
            </section>

            {selectedRows.length > 0 && (
                <div className="re-bulk">
                    <p className="text-sm text-gray-600">
                        <b className="text-gray-900">{selectedRows.length.toLocaleString('en')}</b> قراءة محددة · المجموع{' '}
                        <b className="tabular-nums text-gray-900">{formatCurrency(selectedTotal)}</b>
                    </p>
                    <div className="flex items-center gap-3">
                        <SecondaryButton onClick={() => setSelectedIds(new Set())} disabled={approving}>
                            إلغاء التحديد
                        </SecondaryButton>
                        <PrimaryButton type="button" onClick={() => setConfirming('selected')} disabled={approving}>
                            <Icon name="check" className="h-4 w-4" strokeWidth={2} />
                            اعتماد المحدد
                        </PrimaryButton>
                    </div>
                </div>
            )}

            <ConfirmDialog
                show={confirming !== null}
                onConfirm={approve}
                onCancel={() => setConfirming(null)}
                title={confirming === 'all' ? 'اعتماد كل القراءات؟' : 'اعتماد القراءات المحددة؟'}
                message={
                    confirming === 'all'
                        ? `سيتم اعتماد ${(pendingApproval?.count ?? 0).toLocaleString('en')} قراءة لهذا الأسبوع${isFiltered ? ' مطابقة للبحث والتصفية الحالية' : ''} بمجموع ${formatCurrency(pendingApproval?.amountDue)}، وتُضاف إلى المعاملات المالية للمشتركين. لا يمكن تعديل القراءة بعد اعتمادها.`
                        : `سيتم اعتماد ${selectedRows.length.toLocaleString('en')} قراءة بمجموع ${formatCurrency(selectedTotal)}، وتُضاف إلى المعاملات المالية للمشتركين. لا يمكن تعديل القراءة بعد اعتمادها.`
                }
                confirmLabel="نعم، اعتمد"
                cancelLabel="مراجعة القراءات"
            />
            </div>
        </AuthenticatedLayout>
    );
}
