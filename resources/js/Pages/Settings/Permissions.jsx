import { useEffect, useMemo, useRef, useState } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import Icon from '@/Components/Icon';
import Switch from '@/Components/Switch';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import ConfirmDialog from '@/Components/ConfirmDialog';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import {
    RISK_LABELS,
    filterSections,
    individualChanges,
    levelOf,
    permissionEntries,
    samePermissions,
    sectionExtras,
    sectionIds,
    sectionModel,
    sectionSentence,
    withGroupAccess,
    withSectionLevel,
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

/** The sections in the order the editor groups them; any section not named here goes last. */
const SECTION_GROUPS = [
    { title: 'البيانات الأساسية', hint: 'المشتركون وأدوات العمل اليومي', keys: ['subscriptions', 'meter_boxes', 'circuit_breakers', 'tariffs'] },
    { title: 'المال والتحصيل', hint: 'كل ما يغيّر أرصدة المشتركين أو يعرضها', keys: ['meter_readings', 'collections', 'reports'] },
    { title: 'التواصل والطباعة', hint: 'الرسائل وقوالب الطباعة', keys: ['messages', 'print_templates'] },
    { title: 'الإدارة والمواقع', hint: 'الموظفون والفروع والتقسيمات الجغرافية', keys: ['users', 'user_types', 'branches', 'governorates', 'areas', 'sub_areas'] },
];

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
function MenuButton({ icon, label, children }) {
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
                onClick={() => setOpen((current) => !current)}
                className="inline-flex h-10 items-center gap-2 rounded-control border border-gray-200 bg-surface px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900"
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
function EmployeeList({ users, selectedId, selectedDirty, templates, filters, filterOptions, search, onSearchChange, filterValues, onFilterChange, onSelect, searchRef }) {
    const roleGroup = filterOptions.find((group) => group.key === 'role');
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
                            const pressed = (filterValues.role ?? '') === option.value;

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={pressed}
                                    onClick={() => onFilterChange('role', option.value)}
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

/** A section's level picker: one button per level, each meaning everything up to it; the chosen one stays burgundy. */
function LevelPicker({ section, level, onChange, disabled }) {
    return (
        <div role="radiogroup" aria-label={`مستوى ${section.label}`} className="inline-flex w-full gap-0.5 rounded-control border border-gray-100 bg-gray-50 p-[3px] sm:w-auto">
            {section.ladder.levels.map((name, index) => {
                const checked = level === index;

                return (
                    <button
                        key={name}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={disabled}
                        title={section.ladder.long[index]}
                        onClick={() => onChange(index)}
                        className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none ${
                            checked ? 'bg-brand-500 text-white shadow-sm ring-1 ring-brand-500 enabled:hover:brightness-110 enabled:active:brightness-95' : 'text-gray-600 enabled:hover:bg-brand-50 enabled:hover:text-brand-700 enabled:active:bg-brand-100'
                        }`}
                    >
                        {checked && index > 0 && <i aria-hidden="true" className="h-2 w-2 rounded-full bg-white" />}
                        {name}
                    </button>
                );
            })}
        </div>
    );
}

/** One extra option: its name and risk, what it opens, and its switch — off and explained when it needs a level first. */
function ExtraOption({ section, item, selected, onChange, disabled }) {
    const on = selected.includes(item.id);
    const needed = item.needs > 0 && section.ladder ? section.ladder.ids[item.needs - 1] : null;
    const locked = !on && needed !== null && !selected.includes(needed);

    return (
        <div className={`flex min-h-[58px] items-center gap-3 border-t border-gray-100 px-3.5 py-2.5 first:border-t-0 ${locked ? 'opacity-60' : ''}`}>
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-gray-900">
                    {item.label}
                    <RiskBadge risk={item.risk} />
                </p>
                <p className="text-xs leading-5 text-gray-500">
                    {item.hint}
                    {locked && <span className="text-blue-700 dark:text-blue-400">{item.hint ? ' · ' : ''}يتطلب مستوى «{section.ladder.levels[item.needs]}»</span>}
                </p>
            </div>
            <Switch
                checked={on}
                onChange={(next) => onChange(withToggled(selected, item.id, next))}
                ariaLabel={`${section.label}: ${item.label}`}
                disabled={disabled || locked}
            />
        </div>
    );
}

/**
 * One section: its icon and name, a line saying what the chosen level
 * lets them do, the level picker, and its extra options grouped by kind
 * under «خيارات إضافية». A section whose permissions don't sit on a level
 * is "custom": its options open, with the level's own actions as switches.
 * A changed section carries a burgundy edge and «تغيّر».
 */
function SectionRow({ section, selected, saved, onChange, disabled, forceOpen }) {
    const details = SECTION_DETAILS[section.key] ?? { icon: 'shield', description: '' };
    const level = section.ladder ? levelOf(section.ladder, selected) : null;
    const isCustom = section.ladder && level === null;
    const extras = sectionExtras(section);
    const extraItems = extras.flatMap((group) => group.items);
    const heldExtras = extraItems.filter((item) => selected.includes(item.id)).length;
    const [open, setOpen] = useState(false);
    const ids = sectionIds(section);
    const changed = ids.some((id) => selected.includes(id) !== saved.includes(id));
    const holdsAny = ids.some((id) => selected.includes(id));
    // A section without levels shows its options always; a custom one opens them to fix it.
    const showExtras = !section.ladder || open || isCustom || forceOpen;
    const panelId = `extras-${section.key}`;

    return (
        <section
            aria-labelledby={`section-${section.key}`}
            className={`relative rounded-row border bg-surface p-3.5 transition sm:p-4 ${
                changed ? 'border-brand-200 before:absolute before:inset-y-4 before:-start-px before:w-[3px] before:rounded-full before:bg-brand-500' : 'border-gray-100'
            }`}
        >
            <div className="flex flex-wrap items-center gap-3">
                <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] transition ${
                        holdsAny ? 'bg-graphite-gradient text-white dark:ring-1 dark:ring-white/10' : 'bg-gray-100 text-gray-500'
                    }`}
                >
                    <Icon name={details.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-[11rem] flex-1">
                    <h4 id={`section-${section.key}`} className="flex flex-wrap items-center gap-2 font-bold text-gray-900">
                        {section.label}
                        {changed && <span className="rounded-full border border-brand-200 bg-brand-50 px-2 text-[11px] font-bold text-brand-700">تغيّر</span>}
                        {isCustom && (
                            <span title="صلاحيات هذا القسم لا تطابق مستوى واحدًا: اختر مستوى لتوحيدها، أو عدّلها من الخيارات" className="rounded-full bg-blue-500/10 px-2 text-[11px] font-bold text-blue-700 dark:text-blue-400">
                                مخصّص
                            </span>
                        )}
                    </h4>
                    <p className="text-[13px] text-gray-500">
                        {sectionSentence(section, selected)}
                        {section.ladder && heldExtras > 0 && <> · ومعه {heldExtras} {heldExtras === 1 ? 'خيار إضافي' : 'خيارات إضافية'}</>}
                    </p>
                </div>

                {section.ladder && (
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                        <LevelPicker section={section} level={level} onChange={(next) => onChange(withSectionLevel(section, selected, next))} disabled={disabled} />
                        {extraItems.length > 0 && !isCustom && (
                            <button
                                type="button"
                                onClick={() => setOpen((current) => !current)}
                                aria-expanded={showExtras}
                                aria-controls={panelId}
                                className="inline-flex h-9 items-center gap-1.5 rounded-control border border-gray-200 bg-surface px-3 text-sm font-semibold text-gray-700 transition hover:border-brand-500/40 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900"
                            >
                                خيارات إضافية
                                {heldExtras > 0 ? (
                                    <span className="rounded-full bg-brand-50 px-1.5 font-display text-[11px] font-bold text-brand-700">{heldExtras}</span>
                                ) : (
                                    <span className="font-display text-xs text-gray-400">({extraItems.length})</span>
                                )}
                                <Icon name="chevron-down" className={`h-4 w-4 transition-transform ${showExtras ? 'rotate-180' : ''}`} />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {showExtras && (extraItems.length > 0 || isCustom) && (
                <div id={panelId} className="mt-3 overflow-hidden rounded-control border border-gray-100 sm:ms-[52px]">
                    {isCustom && (
                        <>
                            <p className="bg-gray-50 px-3.5 py-1.5 text-xs font-bold text-gray-500">إجراءات القسم</p>
                            {section.ladder.ids.map((id, index) => (
                                <ExtraOption
                                    key={id}
                                    section={section}
                                    item={{ id, label: section.ladder.labels[index], hint: '', risk: null, needs: 0 }}
                                    selected={selected}
                                    onChange={onChange}
                                    disabled={disabled}
                                />
                            ))}
                        </>
                    )}
                    {extras.map((group) => (
                        <div key={group.title}>
                            <p className="border-t border-gray-100 bg-gray-50 px-3.5 py-1.5 text-xs font-bold text-gray-500 first:border-t-0">{group.title}</p>
                            {group.items.map((item) => (
                                <ExtraOption key={item.id} section={section} item={item} selected={selected} onChange={onChange} disabled={disabled} />
                            ))}
                        </div>
                    ))}
                </div>
            )}
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

/**
 * One employee's permissions: who they are and how far they are from
 * their role's template (with a way back to it, another template, or a
 * colleague's permissions), the sections by group with their levels and
 * extra options, a live summary beside them, and a bar to review and
 * save once something changed. Dangerous grants must be acknowledged in
 * the review before they are saved.
 */
function PermissionEditor({ employee, sections, templates, copySources, scopedToOwnBranch, onDirtyChange }) {
    const saved = employee.permissionIds;
    const { data, setData, put, processing, errors } = useForm({ permissions: { [employee.id]: [...saved] } });
    const selected = data.permissions[employee.id];
    const [query, setQuery] = useState('');
    const [mode, setMode] = useState('all');
    const [reviewing, setReviewing] = useState(false);
    const [acknowledged, setAcknowledged] = useState(false);
    const changes = useMemo(() => individualChanges(sections, saved, selected), [sections, saved, selected]);
    const dangerousGrants = changes.filter((change) => change.added && change.risk === 'danger');
    const dirty = !samePermissions(saved, selected);
    const template = templates.find((item) => item.role === employee.role);
    const deviations = template ? individualChanges(sections, template.permissionIds, selected).length : null;
    const matching = filterSections(sections, selected, saved, query, mode);
    const searching = query.trim() !== '';
    const groups = [
        ...SECTION_GROUPS.map((group) => ({ ...group, sections: group.keys.map((key) => matching.find((section) => section.key === key)).filter(Boolean) })),
        {
            title: 'أخرى',
            hint: '',
            sections: matching.filter((section) => !SECTION_GROUPS.some((group) => group.keys.includes(section.key))),
        },
    ].filter((group) => group.sections.length > 0);

    function setSelected(ids) {
        setData('permissions', { [employee.id]: ids });
    }

    function setGroup(group, viewOnly) {
        setSelected(withGroupAccess(group.sections, selected, viewOnly));
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

    // Ctrl+S (⌘S) saves.
    useEffect(() => {
        function onKeyDown(event) {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (!reviewing) {
                    save();
                }
            }
        }

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    });

    return (
        <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rise-in min-w-0 rounded-card border border-gray-100 bg-surface shadow-card" aria-label={`صلاحيات ${employee.name}`}>
                <div className="space-y-4 border-b border-gray-100 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-3.5">
                        <EmployeeAvatar name={employee.name} size="lg" />
                        <div className="min-w-0">
                            <h3 className="break-words text-xl font-bold text-gray-900">{employee.name}</h3>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-gray-500">
                                <span className="rounded-lg bg-gray-100 px-2 py-0.5 font-bold text-gray-700">{employee.roleLabel}</span>
                                <span className="inline-flex items-center gap-1">
                                    <Icon name="office" className="h-4 w-4" />
                                    {employee.branchName ?? 'بلا فرع'}
                                </span>
                                <span className="font-display" dir="ltr">
                                    @{employee.username}
                                </span>
                            </p>
                        </div>
                        <div className="flex w-full flex-wrap gap-2 sm:ms-auto sm:w-auto">
                            <MenuButton icon="shield" label="تطبيق قالب">
                                {(close) =>
                                    templates.map((item) => (
                                        <MenuItem
                                            key={item.role}
                                            title={item.label}
                                            subtitle={`${item.permissionIds.length} صلاحية${item.role === employee.role ? ' · الدور الحالي' : ''}`}
                                            trailing={item.role === employee.role && <Icon name="check" className="h-4 w-4 text-gray-500" />}
                                            onSelect={() => {
                                                setSelected([...item.permissionIds]);
                                                close();
                                            }}
                                        />
                                    ))
                                }
                            </MenuButton>
                            <MenuButton icon="users" label="نسخ من موظف">
                                {(close) =>
                                    copySources.length === 0 ? (
                                        <p className="px-3 py-4 text-center text-sm text-gray-500">لا يوجد موظفون آخرون في هذه الصفحة.</p>
                                    ) : (
                                        copySources.map((user) => (
                                            <MenuItem
                                                key={user.id}
                                                leading={<EmployeeAvatar name={user.name} size="sm" />}
                                                title={user.name}
                                                subtitle={`${user.roleLabel} · ${user.branchName ?? 'بلا فرع'}`}
                                                trailing={<span className="font-display text-xs font-semibold text-gray-500">{user.permissionIds.length}</span>}
                                                onSelect={() => {
                                                    setSelected([...user.permissionIds]);
                                                    close();
                                                }}
                                            />
                                        ))
                                    )
                                }
                            </MenuButton>
                        </div>
                    </div>

                    {template && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-gray-100 bg-gray-50 px-3.5 py-2.5 text-sm">
                            <Icon name="shield" className="h-[18px] w-[18px] text-gray-400" />
                            {deviations === 0 ? (
                                <span className="text-gray-600">
                                    مطابق تمامًا لقالب <b className="text-gray-900">«{template.label}»</b>
                                </span>
                            ) : (
                                <span className="text-gray-600">
                                    مخصّص: <b className="font-display text-blue-700 dark:text-blue-400">{deviations}</b> {deviations === 1 ? 'اختلاف' : 'اختلافات'} عن قالب{' '}
                                    <b className="text-gray-900">«{template.label}»</b>
                                </span>
                            )}
                            {deviations > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setSelected([...template.permissionIds])}
                                    disabled={processing}
                                    className="ms-auto rounded font-semibold text-brand-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900"
                                >
                                    إعادة إلى القالب
                                </button>
                            )}
                        </div>
                    )}

                    <div className="table-controls flex flex-wrap items-center gap-2">
                        <div className="relative w-full sm:max-w-xs">
                            <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400" />
                            <input
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="ابحث بكلمة: دفعة، خصم، حذف..."
                                aria-label="ابحث عن صلاحية"
                                className="block w-full py-2 ps-10 text-sm"
                            />
                        </div>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="تصفية الأقسام">
                            {[
                                ['all', 'الكل'], ['enabled', 'المفعّلة'], ['sensitive', 'فيها صلاحيات خاصة'], ['changed', 'المعدّلة'],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setMode(value)}
                                    aria-pressed={mode === value}
                                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${
                                        mode === value ? 'border-gray-900 bg-gray-900 text-surface' : 'border-gray-200 text-gray-600 hover:border-brand-500/40 hover:text-gray-900'
                                    }`}
                                >
                                    {label} <span className="ms-0.5 font-display opacity-70">{filterSections(sections, selected, saved, '', value).length}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {groups.length === 0 ? (
                    <div className="px-5 py-10 text-center text-sm text-gray-500">
                        <p>لا توجد صلاحيات تطابق البحث أو التصفية.</p>
                        <button type="button" onClick={() => { setQuery(''); setMode('all'); }} className="mt-2 font-semibold text-brand-600">
                            عرض كل الصلاحيات
                        </button>
                    </div>
                ) : (
                    groups.map((group) => (
                        <div key={group.title} className="px-4 pt-2 sm:px-5">
                            <div className="mb-2 mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                <h4 className="font-bold text-gray-900">{group.title}</h4>
                                {group.hint && <span className="hidden text-xs text-gray-500 sm:inline">{group.hint}</span>}
                                <span className="h-px flex-1 bg-gray-100" />
                                <button type="button" onClick={() => setGroup(group, true)} disabled={processing} className="rounded-lg px-2 py-0.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                                    عرض فقط للمجموعة
                                </button>
                                <button type="button" onClick={() => setGroup(group, false)} disabled={processing} className="rounded-lg px-2 py-0.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                                    إلغاء المجموعة
                                </button>
                            </div>
                            <div className="space-y-2">
                                {group.sections.map((section) => (
                                    <SectionRow
                                        key={section.key}
                                        section={section}
                                        selected={selected}
                                        saved={saved}
                                        onChange={setSelected}
                                        disabled={processing}
                                        forceOpen={searching}
                                    />
                                ))}
                            </div>
                        </div>
                    ))
                )}

                <div className="m-4 flex items-start gap-2.5 rounded-control border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600 sm:m-5">
                    <Icon name="info" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-gray-400" />
                    <p>
                        كل مستوى يشمل ما قبله، والخيارات الإضافية مستقلة عنه.{' '}
                        {scopedToOwnBranch
                            ? 'تظهر هنا الصلاحيات التي تملكها فقط، وتمنحها لموظفي فرعك؛ صلاحيات الفروع والمحافظات والمناطق يمنحها مدير النظام.'
                            : 'مدير النظام يملك جميع الصلاحيات تلقائيًا، ومدير الفرع يدير صلاحيات موظفي فرعه مما يملكه هو.'}
                    </p>
                </div>
            </section>

            <div className="2xl:sticky 2xl:top-24">
                <PermissionSummary employee={employee} sections={sections} selected={selected} template={template} scopedToOwnBranch={scopedToOwnBranch} />
            </div>

            {/* Room at the end of the page, so the bar never hides the last section. */}
            {dirty && <div className="h-20 2xl:col-span-2" aria-hidden="true" />}

            <div
                role="region"
                aria-label="تغييرات لم تُحفظ"
                className={`fixed inset-x-0 bottom-4 z-30 mx-auto flex w-[calc(100%-2rem)] max-w-3xl flex-wrap items-center gap-3 rounded-2xl bg-graphite-gradient px-4 py-3 text-white shadow-lift ring-1 ring-white/10 transition duration-200 ${
                    dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'
                }`}
                aria-hidden={!dirty}
            >
                {Object.keys(errors).length > 0 && (
                    <p className="w-full text-sm font-semibold text-red-300" role="alert">
                        تعذّر حفظ الصلاحيات: {Object.values(errors)[0]}
                    </p>
                )}
                <p className="flex flex-1 items-center gap-2 text-sm" role="status">
                    <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-white px-2 font-display text-sm font-bold text-gray-900">{changes.length}</span>
                    {changes.length === 1 ? 'تغيير لم يُحفظ' : 'تغييرات لم تُحفظ'} لـ {employee.name}
                </p>
                <button
                    type="button"
                    onClick={() => setSelected([...saved])}
                    disabled={processing || !dirty}
                    className="inline-flex items-center gap-1.5 rounded-control bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40"
                >
                    <Icon name="undo" className="h-4 w-4" />
                    تراجع
                </button>
                <PrimaryButton type="button" onClick={save} disabled={processing || !dirty} title="Ctrl + S">
                    <Icon name="check" className="h-4 w-4" strokeWidth={2} />
                    {processing ? 'جارٍ الحفظ...' : 'مراجعة وحفظ'}
                </PrimaryButton>
            </div>

            <Modal show={reviewing} onClose={() => { if (!processing) { setReviewing(false); } }} maxWidth="2xl" centered>
                <div role="dialog" aria-modal="true" aria-labelledby={`permission-review-${employee.id}`} dir="rtl">
                    <div className="px-5 pb-4 pt-6 sm:px-7">
                        <h3 id={`permission-review-${employee.id}`} className="text-lg font-bold text-gray-900">مراجعة تغييرات الصلاحيات</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            {changes.filter((item) => item.added).length} تُمنح · {changes.filter((item) => !item.added).length} تُلغى
                        </p>
                    </div>
                    <PermissionChangeReview employee={employee} changes={changes} />
                    {dangerousGrants.length > 0 && (
                        <label className="mx-5 mb-5 flex cursor-pointer items-start gap-2.5 rounded-control bg-red-500/[0.07] px-3.5 py-3 text-sm text-red-800 dark:text-red-300 sm:mx-7">
                            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 rounded border-gray-300 text-brand-600" />
                            <span>
                                يحصل {employee.name.split(' ')[0]} على صلاحيات خطيرة: <b>{dangerousGrants.map((item) => item.label).join('، ')}</b>. أؤكد أنه يحتاجها لعمله.
                            </span>
                        </label>
                    )}
                    <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:px-7">
                        <SecondaryButton onClick={() => setReviewing(false)} disabled={processing} autoFocus>
                            العودة للتعديل
                        </SecondaryButton>
                        <PrimaryButton type="button" onClick={confirmSave} disabled={processing || !dirty || (dangerousGrants.length > 0 && !acknowledged)}>
                            {processing ? 'جارٍ الحفظ...' : 'تأكيد وحفظ الصلاحيات'}
                        </PrimaryButton>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

export default function Permissions({ users, selectedUser, permissionGroups, roleTemplates, filters, filterOptions, scopedToOwnBranch }) {
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
            if (event.target.closest?.('input, textarea, select, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) {
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

            <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
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
                            key={`${selectedUser.id}:${selectedUser.permissionIds.join(',')}`}
                            employee={selectedUser}
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
