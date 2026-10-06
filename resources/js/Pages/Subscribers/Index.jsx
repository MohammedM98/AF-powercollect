import { useEffect, useRef, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import AddButton from '@/Components/AddButton';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import StatusPill from '@/Components/DataTable/StatusPill';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import Pagination from '@/Components/DataTable/Pagination';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import { useDataTable } from '@/hooks/useDataTable';
import { useDeleteRecord } from '@/hooks/useDeleteRecord';
import { useRowClick } from '@/hooks/useRowClick';
import { useStatementWindow } from '@/hooks/useStatementWindow';
import { printFieldsProps, printRowProps } from '@/lib/print';
import { formatCurrency } from '@/lib/currency';
import { hasLatestWeekReading, readingOptionFor } from '@/lib/readings';
import MeterReadingModal from '@/Pages/MeterReadings/MeterReadingModal';
import SubscriberModal from './SubscriberModal';
import PersonalDetailsModal from './PersonalDetailsModal';
import BulkActionBar from './BulkActionBar';
import BulkChangeModal from './BulkChangeModal';
import PhoneQuickEdit from './PhoneQuickEdit';
import Icon from '@/Components/Icon';
import SubscriberDetailsModal from './SubscriberDetailsModal';
import ReadingHistoryModal from './ReadingHistoryModal';
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
        fullName: subscriber.display_name,
        accountNumber: subscriber.account_number,
        subscriberNumber: subscriber.subscriber_number,
        status: subscriber.status,
        statusLabel: subscriber.statusLabel,
        branchName: subscriber.branchName,
        tariffCategoryLabel: subscriber.tariffCategoryLabel,
        tariffSegmentName: subscriber.tariffSegmentName,
        meterBoxNumber: subscriber.meterBoxNumber,
    };
}

