import FormModal from '@/Components/FormModal';
import { useResourceForm } from '@/hooks/useResourceForm';
import TariffForm, { tariffFormData } from './TariffForm';

export default function TariffModal({ show, onClose, tariff }) {
    const form = useResourceForm('/tariffs', tariff, tariffFormData(tariff));

    return (
        <FormModal show={show} onClose={onClose} form={form} title={form.isEdit ? 'تعديل التعرفة' : 'إنشاء تعرفة'} icon="currency">
            <TariffForm data={form.data} setData={form.setData} errors={form.errors} />
        </FormModal>
    );
}
