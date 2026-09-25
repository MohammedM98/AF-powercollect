import FormPage from '@/Components/FormPage';
import { useResourceForm } from '@/hooks/useResourceForm';
import UserForm, { userFormData } from './UserForm';

export default function Create({ roleOptions, branches, canChooseBranch }) {
    const form = useResourceForm('/users', null, userFormData(null, roleOptions));

    return (
        <FormPage title="إنشاء مستخدم" form={form} cancelHref="/users">
            <UserForm
                data={form.data}
                setData={form.setData}
                errors={form.errors}
                isEdit={form.isEdit}
                roleOptions={roleOptions}
                branches={branches}
                canChooseBranch={canChooseBranch}
            />
        </FormPage>
    );
}
