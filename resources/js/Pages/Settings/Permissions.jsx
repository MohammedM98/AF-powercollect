import { useEffect, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';

const ACTION_LABELS = {
    view: 'عرض',
    create: 'إضافة',
    update: 'تعديل',
    record: 'تسجيل',
    confirm: 'تأكيد',
};

function buildSelectedMap(users) {
    const map = {};
    users.forEach((user) => {
        map[user.id] = new Set(user.permissionIds);
    });
    return map;
}

export default function Permissions({ users, permissionGroups, status, filters, filterOptions }) {
    const [selected, setSelected] = useState(() => buildSelectedMap(users.data));
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/settings/permissions', filters);

    // The list is searchable/paginated, so the set of users on screen
    // changes independently of user edits. Whenever a new page/search
    // result comes in, rebuild the selection map from the server's data
    // for exactly those users — any unsaved edits on a page you've since
    // navigated away from are expected to be lost, same as any other form.
    useEffect(() => {
        setSelected(buildSelectedMap(users.data));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [users.data]);

    function toggle(userId, permissionId) {
        setSelected((prev) => {
            const next = { ...prev };
            const set = new Set(next[userId]);
            if (set.has(permissionId)) {
                set.delete(permissionId);
            } else {
                set.add(permissionId);
            }
            next[userId] = set;
            return next;
        });
    }

    function submit() {
        setSaving(true);

        const payload = {};
        Object.entries(selected).forEach(([userId, set]) => {
            payload[userId] = Array.from(set);
        });

        router.put(
            '/settings/permissions',
            { permissions: payload },
            {
                preserveScroll: true,
                onFinish: () => {
                    setSaving(false);
                    setConfirming(false);
                },
            },
        );
    }

    const totalColumns = 3 + permissionGroups.reduce((sum, group) => sum + group.actions.length, 0);

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">الصلاحيات</h2>}>
            <Head title="الصلاحيات" />

            {status === 'permissions-updated' && (
                <div className="mb-4 text-sm font-medium text-green-600">تم تحديث الصلاحيات.</div>
            )}

            <p className="mb-4 text-sm text-gray-500">
                يمتلك المدير العام جميع الصلاحيات ضمنيًا دائمًا. امنح كل مستخدم صلاحية العرض فقط أو الإدارة الكاملة (إضافة/تعديل) لكل جدول
                على حدة، بغض النظر عن دوره.
            </p>

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو اسم المستخدم..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={users.total}
                filterMenu={
                    <DataTableFilterMenu groups={filterOptions} values={filterValues} onChange={setFilter} onClear={clearFilters} />
                }
            />

            <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
                <table className="w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <th className="whitespace-nowrap px-6 py-3" rowSpan={2}>
                                المستخدم
                            </th>
                            <th className="whitespace-nowrap px-6 py-3" rowSpan={2}>
                                الدور
                            </th>
                            <th className="whitespace-nowrap px-6 py-3" rowSpan={2}>
                                الفرع
                            </th>
                            {permissionGroups.map((group) => (
                                <th key={group.key} className="whitespace-nowrap border-s border-gray-100 px-4 py-2 text-center" colSpan={group.actions.length}>
                                    {group.label}
                                </th>
                            ))}
                        </tr>
                        <tr>
                            {permissionGroups.map((group) =>
                                group.actions.map((entry) => (
                                    <th
                                        key={`${group.key}-${entry.action}`}
                                        className="whitespace-nowrap border-s border-gray-100 px-4 py-2 text-center font-medium"
                                    >
                                        {ACTION_LABELS[entry.action] ?? entry.action}
                                    </th>
                                )),
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {users.data.length === 0 ? (
                            <tr>
                                <td className="px-6 py-4 text-gray-500" colSpan={totalColumns}>
                                    لا يوجد مستخدمون لإدارتهم بعد.
                                </td>
                            </tr>
                        ) : (
                            users.data.map((user) => (
                                <tr key={user.id}>
                                    <td className="whitespace-nowrap px-6 py-4">
                                        <div className="font-medium text-gray-900">{user.name}</div>
                                        <div className="text-gray-500" dir="ltr">
                                            @{user.username}
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 text-gray-600">{user.roleLabel}</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-gray-600">{user.branchName ?? '—'}</td>
                                    {permissionGroups.map((group) =>
                                        group.actions.map((entry) => (
                                            <td
                                                key={`${group.key}-${entry.action}`}
                                                className="border-s border-gray-100 px-4 py-4 text-center"
                                            >
                                                {entry.permission ? (
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-gray-300 text-brand-600 shadow-sm focus:ring-brand-500"
                                                        checked={selected[user.id]?.has(entry.permission.id) ?? false}
                                                        onChange={() => toggle(user.id, entry.permission.id)}
                                                    />
                                                ) : (
                                                    <span className="text-gray-300">—</span>
                                                )}
                                            </td>
                                        )),
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={users} filters={filters} baseUrl="/settings/permissions" />

            <div className="mt-6">
                <button
                    onClick={() => setConfirming(true)}
                    className="inline-flex items-center rounded-md bg-brand-600 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white shadow-sm transition hover:bg-brand-700"
                >
                    حفظ
                </button>
            </div>

            {confirming && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                        <h3 className="text-lg font-bold text-gray-900">تأكيد تحديث الصلاحيات</h3>
                        <p className="mt-2 text-sm text-gray-600">
                            سيتم تطبيق هذه التغييرات على صلاحيات المستخدمين المعروضين حاليًا فورًا. هل تريد المتابعة؟
                        </p>
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => setConfirming(false)}
                                disabled={saving}
                                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                            >
                                إلغاء
                            </button>
                            <button
                                onClick={submit}
                                disabled={saving}
                                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
                            >
                                {saving ? 'جارٍ الحفظ...' : 'تأكيد'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthenticatedLayout>
    );
}
