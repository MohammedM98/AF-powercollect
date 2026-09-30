import FormPage from '@/Components/FormPage';
import SettingsLayout from '@/Layouts/SettingsLayout';
import { useResourceForm } from '@/hooks/useResourceForm';
import UserTypeForm, { userTypeFormData } from './UserTypeForm';

export default function Edit({ userType }) {
    const form = useResourceForm('/user-types', userType, userTypeFormData(userType));

    return (
        <FormPage layout={SettingsLayout} title="تعديل نوع المستخدم" form={form} cancelHref="/user-types">
            <UserTypeForm data={form.data} setData={form.setData} errors={form.errors} />
        </FormPage>
    );
}
