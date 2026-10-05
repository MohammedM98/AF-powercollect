import FormPage from '@/Components/FormPage';
import SettingsLayout from '@/Layouts/SettingsLayout';
import { useResourceForm } from '@/hooks/useResourceForm';
import TariffForm, { tariffFormData } from './TariffForm';

export default function Create() {
    const form = useResourceForm('/tariffs', null, tariffFormData(null));

    return (
        <FormPage layout={SettingsLayout} title="إنشاء تعرفة" form={form} cancelHref="/tariffs">
            <TariffForm data={form.data} setData={form.setData} errors={form.errors} />
        </FormPage>
    );
}
