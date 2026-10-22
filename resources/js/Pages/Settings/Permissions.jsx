import { useEffect, useMemo, useRef, useState } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import AuditAccessCard, { AuditWorkSummary, auditScopeLabel, auditSettingsChanges } from './AuditAccessCard';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import ConfirmDialog from '@/Components/ConfirmDialog';
import PermissionPanel from './PermissionPanel';
import PermissionGuide, { PermissionExplanation } from './PermissionGuide';
import EmployeeList, { EmployeeAvatar, RoleChip } from './PermissionPeople';
import { MatrixHead, MatrixLegend, RiskBadge, SectionRow, TriToggle } from './PermissionMatrix';
import { PermissionCompare, PermissionSummary, RiskGauge } from './PermissionInsights';
import { CATEGORIES } from '@/lib/permissionGuide';
import './PermissionDesign.css';
import { useDataTable } from '@/hooks/useDataTable';
import {
    copyWorkPermissions,
    filterSections,
    individualChanges,
    matchesQuery,
    matrixExtras,
    permissionEntries,
    permissionsWord,
    riskCounts,
    riskLevel,
    roleColors,
    samePermissions,
    sectionIds,
    sectionModel,
    withGroupAccess,
    withSectionsAll,
    withToggled,
} from '@/lib/permissions';
import PageHeader from '@/Components/PageHeader';
import Switch from '@/Components/Switch';

export { SectionRow, PermissionSummary };

const defaultColorOf = roleColors([]);

const MODES = [
    ['all', 'الكل'],
    ['enabled', 'المفعّلة'],
    ['sensitive', 'فيها صلاحيات خاصة'],
    ['changed', 'المعدّلة'],
];

/** What each group of sections covers, shown with «الشرح» on. */
const GROUP_NOTES = {
    basic: 'بيانات العمل اليومي: المشتركون والطبلونات والقواطع وأسعار الكيلو.',
    readings: 'إدخال القراءات الأسبوعية واعتمادها، وتوزيع الطبلونات على القرّاء الميدانيين والكشوف الورقية.',
    finance: 'الدفعات والحركات المالية والتقارير وقوائم القطع. أغلب خياراتها حساسة لأنها تغيّر أرصدة المشتركين.',
    audit: 'مراجعة الصناديق المغلقة ومبالغ البنك واعتماد الفروق. يمنحه السوبر أدمن لأشخاص محددين مع فروع تدقيقهم.',
    communication: 'رسائل المشتركين وقوالب الطباعة المشتركة لكل الشركة.',
    administration: 'حسابات الموظفين والفروع والمناطق. يدير أغلبها السوبر أدمن من اللوحة المركزية.',
};

/** Whether the grid's explanations were left on, remembered per browser. */
function storedExplaining() {
    try {
        return localStorage.getItem('permissions.explaining') === '1';
    } catch {
        return false;
    }
}

const TABS = [
    { key: 'matrix', label: 'الصلاحيات', icon: 'table' },
    { key: 'summary', label: 'ماذا يستطيع؟', icon: 'sparkles' },
    { key: 'compare', label: 'مقارنة', icon: 'repeat' },
];

