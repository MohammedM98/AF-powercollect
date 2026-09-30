import { useRef } from 'react';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import PasswordInput from '@/Components/PasswordInput';
import InputError from '@/Components/InputError';
import SearchableSelect from '@/Components/SearchableSelect';

/**
 * The form's starting values: the user's own when editing (with the
 * password left blank, meaning "unchanged"), otherwise blank for
 * a regular staff account with permissions assigned separately.
 */
export function userFormData(user) {
    return {
        name: user?.name ?? '',
        user_type_id: user?.user_type_id ?? '',
        username: user?.username ?? '',
        password: '',
        password_confirmation: '',
        role: user?.role ?? 'collector',
        branch_id: user?.branch_id ?? '',
        is_active: user?.is_active ?? true,
    };
}

export default function UserForm({ data, setData, errors, isEdit, roleOptions, branches, canChooseBranch, userTypeOptions = [] }) {
    const staffRole = useRef(data.role === 'branch_admin' ? 'collector' : data.role);
    const canAssignBranchAdmin = roleOptions.some((option) => option.value === 'branch_admin');

    return (
        <>
            <div>
                <InputLabel htmlFor="name" value="الاسم" />
                <TextInput id="name" className="mt-1 block w-full" value={data.name} autoFocus onChange={(e) => setData('name', e.target.value)} />
                <InputError message={errors.name} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="username" value="اسم المستخدم" />
                <TextInput
                    id="username"
                    dir="ltr"
                    className="mt-1 block w-full"
                    value={data.username}
                    onChange={(e) => setData('username', e.target.value)}
                />
                <InputError message={errors.username} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="password" value={isEdit ? 'كلمة مرور جديدة (اتركها فارغة للاحتفاظ بالحالية)' : 'كلمة المرور'} />
                <PasswordInput
                    id="password"
                    className="mt-1 block w-full"
                    value={data.password}
                    onChange={(e) => setData('password', e.target.value)}
                />
                <InputError message={errors.password} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="password_confirmation" value="تأكيد كلمة المرور" />
                <PasswordInput
                    id="password_confirmation"
                    className="mt-1 block w-full"
                    value={data.password_confirmation}
                    onChange={(e) => setData('password_confirmation', e.target.value)}
                />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="user_type_id" value="نوع المستخدم" />
                <SearchableSelect
                    id="user_type_id"
                    className="mt-1"
                    value={data.user_type_id}
                    onChange={(value) => setData('user_type_id', value)}
                    options={userTypeOptions}
                    placeholder="— اختر نوع المستخدم —"
                    searchPlaceholder="ابحث عن نوع المستخدم..."
                    emptyLabel="لا توجد أنواع مطابقة"
                />
                <InputError message={errors.user_type_id} className="mt-2" />
            </div>

            {canAssignBranchAdmin && (
                <div className="mt-4">
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="branch_admin"
                            className="rounded text-brand-600"
                            checked={data.role === 'branch_admin'}
                            onChange={(event) => setData('role', event.target.checked ? 'branch_admin' : staffRole.current)}
                        />
                        <InputLabel htmlFor="branch_admin" value="مدير الفرع" className="!mb-0" />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">يمكنه إدارة صلاحيات موظفي فرعه.</p>
                    <InputError message={errors.role} className="mt-2" />
                </div>
            )}

            {canChooseBranch && roleOptions.length > 0 && (
                <div className="mt-4">
                    <InputLabel htmlFor="branch_id" value="الفرع" />
                    {branches.length === 0 ? (
                        <p className="mt-1 text-sm text-gray-500">لا توجد فروع بعد — أنشئ فرعًا أولاً.</p>
                    ) : (
                        <select
                            id="branch_id"
                            className="mt-1 block w-full"
                            value={data.branch_id}
                            onChange={(event) => setData('branch_id', event.target.value)}
                        >
                            <option value="">— اختر فرعًا —</option>
                            {branches.map((branch) => (
                                <option key={branch.id} value={branch.id}>{branch.name}</option>
                            ))}
                        </select>
                    )}
                    <InputError message={errors.branch_id} className="mt-2" />
                </div>
            )}

            <div className="mt-4 flex items-center">
                <input
                    type="checkbox"
                    id="is_active"
                    className="rounded text-brand-600"
                    checked={data.is_active}
                    onChange={(e) => setData('is_active', e.target.checked)}
                />
                <InputLabel htmlFor="is_active" value="نشط" className="!mb-0 ms-2" />
            </div>
        </>
    );
}
