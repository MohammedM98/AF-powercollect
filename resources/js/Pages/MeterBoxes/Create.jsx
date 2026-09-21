import { Head, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import MeterBoxForm from './MeterBoxForm';

export default function Create({ branches, canChooseBranch, governorates, areas }) {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        box_number: '',
        branch_id: '',
    });

    function submit(e) {
        e.preventDefault();
        post('/meter-boxes');
    }

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">إنشاء طبلون</h2>}>
            <Head title="إنشاء طبلون" />

            <div className="max-w-2xl">
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <form onSubmit={submit}>
                        <MeterBoxForm
                            data={data}
                            setData={setData}
                            errors={errors}
                            branches={branches}
                            canChooseBranch={canChooseBranch}
                            governorates={governorates}
                            areas={areas}
                        />

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
