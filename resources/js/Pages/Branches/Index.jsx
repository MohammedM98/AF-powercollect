import { useState } from 'react';
import { Head } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import AddButton from '@/Components/AddButton';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import StatusPill from '@/Components/DataTable/StatusPill';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import BranchModal from './BranchModal';

export default function Index({ branches, canCreate, filters, filterOptions, governorates, areas }) {
    const [modalBranch, setModalBranch] = useState(null);
    const [creating, setCreating] = useState(false);
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/branches', filters);

    return (
        <SettingsLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-3xl font-bold text-gray-900">الفروع</h2>
                    </div>
                    {canCreate && (
                        <div className="shrink-0">
                            <AddButton onClick={() => setCreating(true)}>فرع جديد</AddButton>
                        </div>
                    )}
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
                    <thead>
                        <tr>
                            <SortableTh column="name" label="الاسم" sortState={filters} onSort={sort} />
                            <SortableTh column="phone" label="الهاتف" sortState={filters} onSort={sort} />
                            <th>المحافظة</th>
                            <th>المنطقة</th>
                            <SortableTh column="is_active" label="الحالة" sortState={filters} onSort={sort} />
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {branches.data.length === 0 ? (
                            <tr>
                                <td className="text-gray-500" colSpan={6}>
                                    لا توجد نتائج مطابقة.
                                </td>
                            </tr>
                        ) : (
                            branches.data.map((branch) => (
                                <tr key={branch.id}>
                                    <td>
                                        <RowIdentity
                                            icon="pin"
                                            name={branch.name}
                                            subtitle={branch.governorate?.name}
                                            status={branch.is_active ? 'green' : 'gray'}
                                        />
                                    </td>
                                    <td className="text-gray-600" dir="ltr">
                                        {branch.phone}
                                    </td>
                                    <td className="text-gray-600">{branch.governorate?.name ?? '—'}</td>
                                    <td className="text-gray-600">{branch.area?.name ?? '—'}</td>
                                    <td>
                                        <StatusPill tone={branch.is_active ? 'green' : 'gray'} label={branch.is_active ? 'نشط' : 'متوقف'} />
                                    </td>
                                    <td className="text-end">
                                        {branch.canUpdate && (
                                            <RowActionsMenu>
                                                <button onClick={() => setModalBranch(branch)}>تعديل</button>
                                            </RowActionsMenu>
                                        )}
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
