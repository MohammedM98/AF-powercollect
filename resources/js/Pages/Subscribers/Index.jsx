import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';

const STATUS_STYLES = {
    active: 'bg-emerald-50 text-emerald-700',
    suspended: 'bg-amber-50 text-amber-700',
    disconnected: 'bg-gray-100 text-gray-500',
};

export default function Index({ subscribers, canCreate, status }) {
    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">المشتركون</h2>
                    </div>
                    {canCreate && (
                        <div className="shrink-0">
                            <a
                                href="/subscribers/create"
                                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                مشترك جديد
                            </a>
                        </div>
                    )}
                </>
            }
        >
            <Head title="المشتركون" />

            {status === 'subscriber-created' && <div className="mb-4 text-sm font-medium text-green-600">تم إنشاء المشترك.</div>}
            {status === 'subscriber-updated' && <div className="mb-4 text-sm font-medium text-green-600">تم تحديث المشترك.</div>}

            <div className="mb-4 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-xs font-medium text-brand-700">
                تجربة React عبر Inertia — بقية النظام لا يزال Blade.
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <table className="w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <th className="px-6 py-3">الاسم الكامل</th>
                            <th className="px-6 py-3">رقم العداد</th>
                            <th className="px-6 py-3">صندوق العداد</th>
                            <th className="px-6 py-3">التعرفة</th>
                            <th className="px-6 py-3">الفرع</th>
                            <th className="px-6 py-3">الحالة</th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {subscribers.data.length === 0 ? (
                            <tr>
                                <td className="px-6 py-4 text-gray-500" colSpan={7}>
                                    لا يوجد مشتركون مسجّلون بعد.
                                </td>
                            </tr>
                        ) : (
                            subscribers.data.map((subscriber) => (
                                <tr key={subscriber.id}>
                                    <td className="px-6 py-4 font-medium text-gray-900">{subscriber.full_name}</td>
                                    <td className="px-6 py-4 text-gray-600" dir="ltr">
                                        {subscriber.meter_number}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600" dir="ltr">
                                        {subscriber.meterBoxNumber ?? '—'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{subscriber.tariffCategoryLabel}</td>
                                    <td className="px-6 py-4 text-gray-600">{subscriber.branchName}</td>
                                    <td className="px-6 py-4">
                                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[subscriber.status]}`}>
                                            {subscriber.statusLabel}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-end">
                                        {subscriber.canUpdate && (
                                            <a href={`/subscribers/${subscriber.id}/edit`} className="font-medium text-brand-600 hover:underline">
                                                تعديل
                                            </a>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {(subscribers.prev_page_url || subscribers.next_page_url) && (
                <div className="mt-4 flex items-center gap-4 text-sm">
                    {subscribers.prev_page_url && (
                        <a href={subscribers.prev_page_url} className="font-medium text-brand-600 hover:underline">
                            السابق
                        </a>
                    )}
                    {subscribers.next_page_url && (
                        <a href={subscribers.next_page_url} className="font-medium text-brand-600 hover:underline">
                            التالي
                        </a>
                    )}
                </div>
            )}
        </AuthenticatedLayout>
    );
}
