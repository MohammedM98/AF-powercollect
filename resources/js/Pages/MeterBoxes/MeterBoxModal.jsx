import FormModal from '@/Components/FormModal';
import { useResourceForm } from '@/hooks/useResourceForm';
import MeterBoxForm, { meterBoxFormData } from './MeterBoxForm';

export default function MeterBoxModal({ show, onClose, meterBox, branches, canChooseBranch, governorates, areas, subAreas, currentBranchAreaId }) {
    const form = useResourceForm('/meter-boxes', meterBox, meterBoxFormData(meterBox));

    return (
        <FormModal show={show} onClose={onClose} form={form} title={form.isEdit ? 'تعديل الطبلون' : 'إنشاء طبلون'} icon="table">
            <MeterBoxForm
                data={form.data}
                setData={form.setData}
                errors={form.errors}
                branches={branches}
                canChooseBranch={canChooseBranch}
                governorates={governorates}
                areas={areas}
                subAreas={subAreas}
                currentBranchAreaId={currentBranchAreaId}
            />
        </FormModal>
    );
}