/** A small menu under a button, closed by a click outside it or Esc. */
function MenuButton({ icon, label, children, className = '' }) {
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
            <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={className}>
                <Icon name={icon} className="h-4 w-4" />
                {label}
                <Icon name="chevron-down" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div
                    role="menu"
                    className="animate-dropdown absolute end-0 top-full z-30 mt-2 max-h-80 w-80 overflow-y-auto rounded-2xl border border-gray-100 bg-surface p-1.5 text-gray-900 shadow-lift"
                >
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

/** «+3 −1»: what a change would grant and take away. */
function Delta({ added, removed }) {
    return (
        <bdi dir="ltr" className="pm-delta">
            {added > 0 && <span className="is-added">+{added}</span>}
            {removed > 0 && <span className="is-removed">−{removed}</span>}
            {added === 0 && removed === 0 && <span>=</span>}
        </bdi>
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
                                    <b
                                        className={`mt-px w-3 text-center ${change.added ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400'}`}
                                    >
                                        {change.added ? '+' : '−'}
                                    </b>
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className={`flex flex-wrap items-center gap-1.5 text-sm font-semibold ${change.added ? 'text-gray-900' : 'text-gray-500 line-through'}`}
                                        >
                                            {change.label}
                                            {change.added && <RiskBadge risk={change.risk} />}
                                        </p>
                                        {change.hint && <p className="text-xs text-gray-500">{change.hint}</p>}
                                    </div>
                                    <span
                                        className={`shrink-0 text-xs font-bold ${change.added ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500'}`}
                                    >
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
 * One employee's permissions. A dark header with who they are, how much
 * they hold and how risky it is, and ways to copy a colleague or print
 * their guide; then three views: the grid of every section by action, what
 * they can do in plain words, and a comparison with a colleague. Once
 * something changes, a bar offers to review and save; dangerous grants
 * must be acknowledged in the review before they are saved.
 */
export function PermissionEditor({
    employee,
    sections,
    templates,
    copySources,
    scopedToOwnBranch,
    onDirtyChange,
    auditOptions,
    workBranchOptions = null,
    colorOf = defaultColorOf,
    onSaved,
}) {
    const saved = employee.permissionIds;
    const savedAudit =
        auditOptions && !saved.includes(auditOptions.permissionId) && employee.auditSettingsConfigured === false
            ? { scope: 'selected', branch_ids: employee.branchId ? [employee.branchId] : [], actions: [] }
            : employee.auditSettings;
    const savedWorkBranches = employee.workBranchIds ?? [];
    const { data, setData, put, processing, errors } = useForm({
        permissions: { [employee.id]: [...saved] },
        ...(auditOptions ? { audit_settings: { [employee.id]: savedAudit } } : {}),
        ...(workBranchOptions ? { work_branches: { [employee.id]: [...savedWorkBranches] } } : {}),
    });
    const workBranches = data.work_branches?.[employee.id] ?? savedWorkBranches;
    const workBranchesChanged = !samePermissions(savedWorkBranches, workBranches);
    const selected = data.permissions[employee.id];
    const auditValue = data.audit_settings?.[employee.id];
    const auditEnabled = Boolean(auditOptions && selected.includes(auditOptions.permissionId));
    const auditDraftInitialized = useRef(Boolean(auditOptions && (saved.includes(auditOptions.permissionId) || employee.auditSettingsConfigured)));
    const auditChanges = auditOptions ? auditSettingsChanges(savedAudit, auditValue, auditOptions) : [];
    const [tab, setTab] = useState('matrix');
    const [query, setQuery] = useState('');
    const [mode, setMode] = useState('all');
    const [openSections, setOpenSections] = useState(new Set());
    const [guideAudience, setGuideAudience] = useState(null);
    const [explanation, setExplanation] = useState(null);
    const [explaining, setExplainingState] = useState(storedExplaining);
    const [reviewing, setReviewing] = useState(false);
    const [acknowledged, setAcknowledged] = useState(false);
    const changes = useMemo(() => individualChanges(sections, saved, selected), [sections, saved, selected]);
    const auditGrants =
        auditEnabled && !saved.includes(auditOptions.permissionId)
            ? auditOptions.actions
                  .filter((action) => auditValue.actions.includes(action.value) && action.value.startsWith('approve_'))
                  .map((action) => ({ ...action, added: true, risk: 'danger' }))
            : auditEnabled
              ? auditChanges
              : [];
    const dangerousGrants = [
        ...changes,
        ...auditGrants,
        ...(workBranches.some((id) => !savedWorkBranches.includes(id)) ? [{ added: true, risk: 'danger', label: 'العمل في فروع إضافية' }] : []),
    ].filter((change) => change.added && change.risk === 'danger');
    const dirty = !samePermissions(saved, selected) || auditChanges.length > 0 || workBranchesChanged;
    const template = templates.find((item) => item.role === employee.role);
    const deviations = template ? individualChanges(sections, template.permissionIds, selected).length : null;
    const color = colorOf(employee.roleLabel);
    const counts = riskCounts(sections, selected);
    const heroRisk = riskLevel(sections, selected);
    const allCount = permissionEntries(sections).length;
    const locked = employee.lockedPermissions ?? [];
    const firstName = employee.name.split(' ')[0];
    const needle = query.trim();

    const matching = filterSections(sections, selected, saved, query, mode);
    if (mode === 'changed' && auditChanges.length > 0 && !matching.some((section) => section.key === 'financial_audit')) {
        matching.push(
            ...filterSections(
                sections.filter((section) => section.key === 'financial_audit'),
                selected,
                saved,
                query,
                'all',
            ),
        );
    }
    const listed = new Set(CATEGORIES.flatMap((category) => category.sections));
    const groups = [
        ...CATEGORIES.filter((category) => category.key !== 'all').map((category) => ({
            key: category.key,
            label: category.label,
            icon: category.icon,
            sections: category.sections.map((key) => matching.find((section) => section.key === key)).filter(Boolean),
        })),
        { key: 'other', label: 'أقسام أخرى', icon: 'layers', sections: matching.filter((section) => !listed.has(section.key)) },
    ].filter((group) => group.sections.length > 0);
    const allOpen = matching.length > 0 && matching.every((section) => openSections.has(section.key));

    function setExplaining(on) {
        setExplainingState(on);
        try {
            localStorage.setItem('permissions.explaining', on ? '1' : '0');
        } catch {
            // Private windows may refuse storage; the switch still works for this visit.
        }
    }

    /** Sets the selected permissions; switching the audit on for the first time starts its work at the employee's own branch. */
    function setSelected(ids) {
        if (
            auditOptions &&
            !auditDraftInitialized.current &&
            ids.includes(auditOptions.permissionId) &&
            !selected.includes(auditOptions.permissionId)
        ) {
            setAudit({ scope: 'selected', branch_ids: employee.branchId ? [employee.branchId] : [], actions: [] });
            auditDraftInitialized.current = true;
        }
        setData('permissions', { [employee.id]: ids });
    }

    function setAudit(value) {
        setData('audit_settings', { [employee.id]: value });
    }

    /** Copy a colleague's work permissions; financial audit access and its scope stay a separate decision. */
    function copyFrom(user) {
        setSelected(copyWorkPermissions(sections, selected, user.permissionIds));
    }

    function discard() {
        setData((current) => ({
            ...current,
            permissions: { [employee.id]: [...saved] },
            ...(auditOptions ? { audit_settings: { [employee.id]: savedAudit } } : {}),
            ...(workBranchOptions ? { work_branches: { [employee.id]: [...savedWorkBranches] } } : {}),
        }));
    }

    /** Searching opens the sections whose match is among their options, so it can be seen. */
    function search(value) {
        setQuery(value);
        const text = value.trim();
        setOpenSections(
            new Set(
                text
                    ? sections
                          .filter((section) =>
                              matrixExtras(section).some((group) =>
                                  group.items.some((item) => matchesQuery(item.label, text) || matchesQuery(item.hint ?? '', text)),
                              ),
                          )
                          .map((section) => section.key)
                    : [],
            ),
        );
    }

    function toggleSection(key, next) {
        setOpenSections((old) => {
            const updated = new Set(old);
            next ? updated.add(key) : updated.delete(key);
            return updated;
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
            const previous = {
                permissions: { [employee.id]: [...saved] },
                ...(auditOptions ? { audit_settings: { [employee.id]: savedAudit } } : {}),
                ...(workBranchOptions ? { work_branches: { [employee.id]: [...savedWorkBranches] } } : {}),
            };
            put('/settings/permissions', {
                preserveScroll: true,
                onSuccess: () => {
                    setReviewing(false);
                    onSaved?.({ employeeId: employee.id, name: employee.name, previous });
                },
                onError: () => setReviewing(false),
            });
        }
    }

    function onTabKeyDown(event) {
        const index = TABS.findIndex((item) => item.key === tab);
        const step = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;

        if (step) {
            event.preventDefault();
            const next = TABS[(index + step + TABS.length) % TABS.length];
            setTab(next.key);
            document.getElementById(`permission-tab-${next.key}`)?.focus();
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

    const added = changes.filter((item) => item.added).length;
    const removed = changes.length - added;
    const after = riskCounts(sections, selected);
    const before = riskCounts(sections, saved);

    return (
        <div className="min-w-0 space-y-4">
            <section className="pm-hero rise-in" style={{ '--role': color }} aria-label={`صلاحيات ${employee.name}`}>
                <div className="pm-hero-main">
                    <EmployeeAvatar name={employee.name} color={color} size="lg" />
                    <div className="min-w-0 flex-1">
                        <h3 className="break-words text-2xl font-bold">{employee.name}</h3>
                        <p className="pm-hero-meta">
                            <RoleChip label={employee.roleLabel} color={color} className="on-dark" />
                            <span className="inline-flex items-center gap-1">
                                <Icon name="office" className="h-4 w-4" />
                                {employee.branchName ?? 'بلا فرع'}
                            </span>
                            <span className="font-display" dir="ltr">
                                @{employee.username}
                            </span>
                            {employee.isActive === false && <span className="pm-hero-flag">الحساب موقوف</span>}
                        </p>
                        <p className="pm-hero-stats">
                            <span>
                                <Icon name="key" className="h-4 w-4" />
                                <b className="font-display">{counts.total}</b> من <b className="font-display">{allCount}</b>{' '}
                                {permissionsWord(allCount)}
                            </span>
                            <span className="is-danger">
                                <Icon name="alert" className="h-4 w-4" />
                                <b className="font-display">{counts.danger}</b> خطيرة
                            </span>
                            <span className="is-sensitive">
                                <Icon name="info" className="h-4 w-4" />
                                <b className="font-display">{counts.sensitive}</b> حساسة
                            </span>
                            <span className={`pm-hero-risk is-${heroRisk.level}`}>خطورة {heroRisk.label}</span>
                            {locked.length > 0 && (
                                <span title={locked.join('، ')}>
                                    <Icon name="lock" className="h-4 w-4" />
                                    <b className="font-display">{locked.length}</b> خارج نطاق إدارتك
                                </span>
                            )}
                        </p>
                    </div>
                    <RiskGauge sections={sections} selected={selected} onDark />
                </div>

                <div className="pm-hero-actions">
                    <button type="button" className="pm-hero-button" onClick={() => setGuideAudience('selected')}>
                        <Icon name="document" className="h-4 w-4" />
                        دليل الموظف
                    </button>
                    <MenuButton icon="users" label="نسخ من موظف" className="pm-hero-button">
                        {(close) =>
                            copySources.length === 0 ? (
                                <p className="px-3 py-4 text-center text-sm text-gray-500">لا يوجد موظفون آخرون في هذه الصفحة.</p>
                            ) : (
                                copySources.map((user) => {
                                    const diff = individualChanges(sections, selected, copyWorkPermissions(sections, selected, user.permissionIds));

                                    return (
                                        <MenuItem
                                            key={user.id}
                                            leading={<EmployeeAvatar name={user.name} color={colorOf(user.roleLabel)} size="sm" />}
                                            title={user.name}
                                            subtitle={`${user.roleLabel} · ${user.branchName ?? 'بلا فرع'}`}
                                            trailing={
                                                <Delta
                                                    added={diff.filter((item) => item.added).length}
                                                    removed={diff.filter((item) => !item.added).length}
                                                />
                                            }
                                            onSelect={() => {
                                                copyFrom(user);
                                                close();
                                            }}
                                        />
                                    );
                                })
                            )
                        }
                    </MenuButton>
                </div>

                {template && (
                    <p className="pm-hero-template">
                        <Icon name="shield" className="h-[18px] w-[18px]" />
                        {deviations === 0 ? (
                            <span>
                                مطابق تمامًا لقالب <b>«{template.label}»</b>
                            </span>
                        ) : (
                            <span>
                                مخصّص: <b className="font-display">{deviations}</b> {deviations === 1 ? 'اختلاف' : 'اختلافات'} عن قالب{' '}
                                <b>«{template.label}»</b>
                            </span>
                        )}
                        {deviations > 0 && (
                            <button
                                type="button"
                                onClick={() => setSelected([...template.permissionIds])}
                                disabled={processing}
                                className="ms-auto font-semibold underline-offset-4 hover:underline"
                            >
                                إعادة إلى القالب
                            </button>
                        )}
                    </p>
                )}

                <div className="pm-tabs" role="tablist" aria-label="عرض صلاحيات الموظف">
                    {TABS.map((item) => (
                        <button
                            key={item.key}
                            id={`permission-tab-${item.key}`}
                            type="button"
                            role="tab"
                            aria-selected={tab === item.key}
                            aria-controls={`permission-view-${item.key}`}
                            tabIndex={tab === item.key ? 0 : -1}
                            onClick={() => setTab(item.key)}
                            onKeyDown={onTabKeyDown}
                            className={`pm-tab ${tab === item.key ? 'is-active' : ''}`}
                        >
                            <Icon name={item.icon} className="h-4 w-4" />
                            {item.label}
                            {item.key === 'matrix' && dirty && <span className="pm-unsaved" title="تغييرات لم تُحفظ" />}
                        </button>
                    ))}
                </div>
            </section>

            {tab === 'matrix' && (
                <div id="permission-view-matrix" role="tabpanel" aria-labelledby="permission-tab-matrix" className="space-y-4">
                    {workBranchOptions && (
                        <PermissionPanel
                            title="فروع العمل المسموحة"
                            summary={`${employee.branchName ?? 'بلا فرع'} · فروع إضافية: ${workBranches.length}`}
                            icon="pin"
                            open={openSections.has('work-branches')}
                            onToggle={(next) => toggleSection('work-branches', next)}
                            changed={workBranchesChanged}
                        >
                            <div className="space-y-3 p-4">
                                {explaining && (
                                    <p className="text-sm leading-7 text-gray-500">
                                        الفرع الإداري: <b className="text-gray-900">{employee.branchName ?? 'غير محدد'}</b>. اختر فروعًا إضافية يستطيع
                                        الموظف العمل فيها بنفس صلاحياته عبر رابط كل فرع. نطاق التدقيق مستقل عنها، ونسخ صلاحيات موظف آخر لا يغيّرها.
                                    </p>
                                )}
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {workBranchOptions.map((branch) => (
                                        <div key={branch.id} className="flex items-center gap-2 rounded-control border border-gray-200 bg-surface p-3">
                                            <Switch
                                                checked={branch.id === employee.branchId || workBranches.includes(branch.id)}
                                                disabled={processing || branch.id === employee.branchId}
                                                onChange={(checked) =>
                                                    setData('work_branches', {
                                                        [employee.id]: withToggled(workBranches, branch.id, checked),
                                                    })
                                                }
                                                label={branch.name}
                                                ariaLabel={`العمل في ${branch.name}`}
                                            />
                                            {branch.id === employee.branchId && <span className="ms-auto text-xs text-gray-500">الفرع الإداري</span>}
                                        </div>
                                    ))}
                                </div>
                                {errors.work_branches && <p className="text-sm text-red-600">{errors.work_branches}</p>}
                            </div>
                        </PermissionPanel>
                    )}

                    <section className="pm-card pm-matrix" aria-label="جدول الصلاحيات">
                        <div className="pm-tools">
                            <div className="pm-search">
                                <Icon
                                    name="search"
                                    className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400"
                                />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(event) => search(event.target.value)}
                                    placeholder="ابحث بكلمة: دفعة، خصم، اعتماد، حذف..."
                                    aria-label="ابحث عن صلاحية"
                                    className="block w-full py-2 pe-3 ps-10 text-sm"
                                />
                            </div>
                            <div className="pm-modes" role="group" aria-label="تصفية الأقسام">
                                {MODES.map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setMode(value)}
                                        aria-pressed={mode === value}
                                        className="pm-mode"
                                    >
                                        {label}
                                        <span className="font-display">{filterSections(sections, selected, saved, '', value).length}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="pm-tool-actions">
                                <span className="me-2 inline-flex items-center">
                                    <Switch checked={explaining} onChange={setExplaining} label="الشرح" ariaLabel="إظهار شرح الأقسام والأزرار" />
                                </span>
                                <button
                                    type="button"
                                    className="pm-ghost-button"
                                    disabled={processing || matching.length === 0}
                                    title="يجعل كل قسم معروض للعرض فقط"
                                    onClick={() => setSelected(withGroupAccess(matching, selected, true))}
                                >
                                    <Icon name="eye" className="h-4 w-4" />
                                    عرض فقط
                                </button>
                                <button
                                    type="button"
                                    className="pm-ghost-button"
                                    disabled={processing || matching.length === 0}
                                    title="يسحب صلاحيات الأقسام المعروضة"
                                    onClick={() => setSelected(withSectionsAll(matching, selected, false))}
                                >
                                    <Icon name="close" className="h-4 w-4" />
                                    سحب الكل
                                </button>
                                <button
                                    type="button"
                                    className="pm-ghost-button"
                                    onClick={() => setOpenSections(allOpen ? new Set() : new Set(matching.map((section) => section.key)))}
                                >
                                    <Icon name={allOpen ? 'collapse' : 'expand'} className="h-4 w-4" />
                                    {allOpen ? 'طيّ الكل' : 'فتح الكل'}
                                </button>
                                <button type="button" className="pm-ghost-button is-brand" onClick={() => setGuideAudience('all')}>
                                    <Icon name="document" className="h-4 w-4" />
                                    دليل الصلاحيات
                                </button>
                            </div>
                        </div>
                        {needle && matching.length > 0 && (
                            <p className="pm-found" aria-live="polite">
                                تطابق <b className="font-display">{matching.length}</b> {matching.length === 1 ? 'قسمًا' : 'أقسام'}
                            </p>
                        )}

                        {explaining && (
                            <div className="pm-explain-note">
                                <p>
                                    كل خانة صلاحية مستقلة: تحديد «تعديل» لا يمنح «عرض» أو «إضافة» معه. الخيارات الخاصة بكل قسم تفتح من «خيارات»،
                                    و«ⓘ» تحت أي خانة يشرح ما تتيحه وحدودها.{' '}
                                    {scopedToOwnBranch
                                        ? 'تمنح وتسحب الصلاحيات المتاحة هنا لموظفي فرعك فقط؛ التفويض الإداري والصلاحيات العامة يديرها السوبر أدمن.'
                                        : 'لتمكين مدير الفرع من إضافة موظفين وتوزيع صلاحياتهم، فعّل له «إضافة المستخدمين» و«إدارة صلاحيات موظفي الفرع». المسمى الوظيفي وحده لا يمنح صلاحيات.'}
                                </p>
                                <dl>
                                    <dt>عرض فقط</dt>
                                    <dd>يترك لكل قسم ظاهر صلاحية العرض فقط ويسحب ما سواها.</dd>
                                    <dt>سحب الكل</dt>
                                    <dd>يسحب كل صلاحيات الأقسام الظاهرة.</dd>
                                    <dt>فتح الكل</dt>
                                    <dd>يفتح خيارات كل الأقسام دفعة واحدة دون تغيير شيء.</dd>
                                    <dt>الكل</dt>
                                    <dd>آخر عمود: يمنح أو يسحب كل صلاحيات القسم أو المجموعة.</dd>
                                    <dt>دليل الصلاحيات</dt>
                                    <dd>دليل كامل قابل للبحث والطباعة لكل الصلاحيات.</dd>
                                </dl>
                            </div>
                        )}

                        <div className={`pm-grid ${explaining ? 'is-explaining' : ''}`}>
                            <MatrixHead />
                            {groups.length === 0 ? (
                                <div className="px-5 py-12 text-center text-sm text-gray-500">
                                    <Icon name="search" className="mx-auto h-8 w-8 text-gray-300" />
                                    <p className="mt-2">لا توجد صلاحيات تطابق البحث أو التصفية.</p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            search('');
                                            setMode('all');
                                        }}
                                        className="mt-2 font-semibold text-brand-600"
                                    >
                                        عرض كل الصلاحيات
                                    </button>
                                </div>
                            ) : (
                                groups.map((group) => {
                                    const ids = group.sections.flatMap(sectionIds);
                                    const held = ids.filter((id) => selected.includes(id)).length;

                                    return (
                                        <section key={group.key} className="pm-group" aria-label={group.label}>
                                            <div className="pm-group-head">
                                                <span className="pm-group-icon">
                                                    <Icon name={group.icon} className="h-4 w-4" />
                                                </span>
                                                <h4>{group.label}</h4>
                                                <span className="pm-group-count" style={{ '--fill': `${ids.length ? Math.round((held / ids.length) * 100) : 0}%` }}>
                                                    <b className="font-display">{held}</b> من <b className="font-display">{ids.length}</b>
                                                    <i aria-hidden="true" />
                                                </span>
                                                <span className="flex-1" />
                                                {group.sections.some(
                                                    (section) => section.ladder?.actions.includes('view') || section.key === 'reports',
                                                ) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelected(withGroupAccess(group.sections, selected, true))}
                                                        disabled={processing}
                                                        className="pm-link-button"
                                                    >
                                                        عرض فقط للمجموعة
                                                    </button>
                                                )}
                                                <TriToggle
                                                    ids={ids}
                                                    selected={selected}
                                                    onChange={(on) => setSelected(withSectionsAll(group.sections, selected, on))}
                                                    disabled={processing}
                                                    label={`كل صلاحيات ${group.label}`}
                                                />
                                                {explaining && GROUP_NOTES[group.key] && <p className="pm-group-note">{GROUP_NOTES[group.key]}</p>}
                                            </div>
                                            {group.sections.map((section) =>
                                                section.key === 'financial_audit' && auditOptions ? (
                                                    <SectionRow
                                                        key={section.key}
                                                        section={section}
                                                        selected={selected}
                                                        saved={saved}
                                                        onChange={setSelected}
                                                        disabled={processing}
                                                        open={openSections.has(section.key)}
                                                        onToggle={(next) => toggleSection(section.key, next)}
                                                        onExplain={setExplanation}
                                                        explaining={explaining}
                                                        query={query}
                                                        summary={
                                                            auditEnabled
                                                                ? `مفعّل · ${auditScopeLabel(auditValue, auditOptions.branches)}`
                                                                : 'غير مفعّل · يمنحه السوبر أدمن لأشخاص محددين'
                                                        }
                                                        changed={auditChanges.length > 0}
                                                    >
                                                        <AuditAccessCard
                                                            embedded
                                                            employee={employee}
                                                            options={auditOptions}
                                                            value={auditValue}
                                                            enabled={auditEnabled}
                                                            onEnabledChange={(checked) =>
                                                                setSelected(withToggled(selected, auditOptions.permissionId, checked))
                                                            }
                                                            onChange={setAudit}
                                                            disabled={processing}
                                                        />
                                                    </SectionRow>
                                                ) : (
                                                    <SectionRow
                                                        key={section.key}
                                                        section={section}
                                                        selected={selected}
                                                        saved={saved}
                                                        onChange={setSelected}
                                                        disabled={processing}
                                                        open={openSections.has(section.key)}
                                                        onToggle={(next) => toggleSection(section.key, next)}
                                                        onExplain={setExplanation}
                                                        explaining={explaining}
                                                        query={query}
                                                    />
                                                ),
                                            )}
                                        </section>
                                    );
                                })
                            )}
                        </div>

                        <MatrixLegend />
                    </section>
                </div>
            )}

            {tab === 'summary' && (
                <div
                    id="permission-view-summary"
                    role="tabpanel"
                    aria-labelledby="permission-tab-summary"
                    className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"
                >
                    <PermissionSummary
                        employee={employee}
                        sections={sections}
                        selected={selected}
                        template={template}
                        scopedToOwnBranch={scopedToOwnBranch}
                    />
                    <div className="space-y-4">
                        <div className="pm-card flex flex-col items-center gap-2 p-5 text-center">
                            <h4 className="font-bold text-gray-900">مستوى الخطورة</h4>
                            <RiskGauge sections={sections} selected={selected} large />
                            <p className="text-[13.5px] leading-6 text-gray-500">
                                يزيد مع الصلاحيات التي تحرّك المال أو تغيّر الخدمة. اسحب ما لا يحتاجه {firstName} لعمله.
                            </p>
                        </div>
                        {auditOptions && auditEnabled && (
                            <AuditWorkSummary employee={employee} options={auditOptions} value={auditValue} enabled={auditEnabled} />
                        )}
                    </div>
                </div>
            )}

            {tab === 'compare' && (
                <div id="permission-view-compare" role="tabpanel" aria-labelledby="permission-tab-compare">
                    <PermissionCompare
                        employee={employee}
                        sections={sections}
                        selected={selected}
                        colleagues={copySources}
                        colorOf={colorOf}
                        disabled={processing}
                        onAddMissing={(ids) => setSelected([...new Set([...selected, ...ids])])}
                        onMatch={copyFrom}
                    />
                </div>
            )}

            <PermissionExplanation entry={explanation} onClose={() => setExplanation(null)} />
            {guideAudience && (
                <PermissionGuide
                    key={guideAudience}
                    show
                    onClose={() => setGuideAudience(null)}
                    sections={sections}
                    employee={employee}
                    selected={selected}
                    scopedToOwnBranch={scopedToOwnBranch}
                    auditOptions={auditOptions}
                    auditValue={auditValue}
                    initialAudience={guideAudience}
                />
            )}
            {/* Room at the end of the page, so the bar never hides the last section. */}
            {dirty && <div className="h-20" aria-hidden="true" />}

            <div role="region" aria-label="تغييرات لم تُحفظ" className={`pm-savebar ${dirty ? 'is-visible' : ''}`} aria-hidden={!dirty} inert={!dirty}>
                {Object.keys(errors).length > 0 && (
                    <p className="w-full text-sm font-semibold text-red-300" role="alert">
                        تعذّر حفظ الصلاحيات: {Object.values(errors)[0]}
                    </p>
                )}
                <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm" role="status">
                    <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-white px-2 font-display text-sm font-bold text-gray-900">
                        {changes.length + auditChanges.length + Number(workBranchesChanged)}
                    </span>
                    <span>تغييرات لم تُحفظ لـ {firstName}</span>
                    {changes.length > 0 && <Delta added={added} removed={removed} />}
                    {dangerousGrants.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-200">
                            <Icon name="alert" className="h-3.5 w-3.5" />
                            {dangerousGrants.length} خطيرة
                        </span>
                    )}
                </p>
                <button
                    type="button"
                    onClick={discard}
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

            <Modal
                show={reviewing}
                onClose={() => {
                    if (!processing) {
                        setReviewing(false);
                    }
                }}
                maxWidth="2xl"
                centered
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={`permission-review-${employee.id}`}
                    dir="rtl"
                    className="flex max-h-[90dvh] min-h-0 flex-col"
                >
                    <div className="shrink-0 px-5 pb-4 pt-6 sm:px-7">
                        <h3 id={`permission-review-${employee.id}`} className="text-lg font-bold text-gray-900">
                            مراجعة تغييرات الصلاحيات
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                            {added} تُمنح · {removed} تُلغى
                            {auditChanges.length > 0 && ` · ${auditChanges.length} تغييرات في عمل التدقيق`}
                        </p>
                        <div className="pm-review-strip">
                            <span>
                                قبل: <b className="font-display">{before.total}</b> {permissionsWord(before.total)}، منها{' '}
                                <b className="font-display">{before.danger}</b> خطيرة
                            </span>
                            <Icon name="arrow-left" className="h-4 w-4 shrink-0 text-gray-400" />
                            <span>
                                بعد: <b className="font-display">{after.total}</b> {permissionsWord(after.total)}، منها{' '}
                                <b className={`font-display ${after.danger > before.danger ? 'text-red-700 dark:text-red-400' : ''}`}>
                                    {after.danger}
                                </b>{' '}
                                خطيرة
                            </span>
                            <span className={`pm-review-level is-${heroRisk.level}`}>خطورة {heroRisk.label}</span>
                        </div>
                        {workBranchesChanged && (
                            <div className="mt-3 rounded-control bg-amber-500/10 p-3 text-sm leading-7 text-gray-900">
                                <b>تغيير فروع العمل الإضافية</b>
                                <p>
                                    قبل:{' '}
                                    {workBranchOptions
                                        ?.filter((branch) => savedWorkBranches.includes(branch.id))
                                        .map((branch) => branch.name)
                                        .join('، ') || 'لا توجد'}
                                </p>
                                <p>
                                    بعد:{' '}
                                    {workBranchOptions
                                        ?.filter((branch) => workBranches.includes(branch.id))
                                        .map((branch) => branch.name)
                                        .join('، ') || 'لا توجد'}
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <PermissionChangeReview employee={employee} changes={changes} />
                        {auditChanges.length > 0 && (
                            <div className="mx-5 mb-5 space-y-3 rounded-control border border-gray-100 p-4 sm:mx-7">
                                <h4 className="font-bold text-gray-900">تغييرات عمل التدقيق</h4>
                                {auditChanges.map((change) => (
                                    <div key={change.key} className="text-sm leading-7">
                                        <b className="text-gray-900">{change.label}</b>
                                        <p className="text-gray-500">قبل: {change.before}</p>
                                        <p className="font-semibold text-gray-900">بعد: {change.after}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        {dangerousGrants.length > 0 && (
                            <label className="mx-5 mb-5 flex cursor-pointer items-start gap-2.5 rounded-control bg-red-500/[0.07] px-3.5 py-3 text-sm text-red-800 dark:text-red-300 sm:mx-7">
                                <input
                                    type="checkbox"
                                    checked={acknowledged}
                                    onChange={(event) => setAcknowledged(event.target.checked)}
                                    className="mt-0.5 rounded border-gray-300 text-brand-600"
                                />
                                <span>
                                    يحصل {firstName} على صلاحيات خطيرة: <b>{dangerousGrants.map((item) => item.label).join('، ')}</b>. أؤكد أنه
                                    يحتاجها لعمله.
                                </span>
                            </label>
                        )}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:px-7">
                        <SecondaryButton onClick={() => setReviewing(false)} disabled={processing} autoFocus>
                            العودة للتعديل
                        </SecondaryButton>
                        <PrimaryButton
                            type="button"
                            onClick={confirmSave}
                            disabled={processing || !dirty || (dangerousGrants.length > 0 && !acknowledged)}
                        >
                            {processing ? 'جارٍ الحفظ...' : 'تأكيد وحفظ الصلاحيات'}
                        </PrimaryButton>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

export default function Permissions({
    users,
    selectedUser,
    permissionGroups,
    roleTemplates,
    filters,
    filterOptions,
    scopedToOwnBranch,
    auditOptions = null,
    workBranchOptions = null,
}) {
    const hasUnsavedChanges = useRef(false);
    const [selectedDirty, setSelectedDirty] = useState(false);
    const editorRef = useRef(null);
    const searchRef = useRef(null);
    // The employee picked while the current one has unsaved changes, waiting on "discard them?".
    const [pendingEmployee, setPendingEmployee] = useState(null);
    // The last save, kept for a short while so it can be undone.
    const [lastSave, setLastSave] = useState(null);
    const [undoing, setUndoing] = useState(false);
    const { search, setSearch, filterValues, setFilter } = useDataTable('/settings/permissions', filters, { selected: selectedUser?.id });
    const sections = useMemo(() => permissionGroups.map(sectionModel).filter((section) => sectionIds(section).length > 0), [permissionGroups]);
    const colorOf = useMemo(
        () => roleColors((filterOptions.find((group) => group.key === 'user_type_id')?.options ?? []).map((option) => option.label)),
        [filterOptions],
    );
    const allCount = useMemo(() => permissionEntries(sections).length, [sections]);

    function statsOf(user) {
        const counts = riskCounts(sections, user.permissionIds);
        const risk = riskLevel(sections, user.permissionIds);

        return { ...counts, share: allCount ? Math.round((counts.total / allCount) * 100) : 0, level: risk.level, label: risk.label };
    }

    useEffect(() => {
        if (!lastSave) {
            return;
        }

        const timer = setTimeout(() => setLastSave(null), 15000);
        return () => clearTimeout(timer);
    }, [lastSave]);

    function undoLastSave() {
        if (!lastSave || undoing) {
            return;
        }

        setUndoing(true);
        router.put('/settings/permissions', lastSave.previous, {
            preserveScroll: true,
            onFinish: () => {
                setUndoing(false);
                setLastSave(null);
            },
        });
    }

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
                <PageHeader title="إدارة صلاحيات الموظفين" info="اختر موظفًا، وحدّد ما يستطيع فعله في كل قسم، ثم راجع التغييرات وأكّد حفظها." />
            }
        >
            <Head title="الصلاحيات" />

            <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
                <EmployeeList
                    users={users}
                    selectedId={selectedUser?.id}
                    selectedDirty={selectedDirty}
                    filters={filters}
                    filterOptions={filterOptions}
                    search={search}
                    onSearchChange={setSearch}
                    filterValues={filterValues}
                    onFilterChange={setFilter}
                    onSelect={selectEmployee}
                    searchRef={searchRef}
                    colorOf={colorOf}
                    statsOf={statsOf}
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
                            colorOf={colorOf}
                            onSaved={setLastSave}
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

            {lastSave && !selectedDirty && (
                <div className="pm-toast" role="status">
                    <Icon name="check" className="h-5 w-5 shrink-0 text-emerald-400" strokeWidth={2.5} />
                    <span className="min-w-0 flex-1">حُفظت صلاحيات {lastSave.name}.</span>
                    <button type="button" onClick={undoLastSave} disabled={undoing} className="pm-toast-action">
                        <Icon name="undo" className="h-4 w-4" />
                        {undoing ? 'جارٍ التراجع...' : 'تراجع عن الحفظ'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setLastSave(null)}
                        aria-label="إخفاء"
                        className="rounded-lg p-1 text-white/70 hover:text-white"
                    >
                        <Icon name="close" className="h-4 w-4" />
                    </button>
                </div>
            )}

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
