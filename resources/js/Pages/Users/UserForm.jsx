import { useRef } from 'react';
import FormField from '@/Components/Form/FormField';
import FormPreview, { countFilled } from '@/Components/Form/FormPreview';
import FormSelect, { namedOptions } from '@/Components/Form/FormSelect';
import FormSection from '@/Components/Form/FormSection';
import Icon from '@/Components/Icon';
import InputError from '@/Components/InputError';
import PasswordInput from '@/Components/PasswordInput';
import SearchableSelect from '@/Components/SearchableSelect';
import Switch from '@/Components/Switch';
import TextInput from '@/Components/TextInput';
import { initials } from '@/lib/format';

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
    const name = data.name.trim();
    const userType = userTypeOptions.find((option) => String(option.value) === String(data.user_type_id));
    const branch = branches.find((option) => String(option.id) === String(data.branch_id));
    // A new account needs its password; an existing one keeps theirs unless a new one is typed.
    const requiredFields = ['name', 'username', ...(isEdit ? [] : ['password'])];

    return (
        <div className="space-y-4">
            <FormPreview
                avatar={name ? initials(name) : <Icon name="user" className="h-6 w-6 text-white/70" />}
                dotClass={data.is_active ? 'bg-emerald-500' : 'bg-gray-400'}
                title={name || 'مستخدم جديد'}
                subtitle={data.username.trim() ? `@${data.username.trim()}` : null}
                subtitleDir="ltr"
                chips={[userType?.label, data.role === 'branch_admin' ? 'مدير فرع' : null, branch?.name, data.is_active ? null : 'موقوف'].filter(Boolean)}
                filled={countFilled(data, requiredFields)}
                total={requiredFields.length}
            />

            <FormSection icon="user" title="بيانات الحساب" description="الاسم واسم الدخول وكلمة المرور" columns={2}>
                <FormField id="name" label="الاسم" required error={errors.name}>
                    <TextInput className="block w-full" value={data.name} autoFocus onChange={(e) => setData('name', e.target.value)} />
                </FormField>

                <FormField id="username" label="اسم المستخدم" required error={errors.username}>
                    <TextInput
                        dir="ltr"
                        required
                        pattern="[A-Za-z0-9_.\-]+"
                        data-feedback
                        title="اسم المستخدم بالحروف الإنجليزية والأرقام والرموز . _ - فقط، بلا مسافات"
                        autoComplete="off"
                        className="block w-full"
                        value={data.username}
                        onChange={(e) => setData('username', e.target.value)}
                    />
                </FormField>

                <FormField
                    id="password"
                    label={isEdit ? 'كلمة مرور جديدة (اتركها فارغة للاحتفاظ بالحالية)' : 'كلمة المرور'}
                    required={!isEdit}
                    error={errors.password}
                    hint="10 أحرف على الأقل، وتتضمن حروفًا وأرقامًا."
                >
                    <PasswordInput className="block w-full" value={data.password} onChange={(e) => setData('password', e.target.value)} />
                </FormField>

                <FormField id="password_confirmation" label="تأكيد كلمة المرور">
                    <PasswordInput className="block w-full" value={data.password_confirmation} onChange={(e) => setData('password_confirmation', e.target.value)} />
                </FormField>
            </FormSection>

            <FormSection icon="badge" title="النوع والفرع والحالة" description="ما يفعله المستخدم وأين، وهل حسابه يعمل" columns={2}>
                {canChooseBranch && roleOptions.length > 0 && (
                    <FormSelect
                        id="role"
                        label="الدور الوظيفي"
                        value={data.role}
                        onChange={(value) => setData('role', value)}
                        options={roleOptions}
                        error={errors.role}
                    />
                )}
                {data.role === 'financial_auditor' && (
                    <p className="sm:col-span-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
                        المدقق المالي يتبع الشركة ويراجع كشوف جميع الفروع بحسب صلاحياته. يمكنك تسجيله إداريًا تحت الفرع المركزي؛ نوع المستخدم وحده لا يمنح صلاحية التدقيق.
                    </p>
                )}
                <FormField id="user_type_id" label="نوع المستخدم" error={errors.user_type_id}>
                    <SearchableSelect
                        value={data.user_type_id}
                        onChange={(value) => setData('user_type_id', value)}
                        options={userTypeOptions}
                        placeholder="— اختر نوع المستخدم —"
                        searchPlaceholder="ابحث عن نوع المستخدم..."
                        emptyLabel="لا توجد أنواع مطابقة"
                    />
                </FormField>

                {canChooseBranch && roleOptions.length > 0 && (
                    <FormSelect
                        id="branch_id"
                        label="الفرع"
                        value={data.branch_id}
                        onChange={(value) => setData('branch_id', value)}
                        options={namedOptions(branches)}
                        placeholder="— اختر فرعًا —"
                        emptyMessage="لا توجد فروع بعد — أنشئ فرعًا أولاً"
                        error={errors.branch_id}
                    />
                )}

                {canAssignBranchAdmin && !canChooseBranch && (
                    <div className="sm:col-span-2">
                        <Switch
                            checked={data.role === 'branch_admin'}
                            onChange={(checked) => setData('role', checked ? 'branch_admin' : staffRole.current)}
                            label="مدير الفرع"
                            ariaLabel="مدير الفرع"
                        />
                        <p className="mt-1 text-xs text-gray-500">يمكنه إدارة صلاحيات موظفي فرعه.</p>
                        <InputError message={errors.role} className="mt-1" />
                    </div>
                )}

                <div className="sm:col-span-2">
                    <Switch checked={data.is_active} onChange={(checked) => setData('is_active', checked)} label="حساب نشط" ariaLabel="حساب نشط" />
                    <p className="mt-1 text-xs text-gray-500">الحساب الموقوف لا يستطيع تسجيل الدخول.</p>
                    <InputError message={errors.is_active} className="mt-1" />
                </div>
            </FormSection>
        </div>
    );
}
