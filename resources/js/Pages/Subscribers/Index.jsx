import { useState } from 'react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import SortableTh from '@/Components/DataTable/SortableTh';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import SubscriberModal from './SubscriberModal';

const STATUS_STYLES = {
    active: 'bg-emerald-50 text-emerald-700',
    suspended: 'bg-amber-50 text-amber-700',
    disconnected: 'bg-gray-100 text-gray-500',
};

export default function Index({
    subscribers,
    canCreate,
    status,
    branches,
    meterBoxes,
    tariffs,
    areas,
    billingTypeOptions,
    canChooseBranch,
    filters,
}) {
    const [modalSubscriber, setModalSubscriber] = useState(null);
    const [creating, setCreating] = useState(false);
    const { search, setSearch, sort, setPerPage } = useDataTable('/subscribers', filters);

    const modalProps = { branches, meterBoxes, tariffs, areas, billingTypeOptions, canChooseBranch };

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

            {status === 'subscriber-created' && <div className="mb-4 text-sm font-medium text-green-600">تم إنشاء المشترك.</div>}
            {status === 'subscriber-updated' && <div className="mb-4 text-sm font-medium text-green-600">تم تحديث المشترك.</div>}

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو رقم الهاتف أو العداد أو العنوان..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={subscribers.total}
            />

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <table className="w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <SortableTh column="full_name" label="الاسم الكامل" sortState={filters} onSort={sort} />
                            <SortableTh column="meter_number" label="رقم العداد" sortState={filters} onSort={sort} />
                            <th className="px-6 py-3">صندوق العداد</th>
                            <th className="px-6 py-3">التعرفة</th>
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
                                    <td className="px-6 py-4 font-medium text-gray-900">{subscriber.full_name}</td>
                                    <td className="px-6 py-4 text-gray-600" dir="ltr">
                                        {subscriber.meter_number}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600" dir="ltr">
                                        {subscriber.meterBoxNumber ?? '—'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{subscriber.tariffCategoryLabel}</td>
                                    <td className="px-6 py-4 text-gray-600">{subscriber.branchName}</td>
                                    <td className="px-6 py-4">
                                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[subscriber.status]}`}>
                                            {subscriber.statusLabel}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-end">
                                        {subscriber.canUpdate && (
                                            <button
                                                onClick={() => setModalSubscriber(subscriber)}
                                                className="font-medium text-brand-600 hover:underline"
                                            >
                                                تعديل
                                            </button>
                                        )}
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
        </AuthenticatedLayout>
    );
}
