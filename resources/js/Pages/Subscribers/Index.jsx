import { useState } from 'react';
import { Head, Link } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import AddButton from '@/Components/AddButton';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import StatusPill from '@/Components/DataTable/StatusPill';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import RowIdentity from '@/Components/DataTable/RowIdentity';
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
                        <h2 className="text-3xl font-bold text-gray-900">المشتركون</h2>
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
                    <DataTableFilterMenu
                        tableKey="subscribers"
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
                            <SortableTh column="account_number" label="رقم المشترك" sortState={filters} onSort={sort} />
                            <SortableTh column="full_name" label="الاسم الكامل" sortState={filters} onSort={sort} />
                            <th>الطبلون</th>
                            <th>نوع الاشتراك</th>
                            <th>الفرع</th>
                            <SortableTh column="status" label="الحالة" sortState={filters} onSort={sort} />
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {subscribers.data.length === 0 ? (
                            <tr>
                                <td className="text-gray-500" colSpan={7}>
                                    لا توجد نتائج مطابقة.
                                </td>
                            </tr>
                        ) : (
                            subscribers.data.map((subscriber) => (
                                <tr key={subscriber.id}>
                                    <td className="text-end text-gray-600" dir="ltr">
                                        {subscriber.account_number}
                                    </td>
                                    <td>
                                        <button type="button" onClick={() => setViewingSubscriberId(subscriber.id)} className="text-start">
                                            <RowIdentity
                                                name={subscriber.full_name}
                                                subtitle={subscriber.phone}
                                                subtitleDir="ltr"
                                                status={STATUS_TONES[subscriber.status]}
                                            />
                                        </button>
                                    </td>
                                    <td className="text-gray-600">
                                        {subscriber.meterBoxNumber ? <span className="data-chip">{subscriber.meterBoxNumber}</span> : '—'}
                                    </td>
                                    <td className="text-gray-600">
                                        {subscriber.tariffCategoryLabel}
                                        {subscriber.tariffSegmentName && <div className="text-xs text-gray-400">{subscriber.tariffSegmentName}</div>}
                                    </td>
                                    <td className="text-gray-600">{subscriber.branchName}</td>
                                    <td>
                                        <StatusPill tone={STATUS_TONES[subscriber.status]} label={subscriber.statusLabel} />
                                    </td>
                                    <td className="text-end">
                                        <RowActionsMenu>
                                            <button onClick={() => setViewingSubscriberId(subscriber.id)}>عرض</button>
                                            <Link href={`/subscribers/${subscriber.id}/statement`}>كشف الحساب</Link>
                                            {subscriber.canUpdate && <button onClick={() => setModalSubscriber(subscriber)}>تعديل</button>}
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
