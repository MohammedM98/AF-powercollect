import { useEffect, useRef, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ConfirmDialog from '@/Components/ConfirmDialog';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import { formatCurrency } from '@/lib/currency';

/** "2026-09-18" → "18-09-2026". */
function formatDay(isoDate) {
    return isoDate.split('-').reverse().join('-');
}

/** A checkbox that can also show "some rows ticked". */
function SelectAllCheckbox({ checked, indeterminate, onChange, disabled }) {
    const ref = useRef(null);

    useEffect(() => {
        if (ref.current) {
            ref.current.indeterminate = indeterminate;
        }
    }, [indeterminate]);

    return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label="تحديد كل قراءات الصفحة" />;
}

/**
 * The accountant's queue of readings waiting for approval. Approving a
 * reading (ticked ones, or all that match the filters) locks it and adds
 * its amount to the subscriber's financial transactions.
 */
export default function Index({ readings, summary, showBranch, filters, filterOptions }) {
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/meter-reading-approvals', filters);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    // Which approval is waiting on "are you sure?": 'selected' or 'all'.
    const [confirming, setConfirming] = useState(null);
    const [processing, setProcessing] = useState(false);

    // Ticks only apply to rows on screen; drop any that left the page (approved, or another page).
    useEffect(() => {
        const visibleIds = new Set(readings.data.map((reading) => reading.id));
        setSelectedIds((current) => new Set([...current].filter((id) => visibleIds.has(id))));
    }, [readings.data]);

    const selectedRows = readings.data.filter((reading) => selectedIds.has(reading.id));
    const selectedTotal = selectedRows.reduce((total, reading) => total + Number(reading.amountDue), 0);
    const allOnPageSelected = readings.data.length > 0 && selectedRows.length === readings.data.length;
    const isFiltered = Boolean(search) || Object.values(filterValues).some(Boolean);

    function toggle(id) {
        setSelectedIds((current) => {
            const next = new Set(current);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function toggleAllOnPage() {
        setSelectedIds(allOnPageSelected ? new Set() : new Set(readings.data.map((reading) => reading.id)));
    }

    function approve() {
        const payload = confirming === 'all' ? { all: true, search, filter: filterValues } : { reading_ids: [...selectedIds] };

        setConfirming(null);
        setProcessing(true);
        router.post('/meter-reading-approvals', payload, {
            preserveScroll: true,
            onSuccess: () => setSelectedIds(new Set()),
            onFinish: () => setProcessing(false),
        });
    }

    const columnCount = showBranch ? 7 : 6;

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-3xl font-bold text-gray-900">اعتماد القراءات</h2>
                        <p className="mt-1 text-sm text-gray-500">راجع القراءات المُدخلة واعتمدها لتظهر في المعاملات المالية للمشترك.</p>
                    </div>
                    <div className="shrink-0">
                        <PrimaryButton type="button" onClick={() => setConfirming('all')} disabled={processing || summary.count === 0}>
                            <Icon name="check" className="h-4 w-4" strokeWidth={2} />
                            {isFiltered ? 'اعتماد كل النتائج' : 'اعتماد الكل'} ({summary.count.toLocaleString('en')})
                        </PrimaryButton>
                    </div>
                </>
            }
        >
            <Head title="اعتماد القراءات" />

            <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-surface p-4">
                    <p className="text-sm text-gray-500">{isFiltered ? 'قراءات مطابقة بانتظار الاعتماد' : 'قراءات بانتظار الاعتماد'}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">{summary.count.toLocaleString('en')}</p>
                </div>
                <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
                    <p className="text-sm text-brand-700">مجموع مبالغها</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">{formatCurrency(summary.amountDue)}</p>
                </div>
            </div>

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث باسم المشترك أو رقمه..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={readings.total}
                filterMenu={
                    <DataTableFilterMenu
                        tableKey="meter-reading-approvals"
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
                            <th>
                                <span className="flex items-center gap-4">
                                    <SelectAllCheckbox
                                        checked={allOnPageSelected}
                                        indeterminate={selectedRows.length > 0 && !allOnPageSelected}
                                        onChange={toggleAllOnPage}
                                        disabled={readings.data.length === 0 || processing}
                                    />
                                    المشترك
                                </span>
                            </th>
                            {showBranch && <th>الفرع</th>}
                            <SortableTh column="week_start" label="الأسبوع" sortState={filters} onSort={sort} />
                            <th>القراءة</th>
                            <SortableTh column="consumption" label="الاستهلاك" sortState={filters} onSort={sort} />
                            <SortableTh column="amount_due" label="المبلغ" sortState={filters} onSort={sort} />
                            <th>أدخلها</th>
                        </tr>
                    </thead>
                    <tbody>
                        {readings.data.length === 0 ? (
                            <tr>
                                <td colSpan={columnCount}>
                                    <div className="flex flex-col items-center px-6 py-10 text-center">
                                        <Icon name="check" className="h-9 w-9 text-emerald-500" strokeWidth={2} />
                                        <p className="mt-3 font-semibold text-gray-900">
                                            {isFiltered ? 'لا توجد قراءات مطابقة بانتظار الاعتماد.' : 'لا توجد قراءات بانتظار الاعتماد.'}
                                        </p>
                                        {!isFiltered && <p className="mt-1 text-sm text-gray-500">كل القراءات المُدخلة معتمدة.</p>}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            readings.data.map((reading) => {
                                const isSelected = selectedIds.has(reading.id);

                                return (
                                    <tr key={reading.id} className={isSelected ? 'bg-brand-50' : ''}>
                                        <td>
                                            <div className="flex items-center gap-4">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggle(reading.id)}
                                                    disabled={processing}
                                                    aria-label={`تحديد قراءة ${reading.subscriberName}`}
                                                />
                                                <RowIdentity
                                                    name={reading.subscriberName}
                                                    subtitle={reading.accountNumber}
                                                    subtitleDir="ltr"
                                                    status="amber"
                                                />
                                            </div>
                                        </td>
                                        {showBranch && <td className="text-gray-600">{reading.branchName}</td>}
                                        <td className="text-gray-600">
                                            <span className="block whitespace-nowrap" dir="ltr">
                                                {formatDay(reading.weekEnd)}
                                            </span>
                                            <span className="block whitespace-nowrap text-xs text-gray-400">
                                                من <span dir="ltr">{formatDay(reading.weekStart)}</span>
                                            </span>
                                        </td>
                                        <td className="tabular-nums">
                                            <span className="block font-semibold text-gray-900">{reading.currentReading}</span>
                                            <span className="block whitespace-nowrap text-xs text-gray-400">السابقة {reading.previousReading}</span>
                                        </td>
                                        <td className="tabular-nums text-brand-700">{reading.consumption}</td>
                                        <td className="font-semibold tabular-nums text-gray-900">
                                            <span className="whitespace-nowrap">{formatCurrency(reading.amountDue)}</span>
                                        </td>
                                        <td className="text-gray-600">
                                            {reading.recordedByName ?? '—'}
                                            <span className="block whitespace-nowrap text-xs text-gray-400" dir="ltr">
                                                {reading.recordedAt}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={readings} filters={filters} baseUrl="/meter-reading-approvals" />

            {selectedRows.length > 0 && (
                <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-gray-100 bg-surface/95 px-5 py-4 shadow-lift backdrop-blur">
                    <p className="text-sm text-gray-600">
                        <b className="text-gray-900">{selectedRows.length.toLocaleString('en')}</b> قراءة محددة · المجموع{' '}
                        <b className="tabular-nums text-gray-900">{formatCurrency(selectedTotal)}</b>
                    </p>
                    <div className="flex items-center gap-3">
                        <SecondaryButton onClick={() => setSelectedIds(new Set())} disabled={processing}>
                            إلغاء التحديد
                        </SecondaryButton>
                        <PrimaryButton type="button" onClick={() => setConfirming('selected')} disabled={processing}>
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
                        ? `سيتم اعتماد ${summary.count.toLocaleString('en')} قراءة${isFiltered ? ' مطابقة للبحث والتصفية الحالية' : ''} بمجموع ${formatCurrency(summary.amountDue)}، وتُضاف إلى المعاملات المالية للمشتركين. لا يمكن تعديل القراءة بعد اعتمادها.`
                        : `سيتم اعتماد ${selectedRows.length.toLocaleString('en')} قراءة بمجموع ${formatCurrency(selectedTotal)}، وتُضاف إلى المعاملات المالية للمشتركين. لا يمكن تعديل القراءة بعد اعتمادها.`
                }
                confirmLabel="نعم، اعتمد"
                cancelLabel="مراجعة القراءات"
            />
        </AuthenticatedLayout>
    );
}
