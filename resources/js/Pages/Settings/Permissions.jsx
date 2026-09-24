import { useState } from 'react';
import { Head } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import PermissionModal from './PermissionModal';

export default function Permissions({ users, permissionGroups, status, filters, filterOptions, scopedToOwnBranch }) {
    const [editingUser, setEditingUser] = useState(null);
    const { search, setSearch, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/settings/permissions', filters);

    return (
        <SettingsLayout header={<h2 className="text-xl font-bold text-gray-900">الصلاحيات</h2>}>
            <Head title="الصلاحيات" />

            <p className="mb-4 text-sm text-gray-500">
                اختر مستخدمًا لإدارة صلاحياته بشكل مستقل. يمتلك المدير العام جميع الصلاحيات دائمًا
                {scopedToOwnBranch ? '، وتقتصر إدارتك هنا على موظفي فرعك.' : '.'}
            </p>
            <DataTableToolbar
                search={search} onSearchChange={setSearch} placeholder="بحث بالاسم أو اسم المستخدم..."
                perPage={filters.per_page} onPerPageChange={setPerPage} total={users.total}
                filterMenu={<DataTableFilterMenu tableKey="permissions" groups={filterOptions} values={filterValues} onChange={setFilter} onClear={clearFilters} />}
            />
            <div className="data-table-container">
                <table className="data-table w-full text-start text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500"><tr>
                        <th className="px-6 py-3">المستخدم</th><th className="px-6 py-3">الدور</th><th className="px-6 py-3">الفرع</th>
                        <th className="px-6 py-3"><span className="sr-only">إدارة الصلاحيات</span></th>
                    </tr></thead>
                    <tbody className="divide-y">
                        {users.data.length === 0 ? <tr><td colSpan={4} className="px-6 py-4 text-gray-500">لا يوجد مستخدمون لإدارتهم.</td></tr> : users.data.map((user) => (
                            <tr key={user.id} className="transition hover:bg-gray-50">
                                <td className="px-6 py-4">
                                    <button type="button" onClick={() => setEditingUser(user)} className="text-start font-semibold text-brand-700 hover:underline">{user.name}</button>
                                    <div className="text-end text-gray-500" dir="ltr">@{user.username}</div>
                                </td>
                                <td className="px-6 py-4 text-gray-600">{user.roleLabel}</td>
                                <td className="px-6 py-4 text-gray-600">{user.branchName ?? '—'}</td>
                                <td className="px-6 py-4 text-end"><button type="button" onClick={() => setEditingUser(user)} aria-label={`إدارة صلاحيات ${user.name}`} className="whitespace-nowrap rounded-lg bg-brand-50 px-3 py-2 font-semibold text-brand-700 transition hover:bg-brand-100">إدارة الصلاحيات</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Pagination meta={users} filters={filters} baseUrl="/settings/permissions" />
            {editingUser && <PermissionModal key={editingUser.id} user={editingUser} permissionGroups={permissionGroups} onClose={() => setEditingUser(null)} />}
        </SettingsLayout>
    );
}
