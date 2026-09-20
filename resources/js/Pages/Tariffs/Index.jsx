import { useState } from 'react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatCurrency } from '@/lib/currency';
import TariffModal from './TariffModal';

export default function Index({ tariffs, status, categoryOptions }) {
    const [modalTariff, setModalTariff] = useState(null);
    const [creating, setCreating] = useState(false);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">التعرفات</h2>
                    </div>
                    <div className="shrink-0">
                        <button
                            onClick={() => setCreating(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            تعرفة جديدة
                        </button>
                    </div>
                </>
            }
        >
            <Head title="التعرفات" />

            {status === 'tariff-created' && <div className="mb-4 text-sm font-medium text-green-600">تم إنشاء التعرفة.</div>}
            {status === 'tariff-updated' && <div className="mb-4 text-sm font-medium text-green-600">تم تحديث التعرفة.</div>}

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <table className="w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <th className="px-6 py-3">الفئة</th>
                            <th className="px-6 py-3">السعر (₪)</th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {tariffs.data.length === 0 ? (
                            <tr>
                                <td className="px-6 py-4 text-gray-500" colSpan={3}>
                                    لا توجد تعرفات بعد.
                                </td>
                            </tr>
                        ) : (
                            tariffs.data.map((tariff) => (
                                <tr key={tariff.id}>
                                    <td className="px-6 py-4 font-medium text-gray-900">{tariff.categoryLabel}</td>
                                    <td className="px-6 py-4 text-gray-600" dir="ltr">
                                        {formatCurrency(tariff.rate)}
                                    </td>
                                    <td className="px-6 py-4 text-end">
                                        <button onClick={() => setModalTariff(tariff)} className="font-medium text-brand-600 hover:underline">
                                            تعديل
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {(tariffs.prev_page_url || tariffs.next_page_url) && (
                <div className="mt-4 flex items-center gap-4 text-sm">
                    {tariffs.prev_page_url && (
                        <a href={tariffs.prev_page_url} className="font-medium text-brand-600 hover:underline">
                            السابق
                        </a>
                    )}
                    {tariffs.next_page_url && (
                        <a href={tariffs.next_page_url} className="font-medium text-brand-600 hover:underline">
                            التالي
                        </a>
                    )}
                </div>
            )}

            <TariffModal show={creating} onClose={() => setCreating(false)} tariff={null} categoryOptions={categoryOptions} />

            {/* Keyed by tariff id so switching who's being edited remounts
                the form with fresh initial values — useForm() only captures
                its initial data once, it won't pick up a changed `tariff`
                prop on an already-mounted instance. */}
            {modalTariff && (
                <TariffModal
                    key={modalTariff.id}
                    show
                    onClose={() => setModalTariff(null)}
                    tariff={modalTariff}
                    categoryOptions={categoryOptions}
                />
            )}
        </AuthenticatedLayout>
    );
}
