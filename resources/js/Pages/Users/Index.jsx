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
import UserModal from './UserModal';
import { rowClickProps } from '@/lib/rowClick';

export default function Index({ users, canCreate, branches, canChooseBranch, createRoleOptions, filters, filterOptions }) {
    const [modalUser, setModalUser] = useState(null);
    const [creating, setCreating] = useState(false);
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/users', filters);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-3xl font-bold text-gray-900">المستخدمون</h2>
                    </div>
                    {canCreate && (
                        <div className="shrink-0">
                            <AddButton onClick={() => setCreating(true)}>مستخدم جديد</AddButton>
                        </div>
                    )}
                </>
            }
        >
            <Head title="المستخدمون" />

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو اسم المستخدم..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={users.total}
                filterMenu={
                    <DataTableFilterMenu tableKey="users" groups={filterOptions} values={filterValues} onChange={setFilter} onClear={clearFilters} />
                }
            />

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start">
                    <thead>
                        <tr>
                            <SortableTh column="name" label="الاسم" sortState={filters} onSort={sort} />
                            <SortableTh column="username" label="اسم المستخدم" sortState={filters} onSort={sort} />
                            <SortableTh column="role" label="الدور" sortState={filters} onSort={sort} />
                            <th>الفرع</th>
                            <SortableTh column="is_active" label="الحالة" sortState={filters} onSort={sort} />
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.data.length === 0 ? (
                            <tr>
                                <td className="text-gray-500" colSpan={6}>
                                    لا توجد نتائج مطابقة.
                                </td>
                            </tr>
                        ) : (
                            users.data.map((user) => (
                                <tr key={user.id} {...rowClickProps(user.canUpdate && (() => setModalUser(user)))}>
                                    <td>
                                        <RowIdentity name={user.name} subtitle={user.roleLabel} status={user.is_active ? 'green' : 'gray'} />
                                    </td>
                                    <td className="text-end text-gray-600" dir="ltr">
                                        {user.username}
                                    </td>
                                    <td className="text-gray-600">{user.roleLabel}</td>
                                    <td className="text-gray-600">{user.branchName ?? '—'}</td>
                                    <td>
                                        <StatusPill tone={user.is_active ? 'green' : 'gray'} label={user.is_active ? 'نشط' : 'متوقف'} />
                                    </td>
                                    <td className="text-end">
                                        {user.canUpdate && (
                                            <RowActionsMenu>
                                                <button onClick={() => setModalUser(user)}>تعديل</button>
                                            </RowActionsMenu>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={users} filters={filters} baseUrl="/users" />

            <UserModal
                show={creating}
                onClose={() => setCreating(false)}
                user={null}
                branches={branches}
                canChooseBranch={canChooseBranch}
                roleOptions={createRoleOptions}
            />

            {/* Keyed by user id so switching who's being edited remounts the
                form with fresh initial values — useForm() only captures its
                initial data once, it won't pick up a changed `user` prop on
                an already-mounted instance. */}
            {modalUser && (
                <UserModal
                    key={modalUser.id}
                    show
                    onClose={() => setModalUser(null)}
                    user={modalUser}
                    branches={branches}
                    canChooseBranch={canChooseBranch}
                    roleOptions={modalUser.roleOptions}
                />
            )}
        </AuthenticatedLayout>
    );
}
