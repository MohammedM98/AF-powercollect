import { useEffect, useRef } from 'react';
import { useForm } from '@inertiajs/react';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';

const ACTION_LABELS = { view: 'عرض', create: 'إضافة', update: 'تعديل', minimum_charge: 'تعديل الحد الأدنى للدفع', record: 'تسجيل', confirm: 'تأكيد' };
const STANDARD_ACTIONS = ['view', 'create', 'update'];

export default function PermissionModal({ user, permissionGroups, onClose }) {
    const { data, setData, put, processing, errors } = useForm({ permissions: { [user.id]: [...user.permissionIds] } });
    const panel = useRef(null);
    const selected = data.permissions[user.id];
    const dirty = selected.length !== user.permissionIds.length || selected.some((id) => !user.permissionIds.includes(id));
    const extraPermissions = permissionGroups.flatMap((group) =>
        group.actions
            .filter((entry) => !STANDARD_ACTIONS.includes(entry.action) && entry.permission)
            .map((entry) => ({ ...entry, groupLabel: group.label })),
    );

    useEffect(() => {
        const previousFocus = document.activeElement;
        panel.current?.querySelector('button')?.focus();
        return () => previousFocus?.focus();
    }, []);

    useEffect(() => {
        if (!dirty) {
            return;
        }
        function warnBeforeUnload(event) {
            event.preventDefault();
            event.returnValue = '';
        }
        window.addEventListener('beforeunload', warnBeforeUnload);
        return () => window.removeEventListener('beforeunload', warnBeforeUnload);
    }, [dirty]);

    function close() {
        if (processing) {
            return;
        }
        if (dirty && !window.confirm('لديك تغييرات غير محفوظة. هل تريد تجاهلها؟')) {
            return;
        }
        onClose();
    }

    function toggle(permissionId) {
        setData('permissions', {
            [user.id]: selected.includes(permissionId) ? selected.filter((id) => id !== permissionId) : [...selected, permissionId],
        });
    }

    function submit(event) {
        event.preventDefault();
        put('/settings/permissions', { preserveScroll: true, onSuccess: onClose });
    }

    function trapFocus(event) {
        if (event.key !== 'Tab') {
            return;
        }
        const controls = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    }

    function checkbox(entry, label) {
        return entry?.permission ? (
            <input
                type="checkbox"
                aria-label={label}
                checked={selected.includes(entry.permission.id)}
                disabled={processing}
                onChange={() => toggle(entry.permission.id)}
                className="h-4 w-4 rounded text-brand-600 disabled:opacity-50"
            />
        ) : (
            <span className="text-gray-300" aria-label="غير متاح">
                —
            </span>
        );
    }

    return (
        <Modal show onClose={close} maxWidth="2xl">
            <form
                ref={panel}
                onSubmit={submit}
                onKeyDown={trapFocus}
                role="dialog"
                aria-modal="true"
                aria-labelledby="permission-modal-title"
                className="flex max-h-[85vh] flex-col"
            >
                <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
                    <h3 id="permission-modal-title" className="text-lg font-bold text-gray-900">
                        إدارة الصلاحيات
                    </h3>
                    <button
                        type="button"
                        onClick={close}
                        disabled={processing}
                        aria-label="إغلاق"
                        className="rounded-full px-3 py-1.5 text-gray-500 hover:bg-gray-100"
                    >
                        ✕
                    </button>
                </div>
                <div className="flex items-center gap-3 bg-brand-50 px-6 py-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold text-white">
                        {user.name.substring(0, 1)}
                    </span>
                    <div className="min-w-0">
                        <div className="break-words font-semibold text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-600">
                            {user.roleLabel} · {user.branchName ?? 'بلا فرع'}
                        </div>
                        <div className="text-start text-xs text-gray-500" dir="ltr">
                            @{user.username}
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 text-gray-500">
                                <th className="py-3 text-start font-medium">القسم</th>
                                {STANDARD_ACTIONS.map((action) => (
                                    <th key={action} className="px-2 py-3 font-medium">
                                        {ACTION_LABELS[action]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {permissionGroups.map((group) => (
                                <tr key={group.key} className="border-b border-gray-100">
                                    <th scope="row" className="py-4 text-start font-medium text-gray-900">
                                        {group.label}
                                    </th>
                                    {STANDARD_ACTIONS.map((action) => (
                                        <td key={action} className="px-2 py-4 text-center">
                                            {checkbox(
                                                group.actions.find((entry) => entry.action === action),
                                                `${group.label}: ${ACTION_LABELS[action]}`,
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {extraPermissions.length > 0 && (
                        <div className="flex flex-col gap-4 py-5">
                            <h4 className="font-semibold text-gray-900">صلاحيات إضافية</h4>
                            {extraPermissions.map((entry) => (
                                <label key={entry.permission.id} className="flex items-center gap-3 text-sm text-gray-700">
                                    {checkbox(entry, `${entry.groupLabel}: ${ACTION_LABELS[entry.action] ?? entry.permission.label}`)}
                                    <span>
                                        {ACTION_LABELS[entry.action] ?? entry.permission.label}
                                        <span className="block text-xs text-gray-500">{entry.groupLabel}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}
                    {Object.values(errors).length > 0 && (
                        <div role="alert" className="py-3 text-sm text-red-600">
                            {Object.values(errors).flat().join(' ')}
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <span aria-live="polite" className="text-xs text-gray-500">
                        {dirty ? 'تغييرات غير محفوظة' : 'تُحفظ الصلاحيات لهذا المستخدم فقط'}
                    </span>
                    <div className="flex gap-3">
                        <SecondaryButton onClick={close} disabled={processing}>
                            إلغاء
                        </SecondaryButton>
                        <PrimaryButton type="submit" disabled={processing || !dirty}>
                            {processing ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}
                        </PrimaryButton>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
