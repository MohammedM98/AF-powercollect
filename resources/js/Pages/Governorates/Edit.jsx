import { Head, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import GovernorateForm from './GovernorateForm';

export default function Edit({ governorate }) {
    const { data, setData, put, processing, errors } = useForm({
        name: governorate.name,
    });

    function submit(e) {
        e.preventDefault();
        put(`/governorates/${governorate.id}`);
    }

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">تعديل المحافظة</h2>}>
            <Head title="تعديل المحافظة" />

            <div className="max-w-2xl">
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <form onSubmit={submit}>
                        <GovernorateForm data={data} setData={setData} errors={errors} />

                        <div className="mt-6 flex items-center gap-4">
                            <PrimaryButton disabled={processing}>حفظ</PrimaryButton>
                            <a href="/governorates" className="text-sm text-gray-600 underline">
                                إلغاء
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
