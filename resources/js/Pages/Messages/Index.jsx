import { Head, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import AddButton from '@/Components/AddButton';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import Pagination from '@/Components/DataTable/Pagination';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import { useDataTable } from '@/hooks/useDataTable';
import { useRowClick } from '@/hooks/useRowClick';
import Icon from '@/Components/Icon';
import { timeAgo } from '@/lib/format';
import { openQuickMessage } from '@/lib/quickMessage';
import { ChannelLabel, DeliveryCounts, KindPill, MessageText } from './MessageParts';

/**
 * Every send of messages to subscriptions, newest first; a send opens to
 * its messages one by one.
 */
export default function Index({ batches, canSend, filters, filterOptions }) {
    const rowClick = useRowClick();

    function openBatch(batch) {
        router.visit(`/messages/${batch.id}`);
    }
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, setFilters, clearFilters } = useDataTable('/messages', filters);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-3xl font-bold text-gray-900">الرسائل</h2>
                        <p className="mt-1 text-sm text-gray-500">القراءات الأسبوعية وتذكير الدفع والإعلانات للمشتركين.</p>
                    </div>
                    {canSend && (
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => openQuickMessage()}
                                aria-keyshortcuts="M"
                                className="inline-flex items-center gap-2 rounded-control border border-gray-200 bg-surface px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:border-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                            >
                                <Icon name="send" className="h-4 w-4" />
                                رسالة سريعة
                            </button>
                            <AddButton href="/messages/create">رسالة جديدة</AddButton>
                        </div>
                    )}
                </>
            }
        >
            <Head title="الرسائل" />

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث في نص الرسالة..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={batches.total}
                filterMenu={
                    <DataTableFilterMenu
                        tableKey="messages"
                        groups={filterOptions}
                        values={filterValues}
                        onChange={setFilter}
                        onChangeMany={setFilters}
                        onClear={clearFilters}
                    />
                }
            />

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start">
                    <thead>
                        <tr>
                            <SortableTh column="created_at" label="الوقت" sortState={filters} onSort={sort} />
                            <th>النوع</th>
                            <th>الرسالة</th>
                            <th>طريقة الإرسال</th>
                            <th>الفرع</th>
                            <th>الحالة</th>
                            <th>أرسلها</th>
                            <ActionsTh />
                        </tr>
                    </thead>
                    <tbody>
                        {batches.data.length === 0 ? (
                            <tr>
                                <td className="text-gray-500" colSpan={8}>
                                    لا توجد رسائل بعد.
                                </td>
                            </tr>
                        ) : (
                            batches.data.map((batch) => (
                                <tr key={batch.id} {...rowClick(() => openBatch(batch))}>
                                    <td className="text-gray-600" title={new Date(batch.createdAt).toLocaleString('ar-SY-u-nu-latn')}>
                                        {timeAgo(batch.createdAt)}
                                    </td>
                                    <td>
                                        <KindPill kind={batch.kind} label={batch.kindLabel} />
                                    </td>
                                    <td className="max-w-md !whitespace-normal text-gray-700">
                                        <MessageText text={batch.excerpt} />
                                    </td>
                                    <td>
                                        <ChannelLabel channel={batch.channel} label={batch.channelLabel} />
                                    </td>
                                    <td className="text-gray-600">{batch.branchName}</td>
                                    <td>
                                        <DeliveryCounts batch={batch} />
                                    </td>
                                    <td className="text-gray-600">{batch.createdBy ?? '—'}</td>
                                    <td className="text-end">
                                        <RowActionsMenu onView={() => openBatch(batch)} />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={batches} filters={filters} baseUrl="/messages" />
        </AuthenticatedLayout>
    );
}
