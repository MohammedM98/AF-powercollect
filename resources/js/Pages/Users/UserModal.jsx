import FormModal from '@/Components/FormModal';
import { useResourceForm } from '@/hooks/useResourceForm';
import UserForm, { userFormData } from './UserForm';

export default function UserModal({ show, onClose, user, roleOptions, branches, canChooseBranch, userTypeOptions }) {
    const form = useResourceForm('/users', user, userFormData(user));

    return (
        <FormModal show={show} onClose={onClose} form={form} title={form.isEdit ? 'تعديل المستخدم' : 'إنشاء مستخدم'} icon="user" maxWidth="3xl">
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
        </FormModal>
    );
}
