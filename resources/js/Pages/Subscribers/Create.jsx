import { Head, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import SubscriberForm from './SubscriberForm';

export default function Create({
    branches,
    meterBoxes,
    tariffs,
    circuitBreakers,
    subAreas,
    canChooseBranch,
    currentBranchAreaId,
    currentBranchAreaName,
    canEditMinimumCharge,
}) {
    const { data, setData, post, processing, errors } = useForm({
        full_name: '',
        national_id: '',
        phone: '',
        address: '',
        meter_number: '',
        meter_box_id: '',
        tariff_id: '',
        status: 'active',
        branch_id: '',
        circuit_breaker_id: '',
        minimum_charge: '',
        initial_reading: '',
        subscription_fee: '',
        subscription_date: '',
        notes: '',
    });

    function submit(e) {
        e.preventDefault();
        post('/subscribers');
    }

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">إنشاء مشترك</h2>}>
            <Head title="إنشاء مشترك" />

            <div className="max-w-6xl">
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <form onSubmit={submit}>
                        <SubscriberForm
                            data={data}
                            setData={setData}
                            errors={errors}
                            branches={branches}
                            meterBoxes={meterBoxes}
                            tariffs={tariffs}
                            circuitBreakers={circuitBreakers}
                            subAreas={subAreas}
                            canChooseBranch={canChooseBranch}
                            currentBranchAreaId={currentBranchAreaId}
                            currentBranchAreaName={currentBranchAreaName}
                            canEditMinimumCharge={canEditMinimumCharge}
                        />

                        <div className="mt-6 flex items-center gap-4">
                            <PrimaryButton disabled={processing}>حفظ</PrimaryButton>
                            <a href="/subscribers" className="text-sm text-gray-600 underline">
                                إلغاء
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
