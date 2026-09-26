import { useEffect, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ConfirmDialog from '@/Components/ConfirmDialog';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import StatusPill from '@/Components/DataTable/StatusPill';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import { formatCurrency } from '@/lib/currency';
import { WEEK_DAYS } from '@/lib/weekDays';

const SORT_OPTIONS = [
    { value: 'full_name', label: 'الاسم' },
    { value: 'meter_box_number', label: 'الطبلون' },
    { value: 'last_reading', label: 'آخر قراءة' },
    { value: 'current_reading', label: 'القراءة الجديدة' },
    { value: 'consumption', label: 'الفرق (كيلو)' },
    { value: 'amount_due', label: 'المطلوب دفعه' },
    { value: 'account_number', label: 'رقم المشترك' },
];

const STATUS_TONES = {
    pending: 'amber',
    approved: 'green',
};

/**
 * The week's cost for a typed reading: consumption × kilowatt price, but
 * never less than the minimum payment. Mirrors MeterReading::chargesFor().
 */
function calculateCharges(currentReading, row) {
    if (currentReading === '' || Number.isNaN(Number(currentReading))) {
        return null;
    }

    const consumption = Number(currentReading) - row.previousReading;
    const readingFee = Math.round(consumption * Number(row.unitPrice) * 100) / 100;

    return { consumption, readingFee, amountDue: Math.max(readingFee, Number(row.minimumPayment)) };
}

/** Shift a Y-m-d date by whole days without timezone drift. */
function addDays(isoDate, days) {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
}

/** Y-m-d → d-m-Y, the format used across the app's Arabic screens. */
function formatDay(isoDate) {
    return isoDate.split('-').reverse().join('-');
}

function focusNextReadingInput(currentInput) {
    const inputs = [...document.querySelectorAll('[data-reading-input]:not([disabled])')];
    inputs[inputs.indexOf(currentInput) + 1]?.focus();
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
    // Changing an approved reading sends it back for approval, so it waits on "are you sure?".
    const [confirmingApprovedEdit, setConfirmingApprovedEdit] = useState(false);

    // Pick up the saved value whenever the server sends a fresh row.
    useEffect(() => {
        setValue(savedValue);
    }, [savedValue]);

    const charges = calculateCharges(value, row);
    const belowMinimum = charges && charges.readingFee < Number(row.minimumPayment);

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
        <tr className={error ? 'bg-red-500/10' : row.reading ? '' : 'bg-amber-500/10/40'}>
            <td className="px-4">
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
                        <p className="font-medium text-gray-900">{row.fullName}</p>
                        <p className="text-xs text-gray-500">
                            {[row.meterBoxNumber && `طبلون ${row.meterBoxNumber}`, row.subAreaName].filter(Boolean).join(' · ') || '—'}
                        </p>
                    </div>
                </div>
            </td>
            <td className="px-4 tabular-nums text-gray-600">{row.previousReading}</td>
            <td className="px-4">
                <input
                    type="number"
                    inputMode="numeric"
                    min={row.previousReading}
                    dir="ltr"
                    data-reading-input
                    aria-label={`القراءة الجديدة لـ ${row.fullName}`}
                    aria-invalid={Boolean(error)}
                    disabled={!row.canEdit || saving}
                    value={value}
                    placeholder={row.canEdit ? 'أدخل القراءة' : '—'}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={() => save()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            focusNextReadingInput(e.currentTarget);
                        }
                    }}
                    className={`block w-32 text-sm tabular-nums ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                />
                {error && <p className="mt-1 max-w-[16rem] text-xs text-red-600">{error}</p>}
                {row.hasLaterWeek && <p className="mt-1 text-xs text-gray-400">توجد قراءة لأسبوع لاحق</p>}
            </td>
            <td className={`px-4 py-3 tabular-nums font-semibold ${charges && charges.consumption < 0 ? 'text-red-600' : 'text-brand-700'}`}>
                {charges ? charges.consumption : '—'}
            </td>
            <td className="whitespace-nowrap px-4 tabular-nums text-gray-600">{formatCurrency(row.unitPrice)}</td>
            <td className={`whitespace-nowrap px-4 py-3 tabular-nums ${belowMinimum ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {charges ? formatCurrency(charges.readingFee) : '—'}
            </td>
            <td className={`whitespace-nowrap px-4 py-3 tabular-nums ${belowMinimum ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                {formatCurrency(row.minimumPayment)}
            </td>
            <td className="whitespace-nowrap px-4 font-bold tabular-nums text-gray-900">
                {charges && charges.consumption >= 0 ? formatCurrency(charges.amountDue) : '—'}
                {belowMinimum && charges.consumption >= 0 && <p className="text-xs font-normal text-gray-500">الحد الأدنى</p>}
            </td>
            <td className="px-4">
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
                    <StatusPill tone={STATUS_TONES[row.reading.status]} label={row.reading.statusLabel} />
                ) : (
                    <StatusPill tone="gray" label="لم تُدخل" />
                )}
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
                    {days.length ? `يُفتح الإدخال يوم ${days.join(' و')}.` : 'سيُفتح عندما يفتحه المدير.'} حتى ذلك الحين يمكنك تعديل القراءات المُدخلة
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
    weekOptions,
    summary,
    canRecord,
    canApprove,
    pendingApproval,
    weekIsViewOnly,
    entryWindow,
    filters,
    filterOptions,
}) {
    const { search, setSearch, sort, sortBy, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/meter-readings', filters, { week });
    // The readings ticked for approval, and which approval is waiting on "are you sure?" ('selected' or 'all').
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [confirming, setConfirming] = useState(null);
    const [approving, setApproving] = useState(false);

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
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-3xl font-bold text-gray-900">القراءات الأسبوعية</h2>
                        <p className="mt-1 text-sm text-gray-500">أدخل القراءة الجديدة لكل مشترك — تُحفظ تلقائيًا عند الخروج من الحقل.</p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-sm text-gray-600">
                        تغيير الأسبوع
                        <select value={week} onChange={(e) => changeWeek(e.target.value)} className="rounded-md border-gray-300 text-sm shadow-sm">
                            {weekOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </>
            }
        >
            <Head title="القراءات الأسبوعية" />

            <div className="mb-4 rounded-xl border border-gray-200 bg-surface px-5 py-4">
                <p className="text-lg font-bold text-gray-900">قراءة الأسبوع المنتهي في الخميس {formatDay(addDays(week, 6))}</p>
                <p className="mt-1 text-sm text-gray-500">
                    من الجمعة {formatDay(week)} إلى الخميس {formatDay(addDays(week, 6))}
                </p>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-surface p-4">
                    <p className="text-sm text-gray-500">تم الإدخال</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                        {summary.entered} <span className="text-base font-medium text-gray-400">/ {summary.total}</span>
                    </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-surface p-4">
                    <p className="text-sm text-gray-500">المتبقي</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">{summary.total - summary.entered}</p>
                </div>
                <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
                    <p className="text-sm text-brand-700">مجموع المستحق لهذا الأسبوع</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">{formatCurrency(summary.amountDue)}</p>
                </div>
            </div>

            <EntryWindowNotice
                entryWindow={entryWindow}
                canRecord={canRecord}
                canApprove={canApprove}
                weekIsViewOnly={weekIsViewOnly}
                onShowLatestWeek={() => changeWeek(weekOptions[0].value)}
            />

            {canApprove && pendingApproval.count === 0 && (
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm">
                    <Icon name="check" className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2} />
                    <p className="font-medium text-emerald-800 dark:text-emerald-300">
                        {isFiltered ? 'لا توجد قراءات بانتظار الاعتماد ضمن البحث والتصفية.' : 'لا توجد قراءات بانتظار الاعتماد لهذا الأسبوع.'}
                    </p>
                </div>
            )}

            {canApprove && pendingApproval.count > 0 && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-surface p-4">
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

            <div className="mb-3 flex flex-wrap items-center justify-end gap-2 text-sm text-gray-600">
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
                placeholder="بحث بالاسم أو رقم المشترك أو الهاتف..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={rows.total}
                filterMenu={
                    <DataTableFilterMenu
                        tableKey="meter-readings"
                        groups={filterOptions}
                        values={filterValues}
                        onChange={setFilter}
                        onClear={clearFilters}
                    />
                }
            />

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start">
                    <thead>
                        <tr>
                            <SortableTh column="full_name" label="المشترك" sortState={filters} onSort={sort} className="!px-4" />
                            <SortableTh column="last_reading" label="آخر قراءة" sortState={filters} onSort={sort} className="!px-4" />
                            <SortableTh column="current_reading" label="القراءة الجديدة" sortState={filters} onSort={sort} className="!px-4" />
                            <SortableTh column="consumption" label="الفرق (كيلو)" sortState={filters} onSort={sort} className="!px-4" />
                            <th className="px-4">سعر الكيلو</th>
                            <th className="px-4">قيمة القراءة</th>
                            <th className="px-4">الحد الأدنى</th>
                            <SortableTh column="amount_due" label="المطلوب دفعه" sortState={filters} onSort={sort} className="!px-4" />
                            <th className="px-4">الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.data.length === 0 ? (
                            <tr>
                                <td className="text-gray-500" colSpan={9}>
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

            <Pagination meta={rows} filters={filters} baseUrl="/meter-readings" extraParams={{ week }} />

            {selectedRows.length > 0 && (
                <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-gray-100 bg-surface/95 px-5 py-4 shadow-lift backdrop-blur">
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
        </AuthenticatedLayout>
    );
}
