import { Head, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import UserForm from './UserForm';

export default function Create({ branches, canChooseBranch, roleOptions }) {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        username: '',
        password: '',
        password_confirmation: '',
        role: roleOptions[0]?.value ?? '',
        branch_id: '',
        is_active: true,
    });

    function submit(e) {
        e.preventDefault();
        post('/users');
    }

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">إنشاء مستخدم</h2>}>
            <Head title="إنشاء مستخدم" />

            <div className="max-w-2xl">
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <form onSubmit={submit}>
                        <UserForm
                            data={data}
                            setData={setData}
                            errors={errors}
                            isEdit={false}
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
