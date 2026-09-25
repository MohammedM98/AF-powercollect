import FormPage from '@/Components/FormPage';
import { useResourceForm } from '@/hooks/useResourceForm';
import UserForm, { userFormData } from './UserForm';

export default function Edit({ user, roleOptions, branches, canChooseBranch }) {
    const form = useResourceForm('/users', user, userFormData(user, roleOptions));

    return (
        <FormPage title="تعديل المستخدم" form={form} cancelHref="/users">
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
