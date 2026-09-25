import { useState } from 'react';
import { Head } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import StatusPill from '@/Components/DataTable/StatusPill';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import BranchModal from './BranchModal';
import AddButton from '@/Components/AddButton';

export default function Index({ branches, filters, filterOptions, governorates, areas }) {
    const [modalBranch, setModalBranch] = useState(null);
    const [creating, setCreating] = useState(false);
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/branches', filters);

    return (
        <SettingsLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">الفروع</h2>
                    </div>
                    <div className="shrink-0">
                        <AddButton onClick={() => setCreating(true)}>فرع جديد</AddButton>
                    </div>
                </>
            }
        >
            <Head title="الفروع" />

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو الهاتف..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={branches.total}
                filterMenu={
                    <DataTableFilterMenu
                        tableKey="branches"
                        groups={filterOptions}
                        values={filterValues}
                        onChange={setFilter}
                        onClear={clearFilters}
                    />
                }
            />

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <SortableTh column="name" label="الاسم" sortState={filters} onSort={sort} />
                            <SortableTh column="phone" label="الهاتف" sortState={filters} onSort={sort} />
                            <th className="px-6 py-3">المحافظة</th>
                            <th className="px-6 py-3">المنطقة</th>
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
                                    <td className="px-6 py-4 text-gray-600">{branch.phone}</td>
                                    <td className="px-6 py-4 text-gray-600">{branch.governorate?.name ?? '—'}</td>
                                    <td className="px-6 py-4 text-gray-600">{branch.area?.name ?? '—'}</td>
                                    <td className="px-6 py-4">
                                        <StatusPill tone={branch.is_active ? 'green' : 'gray'} label={branch.is_active ? 'نشط' : 'متوقف'} />
                                    </td>
                                    <td className="px-6 py-4 text-end">
                                        <RowActionsMenu>
                                            <button
                                                onClick={() => setModalBranch(branch)}
                                                className="block w-full px-4 py-2 text-start text-sm text-gray-700 hover:bg-gray-50"
                                            >
                                                تعديل
                                            </button>
                                        </RowActionsMenu>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={branches} filters={filters} baseUrl="/branches" />

            <BranchModal show={creating} onClose={() => setCreating(false)} branch={null} governorates={governorates} areas={areas} />

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
                    areas={areas}
                />
            )}
        </SettingsLayout>
    );
}
