import { Head, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import MeterBoxForm from './MeterBoxForm';

export default function Edit({ meterBox, branches, canChooseBranch }) {
    const { data, setData, put, processing, errors } = useForm({
        box_number: meterBox.box_number,
        area: meterBox.area ?? '',
        location: meterBox.location ?? '',
        branch_id: meterBox.branch_id,
    });

    function submit(e) {
        e.preventDefault();
        put(`/meter-boxes/${meterBox.id}`);
    }

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">تعديل صندوق العداد</h2>}>
            <Head title="تعديل صندوق العداد" />

            <div className="max-w-2xl">
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <form onSubmit={submit}>
                        <MeterBoxForm data={data} setData={setData} errors={errors} branches={branches} canChooseBranch={canChooseBranch} />

                        <div className="mt-6 flex items-center gap-4">
                            <PrimaryButton disabled={processing}>حفظ</PrimaryButton>
                            <a href="/meter-boxes" className="text-sm text-gray-600 underline">
                                إلغاء
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
