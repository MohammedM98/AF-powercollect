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
        <tr className={error ? 'bg-red-50' : row.reading ? '' : 'bg-amber-50/40'}>
            <td className="px-4 py-3 text-end text-gray-600" dir="ltr">
                {row.accountNumber}
            </td>
            <td className="px-4 py-3">
                <p className="font-medium text-gray-900">{row.fullName}</p>
                <p className="text-xs text-gray-500">
                    {[row.meterBoxNumber && `طبلون ${row.meterBoxNumber}`, row.subAreaName].filter(Boolean).join(' · ') || '—'}
                </p>
            </td>
            <td className="px-4 py-3 tabular-nums text-gray-600">{row.previousReading}</td>
            <td className="px-4 py-3">
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
                    className={`block w-32 rounded-md text-sm tabular-nums shadow-sm disabled:bg-gray-50 disabled:text-gray-500 ${
                        error ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-brand-500 focus:ring-brand-500'
                    }`}
                />
                {error && <p className="mt-1 max-w-[16rem] text-xs text-red-600">{error}</p>}
                {row.hasLaterWeek && <p className="mt-1 text-xs text-gray-400">توجد قراءة لأسبوع لاحق</p>}
            </td>
            <td className={`px-4 py-3 tabular-nums font-semibold ${charges && charges.consumption < 0 ? 'text-red-600' : 'text-brand-700'}`}>
                {charges ? charges.consumption : '—'}
            </td>
            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-600">{formatCurrency(row.unitPrice)}</td>
            <td className={`whitespace-nowrap px-4 py-3 tabular-nums ${belowMinimum ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {charges ? formatCurrency(charges.readingFee) : '—'}
            </td>
            <td className={`whitespace-nowrap px-4 py-3 tabular-nums ${belowMinimum ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                {formatCurrency(row.minimumPayment)}
            </td>
            <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums text-gray-900">
                {charges && charges.consumption >= 0 ? formatCurrency(charges.amountDue) : '—'}
                {belowMinimum && charges.consumption >= 0 && <p className="text-xs font-normal text-gray-500">الحد الأدنى</p>}
            </td>
            <td className="px-4 py-3">
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

export default function Index({ rows, week, weekOptions, summary, canRecord, filters, filterOptions }) {
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/meter-readings', filters, { week });

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
                        <h2 className="text-xl font-bold text-gray-900">القراءات الأسبوعية</h2>
                        <p className="mt-1 text-sm text-gray-500">أدخل القراءة الجديدة لكل مشترك — تُحفظ تلقائيًا عند الخروج من الحقل.</p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-sm text-gray-600">
                        الأسبوع
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

            <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-500">تم الإدخال</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                        {summary.entered} <span className="text-base font-medium text-gray-400">/ {summary.total}</span>
                    </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-500">المتبقي</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">{summary.total - summary.entered}</p>
                </div>
                <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
                    <p className="text-sm text-brand-700">مجموع المستحق لهذا الأسبوع</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">{formatCurrency(summary.amountDue)}</p>
                </div>
            </div>

            {!canRecord && <p className="mb-4 text-sm text-gray-500">يمكنك عرض القراءات فقط.</p>}

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو رقم المشترك أو الهاتف..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={rows.total}
                filterMenu={
                    <DataTableFilterMenu tableKey="meter-readings" groups={filterOptions} values={filterValues} onChange={setFilter} onClear={clearFilters} />
                }
            />

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <SortableTh column="account_number" label="رقم المشترك" sortState={filters} onSort={sort} />
                            <SortableTh column="full_name" label="المشترك" sortState={filters} onSort={sort} />
                            <th className="px-4 py-3">آخر قراءة</th>
                            <th className="px-4 py-3">القراءة الجديدة</th>
                            <th className="px-4 py-3">الفرق (كيلو)</th>
                            <th className="px-4 py-3">سعر الكيلو</th>
                            <th className="px-4 py-3">قيمة القراءة</th>
                            <th className="px-4 py-3">الحد الأدنى</th>
                            <th className="px-4 py-3">المطلوب دفعه</th>
                            <th className="px-4 py-3">الحالة</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {rows.data.length === 0 ? (
                            <tr>
                                <td className="px-6 py-4 text-gray-500" colSpan={10}>
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
