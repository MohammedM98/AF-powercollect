import FormPage from '@/Components/FormPage';
import { useResourceForm } from '@/hooks/useResourceForm';
import SubscriberForm, { subscriberFormData } from './SubscriberForm';

export default function Edit({
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
        <FormPage title="تعديل المشترك" form={form} cancelHref="/subscribers" widthClass="max-w-6xl">
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
                isEdit
            />
        </FormPage>
    );
}
