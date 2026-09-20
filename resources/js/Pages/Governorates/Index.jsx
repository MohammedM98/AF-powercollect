import { useState } from 'react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import SortableTh from '@/Components/DataTable/SortableTh';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import GovernorateModal from './GovernorateModal';

export default function Index({ governorates, status, filters, areas }) {
    const [modalGovernorate, setModalGovernorate] = useState(null);
    const [creating, setCreating] = useState(false);
    const { search, setSearch, sort, setPerPage } = useDataTable('/governorates', filters);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">المحافظات</h2>
                    </div>
                    <div className="shrink-0">
                        <button
                            onClick={() => setCreating(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            محافظة جديدة
                        </button>
                    </div>
                </>
            }
        >
            <Head title="المحافظات" />

            {status === 'governorate-created' && <div className="mb-4 text-sm font-medium text-green-600">تم إنشاء المحافظة.</div>}
            {status === 'governorate-updated' && <div className="mb-4 text-sm font-medium text-green-600">تم تحديث المحافظة.</div>}

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={governorates.total}
            />

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <table className="w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <SortableTh column="name" label="الاسم" sortState={filters} onSort={sort} />
                            <th className="px-6 py-3">عدد المناطق</th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {governorates.data.length === 0 ? (
                            <tr>
                                <td className="px-6 py-4 text-gray-500" colSpan={3}>
                                    لا توجد نتائج مطابقة.
                                </td>
                            </tr>
                        ) : (
                            governorates.data.map((governorate) => (
                                <tr key={governorate.id} className="transition hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{governorate.name}</td>
                                    <td className="px-6 py-4 text-gray-600">{governorate.areasCount}</td>
                                    <td className="px-6 py-4 text-end">
                                        <button
                                            onClick={() => setModalGovernorate(governorate)}
                                            className="font-medium text-brand-600 hover:underline"
                                        >
                                            تعديل
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={governorates} filters={filters} baseUrl="/governorates" />

            <GovernorateModal show={creating} onClose={() => setCreating(false)} governorate={null} areas={areas} />

            {/* Keyed by governorate id so switching who's being edited
                remounts the form with fresh initial values — useForm() only
                captures its initial data once, it won't pick up a changed
                `governorate` prop on an already-mounted instance. */}
            {modalGovernorate && (
                <GovernorateModal
                    key={modalGovernorate.id}
                    show
                    onClose={() => setModalGovernorate(null)}
                    governorate={modalGovernorate}
                    areas={areas}
                />
            )}
        </AuthenticatedLayout>
    );
}
