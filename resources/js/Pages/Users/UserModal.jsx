import FormModal from '@/Components/FormModal';
import { useResourceForm } from '@/hooks/useResourceForm';
import UserForm, { userFormData } from './UserForm';

export default function UserModal({ show, onClose, user, roleOptions, branches, canChooseBranch }) {
    const form = useResourceForm('/users', user, userFormData(user, roleOptions));

    return (
        <FormModal
            show={show}
            onClose={onClose}
            form={form}
            title={form.isEdit ? 'تعديل المستخدم' : 'إنشاء مستخدم'}
            icon="user"
        >
            <UserForm
                data={form.data}
                setData={form.setData}
                errors={form.errors}
                isEdit={form.isEdit}
                roleOptions={roleOptions}
                branches={branches}
                canChooseBranch={canChooseBranch}
            />
        </FormModal>
    );
}
