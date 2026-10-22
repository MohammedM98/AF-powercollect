import { useEffect, useMemo, useRef, useState } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import AuditAccessCard, { AuditWorkSummary, auditSettingsChanges } from './AuditAccessCard';
import Icon from '@/Components/Icon';
import Switch from '@/Components/Switch';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import ConfirmDialog from '@/Components/ConfirmDialog';
import PermissionPanel from './PermissionPanel';
import PermissionGuide, { PermissionExplanation } from './PermissionGuide';
import { CATEGORIES, ICONS, permissionGuideEntries } from '@/lib/permissionGuide';
import './PermissionDesign.css';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import {
    RISK_LABELS,
    PERMISSION_COLUMNS,
    copyWorkPermissions,
    filterSections,
    individualChanges,
    permissionCells,
    permissionEntries,
    samePermissions,
    sectionExtras,
    sectionIds,
    sectionModel,
    sectionSentence,
    withGroupAccess,
    withToggled,
} from '@/lib/permissions';

/** The icon, one-line description and page of each section (keyed like PermissionKey::resourceGroups()). */
const SECTION_DETAILS = {
    subscriptions: { icon: 'users', description: 'بيانات المشتركين', page: 'المشتركون' },
    meter_boxes: { icon: 'table', description: 'الطبلونات ومواقعها', page: 'الطبلونات' },
    circuit_breakers: { icon: 'bolt', description: 'القواطع وأمبيراتها', page: 'القواطع' },
    tariffs: { icon: 'dollar', description: 'أسعار الكيلو والحد الأدنى', page: 'التعرفات' },
    meter_readings: { icon: 'gauge', description: 'قراءات العدادات الأسبوعية', page: 'القراءات الأسبوعية' },
    collections: { icon: 'card', description: 'السجل المالي والدفعات وحركات الحسابات', page: 'تسجيل الدفعات والسجل المالي' },
    financial_audit: { icon: 'shield', description: 'مراجعة الصناديق المغلقة ومبالغ البنك واعتماد فروق التدقيق', page: 'التدقيق المالي' },
    reports: { icon: 'trend', description: 'تقارير المال، كل تقرير بصلاحيته', page: 'التقارير' },
    messages: { icon: 'messages', description: 'رسائل المشتركين', page: 'الرسائل' },
    print_templates: { icon: 'printer', description: 'قوالب الطباعة المشتركة لكل الشركة', page: 'قوالب الطباعة' },
    users: { icon: 'user', description: 'حسابات الموظفين', page: 'المستخدمون' },
    user_types: { icon: 'badge', description: 'أنواع المستخدمين', page: 'أنواع المستخدمين' },
    branches: { icon: 'pin', description: 'فروع الشركة', page: 'الفروع' },
    governorates: { icon: 'map', description: 'المحافظات', page: 'المحافظات' },
    areas: { icon: 'map', description: 'المناطق', page: 'المناطق' },
    sub_areas: { icon: 'map', description: 'منطقة 2 داخل منطقة الفرع', page: 'منطقة 2' },
};

function EmployeeAvatar({ name, size = 'md' }) {
    const sizes = { sm: 'h-8 w-8 rounded-[10px] text-xs', md: 'h-10 w-10 rounded-[13px] text-sm', lg: 'h-14 w-14 rounded-[18px] text-lg' };

    return (
        <span
            className={`flex shrink-0 items-center justify-center bg-graphite-gradient font-display font-bold text-white dark:ring-1 dark:ring-white/10 ${sizes[size]}`}
        >
            {(name ?? '').trim().substring(0, 1)}
        </span>
    );
}

/** A small menu under a button, closed by a click outside it or Esc. */
function MenuButton({ icon, label, children, disabled = false }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        function onPointerDown(event) {
            if (!ref.current?.contains(event.target)) {
                setOpen(false);
            }
        }

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        }

        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen((current) => !current)}
                className="permission-copy-trigger inline-flex h-10 items-center gap-2 rounded-control border border-gray-200 bg-surface px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900"
            >
                <Icon name={icon} className="h-4 w-4" />
                {label}
                <Icon name="chevron-down" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div role="menu" className="animate-dropdown absolute end-0 top-full z-30 mt-2 max-h-80 w-72 overflow-y-auto rounded-2xl border border-gray-100 bg-surface p-1.5 shadow-lift">
                    {children(() => setOpen(false))}
                </div>
            )}
        </div>
    );
}

function MenuItem({ title, subtitle, trailing, onSelect, leading }) {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onSelect}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-sm transition hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
        >
            {leading}
            <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-gray-900">{title}</span>
                {subtitle && <span className="block truncate text-xs text-gray-500">{subtitle}</span>}
            </span>
            {trailing}
        </button>
    );
}

/**
 * The right-hand panel: search, the job chips (and the branch for the
 * Super Admin), and the employees, by branch, each with how many
 * permissions they hold and whether they differ from their job's usual ones.
 */
