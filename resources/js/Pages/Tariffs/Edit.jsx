import { Head, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import TariffForm from './TariffForm';

export default function Edit({ tariff, categoryOptions }) {
    const { data, setData, put, processing, errors } = useForm({
        category: tariff.category,
        rate: tariff.rate,
    });

    function submit(e) {
        e.preventDefault();
        put(`/tariffs/${tariff.id}`);
    }

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">تعديل التعرفة</h2>}>
            <Head title="تعديل التعرفة" />

            <div className="max-w-2xl">
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <form onSubmit={submit}>
                        <TariffForm data={data} setData={setData} errors={errors} categoryOptions={categoryOptions} />

                        <div className="mt-6 flex items-center gap-4">
                            <PrimaryButton disabled={processing}>حفظ</PrimaryButton>
                            <a href="/tariffs" className="text-sm text-gray-600 underline">
                                إلغاء
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
