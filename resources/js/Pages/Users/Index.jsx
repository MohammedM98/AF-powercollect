import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';

export default function Index({ users, canCreate, status }) {
    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">المستخدمون</h2>
                    </div>
                    {canCreate && (
                        <div className="shrink-0">
                            <a
                                href="/users/create"
                                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                مستخدم جديد
                            </a>
                        </div>
                    )}
                </>
            }
        >
            <Head title="المستخدمون" />

            {status === 'user-created' && <div className="mb-4 text-sm font-medium text-green-600">تم إنشاء المستخدم.</div>}
            {status === 'user-updated' && <div className="mb-4 text-sm font-medium text-green-600">تم تحديث المستخدم.</div>}

            <div className="mb-4 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-xs font-medium text-brand-700">
                تجربة React عبر Inertia — بقية النظام لا يزال Blade.
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <table className="w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <th className="px-6 py-3">الاسم</th>
                            <th className="px-6 py-3">اسم المستخدم</th>
                            <th className="px-6 py-3">الدور</th>
                            <th className="px-6 py-3">الفرع</th>
                            <th className="px-6 py-3">الحالة</th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {users.data.map((user) => (
                            <tr key={user.id}>
                                <td className="px-6 py-4 font-medium text-gray-900">{user.name}</td>
                                <td className="px-6 py-4 text-gray-600" dir="ltr">
                                    {user.username}
                                </td>
                                <td className="px-6 py-4 text-gray-600">{user.roleLabel}</td>
                                <td className="px-6 py-4 text-gray-600">{user.branchName ?? '—'}</td>
                                <td className="px-6 py-4">
                                    {user.is_active ? (
                                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">نشط</span>
                                    ) : (
                                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">متوقف</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-end">
                                    {user.canUpdate && (
                                        <a href={`/users/${user.id}/edit`} className="font-medium text-brand-600 hover:underline">
                                            تعديل
                                        </a>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {(users.prev_page_url || users.next_page_url) && (
                <div className="mt-4 flex items-center gap-4 text-sm">
                    {users.prev_page_url && (
                        <a href={users.prev_page_url} className="font-medium text-brand-600 hover:underline">
                            السابق
                        </a>
                    )}
                    {users.next_page_url && (
                        <a href={users.next_page_url} className="font-medium text-brand-600 hover:underline">
                            التالي
                        </a>
                    )}
                </div>
            )}
        </AuthenticatedLayout>
    );
}
