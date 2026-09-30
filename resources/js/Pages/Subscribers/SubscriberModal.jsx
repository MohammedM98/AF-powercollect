import FormModal from '@/Components/FormModal';
import { useResourceForm } from '@/hooks/useResourceForm';
import SubscriberForm, { subscriberFormData } from './SubscriberForm';

export default function SubscriberModal({
    show,
    onClose,
    subscriber,
    sourceSubscriber = null,
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
    const form = useResourceForm('/subscribers', subscriber, subscriberFormData(subscriber, sourceSubscriber));

    return (
        <FormModal
            show={show}
            onClose={onClose}
            form={form}
            title={form.isEdit ? 'تعديل المشترك' : sourceSubscriber ? 'إضافة اشتراك' : 'إنشاء مشترك'}
            icon="user"
            maxWidth="5xl"
            bodyClassName="bg-gray-50"
        >
            <SubscriberForm
                data={form.data}
                setData={form.setData}
                errors={form.errors}
                clearErrors={form.clearErrors}
                branches={branches}
                meterBoxes={meterBoxes}
                tariffs={tariffs}
                circuitBreakers={circuitBreakers}
                subAreas={subAreas}
                canChooseBranch={canChooseBranch}
                currentBranchAreaId={currentBranchAreaId}
                currentBranchAreaName={currentBranchAreaName}
                canEditMinimumCharge={canEditMinimumCharge}
                sharedPersonalDetails={Boolean(sourceSubscriber)}
                isEdit={form.isEdit}
                subscriptionCount={subscriber?.subscriptionCount ?? 1}
            />
        </FormModal>
    );
}
