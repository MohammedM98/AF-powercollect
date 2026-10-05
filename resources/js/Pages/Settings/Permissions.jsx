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
import { filterSections, individualChanges, levelOf, permissionEntries, samePermissions, sectionIds, sectionModel, withGroupAccess, withLevel, withToggled } from '@/lib/permissions';

/** The icon and one-line description of each section (keyed like PermissionKey::resourceGroups()). */
const SECTION_DETAILS = {
    subscribers: { icon: 'users', description: 'بيانات المشتركين' },
    meter_boxes: { icon: 'table', description: 'الطبلونات ومواقعها' },
    circuit_breakers: { icon: 'bolt', description: 'القواطع وأمبيراتها' },
    tariffs: { icon: 'dollar', description: 'أسعار الكيلو والحد الأدنى' },
    meter_readings: { icon: 'gauge', description: 'قراءات العدادات الأسبوعية' },
    collections: { icon: 'card', description: 'السجل المالي والدفعات وحركات الحسابات' },
    closings: { icon: 'scale', description: 'الإغلاق اليومي وتسليم النقد والتقارير' },
    reports: { icon: 'trend', description: 'تقارير المال، كل تقرير بصلاحيته' },
    messages: { icon: 'messages', description: 'رسائل المشتركين' },
    print_templates: { icon: 'printer', description: 'قوالب الطباعة المشتركة لكل الشركة' },
    users: { icon: 'user', description: 'حسابات الموظفين' },
    user_types: { icon: 'badge', description: 'أنواع المستخدمين' },
    branches: { icon: 'pin', description: 'فروع الشركة' },
    governorates: { icon: 'map', description: 'المحافظات' },
    areas: { icon: 'map', description: 'المناطق' },
    sub_areas: { icon: 'map', description: 'منطقة 2 داخل منطقة الفرع' },
};

/** The sections in the order the editor groups them; any section not named here goes last. */
const SECTION_GROUPS = [
    { title: 'البيانات الأساسية', hint: 'المشتركون وأدوات العمل اليومي', keys: ['subscribers', 'meter_boxes', 'circuit_breakers', 'tariffs'] },
    { title: 'المال والتحصيل', hint: 'كل ما يغيّر أرصدة المشتركين أو يعرضها', keys: ['meter_readings', 'collections', 'closings', 'reports'] },
    { title: 'التواصل والطباعة', hint: 'الرسائل وقوالب الطباعة', keys: ['messages', 'print_templates'] },
    { title: 'الإدارة والمواقع', hint: 'الموظفون والفروع والتقسيمات الجغرافية', keys: ['users', 'user_types', 'branches', 'governorates', 'areas', 'sub_areas'] },
];

/** The dot beside a chosen level: blue to view, amber in between, burgundy at the top. */
function levelTone(level, top) {
    if (level === 0) {
        return null;
    }

    return level === top ? 'top' : level === 1 ? 'bg-blue-600' : 'bg-amber-600';
}

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
                                                        <span title="تغييرات لم تُحفظ" className="h-2.5 w-2.5 rounded-full bg-amber-500 ring-4 ring-amber-500/20" />
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

