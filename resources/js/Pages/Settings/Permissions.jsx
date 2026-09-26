import { useEffect, useRef, useState } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import ConfirmDialog from '@/Components/ConfirmDialog';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import { initials } from '@/lib/initials';

/**
 * The matrix's three columns. "Record" (readings, collections) sits in the
 * "add" column, labelled as what it is.
 */
const COLUMNS = [
    { label: 'عرض', actions: ['view'] },
    { label: 'إضافة', actions: ['create', 'record'] },
    { label: 'تعديل', actions: ['update'] },
];

const ACTION_LABELS = { view: 'عرض', create: 'إضافة', update: 'تعديل', record: 'تسجيل' };

/** Permissions shown apart, under their section's row, so nobody grants them by accident. */
const SENSITIVE_ACTIONS = {
    minimum_charge: { label: 'تعديل الحد الأدنى للدفع', hint: 'صلاحية خاصة وحساسة', danger: false },
    confirm: { label: 'تأكيد التحصيل', hint: 'صلاحية حساسة — تُمنح بحذر', danger: true },
    approve: { label: 'اعتماد القراءات', hint: 'تُضاف مبالغها إلى معاملات المشتركين المالية', danger: true },
};

function PermissionCheckbox({ checked, onChange, ariaLabel, disabled }) {
    return <input type="checkbox" checked={checked} onChange={onChange} aria-label={ariaLabel} disabled={disabled} className="h-[18px] w-[18px]" />;
}

/** One section (subscribers, readings…) as a matrix row, with any sensitive permission on its own line below. */
function PermissionGroupRows({ group, isOn, onToggle, disabled }) {
    const entries = group.actions.filter((entry) => entry.permission);
    const sensitive = entries.filter((entry) => SENSITIVE_ACTIONS[entry.action]);

    return (
        <>
            <tr className="border-t border-gray-100">
                <th scope="row" className="py-3.5 pe-4 text-start font-semibold text-gray-900">
                    {group.label}
                </th>
                {COLUMNS.map((column) => {
                    const entry = entries.find((candidate) => column.actions.includes(candidate.action));

                    return (
                        <td key={column.label} className="px-4 py-3.5 text-center">
                            {entry ? (
                                <label className="inline-flex flex-col items-center gap-1">
                                    <PermissionCheckbox
                                        checked={isOn(entry.permission.id)}
                                        onChange={() => onToggle(entry.permission.id)}
                                        ariaLabel={`${group.label}: ${ACTION_LABELS[entry.action] ?? entry.permission.label}`}
                                        disabled={disabled}
                                    />
                                    {entry.action === 'record' && <span className="text-[11px] text-gray-400">تسجيل</span>}
                                </label>
                            ) : (
                                <span className="text-gray-300" aria-hidden="true">
                                    —
                                </span>
                            )}
                        </td>
                    );
                })}
            </tr>
            {sensitive.map((entry) => {
                const { label, hint, danger } = SENSITIVE_ACTIONS[entry.action];

                return (
                    <tr key={entry.permission.id}>
                        <td colSpan={COLUMNS.length + 1} className="pb-3.5">
                            <label
                                className={`flex cursor-pointer items-center justify-between gap-4 rounded-control border px-4 py-2.5 ${
                                    danger ? 'border-brand-500/25 bg-brand-500/10' : 'border-gray-100 bg-gray-50'
                                }`}
                            >
                                <span className="min-w-0">
                                    <span className={`flex items-center gap-1.5 text-sm font-bold ${danger ? 'text-brand-600' : 'text-gray-900'}`}>
                                        {danger && <Icon name="warning" className="h-4 w-4 shrink-0" strokeWidth={2} />}
                                        {label}
                                    </span>
                                    <span className={`block text-xs ${danger ? 'text-brand-600' : 'text-gray-500'}`}>{hint}</span>
                                </span>
                                <PermissionCheckbox
                                    checked={isOn(entry.permission.id)}
                                    onChange={() => onToggle(entry.permission.id)}
                                    ariaLabel={`${group.label}: ${label}`}
                                    disabled={disabled}
                                />
                            </label>
                        </td>
                    </tr>
                );
            })}
        </>
    );
}

/**
 * The "manage permissions" pop-up for one employee: who they are, their
 * permissions as a matrix of checkboxes, and Save/Cancel. Saving asks for
 * confirmation; closing with unsaved changes asks whether to discard them.
 */
