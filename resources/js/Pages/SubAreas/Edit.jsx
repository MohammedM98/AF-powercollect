import { Head, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import SubAreaForm from './SubAreaForm';

export default function Edit({ subArea, areas }) {
    const { data, setData, put, processing, errors } = useForm({
        name: subArea.name,
        area_id: subArea.area_id ?? '',
    });

    function submit(e) {
        e.preventDefault();
        put(`/sub-areas/${subArea.id}`);
    }

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">تعديل منطقة 2</h2>}>
            <Head title="تعديل منطقة 2" />

            <div className="max-w-2xl">
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <form onSubmit={submit}>
                        <SubAreaForm data={data} setData={setData} errors={errors} areas={areas} />

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
