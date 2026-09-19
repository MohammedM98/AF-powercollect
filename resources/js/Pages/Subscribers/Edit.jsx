import { Head, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import SubscriberForm from './SubscriberForm';

export default function Edit({ subscriber, branches, meterBoxes, tariffs, billingTypeOptions, canChooseBranch }) {
    const { data, setData, put, processing, errors } = useForm({
        full_name: subscriber.full_name,
        phone: subscriber.phone ?? '',
        address: subscriber.address ?? '',
        meter_number: subscriber.meter_number,
        meter_box_id: subscriber.meter_box_id ?? '',
        tariff_id: subscriber.tariff_id,
        status: subscriber.status,
        branch_id: subscriber.branch_id,
        billing_type: subscriber.billing_type ?? '',
        unit_price: subscriber.unit_price ?? '',
        minimum_charge: subscriber.minimum_charge ?? '',
        ampere_count: subscriber.ampere_count ?? '',
        area_1: subscriber.area_1 ?? '',
        area_2: subscriber.area_2 ?? '',
        customer_classification: subscriber.customer_classification ?? '',
        previous_reading: subscriber.previous_reading ?? '',
        subscription_fee: subscriber.subscription_fee ?? '',
        subscription_date: subscriber.subscription_date ?? '',
        charge_subscription_fee: subscriber.charge_subscription_fee,
        notes: subscriber.notes ?? '',
    });

    function submit(e) {
        e.preventDefault();
        put(`/subscribers/${subscriber.id}`);
    }

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">تعديل المشترك</h2>}>
            <Head title="تعديل المشترك" />

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
                            billingTypeOptions={billingTypeOptions}
                            canChooseBranch={canChooseBranch}
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
