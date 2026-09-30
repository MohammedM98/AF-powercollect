import FormPage from '@/Components/FormPage';
import SettingsLayout from '@/Layouts/SettingsLayout';
import { useResourceForm } from '@/hooks/useResourceForm';
import UserTypeForm, { userTypeFormData } from './UserTypeForm';

export default function Create() {
    const form = useResourceForm('/user-types', null, userTypeFormData(null));

    return (
        <FormPage layout={SettingsLayout} title="إنشاء نوع مستخدم" form={form} cancelHref="/user-types">
            <UserTypeForm data={form.data} setData={form.setData} errors={form.errors} />
        </FormPage>
    );
}
