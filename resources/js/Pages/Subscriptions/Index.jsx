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
import SubscriptionModal from './SubscriptionModal';
import PersonalDetailsModal from './PersonalDetailsModal';
import BulkActionBar from './BulkActionBar';
import BulkChangeModal from './BulkChangeModal';
import PhoneQuickEdit from './PhoneQuickEdit';
import Icon from '@/Components/Icon';
import SubscriptionDetailsModal from './SubscriptionDetailsModal';
import ReadingHistoryModal from './ReadingHistoryModal';
import StatementModal from './StatementModal';

const STATUS_TONES = {
    active: 'green',
    suspended: 'amber',
    disconnected: 'gray',
};

/** A row of the list in the shape the statement window's header reads. */
function statementHeader(subscription) {
    return {
        id: subscription.id,
        fullName: subscription.display_name,
        accountNumber: subscription.account_number,
        subscriberNumber: subscription.subscriber_number,
        status: subscription.status,
        statusLabel: subscription.statusLabel,
        branchName: subscription.branchName,
        tariffCategoryLabel: subscription.tariffCategoryLabel,
        tariffSegmentName: subscription.tariffSegmentName,
        meterBoxNumber: subscription.meterBoxNumber,
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
    subscriptions,
    canCreate,
    canRecordReadings,
    branches,
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
    const [modalSubscription, setModalSubscription] = useState(null);
    const [viewingSubscriptionId, setViewingSubscriptionId] = useState(null);
    // Looked up from the current page props (not kept as a copy) so the
    // statement refreshes after a reading is saved from inside it.
    const viewingSubscription = subscriptions.data.find((subscription) => subscription.id === viewingSubscriptionId) ?? null;
    const [creating, setCreating] = useState(false);
    const [subscriptionSource, setSubscriptionSource] = useState(null);
    const [personalDetailsSubscription, setPersonalDetailsSubscription] = useState(null);
    const [readingSubscription, setReadingSubscription] = useState(null);
    const [historySubscriptionId, setHistorySubscriptionId] = useState(null);
    const historySubscription = subscriptions.data.find((subscription) => subscription.id === historySubscriptionId) ?? null;
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, setFilters, clearFilters } = useDataTable('/subscriptions', filters);
    const rowClick = useRowClick();
    // Subscriptions ticked for a bulk action (kept across pages), or every match of the filters.
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [allMatching, setAllMatching] = useState(false);
    const [bulkField, setBulkField] = useState(null);
    const pageIds = subscriptions.data.map((subscription) => subscription.id);
    const pageSelectedCount = pageIds.filter((id) => selectedIds.has(id)).length;
    const selectionCount = allMatching ? subscriptions.total : selectedIds.size;
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

    function toggleSubscription(id) {
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
    const viewingIndex = subscriptions.data.findIndex((subscription) => subscription.id === viewingSubscriptionId);

    function closeProfile() {
        setViewingSubscriptionId(null);
        if (statementWindow.subscription) {
            statementWindow.close();
        }
    }

    function switchProfile(offset) {
        if (statementWindow.subscription) {
            statementWindow.close();
        }
        setViewingSubscriptionId(subscriptions.data[viewingIndex + offset].id);
    }

    /** Show a subscription's financial history; `form` also opens its payment, charge or discount form. */
    function openStatement(subscription, form = null) {
        statementWindow.open(statementHeader(subscription), form);
    }

    /** The row's "more" menu: the subscription's details, the account's forms, entering this week's reading and the past readings. */
    function rowMenu(subscription) {
        const readingItem = { label: 'إدخال قراءة', icon: 'gauge', tone: 'teal', shortcut: 'R', onSelect: () => setReadingSubscription(subscription) };

        if (!canRecordReadings) {
            readingItem.lockedReason = needsPermission('تسجيل القراءات');
        } else if (subscription.status !== 'active') {
            Object.assign(readingItem, { disabled: true, hint: 'المشترك غير نشط' });
        } else if (hasLatestWeekReading(subscription, readingWeekOptions)) {
            Object.assign(readingItem, { disabled: true, hint: 'مُدخلة هذا الأسبوع' });
        }

        return {
            title: subscription.display_name,
            subtitle: subscription.contact_phone,
            groups: [
                {
                    label: 'المشترك',
                    items: [
                        { label: 'بيانات المشترك', icon: 'user', tone: 'graphite', shortcut: 'I', onSelect: () => setViewingSubscriptionId(subscription.id) },
                        {
                            label: 'تعديل البيانات الشخصية',
                            icon: 'pencil',
                            tone: 'blue',
                            shortcut: 'E',
                            onSelect: () => setPersonalDetailsSubscription(subscription),
                            lockedReason: subscription.canUpdate ? null : needsPermission('تعديل المشتركين'),
                        },
                        ...(canCreate ? [{ label: 'إضافة اشتراك', icon: 'document-plus', tone: 'indigo', onSelect: () => setSubscriptionSource(subscription) }] : []),
                        {
                            label: 'إرسال رسالة',
                            icon: 'send',
                            tone: 'sky',
                            onSelect: () => router.visit(`/messages/create?${new URLSearchParams({ kind: 'custom', status: '', 'subscription_ids[]': subscription.id })}`),
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
                            onSelect: () => openStatement(subscription, 'payment'),
                            lockedReason: subscription.canRecordPayment ? null : needsPermission('تسجيل التحصيلات'),
                        },
                        {
                            label: 'تحميل حركة',
                            icon: 'document-plus',
                            tone: 'amber',
                            onSelect: () => openStatement(subscription, 'charge'),
                            lockedReason: subscription.canAdjustBalance ? null : needsPermission('إضافة تحميل وخصم'),
                        },
                        {
                            label: 'إضافة خصم',
                            icon: 'discount',
                            tone: 'violet',
                            onSelect: () => openStatement(subscription, 'discount'),
                            lockedReason: subscription.canAdjustBalance ? null : needsPermission('إضافة تحميل وخصم'),
                        },
                        {
                            label: 'مقاصة',
                            icon: 'scale',
                            tone: 'teal',
                            onSelect: () => openStatement(subscription, 'clearing'),
                            lockedReason: subscription.canAdjustBalance ? null : needsPermission('إضافة تحميل وخصم'),
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
                            hint: subscription.meterReadings.length ? `${subscription.meterReadings.length} قراءة` : 'لا توجد بعد',
                            onSelect: () => setHistorySubscriptionId(subscription.id),
                        },
                    ],
                },
            ],
        };
    }

    const modalProps = {
        branches,
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
                            href="/subscriptions/bulk-changes"
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
                total={subscriptions.total}
                filterMenu={
                    <DataTableFilterMenu
                        tableKey="subscriptions"
                        groups={filterOptions}
                        values={filterValues}
                        onChange={setFilter}
                        onChangeMany={setFilters}
                        onClear={clearFilters}
                    />
                }
            />

            {canSelect && !allMatching && pageIds.length > 0 && pageSelectedCount === pageIds.length && subscriptions.total > pageIds.length && (
                <div role="status" className="flex flex-wrap items-center justify-center gap-2 border-x border-gray-100 bg-brand-500/5 px-4 py-2.5 text-sm text-gray-700">
                    تم تحديد {pageIds.length.toLocaleString('en')} مشترك في هذه الصفحة.
                    <button
                        type="button"
                        onClick={() => setAllMatching(true)}
                        className="rounded font-semibold text-brand-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                    >
                        تحديد كل النتائج المطابقة ({subscriptions.total.toLocaleString('en')})
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
                        {subscriptions.data.length === 0 ? (
                            <tr>
                                <td className="text-gray-500" colSpan={canSelect ? 10 : 9}>
                                    لا توجد نتائج مطابقة.
                                </td>
                            </tr>
                        ) : (
                            subscriptions.data.map((subscription) => (
                                <tr
                                    key={subscription.id}
                                    {...rowClick(() => openStatement(subscription))}
                                    {...printRowProps(Object.fromEntries(PRINT_FIELDS.map((field) => [field.key, subscription[field.key]])))}
                                    className={allMatching || selectedIds.has(subscription.id) ? 'bg-brand-50' : undefined}
                                >
                                    {canSelect && (
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={allMatching || selectedIds.has(subscription.id)}
                                                onChange={() => toggleSubscription(subscription.id)}
                                                aria-label={`تحديد ${subscription.display_name}`}
                                                className="rounded border-gray-300 text-brand-600"
                                            />
                                        </td>
                                    )}
                                    <td className="text-gray-600">
                                        <span dir="ltr">{subscription.account_number}</span>
                                        {subscription.subscriber_number && (
                                            <span className="mt-1 block text-xs text-gray-400">
                                                رقم المشترك <bdi dir="ltr">{subscription.subscriber_number}</bdi>
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <RowIdentity
                                            name={subscription.display_name}
                                            subtitle={<PhoneQuickEdit subscription={subscription} />}
                                            status={STATUS_TONES[subscription.status]}
                                        />
                                        {subscription.subscriptionCount > 1 && (
                                            <span className="mt-1 block text-xs text-gray-500">{subscription.subscriptionCount} اشتراكات</span>
                                        )}
                                    </td>
                                    <td className="text-gray-600">
                                        {subscription.meterBoxNumber ? <span className="data-chip">{subscription.meterBoxNumber}</span> : '—'}
                                    </td>
                                    <td className="text-gray-600">
                                        {subscription.tariffCategoryLabel}
                                        {subscription.tariffSegmentName && <div className="text-xs text-gray-400">{subscription.tariffSegmentName}</div>}
                                    </td>
                                    <td className="text-gray-600">{subscription.subAreaName || '—'}</td>
                                    <td className="whitespace-nowrap text-gray-600">{formatCurrency(subscription.weeklyMinimumPayment)}</td>
                                    <td className={`whitespace-nowrap font-semibold ${Number(subscription.outstandingBalance) > 0 ? 'text-red-600' : Number(subscription.outstandingBalance) < 0 ? 'text-emerald-600' : 'text-gray-600'}`}>
                                        {formatCurrency(subscription.outstandingBalance)}
                                    </td>
                                    <td>
                                        <StatusPill tone={STATUS_TONES[subscription.status]} label={subscription.statusLabel} />
                                    </td>
                                    <td className="text-end">
                                        <RowActionsMenu
                                            onView={() => openStatement(subscription)}
                                            onEdit={subscription.canUpdate ? () => setModalSubscription(subscription) : undefined}
                                            onDelete={
                                                subscription.canDelete
                                                    ? () => requestDelete(`/subscriptions/${subscription.id}`, subscription.display_name)
                                                    : undefined
                                            }
                                            menu={rowMenu(subscription)}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={subscriptions} filters={filters} baseUrl="/subscriptions" />

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

            <SubscriptionModal show={creating} onClose={() => setCreating(false)} subscription={null} {...modalProps} />

            {subscriptionSource && (
                <SubscriptionModal
                    key={`subscription-${subscriptionSource.id}`}
                    show
                    onClose={() => setSubscriptionSource(null)}
                    subscription={null}
                    sourceSubscription={subscriptionSource}
                    {...modalProps}
                />
            )}

            {personalDetailsSubscription && (
                <PersonalDetailsModal
                    key={`personal-${personalDetailsSubscription.id}`}
                    subscription={personalDetailsSubscription}
                    onClose={() => setPersonalDetailsSubscription(null)}
                />
            )}

            {/* Keyed by subscription id so switching who's being edited remounts
                the form with fresh initial values — useForm() only captures
                its initial data once, it won't pick up a changed `subscription`
                prop on an already-mounted instance. Each window's key has its
                own prefix: siblings sharing a key (the same subscription open in
                two windows) make React duplicate them. */}
            {modalSubscription && (
                <SubscriptionModal
                    key={`edit-${modalSubscription.id}`}
                    show
                    onClose={() => setModalSubscription(null)}
                    subscription={modalSubscription}
                    {...modalProps}
                />
            )}

            <SubscriptionDetailsModal
                key={`details-${viewingSubscription?.id ?? 'closed'}`}
                subscription={viewingSubscription}
                canUpdate={viewingSubscription?.canUpdate}
                readingWeekOptions={readingWeekOptions}
                statement={statementWindow.statement?.subscription.id === viewingSubscriptionId ? statementWindow.statement : null}
                statementLoading={Boolean(statementWindow.subscription && !statementWindow.statement)}
                onLoadStatement={() => openStatement(viewingSubscription)}
                onPrevious={viewingIndex > 0 ? () => switchProfile(-1) : undefined}
                onNext={viewingIndex >= 0 && viewingIndex < subscriptions.data.length - 1 ? () => switchProfile(1) : undefined}
                onClose={closeProfile}
                onEditPersonal={() => {
                    setPersonalDetailsSubscription(viewingSubscription);
                    closeProfile();
                }}
                onOpenReadings={() => {
                    setHistorySubscriptionId(viewingSubscriptionId);
                    closeProfile();
                }}
                onSendMessage={can?.sendMessages ? () => router.visit(`/messages/create?${new URLSearchParams({ kind: 'custom', status: '', 'subscription_ids[]': viewingSubscriptionId })}`) : undefined}
                onEdit={() => {
                    setModalSubscription(viewingSubscription);
                    closeProfile();
                }}
                onOpenStatement={(form = null) => {
                    // The statement takes the details' place rather than opening over them.
                    setViewingSubscriptionId(null);
                    openStatement(viewingSubscription, form);
                }}
            />

            <ReadingHistoryModal
                key={`history-${historySubscription?.id ?? 'closed'}`}
                subscription={historySubscription}
                readingWeekOptions={readingWeekOptions}
                onClose={() => setHistorySubscriptionId(null)}
            />

            {readingSubscription && (
                <MeterReadingModal
                    show
                    onClose={() => setReadingSubscription(null)}
                    reading={null}
                    fixedSubscription={readingOptionFor(readingSubscription)}
                    weekOptions={readingWeekOptions}
                />
            )}

            {/* Keyed by subscription so each statement opens with its own filters and forms. */}
            {statementWindow.subscription && !viewingSubscription && (
                <StatementModal
                    key={`statement-${statementWindow.subscription.id}`}
                    subscription={statementWindow.subscription}
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