/** A section's level picker: one button per level, each meaning everything up to it. */
function LevelPicker({ section, level, onChange, disabled }) {
    const top = section.ladder.levels.length - 1;

    return (
        <div
            role="radiogroup"
            aria-label={`مستوى ${section.label}`}
            className="inline-flex w-full gap-0.5 rounded-control border border-gray-100 bg-gray-50 p-[3px] sm:w-auto"
        >
            {section.ladder.levels.map((name, index) => {
                const checked = level === index;
                const tone = checked ? levelTone(index, top) : null;

                return (
                    <button
                        key={name}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={disabled}
                        title={section.ladder.long[index]}
                        onClick={() => onChange(index)}
                        className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 disabled:cursor-not-allowed sm:flex-none ${
                            !checked
                                ? 'text-gray-500 hover:text-gray-900'
                                : tone === 'top'
                                  ? 'bg-brand-gradient text-white shadow-glow'
                                  : index === 0
                                    ? 'bg-surface text-gray-500 shadow-sm ring-1 ring-gray-100'
                                    : 'bg-surface text-gray-900 shadow-sm ring-1 ring-gray-100'
                        }`}
                    >
                        {index > 0 && <i className={`h-2 w-2 rounded-full ${checked ? (tone === 'top' ? 'bg-white' : tone) : 'bg-current opacity-30'}`} />}
                        {name}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * One section: its level (or its own switches), the line saying what that
 * level allows, and its sensitive permissions set apart. A section whose
 * permissions don't sit on a level is "custom" and shows its switches.
 */
function SectionRow({ section, selected, saved, onChange, onSensitive, disabled }) {
    const details = SECTION_DETAILS[section.key] ?? { icon: 'shield', description: '' };
    const level = section.ladder ? levelOf(section.ladder, selected) : null;
    const savedLevel = section.ladder ? levelOf(section.ladder, saved) : null;
    const isCustom = section.ladder && level === null;
    const [detailed, setDetailed] = useState(false);
    const ids = sectionIds(section);
    const changed = ids.some((id) => selected.includes(id) !== saved.includes(id));
    const holdsAny = ids.some((id) => selected.includes(id));
    const showSwitches = section.ladder && (isCustom || detailed);
    // A record's delete sits on the level's line, compact; the money section's own deletions keep their tiles.
    const inlineDelete = section.ladder && section.key !== 'collections' ? section.sensitive.find((item) => item.action === 'delete') : null;
    const tiles = section.sensitive.filter((item) => item !== inlineDelete);

    return (
        <div
            className={`rounded-row border p-3.5 transition sm:p-4 ${
                changed ? 'border-amber-500/40 bg-amber-500/[0.04]' : 'border-gray-100 bg-surface'
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
                    <h4 className="font-bold text-gray-900">{section.label}</h4>
                    <p className="text-[13px] text-gray-500">
                        {section.ladder && level !== null ? section.ladder.long[level] : details.description}
                        {section.ladder && changed && savedLevel !== level && (
                            <span className="ms-2 whitespace-nowrap text-xs font-bold text-amber-700 dark:text-amber-400">
                                كان: {savedLevel === null ? 'مخصّص' : section.ladder.levels[savedLevel]}
                            </span>
                        )}
                    </p>
                </div>

                {section.ladder && (
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                        {isCustom && (
                            <span
                                title="صلاحيات هذا القسم لا تطابق مستوى واحدًا — اختر مستوى لتوحيدها، أو عدّلها من المفاتيح أدناه"
                                className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-bold text-blue-700"
                            >
                                مخصّص
                            </span>
                        )}
                        <LevelPicker section={section} level={level} onChange={(next) => onChange(withLevel(section.ladder, selected, next))} disabled={disabled} />
                        {inlineDelete && (
                            <span
                                title={inlineDelete.hint}
                                className="inline-flex items-center gap-1.5 rounded-control border border-amber-500/30 bg-amber-500/[0.06] py-1 pe-1 ps-2.5"
                            >
                                <Icon name="warning" className="h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} />
                                <Switch
                                    checked={selected.includes(inlineDelete.id)}
                                    onChange={(next) =>
                                        next ? onSensitive(inlineDelete, section) : onChange(withToggled(selected, inlineDelete.id, false))
                                    }
                                    label={inlineDelete.label}
                                    ariaLabel={`${section.label}: ${inlineDelete.label}`}
                                    disabled={disabled}
                                />
                            </span>
                        )}
                        {!isCustom && section.ladder.ids.length > 1 && (
                            <button
                                type="button"
                                onClick={() => setDetailed((current) => !current)}
                                aria-expanded={detailed}
                                className="text-xs font-semibold text-gray-500 underline decoration-dotted underline-offset-4 hover:text-gray-900"
                            >
                                {detailed ? 'إخفاء الإجراءات' : 'اختيار إجراءات منفصلة'}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {(showSwitches || section.switches.some((item) => !item.hint)) && (
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2.5 sm:ps-[52px]">
                    {showSwitches &&
                        section.ladder.ids.map((id, index) => (
                            <Switch
                                key={id}
                                checked={selected.includes(id)}
                                onChange={(on) => onChange(withToggled(selected, id, on))}
                                label={section.ladder.labels[index]}
                                ariaLabel={`${section.label}: ${section.ladder.labels[index]}`}
                                disabled={disabled}
                            />
                        ))}
                    {section.switches
                        .filter((item) => !item.hint)
                        .map((item) => (
                            <Switch
                                key={item.id}
                                checked={selected.includes(item.id)}
                                onChange={(on) => onChange(withToggled(selected, item.id, on))}
                                label={item.label}
                                ariaLabel={`${section.label}: ${item.label}`}
                                disabled={disabled}
                            />
                        ))}
                </div>
            )}

            {section.switches.some((item) => item.hint) && (
                <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2 sm:ps-[52px]">
                    {section.switches
                        .filter((item) => item.hint)
                        .map((item) => (
                            <div key={item.id} className="flex items-center gap-2.5 rounded-control border border-gray-100 bg-gray-50 px-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-gray-900">{item.label}</p>
                                    <p className="text-xs text-gray-500">{item.hint}</p>
                                </div>
                                <Switch
                                    checked={selected.includes(item.id)}
                                    onChange={(on) => onChange(withToggled(selected, item.id, on))}
                                    ariaLabel={`${section.label}: ${item.label}`}
                                    disabled={disabled}
                                />
                            </div>
                        ))}
                </div>
            )}

            {tiles.length > 0 && (
                <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2 sm:ps-[52px]">
                    {tiles.map((item) => {
                        const on = selected.includes(item.id);

                        return (
                            <div
                                key={item.id}
                                className={`flex items-center gap-2.5 rounded-control border px-3 py-2.5 ${
                                    item.danger ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-gray-100 bg-gray-50'
                                }`}
                            >
                                {item.danger && <Icon name="warning" className="h-[18px] w-[18px] shrink-0 text-amber-600" strokeWidth={2} />}
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-gray-900">{item.label}</p>
                                    <p className="text-xs text-gray-500">{item.hint}</p>
                                </div>
                                <Switch
                                    checked={on}
                                    onChange={(next) => (next && item.danger ? onSensitive(item, section) : onChange(withToggled(selected, item.id, next)))}
                                    ariaLabel={`${section.label}: ${item.label}`}
                                    disabled={disabled}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/** The existing graphite summary, focused on access and exceptions rather than a score. */
export function PermissionSummary({ employee, sections, selected, template, scopedToOwnBranch }) {
    const [expanded, setExpanded] = useState(false);
    const entries = permissionEntries(sections);
    const enabled = entries.filter((item) => selected.includes(item.id));
    const sensitive = enabled.filter((item) => item.sensitive);
    const deviations = template ? individualChanges(sections, template.permissionIds, selected).length : null;
    const locked = employee.lockedPermissions ?? [];

    return (
        <div className="relative mx-4 mt-4 overflow-hidden rounded-[20px] bg-graphite-gradient p-4 text-white sm:mx-5 sm:p-5">
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold">صلاحيات {employee.name.split(' ')[0]}</h3>
                    <p className="mt-1 text-xs leading-5 text-white/70">
                        {scopedToOwnBranch ? 'المعروض هو ما يمكنك تعديله لموظفي فرعك.' : 'صلاحيات الموظف ضمن نطاق دوره وفرعه.'}
                        {' '}القالب ينسخ الصلاحيات ولا يغيّر الدور أو الفرع.
                    </p>
                </div>
                <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}
                    className="rounded-control border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10">
                    {expanded ? 'إخفاء ملخص الإجراءات' : 'عرض ملخص الإجراءات'}
                </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                {[
                    { count: enabled.length, label: 'صلاحية قابلة للإدارة' },
                    { count: sensitive.length, label: 'صلاحية خاصة مفعّلة' },
                    { count: deviations ?? '—', label: 'اختلاف عن قالب الدور' },
                ].map((stat) => (
                    <div key={stat.label} className="rounded-control bg-white/10 px-3 py-2.5">
                        <b className="font-display text-xl">{stat.count}</b>
                        <p className="mt-0.5 text-xs leading-5 text-white/70">{stat.label}</p>
                    </div>
                ))}
            </div>
            {template && <p className="mt-3 text-xs text-white/70">{deviations === 0 ? `مطابق لقالب ${template.label}` : `صلاحيات مخصّصة عن قالب ${template.label}`}</p>}
            {expanded && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {enabled.length === 0 && <span className="text-sm text-white/70">لا توجد صلاحيات مفعّلة ضمن ما يمكنك إدارته.</span>}
                    {enabled.map((item) => (
                        <span key={item.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${item.sensitive ? 'bg-amber-400/20 text-amber-200' : 'bg-white/10 text-white/90'}`}>
                            <Icon name={item.sensitive ? 'warning' : 'check'} className="h-3.5 w-3.5" />
                            {item.section}: {item.label}
                        </span>
                    ))}
                </div>
            )}
            {locked.length > 0 && (
                <div className="mt-3 border-t border-white/15 pt-3 text-xs leading-5 text-white/70">
                    <b className="text-white">{locked.length} صلاحية خارج نطاق إدارتك، تبقى كما هي:</b> {locked.join('، ')}
                </div>
            )}
        </div>
    );
}

export function PermissionChangeReview({ employee, changes }) {
    return (
        <div className="px-5 pb-5 sm:px-7">
            <div className="mb-4 rounded-control border border-gray-100 bg-gray-50 p-3 text-sm leading-6 text-gray-600">
                <b className="text-gray-900">{employee.name}</b> · {employee.roleLabel} · {employee.branchName ?? 'بلا فرع'}
                <p>راجع كل إجراء قبل الحفظ. لا تتغيّر الصلاحيات خارج نطاق إدارتك.</p>
            </div>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto" tabIndex={0} aria-label="جميع تغييرات الصلاحيات">
                {changes.map((change) => (
                    <div key={change.id} className="flex flex-wrap items-start gap-3 rounded-control border border-gray-100 px-3 py-2.5">
                        <Icon name={change.sensitive ? 'warning' : 'shield'} className={`mt-0.5 h-4 w-4 shrink-0 ${change.sensitive ? 'text-amber-600' : 'text-gray-400'}`} />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-gray-900">{change.label}</p>
                            <p className="text-xs text-gray-500">{change.section}{change.hint ? ` · ${change.hint}` : ''}</p>
                        </div>
                        <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${change.added ? 'bg-brand-500/10 text-brand-600' : 'bg-gray-100 text-gray-700'}`}>
                            {change.added ? 'غير ممنوح ← سيُمنح' : 'ممنوح ← سيُلغى'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Keep the employee's scope visible while editing the grouped permission cards.
 * Saving always opens the complete review of individual grants.
 */
function PermissionEditor({ employee, sections, templates, copySources, scopedToOwnBranch, onDirtyChange }) {
    const saved = employee.permissionIds;
    const { data, setData, put, processing, errors } = useForm({ permissions: { [employee.id]: [...saved] } });
    const selected = data.permissions[employee.id];
    const [query, setQuery] = useState('');
    const [mode, setMode] = useState('all');
    const [reviewing, setReviewing] = useState(false);
    // The sensitive permission waiting on "grant it?".
    const [pendingSensitive, setPendingSensitive] = useState(null);
    const changes = useMemo(() => individualChanges(sections, saved, selected), [sections, saved, selected]);
    const dirty = !samePermissions(saved, selected);
    const template = templates.find((item) => item.role === employee.role);
    const matching = filterSections(sections, selected, saved, query, mode);
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
            setReviewing(true);
        }
    }

    function confirmSave() {
        if (dirty && !processing) {
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
                if (!reviewing && !pendingSensitive) {
                    save();
                }
            }
        }

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    });

    return (
        <section className="rise-in rounded-card border border-gray-100 bg-surface shadow-card" aria-label={`صلاحيات ${employee.name}`}>
            <div className="flex flex-wrap items-center gap-3.5 border-b border-gray-100 p-4 sm:p-5">
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
                    <MenuButton icon="shield" label="تطبيق قالب صلاحيات">
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

            <PermissionSummary employee={employee} sections={sections} selected={selected} template={template} scopedToOwnBranch={scopedToOwnBranch} />

            <div className="flex flex-wrap items-center gap-3 px-4 pb-1 pt-4 sm:px-5">
                <div className="relative w-full sm:max-w-xs">
                    <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400" />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="ابحث عن صلاحية..."
                        aria-label="ابحث عن صلاحية"
                        className="block w-full py-2 ps-10 text-sm"
                    />
                </div>
                <p className="hidden items-center gap-3 text-xs text-gray-500 md:ms-auto md:flex">
                    <span>كل مستوى يشمل ما قبله</span>
                    <span className="inline-flex items-center gap-1.5">
                        <i className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
                        عرض
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <i className="h-2.5 w-2.5 rounded-sm bg-amber-600" />
                        إضافة
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <i className="h-2.5 w-2.5 rounded-sm bg-brand-600" />
                        أعلى مستوى
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Icon name="warning" className="h-3.5 w-3.5 text-amber-600" />
                        حساسة
                    </span>
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 px-4 pb-1 pt-3 sm:px-5" role="group" aria-label="تصفية الصلاحيات">
                {[
                    ['all', 'الكل'], ['enabled', 'المفعّلة'], ['sensitive', 'الصلاحيات الخاصة'], ['changed', 'التغييرات'],
                ].map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${mode === value ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {label} <span className="ms-1 font-display">{filterSections(sections, selected, saved, '', value).length}</span>
                    </button>
                ))}
                <span className="text-xs text-gray-500 sm:ms-auto">{matching.length} من {sections.length} أقسام · التصفية لا تغيّر الصلاحيات</span>
            </div>

            {groups.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-500">
                    <p>لا توجد صلاحيات تطابق البحث أو التصفية.</p>
                    <button type="button" onClick={() => { setQuery(''); setMode('all'); }} className="mt-2 font-semibold text-brand-600">عرض كل الصلاحيات</button>
                </div>
            ) : (
                groups.map((group) => (
                    <div key={group.title} className="px-4 pt-2 sm:px-5">
                        <div className="mb-2 mt-3 flex items-center gap-2.5">
                            <h4 className="font-bold text-gray-900">{group.title}</h4>
                            {group.hint && <span className="hidden text-xs text-gray-500 sm:inline">{group.hint}</span>}
                            <span className="h-px flex-1 bg-gray-100" />
                            <button
                                type="button"
                                onClick={() => setGroup(group, false)}
                                className="rounded-lg px-2 py-0.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            >
                                إلغاء المجموعة
                            </button>
                            <button
                                type="button"
                                onClick={() => setGroup(group, true)}
                                className="rounded-lg px-2 py-0.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            >
                                عرض فقط للمجموعة
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
                                    onSensitive={(item) => setPendingSensitive(item)}
                                    disabled={processing}
                                />
                            ))}
                        </div>
                    </div>
                ))
            )}

            <div className="m-4 flex items-start gap-2.5 rounded-control border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600 sm:m-5">
                <Icon name="info" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-gray-400" />
                <p>
                    <b className="text-gray-900">ملاحظة: </b>
                    {scopedToOwnBranch
                        ? 'تظهر هنا الصلاحيات التي تملكها فقط، وتمنحها لموظفي فرعك. صلاحيات الفروع والمحافظات والمناطق يمنحها مدير النظام.'
                        : 'مدير النظام يملك جميع الصلاحيات تلقائيًا. مدير الفرع يدير صلاحيات موظفي فرعه فقط، ويمنحهم مما يملكه هو.'}
                </p>
            </div>

            <div
                className={`sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-b-card border-t px-4 py-3 backdrop-blur sm:px-5 ${
                    dirty ? 'border-amber-500/30 bg-surface/95' : 'border-gray-100 bg-surface/90'
                }`}
            >
                {Object.keys(errors).length > 0 && <p className="w-full text-sm font-semibold text-brand-600" role="alert">تعذّر حفظ الصلاحيات: {Object.values(errors)[0]}</p>}
                <span className={`flex items-center gap-2 text-sm ${dirty ? 'font-semibold text-gray-900' : 'text-gray-500'}`} role="status">
                    {dirty ? (
                        <>
                            <b className="rounded-md bg-amber-600 px-2 font-display text-xs text-white">{changes.length}</b>
                            تغييرات لم تُحفظ
                        </>
                    ) : (
                        <>
                            <Icon name="check" className="h-4 w-4" strokeWidth={2} />
                            كل التغييرات محفوظة
                        </>
                    )}
                </span>
                {dirty && (
                    <div className="hidden max-w-xl flex-wrap gap-1.5 md:flex">
                        {changes.slice(0, 4).map((change) => (
                            <span
                                key={change.text}
                                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                    change.added ? 'bg-brand-500/10 text-brand-600' : 'bg-gray-100 text-gray-700'
                                }`}
                            >
                                {change.added ? '+' : '−'} {change.text}
                            </span>
                        ))}
                        {changes.length > 4 && (
                            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">+{changes.length - 4}</span>
                        )}
                    </div>
                )}
                <div className="ms-auto flex items-center gap-2">
                    <SecondaryButton onClick={() => setSelected([...saved])} disabled={processing || !dirty}>
                        <Icon name="undo" className="h-4 w-4" />
                        تراجع
                    </SecondaryButton>
                    <PrimaryButton type="button" onClick={save} disabled={processing || !dirty} title="Ctrl + S">
                        <Icon name="check" className="h-4 w-4" strokeWidth={2} />
                        {processing ? 'جارٍ الحفظ...' : 'مراجعة وحفظ الصلاحيات'}
                    </PrimaryButton>
                </div>
            </div>

            <Modal show={reviewing} onClose={() => { if (!processing) { setReviewing(false); } }} maxWidth="2xl" centered>
                <div role="dialog" aria-modal="true" aria-labelledby={`permission-review-${employee.id}`} dir="rtl">
                    <div className="px-5 pb-4 pt-6 sm:px-7">
                        <h3 id={`permission-review-${employee.id}`} className="text-lg font-bold text-gray-900">مراجعة تغييرات الصلاحيات</h3>
                        <p className="mt-1 text-sm text-gray-500">منح {changes.filter((item) => item.added).length} · إلغاء {changes.filter((item) => !item.added).length}</p>
                    </div>
                    <PermissionChangeReview employee={employee} changes={changes} />
                    <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:px-7">
                        <SecondaryButton onClick={() => setReviewing(false)} disabled={processing} autoFocus>العودة للتعديل</SecondaryButton>
                        <PrimaryButton type="button" onClick={confirmSave} disabled={processing || !dirty}>{processing ? 'جارٍ الحفظ...' : 'تأكيد وحفظ الصلاحيات'}</PrimaryButton>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                show={Boolean(pendingSensitive)}
                onConfirm={() => {
                    setSelected(withToggled(selected, pendingSensitive.id, true));
                    setPendingSensitive(null);
                }}
                onCancel={() => setPendingSensitive(null)}
                title="صلاحية حساسة"
                message={`«${pendingSensitive?.label ?? ''}»: ${pendingSensitive?.hint ?? ''}. هل تريد منحها لـ ${employee.name}؟ ستراجع التغييرات كاملة قبل حفظها.`}
                confirmLabel="نعم، فعّلها"
                cancelLabel="إلغاء"
                icon="warning"
            />
        </section>
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

            <div className="grid items-start gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
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
