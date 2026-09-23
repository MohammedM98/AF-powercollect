import { Head, useForm } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import GovernorateForm from './GovernorateForm';

export default function Create() {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
    });

    function submit(e) {
        e.preventDefault();
        post('/governorates');
    }

    return (
        <SettingsLayout header={<h2 className="text-xl font-bold text-gray-900">إنشاء محافظة</h2>}>
            <Head title="إنشاء محافظة" />

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
        </SettingsLayout>
    );
}
