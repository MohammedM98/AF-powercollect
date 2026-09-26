import { useEffect, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
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

function SheetRow({ row, week }) {
    const savedValue = row.reading ? String(row.reading.currentReading) : '';
    const [value, setValue] = useState(savedValue);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    // Pick up the saved value whenever the server sends a fresh row.
    useEffect(() => {
        setValue(savedValue);
    }, [savedValue]);

    const charges = calculateCharges(value, row);
    const belowMinimum = charges && charges.readingFee < Number(row.minimumPayment);

    function save() {
        if (value === '' || value === savedValue || saving) {
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
                <p className="font-medium text-gray-900">{row.fullName}</p>
                <p className="text-xs text-gray-500">
                    {[row.meterBoxNumber && `طبلون ${row.meterBoxNumber}`, row.subAreaName].filter(Boolean).join(' · ') || '—'}
                </p>
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
                    onBlur={save}
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

function EntryWindowNotice({ entryWindow, canRecord, weekIsViewOnly, onShowLatestWeek }) {
    if (entryWindow.appliesToActor && !entryWindow.isOpen) {
        const days = WEEK_DAYS.filter((day) => entryWindow.openDays.includes(day.value)).map((day) => day.label);

        return (
            <div role="status" className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
                <p className="font-semibold">إدخال القراءات مغلق حاليًا.</p>
                <p className="mt-1">{days.length ? `يُفتح الإدخال يوم ${days.join(' و')}.` : 'سيُفتح عندما يفتحه المدير.'} يمكنك عرض القراءات فقط.</p>
            </div>
        );
    }

    if (!canRecord) {
        return <p className="mb-4 text-sm text-gray-500">يمكنك عرض القراءات فقط.</p>;
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

export default function Index({ rows, week, weekOptions, summary, canRecord, weekIsViewOnly, entryWindow, filters, filterOptions }) {
    const { search, setSearch, sort, sortBy, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/meter-readings', filters, { week });

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
                weekIsViewOnly={weekIsViewOnly}
                onShowLatestWeek={() => changeWeek(weekOptions[0].value)}
            />

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
                            rows.data.map((row) => <SheetRow key={`${week}-${row.id}`} row={row} week={week} />)
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={rows} filters={filters} baseUrl="/meter-readings" extraParams={{ week }} />
        </AuthenticatedLayout>
    );
}