/** Why a menu action is locked: the permission it needs and who grants it. */
/** The details printing can show as columns of their own (see printFieldsProps). */
const PRINT_FIELDS = [
    { key: 'display_name', label: 'اسم المشترك' },
    { key: 'contact_phone', label: 'رقم الجوال' },
    { key: 'account_number', label: 'رقم الاشتراك' },
    { key: 'subscriber_number', label: 'رقم المشترك' },
    { key: 'meterBoxName', label: 'اسم الطبلون' },
    { key: 'meterBoxNumber', label: 'رقم الطبلون' },
    { key: 'subAreaName', label: 'منطقة 2' },
    { key: 'branchName', label: 'الفرع' },
];

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
    segments,
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
    bulkActions,
    statusOptions,
}) {
    const { can } = usePage().props;
    const [modalSubscriber, setModalSubscriber] = useState(null);
    const [viewingSubscriberId, setViewingSubscriberId] = useState(null);
    // Looked up from the current page props (not kept as a copy) so the
    // statement refreshes after a reading is saved from inside it.
    const viewingSubscriber = subscribers.data.find((subscriber) => subscriber.id === viewingSubscriberId) ?? null;
    const [creating, setCreating] = useState(false);
    const [subscriptionSource, setSubscriptionSource] = useState(null);
    const [personalDetailsSubscriber, setPersonalDetailsSubscriber] = useState(null);
    const [readingSubscriber, setReadingSubscriber] = useState(null);
    const [historySubscriberId, setHistorySubscriberId] = useState(null);
    const historySubscriber = subscribers.data.find((subscriber) => subscriber.id === historySubscriberId) ?? null;
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, setFilters, clearFilters } = useDataTable('/subscribers', filters);
    const rowClick = useRowClick();
    // Subscribers ticked for a bulk action (kept across pages), or every match of the filters.
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [allMatching, setAllMatching] = useState(false);
    const [bulkField, setBulkField] = useState(null);
    const pageIds = subscribers.data.map((subscriber) => subscriber.id);
    const pageSelectedCount = pageIds.filter((id) => selectedIds.has(id)).length;
    const selectionCount = allMatching ? subscribers.total : selectedIds.size;
    const selection = allMatching ? { all: true, search: filters.search, filter: filters.filter } : { ids: [...selectedIds] };
    const headerCheckbox = useRef(null);
    const filtersKey = JSON.stringify([filters.search, filters.filter]);
    const canSelect = bulkActions.minimumCharge || bulkActions.status || bulkActions.message;

    // A new search or filter is a new list: start the choice over.
    useEffect(() => {
        setSelectedIds(new Set());
        setAllMatching(false);
    }, [filtersKey]);

    useEffect(() => {
        if (headerCheckbox.current) {
            headerCheckbox.current.indeterminate = !allMatching && pageSelectedCount > 0 && pageSelectedCount < pageIds.length;
        }
    });

    function toggleSubscriber(id) {
        setAllMatching(false);
        setSelectedIds((current) => {
            const next = new Set(current);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function togglePage() {
        setAllMatching(false);
        setSelectedIds((current) => {
            const next = new Set(current);
            const everyChosen = pageIds.every((id) => next.has(id));
            pageIds.forEach((id) => (everyChosen ? next.delete(id) : next.add(id)));
            return next;
        });
    }

    function clearSelection() {
        setSelectedIds(new Set());
        setAllMatching(false);
    }
    const { requestDelete, deleteDialog } = useDeleteRecord('المشترك');

    const statementWindow = useStatementWindow(statement);
    const viewingIndex = subscribers.data.findIndex((subscriber) => subscriber.id === viewingSubscriberId);

    function closeProfile() {
        setViewingSubscriberId(null);
        if (statementWindow.subscriber) {
            statementWindow.close();
        }
    }

    function switchProfile(offset) {
        if (statementWindow.subscriber) {
            statementWindow.close();
        }
        setViewingSubscriberId(subscribers.data[viewingIndex + offset].id);
    }

    /** Show a subscriber's financial history; `form` also opens its payment, charge or discount form. */
    function openStatement(subscriber, form = null) {
        statementWindow.open(statementHeader(subscriber), form);
    }

    /** The row's "more" menu: the subscriber's details, the account's forms, entering this week's reading and the past readings. */
    function rowMenu(subscriber) {
        const readingItem = { label: 'إدخال قراءة', icon: 'gauge', tone: 'teal', shortcut: 'R', onSelect: () => setReadingSubscriber(subscriber) };

        if (!canRecordReadings) {
            readingItem.lockedReason = needsPermission('تسجيل القراءات');
        } else if (subscriber.status !== 'active') {
            Object.assign(readingItem, { disabled: true, hint: 'المشترك غير نشط' });
        } else if (hasLatestWeekReading(subscriber, readingWeekOptions)) {
            Object.assign(readingItem, { disabled: true, hint: 'مُدخلة هذا الأسبوع' });
        }

        return {
            title: subscriber.display_name,
            subtitle: subscriber.contact_phone,
            groups: [
                {
                    label: 'المشترك',
                    items: [
                        { label: 'بيانات المشترك', icon: 'user', tone: 'graphite', shortcut: 'I', onSelect: () => setViewingSubscriberId(subscriber.id) },
                        {
                            label: 'تعديل البيانات الشخصية',
                            icon: 'pencil',
                            tone: 'blue',
                            shortcut: 'E',
                            onSelect: () => setPersonalDetailsSubscriber(subscriber),
                            lockedReason: subscriber.canUpdate ? null : needsPermission('تعديل المشتركين'),
                        },
                        ...(canCreate ? [{ label: 'إضافة اشتراك', icon: 'document-plus', tone: 'indigo', onSelect: () => setSubscriptionSource(subscriber) }] : []),
                        {
                            label: 'إرسال رسالة',
                            icon: 'send',
                            tone: 'sky',
                            onSelect: () => router.visit(`/messages/create?${new URLSearchParams({ kind: 'custom', status: '', 'subscriber_ids[]': subscriber.id })}`),
                            lockedReason: can?.sendMessages ? null : needsPermission('إرسال الرسائل'),
                        },
                    ],
                },
                {
                    label: 'الحساب المالي',
                    items: [
                        {
                            label: 'تسجيل دفعة',
                            icon: 'banknotes',
                            tone: 'emerald',
                            shortcut: 'P',
                            onSelect: () => openStatement(subscriber, 'payment'),
                            lockedReason: subscriber.canRecordPayment ? null : needsPermission('تسجيل التحصيلات'),
                        },
                        {
                            label: 'تحميل حركة',
                            icon: 'document-plus',
                            tone: 'amber',
                            onSelect: () => openStatement(subscriber, 'charge'),
                            lockedReason: subscriber.canAdjustBalance ? null : needsPermission('إضافة تحميل وخصم'),
                        },
                        {
                            label: 'إضافة خصم',
                            icon: 'discount',
                            tone: 'violet',
                            onSelect: () => openStatement(subscriber, 'discount'),
                            lockedReason: subscriber.canAdjustBalance ? null : needsPermission('إضافة تحميل وخصم'),
                        },
                        {
                            label: 'مقاصة',
                            icon: 'scale',
                            tone: 'teal',
                            onSelect: () => openStatement(subscriber, 'clearing'),
                            lockedReason: subscriber.canAdjustBalance ? null : needsPermission('إضافة تحميل وخصم'),
                        },
                    ],
                },
                {
                    label: 'القراءات',
                    items: [
                        readingItem,
                        {
                            label: 'سجل القراءات',
                            icon: 'chart',
                            tone: 'graphite',
                            shortcut: 'H',
                            hint: subscriber.meterReadings.length ? `${subscriber.meterReadings.length} قراءة` : 'لا توجد بعد',
                            onSelect: () => setHistorySubscriberId(subscriber.id),
                        },
                    ],
                },
            ],
        };
    }

    const modalProps = {
        branches,
        meterBoxes,
        tariffs,
        segments,
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
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Link
                            href="/subscribers/bulk-changes"
                            className="inline-flex items-center gap-2 rounded-control border border-gray-200 bg-surface px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:border-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                        >
                            <Icon name="history" className="h-4 w-4" />
                            سجل التعديلات الجماعية
                        </Link>
                        {canCreate && <AddButton onClick={() => setCreating(true)}>مشترك جديد</AddButton>}
                    </div>
                </>
            }
        >
            <Head title="المشتركون" />

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو رقم الهاتف أو رقم المشترك أو الاشتراك..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={subscribers.total}
                filterMenu={
                    <DataTableFilterMenu
                        tableKey="subscribers"
                        groups={filterOptions}
                        values={filterValues}
                        onChange={setFilter}
                        onChangeMany={setFilters}
                        onClear={clearFilters}
                    />
                }
            />

            {canSelect && !allMatching && pageIds.length > 0 && pageSelectedCount === pageIds.length && subscribers.total > pageIds.length && (
                <div role="status" className="flex flex-wrap items-center justify-center gap-2 border-x border-gray-100 bg-brand-500/5 px-4 py-2.5 text-sm text-gray-700">
                    تم تحديد {pageIds.length.toLocaleString('en')} مشترك في هذه الصفحة.
                    <button
                        type="button"
                        onClick={() => setAllMatching(true)}
                        className="rounded font-semibold text-brand-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                    >
                        تحديد كل النتائج المطابقة ({subscribers.total.toLocaleString('en')})
                    </button>
                </div>
            )}

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start" {...printFieldsProps(PRINT_FIELDS)}>
                    <thead>
                        <tr>
                            {canSelect && (
                                <th data-actions="" className="w-10">
                                    <input
                                        ref={headerCheckbox}
                                        type="checkbox"
                                        checked={allMatching || (pageIds.length > 0 && pageSelectedCount === pageIds.length)}
                                        onChange={togglePage}
                                        aria-label="تحديد كل مشتركي هذه الصفحة"
                                        title="تحديد كل مشتركي هذه الصفحة"
                                        className="rounded border-gray-300 text-brand-600"
                                    />
                                </th>
                            )}
                            <SortableTh column="account_number" label="رقم الاشتراك" sortState={filters} onSort={sort} />
                            <SortableTh column="display_name" label="اسم الاشتراك" sortState={filters} onSort={sort} />
                            <th>الطبلون</th>
                            <th>نوع الاشتراك</th>
                            <th>منطقة 2</th>
                            <th>الحد الأدنى</th>
                            <th>الرصيد</th>
                            <SortableTh column="status" label="الحالة" sortState={filters} onSort={sort} />
                            <ActionsTh />
                        </tr>
                    </thead>
                    <tbody>
                        {subscribers.data.length === 0 ? (
                            <tr>
                                <td className="text-gray-500" colSpan={canSelect ? 10 : 9}>
                                    لا توجد نتائج مطابقة.
                                </td>
                            </tr>
                        ) : (
                            subscribers.data.map((subscriber) => (
                                <tr
                                    key={subscriber.id}
                                    {...rowClick(() => openStatement(subscriber))}
                                    {...printRowProps(Object.fromEntries(PRINT_FIELDS.map((field) => [field.key, subscriber[field.key]])))}
                                    className={allMatching || selectedIds.has(subscriber.id) ? 'bg-brand-50' : undefined}
                                >
                                    {canSelect && (
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={allMatching || selectedIds.has(subscriber.id)}
                                                onChange={() => toggleSubscriber(subscriber.id)}
                                                aria-label={`تحديد ${subscriber.display_name}`}
                                                className="rounded border-gray-300 text-brand-600"
                                            />
                                        </td>
                                    )}
                                    <td className="text-gray-600">
                                        <span dir="ltr">{subscriber.account_number}</span>
                                        {subscriber.subscriber_number && (
                                            <span className="mt-1 block text-xs text-gray-400">
                                                رقم المشترك <bdi dir="ltr">{subscriber.subscriber_number}</bdi>
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <RowIdentity
                                            name={subscriber.display_name}
                                            subtitle={<PhoneQuickEdit subscriber={subscriber} />}
                                            status={STATUS_TONES[subscriber.status]}
                                        />
                                        {subscriber.subscriptionCount > 1 && (
                                            <span className="mt-1 block text-xs text-gray-500">{subscriber.subscriptionCount} اشتراكات</span>
                                        )}
                                    </td>
                                    <td className="text-gray-600">
                                        {subscriber.meterBoxNumber ? <span className="data-chip">{subscriber.meterBoxNumber}</span> : '—'}
                                    </td>
                                    <td className="text-gray-600">
                                        {subscriber.tariffCategoryLabel}
                                        {subscriber.tariffSegmentName && <div className="text-xs text-gray-400">{subscriber.tariffSegmentName}</div>}
                                    </td>
                                    <td className="text-gray-600">{subscriber.subAreaName || '—'}</td>
                                    <td className="whitespace-nowrap text-gray-600">{formatCurrency(subscriber.weeklyMinimumPayment)}</td>
                                    <td className={`whitespace-nowrap font-semibold ${Number(subscriber.outstandingBalance) > 0 ? 'text-red-600' : Number(subscriber.outstandingBalance) < 0 ? 'text-emerald-600' : 'text-gray-600'}`}>
                                        {formatCurrency(subscriber.outstandingBalance)}
                                    </td>
                                    <td>
                                        <StatusPill tone={STATUS_TONES[subscriber.status]} label={subscriber.statusLabel} />
                                    </td>
                                    <td className="text-end">
                                        <RowActionsMenu
                                            onView={() => openStatement(subscriber)}
                                            onEdit={subscriber.canUpdate ? () => setModalSubscriber(subscriber) : undefined}
                                            onDelete={
                                                subscriber.canDelete
                                                    ? () => requestDelete(`/subscribers/${subscriber.id}`, subscriber.display_name)
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

            {canSelect && selectionCount > 0 && (
                <>
                    {/* Room at the end of the page, so the bar never hides the last rows. */}
                    <div className="h-24" aria-hidden="true" />
                    <BulkActionBar
                        count={selectionCount}
                        selection={selection}
                        filters={filters}
                        abilities={bulkActions}
                        onAction={setBulkField}
                        onClear={clearSelection}
                    />
                </>
            )}

            {bulkField && (
                <BulkChangeModal
                    field={bulkField}
                    selection={selection}
                    count={selectionCount}
                    statusOptions={statusOptions}
                    onClose={() => setBulkField(null)}
                    onDone={() => {
                        setBulkField(null);
                        clearSelection();
                    }}
                />
            )}

            <SubscriberModal show={creating} onClose={() => setCreating(false)} subscriber={null} {...modalProps} />

            {subscriptionSource && (
                <SubscriberModal
                    key={`subscription-${subscriptionSource.id}`}
                    show
                    onClose={() => setSubscriptionSource(null)}
                    subscriber={null}
                    sourceSubscriber={subscriptionSource}
                    {...modalProps}
                />
            )}

            {personalDetailsSubscriber && (
                <PersonalDetailsModal
                    key={`personal-${personalDetailsSubscriber.id}`}
                    subscriber={personalDetailsSubscriber}
                    onClose={() => setPersonalDetailsSubscriber(null)}
                />
            )}

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
                statement={statementWindow.statement?.subscriber.id === viewingSubscriberId ? statementWindow.statement : null}
                statementLoading={Boolean(statementWindow.subscriber && !statementWindow.statement)}
                onLoadStatement={() => openStatement(viewingSubscriber)}
                onPrevious={viewingIndex > 0 ? () => switchProfile(-1) : undefined}
                onNext={viewingIndex >= 0 && viewingIndex < subscribers.data.length - 1 ? () => switchProfile(1) : undefined}
                onClose={closeProfile}
                onEditPersonal={() => {
                    setPersonalDetailsSubscriber(viewingSubscriber);
                    closeProfile();
                }}
                onOpenReadings={() => {
                    setHistorySubscriberId(viewingSubscriberId);
                    closeProfile();
                }}
                onSendMessage={can?.sendMessages ? () => router.visit(`/messages/create?${new URLSearchParams({ kind: 'custom', status: '', 'subscriber_ids[]': viewingSubscriberId })}`) : undefined}
                onEdit={() => {
                    setModalSubscriber(viewingSubscriber);
                    closeProfile();
                }}
                onOpenStatement={(form = null) => {
                    // The statement takes the details' place rather than opening over them.
                    setViewingSubscriberId(null);
                    openStatement(viewingSubscriber, form);
                }}
            />

            <ReadingHistoryModal
                key={`history-${historySubscriber?.id ?? 'closed'}`}
                subscriber={historySubscriber}
                readingWeekOptions={readingWeekOptions}
                onClose={() => setHistorySubscriberId(null)}
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
            {statementWindow.subscriber && !viewingSubscriber && (
                <StatementModal
                    key={`statement-${statementWindow.subscriber.id}`}
                    subscriber={statementWindow.subscriber}
                    statement={statementWindow.statement}
                    initialForm={statementWindow.form}
                    onSwitch={(header) => statementWindow.open(header)}
                    onClose={statementWindow.close}
                />
            )}

            {deleteDialog}
        </AuthenticatedLayout>
    );
}
