import { useEffect, useState } from 'react';
import { Head, router } from '@inertiajs/react';
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
import { useDeleteRecord } from '@/hooks/useDeleteRecord';
import { useRowClick } from '@/hooks/useRowClick';
import UserModal from './UserModal';
import UserTypesTab from './UserTypesTab';

const TABS = [
    ['users', 'المستخدمون'],
    ['types', 'أنواع المستخدمين'],
];

export default function Index({
    users,
    canCreate,
    branches,
    canChooseBranch,
    createRoleOptions,
    filters,
    filterOptions,
    userTypeOptions,
    tab: initialTab,
    userTypes,
    canCreateUserType,
}) {
    const [modalUser, setModalUser] = useState(null);
    const [creating, setCreating] = useState(false);
    const [tab, setTab] = useState(initialTab);
    const [addTypeRequested, setAddTypeRequested] = useState(false);
    const showingTypes = tab === 'types' && userTypes !== null;

    useEffect(() => setTab(initialTab), [initialTab]);

    /** Switch tabs, keeping the tab in the address so a refresh or a save comes back to it. */
    function switchTab(next) {
        setTab(next);
        router.get('/users', next === 'types' ? { tab: 'types' } : {}, { only: ['tab'], preserveState: true, preserveScroll: true, replace: true });
    }
    const rowClick = useRowClick();
    const { requestDelete, deleteDialog } = useDeleteRecord('المستخدم');
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/users', filters);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="flex min-w-0 flex-wrap items-center gap-4">
                        <h2 className="text-3xl font-bold text-gray-900">المستخدمون</h2>
                        {userTypes !== null && (
                            <div role="tablist" aria-label="المستخدمون" className="inline-flex gap-0.5 rounded-xl border border-gray-100 bg-gray-100 p-[3px]">
                                {TABS.map(([key, label]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === key}
                                        onClick={() => switchTab(key)}
                                        className={`rounded-[9px] px-3 py-1.5 text-[13.5px] font-semibold transition ${
                                            tab === key ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {showingTypes
                        ? canCreateUserType && (
                              <div className="shrink-0">
                                  <AddButton onClick={() => setAddTypeRequested(true)}>نوع مستخدم جديد</AddButton>
                              </div>
                          )
                        : canCreate && (
                              <div className="shrink-0">
                                  <AddButton onClick={() => setCreating(true)}>مستخدم جديد</AddButton>
                              </div>
                          )}
                </>
            }
        >
            <Head title={showingTypes ? 'أنواع المستخدمين' : 'المستخدمون'} />

            {showingTypes ? (
                <UserTypesTab
                    userTypes={userTypes}
                    canCreate={canCreateUserType}
                    addRequested={addTypeRequested}
                    onAddHandled={() => setAddTypeRequested(false)}
                />
            ) : (
                <>
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
                                    <th>نوع المستخدم</th>
                                    <th>الفرع</th>
                                    <SortableTh column="is_active" label="الحالة" sortState={filters} onSort={sort} />
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.data.length === 0 ? (
                                    <tr>
                                        <td className="text-gray-500" colSpan={7}>
                                            لا توجد نتائج مطابقة.
                                        </td>
                                    </tr>
                                ) : (
                                    users.data.map((user) => (
                                        <tr key={user.id} {...rowClick(user.canUpdate ? () => setModalUser(user) : null)}>
                                            <td>
                                                <RowIdentity name={user.name} subtitle={user.roleLabel} status={user.is_active ? 'green' : 'gray'} />
                                            </td>
                                            <td className="text-end text-gray-600" dir="ltr">
                                                {user.username}
                                            </td>
                                            <td className="text-gray-600">{user.roleLabel}</td>
                                            <td className="text-gray-600">{user.userTypeName ?? '—'}</td>
                                            <td className="text-gray-600">{user.branchName ?? '—'}</td>
                                            <td>
                                                <StatusPill tone={user.is_active ? 'green' : 'gray'} label={user.is_active ? 'نشط' : 'متوقف'} />
                                            </td>
                                            <td className="text-end">
                                                {(user.canUpdate || user.canDelete) && (
                                                    <RowActionsMenu>
                                                        {user.canDelete && <button onClick={() => requestDelete(`/users/${user.id}`, user.name)}>حذف</button>}
                                                        {user.canUpdate && <button onClick={() => setModalUser(user)}>تعديل</button>}
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
                </>
            )}

            <UserModal
                show={creating}
                onClose={() => setCreating(false)}
                user={null}
                branches={branches}
                canChooseBranch={canChooseBranch}
                roleOptions={createRoleOptions}
                userTypeOptions={userTypeOptions}
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
                    userTypeOptions={userTypeOptions}
                />
            )}

            {deleteDialog}
        </AuthenticatedLayout>
    );
}
