import { useEffect, useRef, useState } from 'react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import AddButton from '@/Components/AddButton';
import Icon from '@/Components/Icon';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import StatusPill from '@/Components/DataTable/StatusPill';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import { describeBalance } from '@/lib/accountStatement';
import { downloadCsv } from '@/lib/csv';
import { rowClickProps } from '@/lib/rowClick';
import { SUBSCRIBER_STATUS_TONES } from '@/lib/subscriberStatus';
import MeterReadingModal from '@/Pages/MeterReadings/MeterReadingModal';
import SubscriberModal from './SubscriberModal';
import SubscriberPreviewPanel from './SubscriberPreviewPanel';
import PaymentModal from './PaymentModal';

/** The picked subscribers as spreadsheet rows, header first. */
function exportRows(subscribers) {
    return [
        [
            'رقم المشترك',
            'الاسم',
            'رقم الجوال',
            'رقم الهوية',
            'الطبلون',
            'نوع الاشتراك',
            'تصنيف الزبائن',
            'الفرع',
            'الحالة',
            'الرصيد (شيكل)',
            'حالة الرصيد',
            'آخر قراءة',
            'آخر دفعة',
        ],
        ...subscribers.map((subscriber) => {
            const balance = describeBalance(subscriber.outstandingBalance ?? 0);

            return [
                subscriber.account_number,
                subscriber.full_name,
                subscriber.phone,
                subscriber.national_id,
                subscriber.meterBoxNumber,
                subscriber.tariffCategoryLabel,
                subscriber.tariffSegmentName,
                subscriber.branchName,
                subscriber.statusLabel,
                balance.amount,
                balance.label,
                subscriber.lastReading,
                subscriber.lastPaymentAt,
            ];
        }),
    ];
}

/** The header checkbox: ticks every row on the page, and shows a dash when only some are ticked. */
function SelectAllCheckbox({ checked, indeterminate, onChange }) {
    const ref = useRef(null);

    useEffect(() => {
        if (ref.current) {
            ref.current.indeterminate = indeterminate;
        }
    }, [indeterminate]);

    return (
        <input
            ref={ref}
            type="checkbox"
            checked={checked}
            onChange={onChange}
            aria-label="تحديد كل المشتركين في هذه الصفحة"
            className="h-[18px] w-[18px]"
        />
    );
}

/**
 * The bar that appears under the table once rows are ticked: how many,
 * and what can be done to all of them at once.
 */
function BulkActionsBar({ count, onExport, onClear }) {
    if (count === 0) {
        return null;
    }

    return (
        <div
            role="region"
            aria-label="إجراءات جماعية"
            className="animate-sheet fixed inset-x-0 bottom-5 z-30 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-1.5 rounded-2xl bg-graphite-900 p-1.5 text-white shadow-2xl ring-1 ring-white/10 dark:bg-gray-900 dark:text-graphite-900 dark:ring-black/10 print:hidden"
        >
            <span className="flex items-center gap-2 px-3 text-sm font-bold" aria-live="polite">
                <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-lg bg-white px-1.5 font-display text-xs text-graphite-900 dark:bg-graphite-900 dark:text-white">
                    {count}
                </span>
                محددين
            </span>
            <span className="h-6 w-px bg-white/15 dark:bg-graphite-900/15" aria-hidden="true" />
            <button
                type="button"
                onClick={onExport}
                className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition hover:bg-white/10 dark:hover:bg-graphite-900/10"
            >
                <Icon name="table" className="h-[18px] w-[18px]" />
                تصدير Excel
            </button>
            <button
                type="button"
                onClick={onClear}
                aria-label="إلغاء التحديد"
                title="إلغاء التحديد"
                className="flex h-9 w-9 items-center justify-center rounded-xl transition hover:bg-white/10 dark:hover:bg-graphite-900/10"
            >
                <Icon name="close" className="h-[18px] w-[18px]" />
            </button>
        </div>
    );
}

