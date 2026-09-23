import { Head, useForm } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import CircuitBreakerForm from './CircuitBreakerForm';

export default function Create() {
    const { data, setData, post, processing, errors } = useForm({
        ampere: '',
        minimum_payment: '',
    });

    function submit(event) {
        event.preventDefault();
        post('/circuit-breakers');
    }

    return (
        <SettingsLayout header={<h2 className="text-xl font-bold text-gray-900">إنشاء قاطع</h2>}>
            <Head title="إنشاء قاطع" />

            <div className="max-w-2xl">
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <form onSubmit={submit}>
                        <CircuitBreakerForm data={data} setData={setData} errors={errors} />

                        <div className="mt-6 flex items-center gap-4">
                            <PrimaryButton disabled={processing}>حفظ</PrimaryButton>
                            <a href="/circuit-breakers" className="text-sm text-gray-600 underline">
                                إلغاء
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </SettingsLayout>
    );
}
