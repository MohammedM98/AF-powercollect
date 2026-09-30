import { useState } from 'react';
import { Head } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import AddButton from '@/Components/AddButton';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import SortableTh from '@/Components/DataTable/SortableTh';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import { useDeleteRecord } from '@/hooks/useDeleteRecord';
import { useRowClick } from '@/hooks/useRowClick';
import UserTypeModal from './UserTypeModal';

export default function Index({ userTypes, canCreate, filters }) {
    const [editing, setEditing] = useState(null);
    const [creating, setCreating] = useState(false);
    const rowClick = useRowClick();
    const { requestDelete, deleteDialog } = useDeleteRecord('نوع المستخدم');
    const { search, setSearch, setPerPage, sort } = useDataTable('/user-types', filters);

    return (
        <SettingsLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-3xl font-bold text-gray-900">أنواع المستخدمين</h2>
                        <p className="mt-1 text-sm text-gray-500">أضف المسميات الوظيفية التي تختارها عند إضافة المستخدمين.</p>
                    </div>
                    {canCreate && <AddButton onClick={() => setCreating(true)}>نوع مستخدم جديد</AddButton>}
                </>
            }
        >
            <Head title="أنواع المستخدمين" />
            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بنوع المستخدم..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={userTypes.total}
            />
            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start">
                    <thead>
                        <tr>
                            <SortableTh column="name" label="نوع المستخدم" sortState={filters} onSort={sort} />
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {userTypes.data.length === 0 ? (
                            <tr>
                                <td colSpan={2} className="text-gray-500">لا توجد أنواع مطابقة. أضف نوع مستخدم جديدًا.</td>
                            </tr>
                        ) : (
                            userTypes.data.map((type) => (
                                <tr key={type.id} {...rowClick(type.canUpdate ? () => setEditing(type) : null)}>
                                    <td><RowIdentity icon="users" name={type.name} /></td>
                                    <td className="text-end">
                                        {(type.canUpdate || type.canDelete) && (
                                            <RowActionsMenu>
                                                {type.canUpdate && <button onClick={() => setEditing(type)}>تعديل</button>}
                                                {type.canDelete && (
                                                    <button onClick={() => requestDelete(`/user-types/${type.id}`, type.name)}>حذف</button>
                                                )}
                                            </RowActionsMenu>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <Pagination meta={userTypes} filters={filters} baseUrl="/user-types" />
            <UserTypeModal show={creating} onClose={() => setCreating(false)} userType={null} />
            {editing && (
                <UserTypeModal key={editing.id} show onClose={() => setEditing(null)} userType={editing} />
            )}
            {deleteDialog}
        </SettingsLayout>
    );
}
