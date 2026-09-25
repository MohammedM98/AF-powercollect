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
import AddButton from '@/Components/AddButton';

const STATUS_TONES = {
    active: 'green',
    suspended: 'amber',
    disconnected: 'gray',
};

export default function Index({
    subscribers,
    canCreate,
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
    readingWeekOptions,
}) {
    const [modalSubscriber, setModalSubscriber] = useState(null);
    const [viewingSubscriberId, setViewingSubscriberId] = useState(null);
    // Looked up from the current page props (not kept as a copy) so the
    // statement refreshes after a reading is saved from inside it.
    const viewingSubscriber = subscribers.data.find((subscriber) => subscriber.id === viewingSubscriberId) ?? null;
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
                            <AddButton onClick={() => setCreating(true)}>مشترك جديد</AddButton>
                        </div>
                    )}
                </>
            }
        >
            <Head title="المشتركون" />



            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو رقم الهاتف أو رقم المشترك..."
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
                            <SortableTh column="account_number" label="رقم المشترك" sortState={filters} onSort={sort} />
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
                                <td className="px-6 py-4 text-gray-500" colSpan={7}>
                                    لا توجد نتائج مطابقة.
                                </td>
                            </tr>
                        ) : (
                            subscribers.data.map((subscriber) => (
                                <tr key={subscriber.id} className="transition hover:bg-gray-50">
                                    <td className="px-6 py-4 text-end text-gray-600" dir="ltr">
                                        {subscriber.account_number}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900">
                                        <button
                                            type="button"
                                            onClick={() => setViewingSubscriberId(subscriber.id)}
                                            className="text-start text-brand-700 hover:underline"
                                        >
                                            {subscriber.full_name}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-end text-gray-600" dir="ltr">
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
                                                onClick={() => setViewingSubscriberId(subscriber.id)}
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
                readingWeekOptions={readingWeekOptions}
                onClose={() => setViewingSubscriberId(null)}
                onEdit={() => {
                    setModalSubscriber(viewingSubscriber);
                    setViewingSubscriberId(null);
                }}
            />
        </AuthenticatedLayout>
    );
}
