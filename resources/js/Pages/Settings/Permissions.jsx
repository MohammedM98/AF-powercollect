import { useEffect, useRef } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import Icon from '@/Components/Icon';
import Switch from '@/Components/Switch';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';

const UNSAVED_WARNING = 'لديك تغييرات غير محفوظة. هل تريد تجاهلها؟';

const ACTION_LABELS = { view: 'عرض', create: 'إضافة', update: 'تعديل', record: 'تسجيل' };

/** Permissions shown apart, in their own box, so nobody grants them by accident. */
const SENSITIVE_ACTIONS = {
    minimum_charge: { label: 'تعديل الحد الأدنى للدفع', hint: 'صلاحية خاصة وحساسة', danger: false },
    confirm: { label: 'تأكيد التحصيل', hint: 'صلاحية حساسة — تُمنح بحذر', danger: true },
};

/** The icon and one-line description of each permission group (keyed like PermissionKey::resourceGroups()). */
const GROUP_DETAILS = {
    branches: { icon: 'pin', description: 'إدارة فروع الشركة' },
    users: { icon: 'user', description: 'إدارة حسابات المستخدمين' },
    subscribers: { icon: 'users', description: 'إدارة بيانات المشتركين' },
    tariffs: { icon: 'dollar', description: 'إدارة أسعار التعرفات' },
    meter_boxes: { icon: 'table', description: 'إدارة الطبلونات' },
    circuit_breakers: { icon: 'bolt', description: 'إدارة القواطع' },
    areas: { icon: 'map', description: 'إدارة المناطق' },
    sub_areas: { icon: 'map', description: 'إدارة منطقة 2 داخل منطقة الفرع' },
    governorates: { icon: 'map', description: 'إدارة المحافظات' },
    meter_readings: { icon: 'chart', description: 'إدارة قراءات العدادات' },
    collections: { icon: 'card', description: 'إدارة عمليات التحصيل' },
};

/** The first option of each filter dropdown. */
const ALL_OPTION_LABELS = { role: 'جميع الوظائف', branch_id: 'جميع الفروع' };

function EmployeeAvatar({ name, size = 'md' }) {
    const sizes = { md: 'h-11 w-11 rounded-[14px] text-sm', lg: 'h-14 w-14 rounded-[18px] text-lg' };

    return (
        <span
            className={`flex shrink-0 items-center justify-center bg-graphite-gradient font-display font-bold text-white dark:ring-1 dark:ring-white/10 ${sizes[size]}`}
        >
            {(name ?? '').trim().substring(0, 1)}
        </span>
    );
}

/**
 * The right-hand panel: search, the job and branch filters, and the
 * employees to pick from. The selected one is highlighted.
 */
