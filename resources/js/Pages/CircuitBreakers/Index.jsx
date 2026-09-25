import { useState } from 'react';
import { Head } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import AddButton from '@/Components/AddButton';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import { formatCurrency } from '@/lib/currency';
import CircuitBreakerModal from './CircuitBreakerModal';

export default function Index({ circuitBreakers, filters, filterOptions }) {
    const [modalCircuitBreaker, setModalCircuitBreaker] = useState(null);
    const [creating, setCreating] = useState(false);
    const { setPerPage, sort, filterValues, setFilter, clearFilters } = useDataTable('/circuit-breakers', filters);

    return (
        <SettingsLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">القواطع</h2>
                    </div>
                    <div className="shrink-0">
                        <AddButton onClick={() => setCreating(true)}>قاطع جديد</AddButton>
                    </div>
                </>
            }
        >
            <Head title="القواطع" />

            <DataTableToolbar
                showSearch={false}
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={circuitBreakers.total}
                filterMenu={
                    <DataTableFilterMenu
                        tableKey="circuit_breakers"
                        groups={filterOptions}
                        values={filterValues}
                        onChange={setFilter}
                        onClear={clearFilters}
                    />
                }
            />

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <SortableTh column="ampere" label="الأمبير" sortState={filters} onSort={sort} />
                            <SortableTh column="minimum_payment" label="الحد الأدنى للدفع (شيكل)" sortState={filters} onSort={sort} />
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {circuitBreakers.data.length === 0 ? (
                            <tr>
                                <td className="px-6 py-4 text-gray-500" colSpan={3}>
                                    لا توجد قواطع بعد.
                                </td>
                            </tr>
                        ) : (
                            circuitBreakers.data.map((circuitBreaker) => (
                                <tr key={circuitBreaker.id} className="transition hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{circuitBreaker.ampere}</td>
                                    <td className="px-6 py-4 text-end text-gray-600" dir="ltr">
                                        {formatCurrency(circuitBreaker.minimum_payment)}
                                    </td>
                                    <td className="px-6 py-4 text-end">
                                        <RowActionsMenu>
                                            <button
                                                onClick={() => setModalCircuitBreaker(circuitBreaker)}
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

            <Pagination meta={circuitBreakers} filters={filters} baseUrl="/circuit-breakers" />

            <CircuitBreakerModal show={creating} onClose={() => setCreating(false)} circuitBreaker={null} />
            {modalCircuitBreaker && (
                <CircuitBreakerModal
                    key={modalCircuitBreaker.id}
                    show
                    onClose={() => setModalCircuitBreaker(null)}
                    circuitBreaker={modalCircuitBreaker}
                />
            )}
        </SettingsLayout>
    );
}
