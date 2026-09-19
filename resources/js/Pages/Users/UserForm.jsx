import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

export default function UserForm({ data, setData, errors, isEdit, roleOptions, branches, canChooseBranch }) {
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
                <TextInput
                    id="password"
                    type="password"
                    className="mt-1 block w-full"
                    value={data.password}
                    onChange={(e) => setData('password', e.target.value)}
                />
                <InputError message={errors.password} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="password_confirmation" value="تأكيد كلمة المرور" />
                <TextInput
                    id="password_confirmation"
                    type="password"
                    className="mt-1 block w-full"
                    value={data.password_confirmation}
                    onChange={(e) => setData('password_confirmation', e.target.value)}
                />
            </div>

            {roleOptions.length > 0 ? (
                <>
                    <div className="mt-4">
                        <InputLabel htmlFor="role" value="الدور" />
                        <select
                            id="role"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                            value={data.role}
                            onChange={(e) => setData('role', e.target.value)}
                        >
                            {roleOptions.map((role) => (
                                <option key={role.value} value={role.value}>
                                    {role.label}
                                </option>
                            ))}
                        </select>
                        <InputError message={errors.role} className="mt-2" />
                    </div>

                    {canChooseBranch && (
                        <div className="mt-4">
                            <InputLabel htmlFor="branch_id" value="الفرع" />
                            {branches.length === 0 ? (
                                <p className="mt-1 text-sm text-gray-500">لا توجد فروع بعد — أنشئ فرعًا أولاً.</p>
                            ) : (
                                <select
                                    id="branch_id"
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                                    value={data.branch_id}
                                    onChange={(e) => setData('branch_id', e.target.value)}
                                >
                                    <option value="">— اختر فرعًا —</option>
                                    {branches.map((branch) => (
                                        <option key={branch.id} value={branch.id}>
                                            {branch.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <InputError message={errors.branch_id} className="mt-2" />
                        </div>
                    )}
                </>
            ) : (
                <p className="mt-4 text-sm text-gray-500">سينتمي هذا المستخدم إلى فرعك.</p>
            )}

            <div className="mt-4 flex items-center">
                <input
                    type="checkbox"
                    id="is_active"
                    className="rounded border-gray-300 text-brand-600 shadow-sm"
                    checked={data.is_active}
                    onChange={(e) => setData('is_active', e.target.checked)}
                />
                <InputLabel htmlFor="is_active" value="نشط" className="!mb-0 ms-2" />
            </div>
        </>
    );
}
