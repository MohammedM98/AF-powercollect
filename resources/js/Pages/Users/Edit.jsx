import { Head, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import UserForm from './UserForm';

export default function Edit({ user, branches, canChooseBranch, roleOptions }) {
    const { data, setData, put, processing, errors } = useForm({
        name: user.name,
        username: user.username,
        password: '',
        password_confirmation: '',
        role: user.role,
        branch_id: user.branch_id ?? '',
        is_active: user.is_active,
    });

    function submit(e) {
        e.preventDefault();
        put(`/users/${user.id}`);
    }

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">تعديل المستخدم</h2>}>
            <Head title="تعديل المستخدم" />

            <div className="max-w-2xl">
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <form onSubmit={submit}>
                        <UserForm
                            data={data}
                            setData={setData}
                            errors={errors}
                            isEdit
                            roleOptions={roleOptions}
                            branches={branches}
                            canChooseBranch={canChooseBranch}
                        />

                        <div className="mt-6 flex items-center gap-4">
                            <PrimaryButton disabled={processing}>حفظ</PrimaryButton>
                            <a href="/users" className="text-sm text-gray-600 underline">
                                إلغاء
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
