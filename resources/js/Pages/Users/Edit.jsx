import FormPage from '@/Components/FormPage';
import { useResourceForm } from '@/hooks/useResourceForm';
import UserForm, { userFormData } from './UserForm';

export default function Edit({ user, roleOptions, branches, canChooseBranch, userTypeOptions }) {
    const form = useResourceForm('/users', user, userFormData(user));

    return (
        <FormPage title="تعديل المستخدم" form={form} cancelHref="/users" widthClass="max-w-4xl">
            <UserForm
                data={form.data}
                setData={form.setData}
                errors={form.errors}
                isEdit={form.isEdit}
                roleOptions={roleOptions}
                userTypeOptions={userTypeOptions}
                branches={branches}
                canChooseBranch={canChooseBranch}
            />
        </FormPage>
    );
}
