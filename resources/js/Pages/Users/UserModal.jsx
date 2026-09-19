import { useForm } from '@inertiajs/react';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import UserForm from './UserForm';

export default function UserModal({ show, onClose, user, branches, canChooseBranch, roleOptions }) {
    const isEdit = Boolean(user);

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm(
        isEdit
            ? {
                  name: user.name,
                  username: user.username,
                  password: '',
                  password_confirmation: '',
                  role: user.role,
                  branch_id: user.branch_id ?? '',
                  is_active: user.is_active,
              }
            : {
                  name: '',
                  username: '',
                  password: '',
                  password_confirmation: '',
                  role: roleOptions[0]?.value ?? '',
                  branch_id: '',
                  is_active: true,
              },
    );

    function close() {
        clearErrors();
        reset();
        onClose();
    }

    function submit(e) {
        e.preventDefault();

        const options = { preserveScroll: true, onSuccess: close };

        if (isEdit) {
            put(`/users/${user.id}`, options);
        } else {
            post('/users', options);
        }
    }

    return (
        <Modal show={show} onClose={close} maxWidth="lg">
            <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="1.5"
                                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                                />
                            </svg>
                        </span>
                        <h3 className="text-lg font-bold text-gray-900">{isEdit ? 'تعديل المستخدم' : 'إنشاء مستخدم'}</h3>
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    <UserForm
                        data={data}
                        setData={setData}
                        errors={errors}
                        isEdit={isEdit}
                        roleOptions={roleOptions}
                        branches={branches}
                        canChooseBranch={canChooseBranch}
                    />
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <SecondaryButton onClick={close}>إلغاء</SecondaryButton>
                    <PrimaryButton disabled={processing}>{processing ? 'جارٍ الحفظ...' : 'حفظ'}</PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}