export default function Index({
    subscribers,
    canCreate,
    canRecordReadings,
    currencies,
    paymentMethods,
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
    const [creating, setCreating] = useState(false);
    // The subscriber open in the quick preview, and which of its tabs.
    const [preview, setPreview] = useState(null);
    const [readingFor, setReadingFor] = useState(null);
    const [paymentFor, setPaymentFor] = useState(null);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/subscribers', filters);

    const rows = subscribers.data;
    // Looked up from the current page props (not kept as a copy) so the
    // preview refreshes after a reading or payment is saved from it.
    const previewIndex = preview ? rows.findIndex((subscriber) => subscriber.id === preview.id) : -1;
    const previewSubscriber = rows[previewIndex] ?? null;
    const selectedRows = rows.filter((subscriber) => selectedIds.has(subscriber.id));

    // A different set of rows (another page, search or filter) starts with nothing ticked.
    const rowIds = rows.map((subscriber) => subscriber.id).join(',');

    useEffect(() => {
        setSelectedIds(new Set());
    }, [rowIds]);

    function toggleSelected(id) {
        setSelectedIds((current) => {
            const next = new Set(current);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function toggleAll() {
        setSelectedIds(selectedRows.length === rows.length ? new Set() : new Set(rows.map((subscriber) => subscriber.id)));
    }

    function openPreview(subscriber, tab = 'activity') {
        setPreview({ id: subscriber.id, tab });
    }

    function editSubscriber(subscriber) {
        setPreview(null);
        setModalSubscriber(subscriber);
    }

    /** Whether this week's reading is already in, so there is nothing left to enter. */
    function currentWeekRecorded(subscriber) {
        const lastReading = subscriber.meterReadings?.[0];

        return Boolean(lastReading && lastReading.weekStart === readingWeekOptions[0]?.value);
    }

    /** The "More" menu of a row (and of the quick preview). Actions the user may not use stay in the list, locked. */
    function subscriberMenu(subscriber) {
        const readingLock = !canRecordReadings
            ? {}
            : subscriber.status !== 'active'
              ? { disabledLabel: 'غير نشط', disabledReason: 'تُدخل القراءات للمشتركين النشطين فقط.' }
              : currentWeekRecorded(subscriber) && readingWeekOptions.length === 1
                ? { disabledLabel: 'مُدخلة', disabledReason: 'قراءة هذا الأسبوع مُدخلة بالفعل؛ عدّلها من صفحة القراءات.' }
                : null;

        return [
            {
                title: 'القراءات والاستهلاك',
                items: [
                    {
                        key: 'readings',
                        label: 'عرض القراءات',
                        icon: 'gauge',
                        shortcut: 'V',
                        onSelect: () => openPreview(subscriber, 'readings'),
                    },
                    {
                        key: 'new-reading',
                        label: 'إدخال قراءة',
                        icon: 'plus-circle',
                        shortcut: 'R',
                        disabled: readingLock !== null,
                        ...readingLock,
                        onSelect: () => setReadingFor(subscriber),
                    },
                ],
            },
            {
                title: 'الحساب والدفعات',
                items: [
                    {
                        key: 'statement',
                        label: 'كشف الحساب',
                        icon: 'ledger',
                        keywords: ['طباعة', 'تصدير'],
                        children: [
                            {
                                key: 'statement-open',
                                label: 'عرض الكشف',
                                icon: 'eye',
                                shortcut: 'A',
                                href: `/subscribers/${subscriber.id}/statement`,
                            },
                            {
                                key: 'statement-pdf',
                                label: 'طباعة / PDF',
                                hint: 'PDF',
                                icon: 'printer',
                                shortcut: 'P',
                                href: `/subscribers/${subscriber.id}/statement?print=1`,
                            },
                            {
                                key: 'statement-excel',
                                label: 'ملف Excel',
                                hint: 'Excel',
                                icon: 'table',
                                shortcut: 'E',
                                href: `/subscribers/${subscriber.id}/statement/export`,
                                download: true,
                            },
                        ],
                    },
                    {
                        key: 'payment',
                        label: 'تسجيل دفعة',
                        icon: 'cash',
                        shortcut: 'C',
                        disabled: !subscriber.canRecordPayment,
                        onSelect: () => setPaymentFor(subscriber),
                    },
                ],
            },
        ];
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
                            <th className="data-table-select">
                                {rows.length > 0 && (
                                    <SelectAllCheckbox
                                        checked={selectedRows.length === rows.length}
                                        indeterminate={selectedRows.length > 0 && selectedRows.length < rows.length}
                                        onChange={toggleAll}
                                    />
                                )}
                            </th>
                            <SortableTh column="account_number" label="رقم المشترك" sortState={filters} onSort={sort} />
                            <SortableTh column="full_name" label="الاسم الكامل" sortState={filters} onSort={sort} />
                            <th>الطبلون</th>
                            <th>نوع الاشتراك</th>
                            <th>الفرع</th>
                            <SortableTh column="status" label="الحالة" sortState={filters} onSort={sort} />
                            <th>
                                <span className="sr-only">الإجراءات</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td className="text-gray-500" colSpan={8}>
                                    لا توجد نتائج مطابقة.
                                </td>
                            </tr>
                        ) : (
                            rows.map((subscriber) => {
                                const selected = selectedIds.has(subscriber.id);

                                return (
                                    <tr
                                        key={subscriber.id}
                                        className={selected || subscriber.id === previewSubscriber?.id ? 'bg-brand-50' : undefined}
                                        {...rowClickProps(() => openPreview(subscriber))}
                                    >
                                        <td className="data-table-select">
                                            <label className="flex h-full cursor-pointer items-center justify-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleSelected(subscriber.id)}
                                                    aria-label={`تحديد ${subscriber.full_name}`}
                                                    className="h-[18px] w-[18px]"
                                                />
                                            </label>
                                        </td>
                                        <td className="text-end text-gray-600" dir="ltr">
                                            {subscriber.account_number}
                                        </td>
                                        <td>
                                            <RowIdentity
                                                name={subscriber.full_name}
                                                subtitle={subscriber.phone}
                                                subtitleDir="ltr"
                                                status={SUBSCRIBER_STATUS_TONES[subscriber.status]}
                                            />
                                        </td>
                                        <td className="text-gray-600">
                                            {subscriber.meterBoxNumber ? <span className="data-chip">{subscriber.meterBoxNumber}</span> : '—'}
                                        </td>
                                        <td className="text-gray-600">
                                            {subscriber.tariffCategoryLabel}
                                            {subscriber.tariffSegmentName && (
                                                <div className="text-xs text-gray-500">{subscriber.tariffSegmentName}</div>
                                            )}
                                        </td>
                                        <td className="text-gray-600">{subscriber.branchName}</td>
                                        <td>
                                            <StatusPill tone={SUBSCRIBER_STATUS_TONES[subscriber.status]} label={subscriber.statusLabel} />
                                        </td>
                                        <td className="text-end">
                                            <RowActionsMenu
                                                menu={subscriberMenu(subscriber)}
                                                menuHeader={{ name: subscriber.full_name, subtitle: subscriber.phone }}
                                                menuKey="subscribers"
                                            >
                                                <button onClick={() => openPreview(subscriber)}>عرض</button>
                                                {subscriber.canUpdate && <button onClick={() => editSubscriber(subscriber)}>تعديل</button>}
                                            </RowActionsMenu>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={subscribers} filters={filters} baseUrl="/subscribers" />

            <BulkActionsBar
                count={selectedRows.length}
                onExport={() => downloadCsv(`subscribers-${new Date().toISOString().slice(0, 10)}.csv`, exportRows(selectedRows))}
                onClear={() => setSelectedIds(new Set())}
            />

            {previewSubscriber && (
                <SubscriberPreviewPanel
                    subscriber={previewSubscriber}
                    tab={preview.tab}
                    onClose={() => setPreview(null)}
                    onPrevious={previewIndex > 0 ? () => openPreview(rows[previewIndex - 1]) : null}
                    onNext={previewIndex < rows.length - 1 ? () => openPreview(rows[previewIndex + 1]) : null}
                    onEdit={previewSubscriber.canUpdate ? () => editSubscriber(previewSubscriber) : null}
                    menu={subscriberMenu(previewSubscriber)}
                />
            )}

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

            {readingFor && (
                <MeterReadingModal
                    key={readingFor.id}
                    show
                    onClose={() => setReadingFor(null)}
                    reading={null}
                    fixedSubscriber={{
                        value: String(readingFor.id),
                        label: `${readingFor.account_number} — ${readingFor.full_name}`,
                        lastReading: readingFor.lastReading,
                        lastWeekStart: readingFor.lastReadingWeekStart,
                    }}
                    weekOptions={readingWeekOptions}
                />
            )}

            {paymentFor && (
                <PaymentModal
                    key={paymentFor.id}
                    show
                    onClose={() => setPaymentFor(null)}
                    subscriber={{ id: paymentFor.id, fullName: paymentFor.full_name }}
                    balance={paymentFor.outstandingBalance ?? 0}
                    currencies={currencies}
                    paymentMethods={paymentMethods}
                />
            )}
        </AuthenticatedLayout>
    );
}
