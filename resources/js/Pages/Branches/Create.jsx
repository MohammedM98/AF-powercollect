import { Head, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import BranchForm from './BranchForm';

export default function Create({ governorates, areas }) {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        phone: '',
        is_active: true,
        governorate_id: '',
        area_id: '',
    });

    function submit(e) {
        e.preventDefault();
        post('/branches');
    }

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">إنشاء فرع</h2>}>
            <Head title="إنشاء فرع" />

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
