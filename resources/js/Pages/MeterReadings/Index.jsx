import { useState } from 'react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import StatusPill from '@/Components/DataTable/StatusPill';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import MeterReadingModal from './MeterReadingModal';

const STATUS_TONES = {
    pending: 'amber',
    approved: 'green',
};

export default function Index({ readings, canCreate, filters, filterOptions, weekOptions, subscriberOptions }) {
    const [creating, setCreating] = useState(false);
    const [editingReading, setEditingReading] = useState(null);
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/meter-readings', filters);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">القراءات الأسبوعية</h2>
                    </div>
                    {canCreate && (
                        <div className="shrink-0">
                            <button
                                onClick={() => setCreating(true)}
                                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                إدخال قراءة
                            </button>
                        </div>
                    )}
                </>
            }
        >
            <Head title="القراءات الأسبوعية" />

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث باسم المشترك أو رقمه..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={readings.total}
                filterMenu={
                    <DataTableFilterMenu tableKey="meter-readings" groups={filterOptions} values={filterValues} onChange={setFilter} onClear={clearFilters} />
                }
            />

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <th className="px-6 py-3">رقم المشترك</th>
                            <th className="px-6 py-3">المشترك</th>
                            <SortableTh column="week_start" label="الأسبوع" sortState={filters} onSort={sort} />
                            <th className="px-6 py-3">القراءة السابقة</th>
                            <SortableTh column="current_reading" label="القراءة الحالية" sortState={filters} onSort={sort} />
                            <SortableTh column="consumption" label="الاستهلاك" sortState={filters} onSort={sort} />
                            <th className="px-6 py-3">الحالة</th>
                            <th className="px-6 py-3">أدخلها</th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {readings.data.length === 0 ? (
                            <tr>
                                <td className="px-6 py-4 text-gray-500" colSpan={9}>
                                    لا توجد قراءات مطابقة.
                                </td>
                            </tr>
                        ) : (
                            readings.data.map((reading) => (
                                <tr key={reading.id} className="transition hover:bg-gray-50">
                                    <td className="px-6 py-4 text-end text-gray-600" dir="ltr">
                                        {reading.accountNumber}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{reading.subscriberName}</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-gray-600">
                                        {reading.weekStart} ← {reading.weekEnd}
                                    </td>
                                    <td className="px-6 py-4 tabular-nums text-gray-600">{reading.previous_reading}</td>
                                    <td className="px-6 py-4 tabular-nums font-semibold text-gray-900">{reading.current_reading}</td>
                                    <td className="px-6 py-4 tabular-nums text-brand-700">{reading.consumption}</td>
                                    <td className="px-6 py-4">
                                        <StatusPill tone={STATUS_TONES[reading.status]} label={reading.statusLabel} />
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        <p>{reading.recordedByName ?? '—'}</p>
                                        <p className="text-xs text-gray-400" dir="ltr">
                                            {reading.recordedAt}
                                        </p>
                                    </td>
                                    <td className="px-6 py-4 text-end">
                                        {reading.canUpdate && (
                                            <button
                                                type="button"
                                                onClick={() => setEditingReading(reading)}
                                                className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                                            >
                                                تعديل
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={readings} filters={filters} baseUrl="/meter-readings" />

            {creating && (
                <MeterReadingModal
                    show
                    onClose={() => setCreating(false)}
                    reading={null}
                    subscriberOptions={subscriberOptions}
                    weekOptions={weekOptions}
                />
            )}

            {editingReading && (
                <MeterReadingModal
                    key={editingReading.id}
                    show
                    onClose={() => setEditingReading(null)}
                    reading={editingReading}
                    subscriberOptions={subscriberOptions}
                    weekOptions={weekOptions}
                />
            )}
        </AuthenticatedLayout>
    );
}
