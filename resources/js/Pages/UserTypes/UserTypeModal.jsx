import FormModal from '@/Components/FormModal';
import { useResourceForm } from '@/hooks/useResourceForm';
import UserTypeForm, { userTypeFormData } from './UserTypeForm';

export default function UserTypeModal({ show, onClose, userType }) {
    const form = useResourceForm('/user-types', userType, userTypeFormData(userType));

    return (
        <FormModal show={show} onClose={onClose} form={form} title={form.isEdit ? 'تعديل نوع المستخدم' : 'إنشاء نوع مستخدم'} icon="users">
            <UserTypeForm data={form.data} setData={form.setData} errors={form.errors} />
        </FormModal>
    );
}
