import FormModal from '@/Components/FormModal';
import { useResourceForm } from '@/hooks/useResourceForm';
import GovernorateForm, { governorateFormData } from './GovernorateForm';

export default function GovernorateModal({ show, onClose, governorate }) {
    const form = useResourceForm('/governorates', governorate, governorateFormData(governorate));

    return (
        <FormModal show={show} onClose={onClose} form={form} title={form.isEdit ? 'تعديل المحافظة' : 'إنشاء محافظة'} icon="office" maxWidth="md">
            <GovernorateForm data={form.data} setData={form.setData} errors={form.errors} />
        </FormModal>
    );
}