function EmployeeList({ users, selectedId, filters, filterOptions, search, onSearchChange, filterValues, onFilterChange, onSelect }) {
    return (
        <aside className="rise-in rounded-card border border-gray-100 bg-surface p-5 shadow-card lg:sticky lg:top-24">
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-500">
                    <Icon name="users" className="h-5 w-5" />
                </span>
                <div>
                    <h3 className="text-lg font-bold text-gray-900">الموظفون</h3>
                    <p className="text-sm text-gray-500">اختر موظفًا لتعديل صلاحياته</p>
                </div>
            </div>

            <div className="mt-5 space-y-3">
                <div className="relative">
                    <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="البحث عن موظف..."
                        aria-label="البحث عن موظف بالاسم أو اسم المستخدم"
                        className="block w-full py-2.5 ps-10 text-sm"
                    />
                </div>
                {filterOptions.map((group) => (
                    <select
                        key={group.key}
                        value={filterValues[group.key] ?? ''}
                        onChange={(event) => onFilterChange(group.key, event.target.value)}
                        aria-label={group.label}
                        className="block w-full py-2.5 text-sm"
                    >
                        <option value="">{ALL_OPTION_LABELS[group.key] ?? group.label}</option>
                        {group.options.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                ))}
            </div>

            <p className="mt-5 text-sm text-gray-500">
                <b className="font-display font-bold text-gray-900">{users.total.toLocaleString('en')}</b> موظف
            </p>

            {users.data.length === 0 ? (
                <p className="mt-3 rounded-row border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                    لا يوجد موظفون مطابقون.
                </p>
            ) : (
                <ul className="mt-3 space-y-2">
                    {users.data.map((user) => {
                        const isSelected = user.id === selectedId;

                        return (
                            <li key={user.id}>
                                <button
                                    type="button"
                                    onClick={() => onSelect(user)}
                                    aria-current={isSelected ? 'true' : undefined}
                                    className={`flex w-full items-center gap-3 rounded-row border p-3 text-start transition focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${
                                        isSelected
                                            ? 'border-brand-300 bg-brand-50 shadow-sm'
                                            : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    <EmployeeAvatar name={user.name} />
                                    <span className="min-w-0">
                                        <span className={`block truncate font-semibold ${isSelected ? 'text-brand-700' : 'text-gray-900'}`}>
                                            {user.name}
                                        </span>
                                        <span className="block truncate text-[12.5px] text-gray-500">
                                            {user.roleLabel} · {user.branchName ?? 'بلا فرع'}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {users.last_page > 1 && (
                <div className="mt-4">
                    <Pagination meta={users} filters={filters} baseUrl="/settings/permissions" extraParams={{ selected: selectedId }} />
                </div>
            )}
        </aside>
    );
}

/** One section (subscribers, readings…): its name, its everyday switches and any sensitive ones set apart. */
function PermissionGroupRow({ group, isOn, onToggle, disabled }) {
    const details = GROUP_DETAILS[group.key] ?? { icon: 'shield', description: '' };
    const entries = group.actions.filter((entry) => entry.permission);
    const everyday = entries.filter((entry) => !SENSITIVE_ACTIONS[entry.action]);
    const sensitive = entries.filter((entry) => SENSITIVE_ACTIONS[entry.action]);

    return (
        <section className="rounded-row border border-gray-100 bg-surface p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="flex min-w-0 items-center gap-3 lg:w-56 lg:shrink-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-500">
                        <Icon name={details.icon} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <h4 className="font-bold text-gray-900">{group.label}</h4>
                        {details.description && <p className="text-[12.5px] text-gray-500">{details.description}</p>}
                    </div>
                </div>

                <div className="flex flex-1 flex-wrap items-center gap-x-7 gap-y-3">
                    {everyday.map((entry) => (
                        <Switch
                            key={entry.permission.id}
                            checked={isOn(entry.permission.id)}
                            onChange={() => onToggle(entry.permission.id)}
                            label={ACTION_LABELS[entry.action] ?? entry.permission.label}
                            ariaLabel={`${group.label}: ${ACTION_LABELS[entry.action] ?? entry.permission.label}`}
                            disabled={disabled}
                        />
                    ))}
                </div>
            </div>

            {sensitive.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3 lg:ps-60">
                    {sensitive.map((entry) => {
                        const { label, hint, danger } = SENSITIVE_ACTIONS[entry.action];

                        return (
                            <div
                                key={entry.permission.id}
                                className={`flex w-full items-center justify-between gap-4 rounded-control border px-4 py-2.5 sm:w-auto sm:min-w-[17rem] ${
                                    danger ? 'border-brand-200 bg-brand-50' : 'border-gray-100 bg-gray-50'
                                }`}
                            >
                                <div className="min-w-0">
                                    <p className={`flex items-center gap-1.5 text-sm font-bold ${danger ? 'text-brand-700' : 'text-gray-900'}`}>
                                        {danger && <Icon name="warning" className="h-4 w-4 shrink-0" strokeWidth={2} />}
                                        {label}
                                    </p>
                                    <p className={`text-xs ${danger ? 'text-brand-600' : 'text-gray-500'}`}>{hint}</p>
                                </div>
                                <Switch
                                    checked={isOn(entry.permission.id)}
                                    onChange={() => onToggle(entry.permission.id)}
                                    ariaLabel={`${group.label}: ${label}`}
                                    disabled={disabled}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

/**
 * The left-hand panel: who is being edited, their permissions as switches,
 * and Save/Cancel. Unsaved changes are announced at the top and guard
 * against leaving the page by accident.
 */
function PermissionEditor({ employee, permissionGroups, scopedToOwnBranch, onDirtyChange }) {
    const saved = employee.permissionIds;
    const { data, setData, put, processing, reset } = useForm({ permissions: { [employee.id]: [...saved] } });
    const selected = data.permissions[employee.id];
    const dirty = selected.length !== saved.length || selected.some((id) => !saved.includes(id));
    const groups = permissionGroups.filter((group) => group.actions.some((entry) => entry.permission));

    useEffect(() => {
        onDirtyChange(dirty);
    }, [dirty, onDirtyChange]);

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

    function save(event) {
        event.preventDefault();
        put('/settings/permissions', { preserveScroll: true });
    }

    return (
        <form onSubmit={save} className="rise-in rounded-card border border-gray-100 bg-surface shadow-card">
            <div className="p-5 sm:p-6">
                {dirty && (
                    <div role="status" className="mb-5 flex items-start gap-3 rounded-control border border-brand-200 bg-brand-50 px-4 py-3">
                        <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" strokeWidth={2} />
                        <div>
                            <p className="font-bold text-brand-700">تغييرات غير محفوظة</p>
                            <p className="text-sm text-brand-600">هناك تعديلات على الصلاحيات لم تُحفظ بعد.</p>
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-5 border-b border-gray-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <EmployeeAvatar name={employee.name} size="lg" />
                        <div className="min-w-0">
                            <h3 className="break-words text-xl font-bold text-gray-900">{employee.name}</h3>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                                <span>{employee.roleLabel}</span>
                                <span className="inline-flex items-center gap-1">
                                    <Icon name="office" className="h-4 w-4" />
                                    {employee.branchName ?? 'بلا فرع'}
                                </span>
                            </p>
                        </div>
                    </div>
                    <dl className="hidden grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm sm:grid">
                        <dt className="text-gray-500">الاسم الكامل</dt>
                        <dd className="font-semibold text-gray-900">{employee.name}</dd>
                        <dt className="text-gray-500">الوظيفة</dt>
                        <dd className="font-semibold text-gray-900">{employee.roleLabel}</dd>
                        <dt className="text-gray-500">الفرع</dt>
                        <dd className="font-semibold text-gray-900">{employee.branchName ?? '—'}</dd>
                        <dt className="text-gray-500">اسم المستخدم</dt>
                        <dd className="font-semibold text-gray-900" dir="ltr">
                            @{employee.username}
                        </dd>
                    </dl>
                </div>

                <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">صلاحيات النظام</h3>
                        <p className="text-sm text-gray-500">فعّل ما يحتاجه الموظف لعمله فقط.</p>
                    </div>
                    <span className="data-chip">{selected.length.toLocaleString('en')} مفعّلة</span>
                </div>

                <div className="mt-4 space-y-3">
                    {groups.map((group) => (
                        <PermissionGroupRow
                            key={group.key}
                            group={group}
                            isOn={(permissionId) => selected.includes(permissionId)}
                            onToggle={toggle}
                            disabled={processing}
                        />
                    ))}
                </div>

                <div className="mt-5 flex items-start gap-2.5 rounded-control border border-gray-100 bg-gray-50 px-4 py-3 text-[13px] text-gray-600">
                    <Icon name="info" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-gray-400" />
                    <p>
                        <b className="text-gray-900">ملاحظة: </b>
                        {scopedToOwnBranch
                            ? 'تظهر هنا الصلاحيات التي تملكها فقط، وتمنحها لموظفي فرعك. صلاحيات الفروع والمحافظات والمناطق يمنحها مدير النظام.'
                            : 'مدير النظام يملك جميع الصلاحيات تلقائيًا. مدير الفرع يدير صلاحيات موظفي فرعه فقط، ويمنحهم مما يملكه هو.'}
                    </p>
                </div>
            </div>

            <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-b-card border-t border-gray-100 bg-surface/90 px-5 py-4 backdrop-blur sm:px-6">
                <PrimaryButton type="submit" disabled={processing || !dirty}>
                    <Icon name="check" className="h-4 w-4" strokeWidth={2} />
                    {processing ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}
                </PrimaryButton>
                <SecondaryButton onClick={() => reset()} disabled={processing || !dirty}>
                    إلغاء
                </SecondaryButton>
                <span className="text-xs text-gray-500">تُحفظ الصلاحيات لهذا الموظف فقط.</span>
            </div>
        </form>
    );
}

export default function Permissions({ users, selectedUser, permissionGroups, filters, filterOptions, scopedToOwnBranch }) {
    const hasUnsavedChanges = useRef(false);
    const editorRef = useRef(null);
    const { search, setSearch, filterValues, setFilter } = useDataTable('/settings/permissions', filters, { selected: selectedUser?.id });

    function selectEmployee(user) {
        if (user.id === selectedUser?.id || (hasUnsavedChanges.current && !window.confirm(UNSAVED_WARNING))) {
            return;
        }

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
                onSuccess: () => {
                    // On narrow screens the editor sits below the list: bring it into view.
                    if (window.innerWidth < 1024) {
                        editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                },
            },
        );
    }

    return (
        <SettingsLayout
            header={
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">إدارة صلاحيات الموظفين</h2>
                    <p className="mt-1 text-sm text-gray-500">اختر موظفًا من القائمة، ثم فعّل صلاحياته أو أوقفها.</p>
                </div>
            }
        >
            <Head title="الصلاحيات" />

            <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
                <EmployeeList
                    users={users}
                    selectedId={selectedUser?.id}
                    filters={filters}
                    filterOptions={filterOptions}
                    search={search}
                    onSearchChange={setSearch}
                    filterValues={filterValues}
                    onFilterChange={setFilter}
                    onSelect={selectEmployee}
                />

                <div ref={editorRef} className="scroll-mt-24">
                    {selectedUser ? (
                        <PermissionEditor
                            // A fresh editor per employee and per saved state, so the switches always start from what's stored.
                            key={`${selectedUser.id}:${selectedUser.permissionIds.join(',')}`}
                            employee={selectedUser}
                            permissionGroups={permissionGroups}
                            scopedToOwnBranch={scopedToOwnBranch}
                            onDirtyChange={(dirty) => (hasUnsavedChanges.current = dirty)}
                        />
                    ) : (
                        <div className="flex min-h-[20rem] flex-col items-center justify-center rounded-card border border-dashed border-gray-200 bg-surface p-8 text-center">
                            <Icon name="shield" className="h-10 w-10 text-gray-300" />
                            <p className="mt-3 text-sm font-medium text-gray-600">لا يوجد موظفون لإدارة صلاحياتهم.</p>
                        </div>
                    )}
                </div>
            </div>
        </SettingsLayout>
    );
}
