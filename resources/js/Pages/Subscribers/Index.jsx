import { useState } from 'react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import StatusPill from '@/Components/DataTable/StatusPill';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import SubscriberModal from './SubscriberModal';
import SubscriberDetailsModal from './SubscriberDetailsModal';

const STATUS_TONES = {
    active: 'green',
    suspended: 'amber',
    disconnected: 'gray',
};

export default function Index({
    subscribers,
    canCreate,
    status,
    branches,
    meterBoxes,
    tariffs,
    circuitBreakers,
    subAreas,
    canChooseBranch,
    currentBranchAreaId,
    currentBranchAreaName,
    canEditMinimumCharge,
    filters,
    filterOptions,
}) {
    const [modalSubscriber, setModalSubscriber] = useState(null);
    const [viewingSubscriber, setViewingSubscriber] = useState(null);
    const [creating, setCreating] = useState(false);
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/subscribers', filters);

    const modalProps = {
        branches,
        meterBoxes,
        tariffs,
        circuitBreakers,
        subAreas,
        canChooseBranch,
        currentBranchAreaId,
        currentBranchAreaName,
        canEditMinimumCharge,
    };

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">المشتركون</h2>
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
                                مشترك جديد
                            </button>
                        </div>
                    )}
                </>
            }
        >
            <Head title="المشتركون" />



            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو رقم الهاتف..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={subscribers.total}
                filterMenu={
                    <DataTableFilterMenu tableKey="subscribers" groups={filterOptions} values={filterValues} onChange={setFilter} onClear={clearFilters} />
                }
            />

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <SortableTh column="full_name" label="الاسم الكامل" sortState={filters} onSort={sort} />
                            <th className="px-6 py-3">الطبلون</th>
                            <th className="px-6 py-3">نوع الاشتراك</th>
                            <th className="px-6 py-3">الفرع</th>
                            <SortableTh column="status" label="الحالة" sortState={filters} onSort={sort} />
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {subscribers.data.length === 0 ? (
                            <tr>
                                <td className="px-6 py-4 text-gray-500" colSpan={6}>
                                    لا توجد نتائج مطابقة.
                                </td>
                            </tr>
                        ) : (
                            subscribers.data.map((subscriber) => (
                                <tr key={subscriber.id} className="transition hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">
                                        <button
                                            type="button"
                                            onClick={() => setViewingSubscriber(subscriber)}
                                            className="text-start text-brand-700 hover:underline"
                                        >
                                            {subscriber.full_name}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600" dir="ltr">
                                        {subscriber.meterBoxNumber ?? '—'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{subscriber.tariffCategoryLabel}</td>
                                    <td className="px-6 py-4 text-gray-600">{subscriber.branchName}</td>
                                    <td className="px-6 py-4">
                                        <StatusPill tone={STATUS_TONES[subscriber.status]} label={subscriber.statusLabel} />
                                    </td>
                                    <td className="px-6 py-4 text-end">
                                        <RowActionsMenu>
                                            <button
                                                onClick={() => setViewingSubscriber(subscriber)}
                                                className="block w-full px-4 py-2 text-start text-sm text-gray-700 hover:bg-gray-50"
                                            >
                                                عرض
                                            </button>
                                            {subscriber.canUpdate && (
                                                <button
                                                    onClick={() => setModalSubscriber(subscriber)}
                                                    className="block w-full px-4 py-2 text-start text-sm text-gray-700 hover:bg-gray-50"
                                                >
                                                    تعديل
                                                </button>
                                            )}
                                        </RowActionsMenu>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={subscribers} filters={filters} baseUrl="/subscribers" />

            <SubscriberModal show={creating} onClose={() => setCreating(false)} subscriber={null} {...modalProps} />

            {/* Keyed by subscriber id so switching who's being edited remounts
                the form with fresh initial values — useForm() only captures
                its initial data once, it won't pick up a changed `subscriber`
                prop on an already-mounted instance. */}
            {modalSubscriber && (
                <SubscriberModal
                    key={modalSubscriber.id}
                    show
                    onClose={() => setModalSubscriber(null)}
                    subscriber={modalSubscriber}
                    {...modalProps}
                />
            )}

            <SubscriberDetailsModal
                key={viewingSubscriber?.id ?? 'closed'}
                subscriber={viewingSubscriber}
                canUpdate={viewingSubscriber?.canUpdate}
                onClose={() => setViewingSubscriber(null)}
                onEdit={() => {
                    setModalSubscriber(viewingSubscriber);
                    setViewingSubscriber(null);
                }}
            />
        </AuthenticatedLayout>
    );
}