function PermissionEditorModal({ employee, permissionGroups, scopedToOwnBranch, onClose }) {
    const saved = employee.permissionIds;
    const { data, setData, put, processing } = useForm({ permissions: { [employee.id]: [...saved] } });
    const [pendingConfirmation, setPendingConfirmation] = useState(null);
    const selected = data.permissions[employee.id];
    const dirty = selected.length !== saved.length || selected.some((id) => !saved.includes(id));
    const groups = permissionGroups.filter((group) => group.actions.some((entry) => entry.permission));

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

    function toggle(permissionId) {
        setData('permissions', {
            [employee.id]: selected.includes(permissionId) ? selected.filter((id) => id !== permissionId) : [...selected, permissionId],
        });
    }

    function requestClose() {
        if (dirty) {
            setPendingConfirmation('discard');
        } else {
            onClose();
        }
    }

    function submit(event) {
        event.preventDefault();

        if (dirty) {
            setPendingConfirmation('save');
        }
    }

    function onKeyDown(event) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.currentTarget.requestSubmit();
        }
    }

    function save() {
        setPendingConfirmation(null);
        put('/settings/permissions', { preserveScroll: true, onSuccess: onClose });
    }

    return (
        <>
            <Modal show onClose={requestClose} maxWidth="2xl">
                <form onSubmit={submit} onKeyDown={onKeyDown} className="flex max-h-[90vh] flex-col">
                    <div className="flex items-center justify-between border-b border-gray-100 px-7 py-5">
                        <h3 className="text-lg font-bold text-gray-900">إدارة الصلاحيات</h3>
                        <button
                            type="button"
                            onClick={requestClose}
                            aria-label="إغلاق"
                            className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900"
                        >
                            <Icon name="close" />
                        </button>
                    </div>

                    <div className="flex items-center gap-4 border-b border-gray-100 bg-gray-50 px-7 py-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-graphite-gradient font-display font-bold text-white dark:ring-1 dark:ring-white/10">
                            {initials(employee.name)}
                        </span>
                        <div className="min-w-0">
                            <p className="truncate font-bold text-gray-900">{employee.name}</p>
                            <p className="truncate text-sm text-gray-500">
                                {employee.roleLabel} · {employee.branchName ?? 'بلا فرع'}
                            </p>
                            <p className="truncate text-xs text-gray-400" dir="ltr">
                                @{employee.username}
                            </p>
                        </div>
                        {dirty && (
                            <span
                                role="status"
                                className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-600"
                            >
                                <Icon name="alert" className="h-4 w-4" strokeWidth={2} />
                                تغييرات غير محفوظة
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto px-7 py-4">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-500">
                                    <th scope="col" className="pb-3 text-start font-semibold">
                                        القسم
                                    </th>
                                    {COLUMNS.map((column) => (
                                        <th key={column.label} scope="col" className="w-24 pb-3 text-center font-semibold">
                                            {column.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map((group) => (
                                    <PermissionGroupRows
                                        key={group.key}
                                        group={group}
                                        isOn={(permissionId) => selected.includes(permissionId)}
                                        onToggle={toggle}
                                        disabled={processing}
                                    />
                                ))}
                            </tbody>
                        </table>

                        <div className="mt-4 flex items-start gap-2.5 rounded-control border border-gray-100 bg-gray-50 px-4 py-3 text-[13px] text-gray-600">
                            <Icon name="info" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-gray-400" />
                            <p>
                                <b className="text-gray-900">ملاحظة: </b>
                                {scopedToOwnBranch
                                    ? 'تظهر هنا الصلاحيات التي تملكها فقط، وتمنحها لموظفي فرعك. صلاحيات الفروع والمحافظات والمناطق يمنحها مدير النظام.'
                                    : 'مدير النظام يملك جميع الصلاحيات تلقائيًا. مدير الفرع يدير صلاحيات موظفي فرعه فقط، ويمنحهم مما يملكه هو.'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-7 py-4">
                        <p className="me-auto hidden text-xs text-gray-400 sm:block">
                            <span dir="ltr">Ctrl + Enter</span> للحفظ
                        </p>
                        <span className="text-xs text-gray-500">تُحفظ الصلاحيات لهذا المستخدم فقط</span>
                        <SecondaryButton onClick={requestClose}>إلغاء</SecondaryButton>
                        <PrimaryButton type="submit" disabled={processing || !dirty}>
                            {processing ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}
                        </PrimaryButton>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                show={pendingConfirmation === 'save'}
                onConfirm={save}
                onCancel={() => setPendingConfirmation(null)}
                title="حفظ الصلاحيات؟"
                message={`سيتم تحديث صلاحيات ${employee.name} بالتغييرات التي أجريتها. هل تريد المتابعة؟`}
                confirmLabel="نعم، احفظ الصلاحيات"
                cancelLabel="مراجعة الصلاحيات"
                icon="shield"
            />

            <ConfirmDialog
                show={pendingConfirmation === 'discard'}
                onConfirm={onClose}
                onCancel={() => setPendingConfirmation(null)}
                title="تجاهل التغييرات؟"
                message={`لديك تعديلات على صلاحيات ${employee.name} لم تُحفظ بعد. إذا أغلقت النافذة الآن فستفقدها.`}
                confirmLabel="تجاهل التغييرات"
                cancelLabel="البقاء ومتابعة التعديل"
                icon="alert"
                tone="danger"
            />
        </>
    );
}

export default function Permissions({ users, selectedUser, permissionGroups, filters, filterOptions, scopedToOwnBranch }) {
    // The employee whose pop-up is open (their permissions arrive as `selectedUser`).
    const [editingId, setEditingId] = useState(null);
    const [loadingId, setLoadingId] = useState(null);
    const { search, setSearch, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/settings/permissions', filters);
    const editing = editingId !== null && selectedUser?.id === editingId ? selectedUser : null;

    /** Loads the employee's current permissions, then opens their pop-up. */
    function openEmployee(user) {
        if (selectedUser?.id === user.id) {
            setEditingId(user.id);
            return;
        }

        setLoadingId(user.id);
        router.get(
            '/settings/permissions',
            {
                search,
                sort: filters.sort,
                direction: filters.direction,
                per_page: filters.per_page,
                filter: filterValues,
                page: users.current_page,
                selected: user.id,
            },
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                only: ['selectedUser'],
                onSuccess: () => setEditingId(user.id),
                onFinish: () => setLoadingId(null),
            },
        );
    }

    return (
        <SettingsLayout
            header={
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">الصلاحيات</h2>
                    <p className="mt-2 text-sm text-gray-500">
                        {scopedToOwnBranch
                            ? 'اختر موظفًا من فرعك لإدارة صلاحياته بشكل مستقل.'
                            : 'اختر مستخدمًا لإدارة صلاحياته بشكل مستقل. يمتلك المدير العام جميع الصلاحيات دائمًا.'}
                    </p>
                </div>
            }
        >
            <Head title="الصلاحيات" />

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو اسم المستخدم..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={users.total}
                filterMenu={
                    <DataTableFilterMenu
                        tableKey="permissions"
                        groups={filterOptions}
                        values={filterValues}
                        onChange={setFilter}
                        onClear={clearFilters}
                    />
                }
            />

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start">
                    <thead>
                        <tr>
                            <th>المستخدم</th>
                            <th>الدور</th>
                            <th>الفرع</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.data.length === 0 ? (
                            <tr>
                                <td className="text-gray-500" colSpan={4}>
                                    لا يوجد موظفون مطابقون.
                                </td>
                            </tr>
                        ) : (
                            users.data.map((user) => (
                                <tr key={user.id}>
                                    <td>
                                        <RowIdentity name={user.name} subtitle={`@${user.username}`} subtitleDir="ltr" />
                                    </td>
                                    <td className="text-gray-600">{user.roleLabel}</td>
                                    <td className="text-gray-600">{user.branchName ?? '—'}</td>
                                    <td className="text-end">
                                        <div className="data-table-actions">
                                            <button
                                                type="button"
                                                className="row-action"
                                                onClick={() => openEmployee(user)}
                                                disabled={loadingId !== null}
                                                aria-busy={loadingId === user.id}
                                            >
                                                <Icon name="shield" className="h-4 w-4" />
                                                إدارة الصلاحيات
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={users} filters={filters} baseUrl="/settings/permissions" />

            {editing && (
                <PermissionEditorModal
                    // A fresh editor per employee and per saved state, so the boxes always start from what's stored.
                    key={`${editing.id}:${editing.permissionIds.join(',')}`}
                    employee={editing}
                    permissionGroups={permissionGroups}
                    scopedToOwnBranch={scopedToOwnBranch}
                    onClose={() => setEditingId(null)}
                />
            )}
        </SettingsLayout>
    );
}
