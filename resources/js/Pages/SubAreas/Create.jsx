import FormPage from '@/Components/FormPage';
import { useResourceForm } from '@/hooks/useResourceForm';
import SubAreaForm, { subAreaFormData } from './SubAreaForm';

export default function Create({ areas }) {
    const form = useResourceForm('/sub-areas', null, subAreaFormData(null));

    return (
        <FormPage title="إنشاء منطقة 2" form={form} cancelHref="/governorates">
            <SubAreaForm data={form.data} setData={form.setData} errors={form.errors} areas={areas} />
        </FormPage>
    );
}
