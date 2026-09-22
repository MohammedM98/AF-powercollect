import { useForm } from '@inertiajs/react';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import SubscriberForm from './SubscriberForm';

const BLANK = {
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
};

export default function SubscriberModal({
    show,
    onClose,
    subscriber,
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
    const isEdit = Boolean(subscriber);

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm(
        isEdit
            ? {
                  full_name: subscriber.full_name,
                  national_id: subscriber.national_id,
                  phone: subscriber.phone ?? '',
                  address: subscriber.address ?? '',
                  meter_number: subscriber.meter_number,
                  meter_box_id: subscriber.meter_box_id ?? '',
                  tariff_id: subscriber.tariff_id,
                  status: subscriber.status,
                  branch_id: subscriber.branch_id,
                  circuit_breaker_id: subscriber.circuit_breaker_id ?? '',
                  minimum_charge: subscriber.minimum_charge ?? '',
                  initial_reading: subscriber.initial_reading ?? '',
                  subscription_fee: subscriber.subscription_fee ?? '',
                  subscription_date: subscriber.subscription_date ?? '',
                  notes: subscriber.notes ?? '',
              }
            : BLANK,
    );

    function close() {
        clearErrors();
        reset();
        onClose();
    }

    function submit(e) {
        e.preventDefault();

        const options = { preserveScroll: true, onSuccess: close };

        if (isEdit) {
            put(`/subscribers/${subscriber.id}`, options);
        } else {
            post('/subscribers', options);
        }
    }

    return (
        <Modal show={show} onClose={close} maxWidth="5xl">
            <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="1.5"
                                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                                />
                            </svg>
                        </span>
                        <h3 className="text-lg font-bold text-gray-900">{isEdit ? 'تعديل المشترك' : 'إنشاء مشترك'}</h3>
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
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
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <SecondaryButton onClick={close}>إلغاء</SecondaryButton>
                    <PrimaryButton disabled={processing}>{processing ? 'جارٍ الحفظ...' : 'حفظ'}</PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}
