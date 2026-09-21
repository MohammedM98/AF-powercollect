import { Head, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import BranchForm from './BranchForm';

export default function Edit({ branch, governorates, areas }) {
    const { data, setData, put, processing, errors } = useForm({
        name: branch.name,
        phone: branch.phone ?? '',
        is_active: branch.is_active,
        governorate_id: branch.governorate_id ?? '',
        area_id: branch.area_id ?? '',
    });

    function submit(e) {
        e.preventDefault();
        put(`/branches/${branch.id}`);
    }

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">تعديل الفرع</h2>}>
            <Head title="تعديل الفرع" />

            <div className="max-w-2xl">
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <form onSubmit={submit}>
                        <BranchForm data={data} setData={setData} errors={errors} governorates={governorates} areas={areas} />

                        <div className="mt-6 flex items-center gap-4">
                            <PrimaryButton disabled={processing}>حفظ</PrimaryButton>
                            <a href="/branches" className="text-sm text-gray-600 underline">
                                إلغاء
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
