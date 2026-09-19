import { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';

export default function Permissions({ users, permissions, status }) {
    const [selected, setSelected] = useState(() => {
        const map = {};
        users.forEach((user) => {
            map[user.id] = new Set(user.permissionIds);
        });
        return map;
    });
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);

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

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">الصلاحيات</h2>}>
            <Head title="الصلاحيات" />

            {status === 'permissions-updated' && (
                <div className="mb-4 text-sm font-medium text-green-600">تم تحديث الصلاحيات.</div>
            )}

            <div className="mb-4 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-xs font-medium text-brand-700">
                تجربة React عبر Inertia — بقية النظام لا يزال Blade.
            </div>

            <p className="mb-4 text-sm text-gray-500">
                يمتلك المدير العام جميع الصلاحيات ضمنيًا دائمًا. امنح صلاحيات فردية لمستخدمين محددين هنا، بغض النظر عن دورهم.
            </p>

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <table className="w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <th className="px-6 py-3">المستخدم</th>
                            <th className="px-6 py-3">الدور</th>
                            <th className="px-6 py-3">الفرع</th>
                            {permissions.map((permission) => (
                                <th key={permission.id} className="px-6 py-3 text-center">
                                    {permission.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {users.length === 0 ? (
                            <tr>
                                <td className="px-6 py-4 text-gray-500" colSpan={3 + permissions.length}>
                                    لا يوجد مستخدمون لإدارتهم بعد.
                                </td>
                            </tr>
                        ) : (
                            users.map((user) => (
                                <tr key={user.id}>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{user.name}</div>
                                        <div className="text-gray-500" dir="ltr">
                                            @{user.username}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{user.roleLabel}</td>
                                    <td className="px-6 py-4 text-gray-600">{user.branchName ?? '—'}</td>
                                    {permissions.map((permission) => (
                                        <td key={permission.id} className="px-6 py-4 text-center">
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-brand-600 shadow-sm focus:ring-brand-500"
                                                checked={selected[user.id]?.has(permission.id) ?? false}
                                                onChange={() => toggle(user.id, permission.id)}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

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
                            سيتم تطبيق هذه التغييرات على صلاحيات المستخدمين فورًا. هل تريد المتابعة؟
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