export function EmployeeList({ users, selectedId, selectedDirty, templates, filters, filterOptions, search, onSearchChange, filterValues, onFilterChange, onSelect, searchRef }) {
    const roleGroup = filterOptions.find((group) => group.key === 'user_type_id');
    const branchGroup = filterOptions.find((group) => group.key === 'branch_id');
    const byBranch = users.data.reduce((groups, user) => {
        const branch = user.branchName ?? 'بلا فرع';
        (groups[branch] ??= []).push(user);
        return groups;
    }, {});
    const showBranches = Object.keys(byBranch).length > 1;

    return (
        <aside className="rise-in flex flex-col rounded-card border border-gray-100 bg-surface shadow-card lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)]">
            <div className="border-b border-gray-100 p-4">
                <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                    الموظفون
                    <span className="ms-auto font-display text-sm font-semibold text-gray-500">{users.total.toLocaleString('en')} موظف</span>
                </h3>
                <div className="relative mt-3">
                    <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400" />
                    <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="ابحث عن موظف..."
                        aria-label="البحث عن موظف بالاسم أو اسم المستخدم"
                        className="block w-full py-2.5 pe-10 ps-10 text-sm"
                    />
                    <span className="kbd pointer-events-none absolute inset-y-0 end-3 my-auto h-fit">/</span>
                </div>
                {roleGroup && (
                    <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={roleGroup.label}>
                        {[{ value: '', label: 'الكل' }, ...roleGroup.options].map((option) => {
                            const pressed = (filterValues.user_type_id ?? '') === option.value;

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={pressed}
                                    onClick={() => onFilterChange('user_type_id', option.value)}
                                    className={`rounded-full border px-3 py-0.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${
                                        pressed ? 'border-gray-900 bg-gray-900 text-surface' : 'border-gray-200 text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                )}
                {branchGroup && (
                    <select
                        value={filterValues.branch_id ?? ''}
                        onChange={(event) => onFilterChange('branch_id', event.target.value)}
                        aria-label={branchGroup.label}
                        className="mt-3 block w-full py-2 text-sm"
                    >
                        <option value="">جميع الفروع</option>
                        {branchGroup.options.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {users.data.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-gray-500">لا يوجد موظفون مطابقون.</p>
                ) : (
                    Object.entries(byBranch).map(([branch, people]) => (
                        <div key={branch}>
                            {showBranches && (
                                <p className="flex justify-between px-2.5 pb-1 pt-3 text-xs font-bold text-gray-500">
                                    <span>{branch}</span>
                                    <span className="font-display">{people.length}</span>
                                </p>
                            )}
                            <ul className="space-y-1">
                                {people.map((user) => {
                                    const isSelected = user.id === selectedId;
                                    const template = templates.find((item) => item.role === user.role);
                                    const isCustom = template && !samePermissions(user.permissionIds, template.permissionIds);

                                    return (
                                        <li key={user.id}>
                                            <button
                                                type="button"
                                                data-employee={user.id}
                                                onClick={() => onSelect(user)}
                                                aria-current={isSelected ? 'true' : undefined}
                                                className={`relative flex w-full items-center gap-2.5 rounded-row border px-2.5 py-2 text-start transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${
                                                    isSelected
                                                        ? 'border-brand-200 bg-brand-50 before:absolute before:inset-y-2.5 before:-start-px before:w-[3px] before:rounded-full before:bg-brand-500'
                                                        : 'border-transparent hover:bg-gray-50'
                                                }`}
                                            >
                                                <EmployeeAvatar name={user.name} />
                                                <span className="min-w-0 flex-1">
                                                    <span className={`block truncate text-[15px] font-bold ${isSelected ? 'text-brand-700' : 'text-gray-900'}`}>{user.name}</span>
                                                    <span className="block truncate text-xs text-gray-500">{user.roleLabel}</span>
                                                </span>
                                                <span className="flex shrink-0 flex-col items-end gap-1">
                                                    {isSelected && selectedDirty ? (
                                                        <span title="تغييرات لم تُحفظ" className="h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-brand-500/20" />
                                                    ) : (
                                                        <span title="عدد الصلاحيات" className="rounded-md bg-gray-100 px-1.5 font-display text-xs font-bold text-gray-700">
                                                            {user.permissionIds.length}
                                                        </span>
                                                    )}
                                                    {isCustom && <span className="rounded-md bg-blue-500/10 px-1.5 text-[11px] font-bold text-blue-700">مخصّص</span>}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))
                )}
            </div>

            {users.last_page > 1 && (
                <div className="border-t border-gray-100 p-3">
                    <Pagination meta={users} filters={filters} baseUrl="/settings/permissions" extraParams={{ selected: selectedId }} />
                </div>
            )}
        </aside>
    );
}

/** «حساس» or «خطير» beside a permission: a small label, never a coloured card. */
function RiskBadge({ risk }) {
    if (!risk) {
        return null;
    }

    return (
        <span
            className={`inline-flex items-center rounded-md px-1.5 text-[11px] font-bold leading-[18px] ${
                risk === 'danger' ? 'bg-red-500/10 text-red-700 dark:text-red-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            }`}
        >
            {RISK_LABELS[risk]}
        </span>
    );
}

function PermissionCheckbox({ ids, selected, onChange, disabled, label, changed = false, risk }) {
    const count = ids.filter((id) => selected.includes(id)).length;
    const checked = count === 0 ? false : count === ids.length ? true : 'mixed';

    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled || ids.length === 0}
            title={label}
            className={`permission-checkbox ${checked ? 'is-checked' : ''} ${changed ? 'is-changed' : ''} ${risk ? `is-${risk}` : ''}`}
            onClick={() => onChange(checked === true ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])])}
        >
            {checked && (checked === 'mixed' ? <span className="h-0.5 w-3 rounded bg-current" /> : <Icon name="check" className="h-4 w-4" />)}
        </button>
    );
}

/** One extra option: its name and risk, what it opens, and its switch — off and explained when it needs a level first. */
function ExtraOption({ section, item, selected, onChange, disabled, onExplain }) {
    const on = selected.includes(item.id);
    const needed = item.needs > 0 && section.ladder ? section.ladder.ids[item.needs - 1] : null;
    const locked = !on && needed !== null && !selected.includes(needed);

    return (
        <div className={`permission-option flex min-h-[68px] items-center gap-3 border-t border-gray-100 px-3.5 py-2.5 first:border-t-0 ${locked ? 'opacity-60' : ''}`}>
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-gray-900">
                    {item.label}
                    <RiskBadge risk={item.risk} />
                </p>
                <p className="text-sm leading-7 text-gray-500">
                    {item.hint}
                    {locked && <span className="text-blue-600">{item.hint ? ' · ' : ''}يتطلب «{section.ladder.labels[item.needs - 1]}»</span>}
                </p>
            </div>
            {onExplain && <button type="button" aria-label={`شرح ${item.label}`} onClick={onExplain} className="shrink-0 rounded-control border border-gray-200 p-2 text-gray-500 hover:text-brand-600"><Icon name="info" className="h-4 w-4" /></button>}
            <Switch
                checked={on}
                onChange={(next) => onChange(withToggled(selected, item.id, next))}
                ariaLabel={`${section.label}: ${item.label}`}
                disabled={disabled || locked}
            />
        </div>
    );
}

/** Each action has its own checkbox; expanding the explanation never changes access. */
export function SectionRow({ section, selected, saved, onChange, disabled, open = false, onToggle, onExplain }) {
    const details = SECTION_DETAILS[section.key] ?? { icon: ICONS[section.key] ?? 'shield' };
    const cells = permissionCells(section);
    const cellIds = cells.flatMap((cell) => cell.permission ? [cell.permission.id] : []);
    const extras = sectionExtras(section).map((group) => ({ ...group, items: group.items.filter((item) => !cellIds.includes(item.id)) })).filter((group) => group.items.length > 0);
    const ids = sectionIds(section);
    const changed = ids.some(id => selected.includes(id) !== saved.includes(id));
    const guide = permissionGuideEntries([section]);
    const explain = id => onExplain?.(guide.find(entry => entry.id === id));

    return (
        <section className={`permission-matrix-section ${changed ? 'is-changed' : ''}`} aria-label={section.label}>
            <div className="permission-matrix-row">
                <div className="permission-section-identity">
                    <span className="permission-section-icon"><Icon name={details.icon} className="h-5 w-5" /></span>
                    <div className="min-w-0">
                        <h5 className="flex flex-wrap items-center gap-2 font-bold text-gray-900">{section.label}{changed && <span className="permission-change-label">تغيّر</span>}</h5>
                        <p className="text-xs text-gray-500">{details.description ?? sectionSentence(section, selected)}</p>
                    </div>
                </div>
                {cells.map((cell) => (
                    <div key={cell.key} className="permission-matrix-cell">
                        <span className="permission-cell-label">{cell.label}</span>
                        {cell.permission ? (
                            <PermissionCheckbox ids={[cell.permission.id]} selected={selected} onChange={onChange} disabled={disabled} label={`${section.label}: ${cell.permission.label}`} risk={cell.permission.risk} changed={selected.includes(cell.permission.id) !== saved.includes(cell.permission.id)} />
                        ) : <span className="text-gray-400" aria-label={`${section.label}: ${cell.label} غير متاح`}>—</span>}
                    </div>
                ))}
                <div className="permission-row-options">
                    <button type="button" aria-expanded={open} aria-controls={`permission-options-${section.key}`} onClick={() => onToggle?.(!open)} className="permission-options-trigger">
                        <Icon name="info" className="h-4 w-4" />
                        خيارات {extras.length > 0 && <bdi className="font-display">{extras.flatMap((group) => group.items).filter((item) => selected.includes(item.id)).length}/{extras.flatMap((group) => group.items).length}</bdi>}
                        <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </div>
            <div id={`permission-options-${section.key}`} className="permission-panel-body" hidden={!open}>
                <div className="permission-section-description">
                    <p>{sectionSentence(section, selected) || 'لا يملك صلاحيات في هذا القسم.'}</p>
                    <p>كل إجراء مستقل. تفعيل التعديل لا يمنح الإضافة أو العرض تلقائيًا.</p>
                </div>
                <div className="grid gap-2 border-t border-gray-100 p-4 sm:grid-cols-2">
                    {cells.filter((cell) => cell.permission).map((cell) => (
                        <button key={cell.key} type="button" onClick={() => explain(cell.permission.id)} className="permission-action-help">
                            <Icon name="info" className="h-4 w-4 shrink-0 text-gray-400" />
                            <span>{guide.find((entry) => entry.id === cell.permission.id)?.label ?? cell.permission.label}</span>
                            <RiskBadge risk={cell.permission.risk} />
                        </button>
                    ))}
                </div>
                {extras.map((group) => <div key={group.title}><p className="border-y border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-600">{group.title}</p>{group.items.map((item) => <ExtraOption key={item.id} section={section} item={{ ...item, hint: guide.find((entry) => entry.id === item.id)?.description ?? item.hint }} selected={selected} onChange={onChange} disabled={disabled} onExplain={() => explain(item.id)} />)}</div>)}
            </div>
        </section>
    );
}

/** The ways to be paid the selected permissions allow, for the summary. */
function paymentWays(sections, selected) {
    const payments = sections.find((section) => section.key === 'collections');
    const record = payments?.ladder?.actions.indexOf('record') ?? -1;

    if (!payments || record === -1 || !selected.includes(payments.ladder.ids[record])) {
        return null;
    }

    return payments.switches.filter((item) => ['record_cash', 'record_transfer'].includes(item.action) && selected.includes(item.id)).map((item) => item.label);
}

/**
 * What the employee can do, in plain words, as it stands in the editor:
 * how many permissions (and how many of them sensitive or dangerous), a
 * line per section they hold something in, the pages they'll see, what
 * they can't do, how far they are from their role's template, and the
 * permissions outside what the actor may manage, which stay as they are.
 */
export function PermissionSummary({ employee, sections, selected, template, scopedToOwnBranch }) {
    const entries = permissionEntries(sections);
    const enabled = entries.filter((item) => selected.includes(item.id));
    const deviations = template ? individualChanges(sections, template.permissionIds, selected).length : null;
    const locked = employee.lockedPermissions ?? [];
    const held = sections.filter((section) => sectionIds(section).some((id) => selected.includes(id)));
    const notHeld = sections.filter((section) => !held.includes(section));
    const ways = paymentWays(sections, selected);
    const dangerous = enabled.filter((item) => item.risk === 'danger');
    const firstName = employee.name.split(' ')[0];

    return (
        <aside className="rise-in space-y-4 rounded-card border border-gray-100 bg-surface p-4 shadow-card sm:p-5" aria-label={`ملخص صلاحيات ${employee.name}`}>
            <div>
                <h3 className="font-bold text-gray-900">ماذا يستطيع {firstName}؟</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                    {scopedToOwnBranch ? 'المعروض هو ما يمكنك تعديله لموظفي فرعك.' : 'يتحدّث مع كل تغيير، قبل الحفظ.'}
                </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {[
                    { count: enabled.length, label: 'صلاحية', tone: 'text-gray-900' },
                    { count: enabled.filter((item) => item.risk === 'sensitive').length, label: 'حساسة', tone: 'text-amber-700 dark:text-amber-400' },
                    { count: dangerous.length, label: 'خطيرة', tone: 'text-red-700 dark:text-red-400' },
                ].map((stat) => (
                    <div key={stat.label} className="rounded-control border border-gray-100 bg-gray-50 px-3 py-2">
                        <b className={`block font-display text-xl leading-tight ${stat.tone}`}>{stat.count}</b>
                        <span className="text-xs text-gray-500">{stat.label}</span>
                    </div>
                ))}
            </div>

            {template && (
                <p className="text-xs text-gray-500">
                    {deviations === 0 ? `مطابق لقالب ${template.label}` : `${deviations} اختلاف عن قالب الدور (${template.label})`}
                </p>
            )}

            <ul className="space-y-1.5 text-[13.5px] text-gray-800">
                {held.length === 0 && <li className="text-gray-500">لا يملك أي صلاحية بعد.</li>}
                {held.map((section) => (
                    <li key={section.key} className="flex gap-2">
                        <i className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <span>
                            <b className="font-semibold">{section.label}:</b> {sectionSentence(section, selected)}
                        </span>
                    </li>
                ))}
                {ways && (
                    <li className="flex gap-2">
                        <i className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <span>{ways.length ? `يأخذ الدفعات: ${ways.join(' و')}` : 'لا يأخذ أي دفعة: لم تُختر طريقة دفع'}</span>
                    </li>
                )}
                {dangerous.length > 0 && (
                    <li className="flex gap-2 text-red-700 dark:text-red-400">
                        <i className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                        <span>صلاحيات خطيرة: {dangerous.map((item) => item.label).join('، ')}</span>
                    </li>
                )}
            </ul>

            <div className="border-t border-gray-100 pt-3">
                <h4 className="text-sm font-bold text-gray-900">الصفحات التي سيراها</h4>
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {['الرئيسية', ...held.map((section) => SECTION_DETAILS[section.key]?.page ?? section.label)].map((page) => (
                        <span key={page} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                            {page}
                        </span>
                    ))}
                </div>
            </div>

            {notHeld.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                    <h4 className="text-sm font-bold text-gray-900">لا يصل إلى</h4>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {notHeld.map((section) => (
                            <span key={section.key} className="rounded-full border border-dashed border-gray-200 px-2.5 py-0.5 text-xs text-gray-500">
                                {section.label}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {locked.length > 0 && (
                <p className="rounded-control bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600">
                    <b className="text-gray-900">{locked.length} صلاحية خارج نطاق إدارتك، تبقى كما هي:</b> {locked.join('، ')}
                </p>
            )}
        </aside>
    );
}

/**
 * Every change before it is saved, grouped by section: each permission
 * that will be granted or taken away, with what it opens and its risk.
 */
export function PermissionChangeReview({ employee, changes }) {
    const bySection = changes.reduce((groups, change) => {
        (groups[change.section] ??= []).push(change);
        return groups;
    }, {});

    return (
        <div className="px-5 pb-5 sm:px-7">
            <p className="mb-4 rounded-control border border-gray-100 bg-gray-50 p-3 text-sm leading-6 text-gray-600">
                <b className="text-gray-900">{employee.name}</b> · {employee.roleLabel} · {employee.branchName ?? 'بلا فرع'}
                <br />
                لا تتغيّر الصلاحيات خارج نطاق إدارتك.
            </p>
            <div className="max-h-[50vh] space-y-3 overflow-y-auto" tabIndex={0} aria-label="جميع تغييرات الصلاحيات">
                {Object.entries(bySection).map(([section, items]) => (
                    <section key={section} className="overflow-hidden rounded-control border border-gray-100">
                        <h4 className="bg-gray-50 px-3 py-1.5 text-sm font-bold text-gray-700">{section}</h4>
                        <ul className="space-y-1 p-1.5">
                            {items.map((change) => (
                                <li
                                    key={change.id}
                                    className={`flex items-start gap-2.5 rounded-[10px] px-2.5 py-2 ${change.added ? 'bg-emerald-500/[0.07]' : 'bg-gray-50'}`}
                                >
                                    <b className={`mt-px w-3 text-center ${change.added ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400'}`}>{change.added ? '+' : '−'}</b>
                                    <div className="min-w-0 flex-1">
                                        <p className={`flex flex-wrap items-center gap-1.5 text-sm font-semibold ${change.added ? 'text-gray-900' : 'text-gray-500 line-through'}`}>
                                            {change.label}
                                            {change.added && <RiskBadge risk={change.risk} />}
                                        </p>
                                        {change.hint && <p className="text-xs text-gray-500">{change.hint}</p>}
                                    </div>
                                    <span className={`shrink-0 text-xs font-bold ${change.added ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500'}`}>
                                        {change.added ? 'سيُمنح' : 'سيُلغى'}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
}

/** Count the selected actions without assigning a numerical risk score. */
function PermissionStats({ sections, selected }) {
    const entries = permissionEntries(sections).filter((entry) => selected.includes(entry.id));
    const stats = [
        { label: 'صلاحية مفعّلة', count: entries.length, icon: 'key', tone: '' },
        { label: 'صلاحيات حساسة', count: entries.filter((entry) => entry.risk === 'sensitive').length, icon: 'shield', tone: 'is-sensitive' },
        { label: 'صلاحيات خطيرة', count: entries.filter((entry) => entry.risk === 'danger').length, icon: 'alert', tone: 'is-danger' },
    ];

    return <div className="permission-stats">{stats.map((stat) => (
        <div key={stat.label} className={`permission-stat ${stat.tone}`}>
            <Icon name={stat.icon} className="h-5 w-5" />
            <bdi className="font-display">{stat.count}</bdi>
            <span>{stat.label}</span>
        </div>
    ))}</div>;
}

export function PermissionComparison({ employee, sections, selected, colleagues, disabled, onMatch, onAddMissing }) {
    const [sourceId, setSourceId] = useState('');
    const colleague = colleagues.find((person) => String(person.id) === sourceId);
    const entries = permissionEntries(sections.filter((section) => section.key !== 'financial_audit'));
    const onlyMine = colleague ? entries.filter((entry) => selected.includes(entry.id) && !colleague.permissionIds.includes(entry.id)) : [];
    const onlyTheirs = colleague ? entries.filter((entry) => !selected.includes(entry.id) && colleague.permissionIds.includes(entry.id)) : [];
    const shared = colleague ? entries.filter((entry) => selected.includes(entry.id) && colleague.permissionIds.includes(entry.id)) : [];

    return (
        <section className="permission-card p-4 sm:p-5" aria-label="مقارنة صلاحيات الموظفين">
            <h4 className="flex items-center gap-2 text-lg font-bold text-gray-900"><Icon name="repeat" className="h-5 w-5 text-brand-600" />مقارنة {employee.name.split(' ')[0]} بزميل</h4>
            <p className="mt-2 text-sm leading-7 text-gray-500">قارن صلاحيات العمل، ثم أضف ما ينقص أو طابق الاختيارات. لا يُحفظ شيء قبل المراجعة.</p>
            <label className="mt-5 block text-sm font-semibold text-gray-900">
                الموظف الذي تقارن به
                <select aria-label="الموظف الذي تقارن به" className="mt-2 block w-full sm:max-w-md" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                    <option value="">اختر موظفًا من القائمة الحالية</option>
                    {colleagues.map((person) => <option key={person.id} value={person.id}>{person.name} — {person.roleLabel} — {person.branchName ?? 'بلا فرع'}</option>)}
                </select>
            </label>
            {!colleagues.length && <p className="mt-4 text-sm text-gray-500">لا يوجد موظفون آخرون في هذه الصفحة.</p>}
            {colleague && <>
                <p className="my-4 text-sm text-gray-600">يشتركان في <bdi className="font-display font-bold text-gray-900">{shared.length}</bdi> صلاحية عمل.</p>
                <div className="grid gap-3 md:grid-cols-2">
                    {[{ label: `عند ${employee.name} فقط`, items: onlyMine }, { label: `عند ${colleague.name} فقط`, items: onlyTheirs }].map((column) => (
                        <div key={column.label} className="rounded-row border border-gray-200 bg-gray-50 p-4">
                            <h5 className="font-bold text-gray-900">{column.label} <bdi className="font-display text-gray-500">({column.items.length})</bdi></h5>
                            {column.items.length ? <ul className="mt-3 space-y-2">{column.items.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm text-gray-700"><span>{item.section}: {item.label}</span><RiskBadge risk={item.risk} /></li>)}</ul> : <p className="mt-3 text-sm text-gray-500">لا توجد صلاحيات إضافية.</p>}
                        </div>
                    ))}
                </div>
                <p className="mt-4 text-xs leading-7 text-gray-500">المقارنة والنسخ يشملان صلاحيات العمل فقط. فروع العمل وإتاحة التدقيق المالي وفروعه وإجراءاته تبقى كما هي.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                    <SecondaryButton disabled={disabled || !onlyTheirs.length} onClick={() => onAddMissing(onlyTheirs.map((entry) => entry.id))}><Icon name="plus" className="h-4 w-4" />أضف ما ينقصه ({onlyTheirs.length})</SecondaryButton>
                    <SecondaryButton disabled={disabled || (!onlyTheirs.length && !onlyMine.length)} onClick={() => onMatch(colleague)}><Icon name="repeat" className="h-4 w-4" />طابق صلاحيات العمل</SecondaryButton>
                </div>
            </>}
        </section>
    );
}

const EDITOR_TABS = [
    { key: 'matrix', label: 'الصلاحيات', icon: 'table' },
    { key: 'summary', label: 'ماذا يستطيع؟', icon: 'shield' },
    { key: 'compare', label: 'مقارنة', icon: 'repeat' },
];

export function PermissionEditor({ employee, sections, templates = [], copySources, scopedToOwnBranch, onDirtyChange, auditOptions, workBranchOptions = null }) {
    const saved = employee.permissionIds;
    const savedAudit = auditOptions && !saved.includes(auditOptions.permissionId) && employee.auditSettingsConfigured === false
        ? { scope: 'selected', branch_ids: employee.branchId ? [employee.branchId] : [], actions: [] }
        : employee.auditSettings;
    const savedWorkBranches = employee.workBranchIds ?? [];
    const { data, setData, put, processing, errors } = useForm({
        permissions: { [employee.id]: [...saved] },
        ...(auditOptions ? { audit_settings: { [employee.id]: savedAudit } } : {}),
        ...(workBranchOptions ? { work_branches: { [employee.id]: [...savedWorkBranches] } } : {}),
    });
    const selected = data.permissions[employee.id];
    const auditValue = data.audit_settings?.[employee.id];
    const workBranches = data.work_branches?.[employee.id] ?? savedWorkBranches;
    const workBranchesChanged = !samePermissions(savedWorkBranches, workBranches);
    const auditEnabled = Boolean(auditOptions && selected.includes(auditOptions.permissionId));
    const auditDraftInitialized = useRef(Boolean(auditOptions && (saved.includes(auditOptions.permissionId) || employee.auditSettingsConfigured)));
    const [activeTab, setActiveTab] = useState('matrix');
    const [query, setQuery] = useState('');
    const [mode, setMode] = useState('all');
    const [openSections, setOpenSections] = useState(new Set());
    const [guideAudience, setGuideAudience] = useState(null);
    const [explanation, setExplanation] = useState(null);
    const [reviewing, setReviewing] = useState(false);
    const [acknowledged, setAcknowledged] = useState(false);
    const changes = useMemo(() => individualChanges(sections, saved, selected), [sections, saved, selected]);
    const auditChanges = auditOptions ? auditSettingsChanges(savedAudit, auditValue, auditOptions) : [];
    const auditGrants = auditEnabled && !saved.includes(auditOptions.permissionId)
        ? auditOptions.actions.filter((action) => auditValue.actions.includes(action.value) && action.value.startsWith('approve_')).map((action) => ({ ...action, added: true, risk: 'danger' }))
        : auditEnabled ? auditChanges : [];
    const dangerousGrants = [...changes, ...auditGrants, ...(workBranches.some((id) => !savedWorkBranches.includes(id)) ? [{ added: true, risk: 'danger', label: 'العمل في فروع إضافية' }] : [])].filter((change) => change.added && change.risk === 'danger');
    const dirty = !samePermissions(saved, selected) || auditChanges.length > 0 || workBranchesChanged;
    const template = templates.find((item) => item.role === employee.role);
    const matching = filterSections(sections, selected, saved, query, mode);
    if (mode === 'changed' && auditChanges.length > 0 && !matching.some((section) => section.key === 'financial_audit')) {
        matching.push(...filterSections(sections.filter((section) => section.key === 'financial_audit'), selected, saved, query));
    }
    const categorized = new Set(CATEGORIES.flatMap((category) => category.sections));
    const groups = [
        ...CATEGORIES.filter((category) => category.key !== 'all').map((category) => ({ ...category, sections: matching.filter((section) => category.sections.includes(section.key)) })),
        { key: 'other', label: 'أقسام أخرى', icon: 'layers', sections: matching.filter((section) => !categorized.has(section.key)) },
    ].filter((group) => group.sections.length > 0);
    const allExpanded = matching.length > 0 && matching.every((section) => openSections.has(section.key));
    const grantCount = changes.filter((change) => change.added).length;
    const revokeCount = changes.length - grantCount;

    function setSelected(ids) {
        if (auditOptions && !auditDraftInitialized.current && ids.includes(auditOptions.permissionId) && !selected.includes(auditOptions.permissionId)) {
            setAudit({ scope: 'selected', branch_ids: employee.branchId ? [employee.branchId] : [], actions: [] });
            auditDraftInitialized.current = true;
        }
        setData('permissions', { [employee.id]: ids });
    }

    function setAudit(value) {
        setData('audit_settings', { [employee.id]: value });
    }

    function toggleSection(key, open) {
        setOpenSections((current) => {
            const next = new Set(current);
            open ? next.add(key) : next.delete(key);
            return next;
        });
    }

    function copyFrom(person) {
        setSelected(copyWorkPermissions(sections, selected, person.permissionIds));
    }

    function discard() {
        setData({
            permissions: { [employee.id]: [...saved] },
            ...(auditOptions ? { audit_settings: { [employee.id]: savedAudit } } : {}),
            ...(workBranchOptions ? { work_branches: { [employee.id]: [...savedWorkBranches] } } : {}),
        });
    }

    function save() {
        if (dirty && !processing) {
            setAcknowledged(false);
            setReviewing(true);
        }
    }

    function confirmSave() {
        if (dirty && !processing && (dangerousGrants.length === 0 || acknowledged)) {
            put('/settings/permissions', { preserveScroll: true, onSuccess: () => setReviewing(false), onError: () => setReviewing(false) });
        }
    }

    function navigateTabs(event) {
        const direction = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
        if (!direction && event.key !== 'Home' && event.key !== 'End') {
            return;
        }
        event.preventDefault();
        const index = EDITOR_TABS.findIndex((tab) => tab.key === activeTab);
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? EDITOR_TABS.length - 1 : (index + direction + EDITOR_TABS.length) % EDITOR_TABS.length;
        const next = EDITOR_TABS[nextIndex];
        setActiveTab(next.key);
        document.getElementById(`permission-tab-${next.key}`)?.focus();
    }

    useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
    useEffect(() => {
        if (!dirty) { return; }
        function warnBeforeUnload(event) { event.preventDefault(); event.returnValue = ''; }
        window.addEventListener('beforeunload', warnBeforeUnload);
        return () => window.removeEventListener('beforeunload', warnBeforeUnload);
    }, [dirty]);
    useEffect(() => {
        function onKeyDown(event) {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (!reviewing) { save(); }
            }
        }
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    });

    return (
        <div className="permission-workspace min-w-0 space-y-4">
            <section className="permission-employee-hero" aria-label={`صلاحيات ${employee.name}`}>
                <div className="permission-hero-main">
                    <EmployeeAvatar name={employee.name} size="lg" />
                    <div className="min-w-0 flex-1">
                        <h3 className="break-words text-2xl font-bold text-white">{employee.name}</h3>
                        <div className="permission-hero-meta">
                            <span className="permission-job-badge">{employee.roleLabel}</span>
                            <span className="inline-flex items-center gap-1"><Icon name="office" className="h-4 w-4" />{employee.branchName ?? 'بلا فرع'}</span>
                            <bdi className="font-display">@{employee.username}</bdi>
                            {employee.isActive === false && <span className="text-amber-300">الحساب موقوف</span>}
                        </div>
                        {(employee.lockedPermissions?.length ?? 0) > 0 && <p className="mt-2 flex items-center gap-1.5 text-xs text-white/70"><Icon name="lock" className="h-3.5 w-3.5" />{employee.lockedPermissions.length} صلاحية خارج نطاق إدارتك، تبقى كما هي</p>}
                    </div>
                    <div className="permission-hero-actions">
                        <button type="button" onClick={() => setGuideAudience('selected')} className="permission-hero-button"><Icon name="document" className="h-4 w-4" />دليل الموظف</button>
                        <MenuButton icon="users" label="نسخ من موظف" disabled={processing}>
                            {(close) => <>
                                <p className="border-b border-gray-100 px-3 py-2 text-xs leading-6 text-gray-500">نسخ صلاحيات العمل فقط؛ فروع العمل وإعدادات التدقيق لا تتغيّر.</p>
                                {copySources.length ? copySources.map((person) => <MenuItem key={person.id} leading={<EmployeeAvatar name={person.name} size="sm" />} title={person.name} subtitle={`${person.roleLabel} · ${person.branchName ?? 'بلا فرع'}`} onSelect={() => { copyFrom(person); close(); }} />) : <p className="px-3 py-4 text-center text-sm text-gray-500">لا يوجد موظفون آخرون في هذه الصفحة.</p>}
                            </>}
                        </MenuButton>
                    </div>
                </div>
                <PermissionStats sections={sections} selected={selected} />
            </section>

            <div className="permission-view-tabs" role="tablist" aria-label="عرض صلاحيات الموظف" onKeyDown={navigateTabs}>
                {EDITOR_TABS.map((tab) => <button key={tab.key} type="button" role="tab" id={`permission-tab-${tab.key}`} aria-controls={`permission-view-${tab.key}`} aria-selected={activeTab === tab.key} tabIndex={activeTab === tab.key ? 0 : -1} onClick={() => setActiveTab(tab.key)}><Icon name={tab.icon} className="h-4 w-4" />{tab.label}{tab.key === 'matrix' && dirty && <span className="permission-unsaved-dot" aria-label="تغييرات لم تُحفظ" />}</button>)}
            </div>

            <div role="tabpanel" id="permission-view-matrix" aria-labelledby="permission-tab-matrix" hidden={activeTab !== 'matrix'} className="space-y-4">
                {workBranchOptions && <PermissionPanel title="فروع العمل المسموحة" summary={`${employee.branchName ?? 'بلا فرع'} · فروع إضافية: ${workBranches.length}`} icon="pin" open={openSections.has('work-branches')} onToggle={(open) => toggleSection('work-branches', open)} changed={workBranchesChanged}>
                    <div className="space-y-3 p-4">
                        <p className="text-sm leading-7 text-gray-500">الفرع الإداري: <b className="text-gray-900">{employee.branchName ?? 'غير محدد'}</b>. اختر فروعًا إضافية يستطيع الموظف العمل فيها بنفس صلاحياته عبر رابط كل فرع. نطاق التدقيق مستقل عنها.</p>
                        <div className="grid gap-2 sm:grid-cols-2">{workBranchOptions.map((branch) => <label key={branch.id} className="flex cursor-pointer items-center gap-2 rounded-control border border-gray-200 p-3 text-sm text-gray-900"><input type="checkbox" className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={branch.id === employee.branchId || workBranches.includes(branch.id)} disabled={processing || branch.id === employee.branchId} onChange={(event) => setData('work_branches', { [employee.id]: withToggled(workBranches, branch.id, event.target.checked) })} />{branch.name}{branch.id === employee.branchId && <span className="ms-auto text-xs text-gray-500">الفرع الإداري</span>}</label>)}</div>
                        <p className="text-xs leading-6 text-gray-500">نسخ صلاحيات موظف آخر لا يغيّر فروع العمل هذه.</p>
                        {errors.work_branches && <p className="text-sm text-red-600">{errors.work_branches}</p>}
                    </div>
                </PermissionPanel>}

                <section className="permission-card permission-matrix" aria-label="جدول الصلاحيات">
                    <div className="permission-tools">
                        <div className="relative w-full sm:max-w-sm">
                            <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400" />
                            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بكلمة: دفعة، خصم، اعتماد، حذف..." aria-label="ابحث عن صلاحية" className="block w-full py-2 pe-3 ps-10 text-sm" />
                        </div>
                        <div className="permission-filter-tabs" role="group" aria-label="تصفية الأقسام">
                            {[['all', 'الكل'], ['enabled', 'المفعّلة'], ['sensitive', 'فيها صلاحيات خاصة'], ['changed', 'المعدّلة']].map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{label}<bdi className="font-display">{filterSections(sections, selected, saved, '', value).length}</bdi></button>)}
                        </div>
                        <div className="permission-tool-actions">
                            <button type="button" disabled={processing || !matching.length} onClick={() => setSelected(withGroupAccess(matching, selected, true))}><Icon name="eye" className="h-4 w-4" />عرض فقط</button>
                            <button type="button" disabled={processing || !matching.length} onClick={() => setSelected(withGroupAccess(matching, selected, false))}><Icon name="close" className="h-4 w-4" />سحب الكل</button>
                            <button type="button" onClick={() => setOpenSections(allExpanded ? new Set() : new Set(matching.map((section) => section.key)))}><Icon name="layers" className="h-4 w-4" />{allExpanded ? 'طيّ الكل' : 'فتح الكل'}</button>
                            <button type="button" onClick={() => setGuideAudience('all')} className="text-brand-600"><Icon name="document" className="h-4 w-4" />دليل الصلاحيات</button>
                        </div>
                    </div>
                    <div className="permission-matrix-heading" aria-hidden="true"><span>القسم والإجراء</span>{PERMISSION_COLUMNS.map((column) => <span key={column.key}>{column.label}</span>)}<span>خيارات إضافية</span></div>
                    {!groups.length && <div className="px-5 py-12 text-center text-sm text-gray-500"><Icon name="search" className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-2">لا توجد صلاحيات تطابق البحث أو التصفية.</p><button type="button" onClick={() => { setQuery(''); setMode('all'); }} className="mt-2 font-semibold text-brand-600">عرض كل الصلاحيات</button></div>}
                    {groups.map((group) => {
                        const groupIds = group.sections.flatMap(sectionIds);
                        return <section key={group.key} aria-label={group.label}>
                            <div className="permission-matrix-group">
                                <span className="permission-group-icon"><Icon name={group.icon} className="h-4 w-4" /></span>
                                <h4 className="font-bold text-gray-900">{group.label}</h4>
                                <bdi className="font-display text-xs text-gray-500">{groupIds.filter((id) => selected.includes(id)).length} / {groupIds.length}</bdi>
                                <span className="flex-1" />
                                {group.sections.some((section) => section.ladder?.actions.includes('view') || section.key === 'reports') && <button type="button" onClick={() => setSelected(withGroupAccess(group.sections, selected, true))} disabled={processing} className="permission-group-view">عرض فقط للمجموعة</button>}
                                {group.key !== 'audit' && <PermissionCheckbox ids={groupIds} selected={selected} onChange={setSelected} disabled={processing} label={`كل صلاحيات ${group.label}`} />}
                            </div>
                            {group.sections.map((section) => section.key === 'financial_audit' && auditOptions ? (
                                <div key={section.key} className="p-3 sm:p-4"><PermissionPanel title="التدقيق المالي" icon="shield" summary={auditEnabled ? 'مفعّل · الفروع والإجراءات محددة داخل القسم' : 'غير مفعّل · يمنحه السوبر أدمن لأشخاص محددين'} changed={auditChanges.length > 0 || selected.includes(auditOptions.permissionId) !== saved.includes(auditOptions.permissionId)} open={openSections.has(section.key)} onToggle={(open) => toggleSection(section.key, open)}>
                                    <AuditAccessCard embedded employee={employee} options={auditOptions} value={auditValue} enabled={auditEnabled} onEnabledChange={(checked) => setSelected(withToggled(selected, auditOptions.permissionId, checked))} onChange={setAudit} disabled={processing} />
                                    {sectionExtras(section).flatMap((item) => item.items).filter((item) => item.action !== 'audit').map((item) => <ExtraOption key={item.id} section={section} item={item} selected={selected} onChange={setSelected} disabled={processing} onExplain={() => setExplanation(permissionGuideEntries([section]).find((entry) => entry.id === item.id))} />)}
                                </PermissionPanel></div>
                            ) : <SectionRow key={section.key} section={section} selected={selected} saved={saved} onChange={setSelected} disabled={processing} open={openSections.has(section.key)} onToggle={(open) => toggleSection(section.key, open)} onExplain={setExplanation} />)}
                        </section>;
                    })}
                    <div className="permission-matrix-note"><Icon name="info" className="mt-1 h-4 w-4 shrink-0" /><p>كل خانة مستقلة؛ التعديل لا يمنح الإضافة أو العرض تلقائيًا. الاختصارات الجماعية تخص الأقسام المعروضة فقط. {scopedToOwnBranch ? 'تمنح وتسحب الصلاحيات المتاحة هنا لموظفي فرعك فقط؛ التفويض الإداري والصلاحيات العامة يديرها السوبر أدمن.' : 'لتمكين مدير الفرع من إضافة موظفين وتوزيع صلاحياتهم، فعّل له «إضافة المستخدمين» و«إدارة صلاحيات موظفي الفرع». المسمى الوظيفي وحده لا يمنح صلاحيات.'}</p></div>
                </section>
            </div>

            <div role="tabpanel" id="permission-view-summary" aria-labelledby="permission-tab-summary" hidden={activeTab !== 'summary'}>
                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                    <PermissionSummary employee={employee} sections={sections} selected={selected} template={template} scopedToOwnBranch={scopedToOwnBranch} />
                    <div className="space-y-4">
                        {auditOptions && auditEnabled && <AuditWorkSummary employee={employee} options={auditOptions} value={auditValue} enabled={auditEnabled} />}
                        <div className="permission-card p-5"><h4 className="font-bold text-gray-900">صلاحيات تؤثر في المال والخدمة</h4><p className="mt-2 text-sm leading-7 text-gray-500">راجع إجراءات مثل ردّ الدفعة، تعديل سعر الكيلو وتأكيد القطع. امنح الموظف ما يحتاجه لعمله فقط.</p></div>
                    </div>
                </div>
            </div>
            <div role="tabpanel" id="permission-view-compare" aria-labelledby="permission-tab-compare" hidden={activeTab !== 'compare'}>
                <PermissionComparison employee={employee} sections={sections} selected={selected} colleagues={copySources} disabled={processing} onMatch={copyFrom} onAddMissing={(ids) => setSelected([...new Set([...selected, ...ids])])} />
            </div>
            <PermissionExplanation entry={explanation} onClose={() => setExplanation(null)} />
            {guideAudience && <PermissionGuide key={guideAudience} show onClose={() => setGuideAudience(null)} sections={sections} employee={employee} selected={selected} scopedToOwnBranch={scopedToOwnBranch} auditOptions={auditOptions} auditValue={auditValue} initialAudience={guideAudience} />}
            {dirty && <div className="h-24" aria-hidden="true" />}
            <div role="region" aria-label="تغييرات لم تُحفظ" className={`permission-savebar ${dirty ? 'is-visible' : ''}`} aria-hidden={!dirty} inert={!dirty}>
                {Object.keys(errors).length > 0 && <p className="w-full text-sm font-semibold text-red-300" role="alert">تعذّر حفظ الصلاحيات: {Object.values(errors)[0]}</p>}
                <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm" role="status"><bdi className="permission-save-count font-display">{changes.length + auditChanges.length + Number(workBranchesChanged)}</bdi>تغييرات لم تُحفظ لـ {employee.name}<span className="permission-delta"><bdi>+{grantCount}</bdi><bdi>−{revokeCount}</bdi></span></p>
                <button type="button" onClick={discard} disabled={processing || !dirty} className="permission-discard"><Icon name="undo" className="h-4 w-4" />تراجع</button>
                <PrimaryButton type="button" onClick={save} disabled={processing || !dirty} title="Ctrl + S"><Icon name="check" className="h-4 w-4" />{processing ? 'جارٍ الحفظ...' : 'مراجعة وحفظ'}</PrimaryButton>
            </div>
            <Modal show={reviewing} onClose={() => { if (!processing) { setReviewing(false); } }} maxWidth="2xl" centered>
                <div role="dialog" aria-modal="true" aria-labelledby={`permission-review-${employee.id}`} dir="rtl" className="flex max-h-[90dvh] min-h-0 flex-col">
                    <div className="shrink-0 px-5 pb-4 pt-6 sm:px-7">
                        <h3 id={`permission-review-${employee.id}`} className="text-lg font-bold text-gray-900">مراجعة تغييرات الصلاحيات</h3>
                        <p className="mt-1 text-sm text-gray-500">{grantCount} تُمنح · {revokeCount} تُلغى{auditChanges.length > 0 && ` · ${auditChanges.length} تغييرات في عمل التدقيق`}</p>
                        {workBranchesChanged && <div className="mt-3 rounded-control bg-amber-500/10 p-3 text-sm leading-7 text-gray-900"><b>تغيير فروع العمل الإضافية</b><p>قبل: {workBranchOptions?.filter((branch) => savedWorkBranches.includes(branch.id)).map((branch) => branch.name).join('، ') || 'لا توجد'}</p><p>بعد: {workBranchOptions?.filter((branch) => workBranches.includes(branch.id)).map((branch) => branch.name).join('، ') || 'لا توجد'}</p></div>}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <PermissionChangeReview employee={employee} changes={changes} />
                        {auditChanges.length > 0 && <div className="mx-5 mb-5 space-y-3 rounded-control border border-gray-100 p-4 sm:mx-7"><h4 className="font-bold text-gray-900">تغييرات عمل التدقيق</h4>{auditChanges.map((change) => <div key={change.key} className="text-sm leading-7"><b className="text-gray-900">{change.label}</b><p className="text-gray-500">قبل: {change.before}</p><p className="font-semibold text-gray-900">بعد: {change.after}</p></div>)}</div>}
                        {dangerousGrants.length > 0 && <label className="mx-5 mb-5 flex cursor-pointer items-start gap-2.5 rounded-control bg-red-500/[0.07] px-3.5 py-3 text-sm text-red-800 dark:text-red-300 sm:mx-7"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 rounded border-gray-300 text-brand-600" /><span>يحصل {employee.name.split(' ')[0]} على صلاحيات خطيرة: <b>{dangerousGrants.map((item) => item.label).join('، ')}</b>. أؤكد أنه يحتاجها لعمله.</span></label>}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:px-7"><SecondaryButton onClick={() => setReviewing(false)} disabled={processing} autoFocus>العودة للتعديل</SecondaryButton><PrimaryButton type="button" onClick={confirmSave} disabled={processing || !dirty || (dangerousGrants.length > 0 && !acknowledged)}>{processing ? 'جارٍ الحفظ...' : 'تأكيد وحفظ الصلاحيات'}</PrimaryButton></div>
                </div>
            </Modal>
        </div>
    );
}
export default function Permissions({ users, selectedUser, permissionGroups, roleTemplates, filters, filterOptions, scopedToOwnBranch, auditOptions = null, workBranchOptions = null }) {
    const hasUnsavedChanges = useRef(false);
    const [selectedDirty, setSelectedDirty] = useState(false);
    const editorRef = useRef(null);
    const searchRef = useRef(null);
    // The employee picked while the current one has unsaved changes, waiting on "discard them?".
    const [pendingEmployee, setPendingEmployee] = useState(null);
    const { search, setSearch, filterValues, setFilter } = useDataTable('/settings/permissions', filters, { selected: selectedUser?.id });
    const sections = useMemo(() => permissionGroups.map(sectionModel).filter((section) => sectionIds(section).length > 0), [permissionGroups]);

    function selectEmployee(user) {
        if (user.id === selectedUser?.id) {
            return;
        }

        if (hasUnsavedChanges.current) {
            setPendingEmployee(user);
        } else {
            openEmployee(user);
        }
    }

    function openEmployee(user) {
        setPendingEmployee(null);
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

    // "/" jumps to the employee search; J and K move to the next and previous employee.
    useEffect(() => {
        function onKeyDown(event) {
            if (event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="tablist"]') || event.ctrlKey || event.metaKey || event.altKey) {
                return;
            }

            if (event.key === '/') {
                event.preventDefault();
                searchRef.current?.focus();
            } else if (event.key === 'j' || event.key === 'k') {
                const index = users.data.findIndex((user) => user.id === selectedUser?.id);
                const next = users.data[index + (event.key === 'j' ? 1 : -1)];

                if (next) {
                    selectEmployee(next);
                }
            }
        }

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    });

    return (
        <SettingsLayout
            header={
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">إدارة صلاحيات الموظفين</h2>
                    <p className="mt-1 text-sm text-gray-500">اختر موظفًا، وحدّد الإجراءات المسموحة، ثم راجع التغييرات وأكّد حفظها.</p>
                </div>
            }
        >
            <Head title="الصلاحيات" />

            <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
                <EmployeeList
                    users={users}
                    selectedId={selectedUser?.id}
                    selectedDirty={selectedDirty}
                    templates={roleTemplates}
                    filters={filters}
                    filterOptions={filterOptions}
                    search={search}
                    onSearchChange={setSearch}
                    filterValues={filterValues}
                    onFilterChange={setFilter}
                    onSelect={selectEmployee}
                    searchRef={searchRef}
                />

                <div ref={editorRef} className="min-w-0 scroll-mt-24">
                    {selectedUser ? (
                        <PermissionEditor
                            // A fresh editor per employee and per saved state, so the levels always start from what's stored.
                            key={`${selectedUser.id}:${selectedUser.permissionIds.join(',')}:${JSON.stringify(selectedUser.auditSettings)}:${JSON.stringify(selectedUser.workBranchIds)}`}
                            employee={selectedUser}
                            auditOptions={auditOptions}
                            workBranchOptions={workBranchOptions}
                            sections={sections}
                            templates={roleTemplates}
                            copySources={users.data.filter((user) => user.id !== selectedUser.id)}
                            scopedToOwnBranch={scopedToOwnBranch}
                            onDirtyChange={(dirty) => {
                                hasUnsavedChanges.current = dirty;
                                setSelectedDirty(dirty);
                            }}
                        />
                    ) : (
                        <div className="flex min-h-[20rem] flex-col items-center justify-center rounded-card border border-dashed border-gray-200 bg-surface p-8 text-center">
                            <Icon name="shield" className="h-10 w-10 text-gray-300" />
                            <p className="mt-3 text-sm font-medium text-gray-600">لا يوجد موظفون لإدارة صلاحياتهم.</p>
                        </div>
                    )}
                </div>
            </div>

            <p className="mt-4 hidden flex-wrap gap-4 text-xs text-gray-500 lg:flex">
                <span>
                    <span className="kbd">/</span> بحث عن موظف
                </span>
                <span>
                    <span className="kbd">J</span> <span className="kbd">K</span> الموظف التالي والسابق
                </span>
                <span>
                    <span className="kbd">Ctrl</span> + <span className="kbd">S</span> مراجعة وحفظ
                </span>
            </p>

            <ConfirmDialog
                show={Boolean(pendingEmployee)}
                onConfirm={() => openEmployee(pendingEmployee)}
                onCancel={() => setPendingEmployee(null)}
                title="تجاهل التغييرات؟"
                message={`لديك تعديلات على صلاحيات ${selectedUser?.name ?? 'هذا الموظف'} لم تُحفظ بعد. إذا انتقلت إلى موظف آخر فستفقدها.`}
                confirmLabel="تجاهل التغييرات"
                cancelLabel="البقاء ومتابعة التعديل"
                icon="alert"
                tone="danger"
            />
        </SettingsLayout>
    );
}
