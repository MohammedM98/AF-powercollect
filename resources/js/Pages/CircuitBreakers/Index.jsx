import { useState } from 'react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import SortableTh from '@/Components/DataTable/SortableTh';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import { formatCurrency } from '@/lib/currency';
import CircuitBreakerModal from './CircuitBreakerModal';

export default function Index({ circuitBreakers, status, filters }) {
    const [modalCircuitBreaker, setModalCircuitBreaker] = useState(null);
    const [creating, setCreating] = useState(false);
    const { setPerPage, sort } = useDataTable('/circuit-breakers', filters);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">القواطع</h2>
                    </div>
                    <div className="shrink-0">
                        <button
                            onClick={() => setCreating(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            قاطع جديد
                        </button>
                    </div>
                </>
            }
        >
            <Head title="القواطع" />

            {status === 'circuit-breaker-created' && <div className="mb-4 text-sm font-medium text-green-600">تم إنشاء القاطع.</div>}
            {status === 'circuit-breaker-updated' && <div className="mb-4 text-sm font-medium text-green-600">تم تحديث القاطع.</div>}

            <DataTableToolbar
                showSearch={false}
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={circuitBreakers.total}
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
                                    <td className="px-6 py-4 text-gray-600" dir="ltr">
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
        </AuthenticatedLayout>
    );
}
