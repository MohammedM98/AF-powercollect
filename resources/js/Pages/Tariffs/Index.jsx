import { useState } from 'react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import { formatCurrency } from '@/lib/currency';
import TariffModal from './TariffModal';

export default function Index({ tariffs, status, categoryOptions, filters, filterOptions }) {
    const [modalTariff, setModalTariff] = useState(null);
    const [creating, setCreating] = useState(false);
    const { setPerPage, sort, filterValues, setFilter, clearFilters } = useDataTable('/tariffs', filters);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">التعرفات</h2>
                    </div>
                    <div className="shrink-0">
                        <button
                            onClick={() => setCreating(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            تعرفة جديدة
                        </button>
                    </div>
                </>
            }
        >
            <Head title="التعرفات" />



            <DataTableToolbar
                showSearch={false}
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={tariffs.total}
                filterMenu={
                    <DataTableFilterMenu tableKey="tariffs" groups={filterOptions} values={filterValues} onChange={setFilter} onClear={clearFilters} />
                }
            />

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <SortableTh column="category" label="الفئة" sortState={filters} onSort={sort} />
                            <SortableTh column="rate" label="السعر (شيكل)" sortState={filters} onSort={sort} />
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {tariffs.data.length === 0 ? (
                            <tr>
                                <td className="px-6 py-4 text-gray-500" colSpan={3}>
                                    لا توجد تعرفات بعد.
                                </td>
                            </tr>
                        ) : (
                            tariffs.data.map((tariff) => (
                                <tr key={tariff.id} className="transition hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{tariff.categoryLabel}</td>
                                    <td className="px-6 py-4 text-gray-600" dir="ltr">
                                        {formatCurrency(tariff.rate)}
                                    </td>
                                    <td className="px-6 py-4 text-end">
                                        <RowActionsMenu>
                                            <button
                                                onClick={() => setModalTariff(tariff)}
                                                className="block w-full px-4 py-2 text-start text-sm text-gray-700 hover:bg-gray-50"
                                            >
                                                تعديل
                                            </button>
                                        </RowActionsMenu>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={tariffs} filters={filters} baseUrl="/tariffs" />

            <TariffModal show={creating} onClose={() => setCreating(false)} tariff={null} categoryOptions={categoryOptions} />

            {/* Keyed by tariff id so switching who's being edited remounts
                the form with fresh initial values — useForm() only captures
                its initial data once, it won't pick up a changed `tariff`
                prop on an already-mounted instance. */}
            {modalTariff && (
                <TariffModal
                    key={modalTariff.id}
                    show
                    onClose={() => setModalTariff(null)}
                    tariff={modalTariff}
                    categoryOptions={categoryOptions}
                />
            )}
        </AuthenticatedLayout>
    );
}
