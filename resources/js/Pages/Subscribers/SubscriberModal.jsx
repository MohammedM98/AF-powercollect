import FormModal from '@/Components/FormModal';
import { useResourceForm } from '@/hooks/useResourceForm';
import SubscriberForm, { subscriberFormData } from './SubscriberForm';

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
    const form = useResourceForm('/subscribers', subscriber, subscriberFormData(subscriber));

    return (
        <FormModal
            show={show}
            onClose={onClose}
            form={form}
            title={form.isEdit ? 'تعديل المشترك' : 'إنشاء مشترك'}
            icon="user"
            maxWidth="5xl"
        >
            <SubscriberForm
                data={form.data}
                setData={form.setData}
                errors={form.errors}
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
        </FormModal>
    );
}
