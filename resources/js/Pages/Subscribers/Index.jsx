import { useState } from 'react';
import { Head } from '@inertiajs/react';
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
import { useDeleteRecord } from '@/hooks/useDeleteRecord';
import { useRowClick } from '@/hooks/useRowClick';
import { useStatementWindow } from '@/hooks/useStatementWindow';
import { hasLatestWeekReading, readingOptionFor } from '@/lib/readings';
import MeterReadingModal from '@/Pages/MeterReadings/MeterReadingModal';
import SubscriberModal from './SubscriberModal';
import SubscriberDetailsModal from './SubscriberDetailsModal';
import StatementModal from './StatementModal';

const STATUS_TONES = {
    active: 'green',
    suspended: 'amber',
    disconnected: 'gray',
};

/** A row of the list in the shape the statement window's header reads. */
function statementHeader(subscriber) {
    return {
        id: subscriber.id,
        fullName: subscriber.full_name,
        accountNumber: subscriber.account_number,
        status: subscriber.status,
        statusLabel: subscriber.statusLabel,
        branchName: subscriber.branchName,
        tariffCategoryLabel: subscriber.tariffCategoryLabel,
        tariffSegmentName: subscriber.tariffSegmentName,
        meterBoxNumber: subscriber.meterBoxNumber,
    };
}

/** Why a menu action is locked: the permission it needs and who grants it. */
function needsPermission(permission) {
    return `تحتاج صلاحية «${permission}» — يمنحها مدير الفرع أو مدير النظام.`;
}

export default function Index({
    subscribers,
    canCreate,
    canRecordReadings,
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
    statement,
}) {
    const [modalSubscriber, setModalSubscriber] = useState(null);
    const [viewingSubscriberId, setViewingSubscriberId] = useState(null);
    // Looked up from the current page props (not kept as a copy) so the
    // statement refreshes after a reading is saved from inside it.
    const viewingSubscriber = subscribers.data.find((subscriber) => subscriber.id === viewingSubscriberId) ?? null;
    const [creating, setCreating] = useState(false);
    const [readingSubscriber, setReadingSubscriber] = useState(null);
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/subscribers', filters);
    const rowClick = useRowClick();
    const { requestDelete, deleteDialog } = useDeleteRecord('المشترك');

    const statementWindow = useStatementWindow(statement);

    /** Show a subscriber's financial history; `form` also opens its payment, charge or discount form. */
    function openStatement(subscriber, form = null) {
        statementWindow.open(statementHeader(subscriber), form);
    }

    /** The row's "more" menu: the subscriber's details, the account's forms and entering this week's reading. */
    function rowMenu(subscriber) {
        const readingItem = { label: 'إدخال قراءة', icon: 'gauge', shortcut: 'R', onSelect: () => setReadingSubscriber(subscriber) };

        if (!canRecordReadings) {
            readingItem.lockedReason = needsPermission('تسجيل القراءات');
        } else if (subscriber.status !== 'active') {
            Object.assign(readingItem, { disabled: true, hint: 'المشترك غير نشط' });
        } else if (hasLatestWeekReading(subscriber, readingWeekOptions)) {
            Object.assign(readingItem, { disabled: true, hint: 'مُدخلة هذا الأسبوع' });
        }

        return {
            title: subscriber.full_name,
            subtitle: subscriber.phone,
            groups: [
                {
                    label: 'المشترك',
                    items: [{ label: 'بيانات المشترك', icon: 'user', shortcut: 'I', onSelect: () => setViewingSubscriberId(subscriber.id) }],
                },
                {
                    label: 'الحساب المالي',
                    items: [
                        {
                            label: 'تسجيل دفعة',
                            icon: 'banknotes',
                            shortcut: 'P',
                            onSelect: () => openStatement(subscriber, 'payment'),
                            lockedReason: subscriber.canRecordPayment ? null : needsPermission('تسجيل التحصيلات'),
                        },
                        {
                            label: 'إضافة تحميل',
                            icon: 'document-plus',
                            onSelect: () => openStatement(subscriber, 'charge'),
                            lockedReason: subscriber.canAdjustBalance ? null : needsPermission('إضافة تحميل وخصم'),
                        },
                        {
                            label: 'إضافة خصم',
                            icon: 'discount',
                            onSelect: () => openStatement(subscriber, 'discount'),
                            lockedReason: subscriber.canAdjustBalance ? null : needsPermission('إضافة تحميل وخصم'),
                        },
                    ],
                },
                { label: 'القراءات', items: [readingItem] },
            ],
        };
    }

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
                                <tr key={subscriber.id} {...rowClick(() => openStatement(subscriber))}>
                                    <td className="text-end text-gray-600" dir="ltr">
                                        {subscriber.account_number}
                                    </td>
                                    <td>
                                        <RowIdentity
                                            name={subscriber.full_name}
                                            subtitle={subscriber.phone}
                                            subtitleDir="ltr"
                                            status={STATUS_TONES[subscriber.status]}
                                        />
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
                                        <RowActionsMenu
                                            onView={() => openStatement(subscriber)}
                                            onEdit={subscriber.canUpdate ? () => setModalSubscriber(subscriber) : undefined}
                                            onDelete={
                                                subscriber.canDelete
                                                    ? () => requestDelete(`/subscribers/${subscriber.id}`, subscriber.full_name)
                                                    : undefined
                                            }
                                            menu={rowMenu(subscriber)}
                                        />
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
                prop on an already-mounted instance. Each window's key has its
                own prefix: siblings sharing a key (the same subscriber open in
                two windows) make React duplicate them. */}
            {modalSubscriber && (
                <SubscriberModal
                    key={`edit-${modalSubscriber.id}`}
                    show
                    onClose={() => setModalSubscriber(null)}
                    subscriber={modalSubscriber}
                    {...modalProps}
                />
            )}

            <SubscriberDetailsModal
                key={`details-${viewingSubscriber?.id ?? 'closed'}`}
                subscriber={viewingSubscriber}
                canUpdate={viewingSubscriber?.canUpdate}
                readingWeekOptions={readingWeekOptions}
                onClose={() => setViewingSubscriberId(null)}
                onEdit={() => {
                    setModalSubscriber(viewingSubscriber);
                    setViewingSubscriberId(null);
                }}
                onOpenStatement={() => {
                    // The statement takes the details' place rather than opening over them.
                    setViewingSubscriberId(null);
                    openStatement(viewingSubscriber);
                }}
            />

            {readingSubscriber && (
                <MeterReadingModal
                    show
                    onClose={() => setReadingSubscriber(null)}
                    reading={null}
                    fixedSubscriber={readingOptionFor(readingSubscriber)}
                    weekOptions={readingWeekOptions}
                />
            )}

            {/* Keyed by subscriber so each statement opens with its own filters and forms. */}
            {statementWindow.subscriber && (
                <StatementModal
                    key={`statement-${statementWindow.subscriber.id}`}
                    subscriber={statementWindow.subscriber}
                    statement={statementWindow.statement}
                    initialForm={statementWindow.form}
                    onClose={statementWindow.close}
                />
            )}

            {deleteDialog}
        </AuthenticatedLayout>
    );
}
