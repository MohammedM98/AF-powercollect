import { useState } from 'react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import BranchModal from './BranchModal';

export default function Index({ branches, status }) {
    const [modalBranch, setModalBranch] = useState(null);
    const [creating, setCreating] = useState(false);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">الفروع</h2>
                    </div>
                    <div className="shrink-0">
                        <button
                            onClick={() => setCreating(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            فرع جديد
                        </button>
                    </div>
                </>
            }
        >
            <Head title="الفروع" />

            {status === 'branch-created' && (
                <div className="mb-4 text-sm font-medium text-green-600">تم إنشاء الفرع.</div>
            )}
            {status === 'branch-updated' && (
                <div className="mb-4 text-sm font-medium text-green-600">تم تحديث الفرع.</div>
            )}

            <div className="mb-4 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-xs font-medium text-brand-700">
                تجربة React عبر Inertia — بقية النظام لا يزال Blade.
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <table className="w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <th className="px-6 py-3">الاسم</th>
                            <th className="px-6 py-3">الموقع</th>
                            <th className="px-6 py-3">الهاتف</th>
                            <th className="px-6 py-3">الحالة</th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {branches.data.map((branch) => (
                            <tr key={branch.id}>
                                <td className="px-6 py-4 font-medium text-gray-900">{branch.name}</td>
                                <td className="px-6 py-4 text-gray-600">{branch.location}</td>
                                <td className="px-6 py-4 text-gray-600">{branch.phone}</td>
                                <td className="px-6 py-4">
                                    {branch.is_active ? (
                                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">نشط</span>
                                    ) : (
                                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">متوقف</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-end">
                                    <button onClick={() => setModalBranch(branch)} className="font-medium text-brand-600 hover:underline">
                                        تعديل
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {(branches.prev_page_url || branches.next_page_url) && (
                <div className="mt-4 flex items-center gap-4 text-sm">
                    {branches.prev_page_url && (
                        <a href={branches.prev_page_url} className="font-medium text-brand-600 hover:underline">
                            السابق
                        </a>
                    )}
                    {branches.next_page_url && (
                        <a href={branches.next_page_url} className="font-medium text-brand-600 hover:underline">
                            التالي
                        </a>
                    )}
                </div>
            )}

            <BranchModal show={creating} onClose={() => setCreating(false)} branch={null} />

            {/* Keyed by branch id so switching who's being edited remounts
                the form with fresh initial values — useForm() only captures
                its initial data once, it won't pick up a changed `branch`
                prop on an already-mounted instance. */}
            {modalBranch && (
                <BranchModal key={modalBranch.id} show onClose={() => setModalBranch(null)} branch={modalBranch} />
            )}
        </AuthenticatedLayout>
    );
}
