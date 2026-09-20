import { useState } from 'react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import SortableTh from '@/Components/DataTable/SortableTh';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import BranchModal from './BranchModal';

export default function Index({ branches, status, filters, governorates }) {
    const [modalBranch, setModalBranch] = useState(null);
    const [creating, setCreating] = useState(false);
    const { search, setSearch, sort, setPerPage } = useDataTable('/branches', filters);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">الفروع</h2>
                    </div>
                    <div className="shrink-0">
                        <button
                            onClick={() => setCreating(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            فرع جديد
                        </button>
                    </div>
                </>
            }
        >
            <Head title="الفروع" />

            {status === 'branch-created' && (
                <div className="mb-4 text-sm font-medium text-green-600">تم إنشاء الفرع.</div>
            )}
            {status === 'branch-updated' && (
                <div className="mb-4 text-sm font-medium text-green-600">تم تحديث الفرع.</div>
            )}

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو الموقع أو الهاتف..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={branches.total}
            />

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <table className="w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <SortableTh column="name" label="الاسم" sortState={filters} onSort={sort} />
                            <SortableTh column="location" label="الموقع" sortState={filters} onSort={sort} />
                            <SortableTh column="phone" label="الهاتف" sortState={filters} onSort={sort} />
                            <th className="px-6 py-3">المحافظة</th>
                            <SortableTh column="is_active" label="الحالة" sortState={filters} onSort={sort} />
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {branches.data.length === 0 ? (
                            <tr>
                                <td className="px-6 py-4 text-gray-500" colSpan={6}>
                                    لا توجد نتائج مطابقة.
                                </td>
                            </tr>
                        ) : (
                            branches.data.map((branch) => (
                                <tr key={branch.id} className="transition hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{branch.name}</td>
                                    <td className="px-6 py-4 text-gray-600">{branch.location}</td>
                                    <td className="px-6 py-4 text-gray-600">{branch.phone}</td>
                                    <td className="px-6 py-4 text-gray-600">{branch.governorate?.name ?? '—'}</td>
                                    <td className="px-6 py-4">
                                        {branch.is_active ? (
                                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                                نشط
                                            </span>
                                        ) : (
                                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                                                متوقف
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-end">
                                        <button onClick={() => setModalBranch(branch)} className="font-medium text-brand-600 hover:underline">
                                            تعديل
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={branches} filters={filters} baseUrl="/branches" />

            <BranchModal show={creating} onClose={() => setCreating(false)} branch={null} governorates={governorates} />

            {/* Keyed by branch id so switching who's being edited remounts
                the form with fresh initial values — useForm() only captures
                its initial data once, it won't pick up a changed `branch`
                prop on an already-mounted instance. */}
            {modalBranch && (
                <BranchModal
                    key={modalBranch.id}
                    show
                    onClose={() => setModalBranch(null)}
                    branch={modalBranch}
                    governorates={governorates}
                />
            )}
        </AuthenticatedLayout>
    );
}
