import { Head, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import CircuitBreakerForm from './CircuitBreakerForm';

export default function Edit({ circuitBreaker }) {
    const { data, setData, put, processing, errors } = useForm({
        ampere: circuitBreaker.ampere,
        minimum_payment: circuitBreaker.minimum_payment,
    });

    function submit(event) {
        event.preventDefault();
        put(`/circuit-breakers/${circuitBreaker.id}`);
    }

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">تعديل القاطع</h2>}>
            <Head title="تعديل القاطع" />

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
        </AuthenticatedLayout>
    );
}
