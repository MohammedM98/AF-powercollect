import { useState } from 'react';
import { Head } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import Pagination from '@/Components/DataTable/Pagination';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import { useDataTable } from '@/hooks/useDataTable';
import PermissionModal from './PermissionModal';

export default function Permissions({ users, permissionGroups, filters, filterOptions, scopedToOwnBranch }) {
    const [editingUser, setEditingUser] = useState(null);
    const { search, setSearch, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/settings/permissions', filters);

    return (
        <SettingsLayout header={<h2 className="text-3xl font-bold text-gray-900">الصلاحيات</h2>}>
            <Head title="الصلاحيات" />

            <p className="mb-4 text-sm text-gray-500">
                اختر مستخدمًا لإدارة صلاحياته بشكل مستقل. يمتلك المدير العام جميع الصلاحيات دائمًا
                {scopedToOwnBranch ? '، وتقتصر إدارتك هنا على موظفي فرعك.' : '.'}
            </p>
            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو اسم المستخدم..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={users.total}
                filterMenu={
                    <DataTableFilterMenu
                        tableKey="permissions"
                        groups={filterOptions}
                        values={filterValues}
                        onChange={setFilter}
                        onClear={clearFilters}
                    />
                }
            />
            <div className="data-table-container">
                <table className="data-table w-full text-start text-sm">
                    <thead>
                        <tr>
                            <th>المستخدم</th>
                            <th>الدور</th>
                            <th>الفرع</th>
                            <th>
                                <span className="sr-only">إدارة الصلاحيات</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.data.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="text-gray-500">
                                    لا يوجد مستخدمون لإدارتهم.
                                </td>
                            </tr>
                        ) : (
                            users.data.map((user) => (
                                <tr key={user.id}>
                                    <td>
                                        <button type="button" onClick={() => setEditingUser(user)} className="text-start">
                                            <RowIdentity name={user.name} subtitle={`@${user.username}`} subtitleDir="ltr" />
                                        </button>
                                    </td>
                                    <td className="text-gray-600">{user.roleLabel}</td>
                                    <td className="text-gray-600">{user.branchName ?? '—'}</td>
                                    <td className="text-end">
                                        <RowActionsMenu>
                                            <button onClick={() => setEditingUser(user)} aria-label={`إدارة صلاحيات ${user.name}`}>
                                                إدارة الصلاحيات
                                            </button>
                                        </RowActionsMenu>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <Pagination meta={users} filters={filters} baseUrl="/settings/permissions" />
            {editingUser && (
                <PermissionModal key={editingUser.id} user={editingUser} permissionGroups={permissionGroups} onClose={() => setEditingUser(null)} />
            )}
        </SettingsLayout>
    );
}
