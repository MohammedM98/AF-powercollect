import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import AddButton from '@/Components/AddButton';
import BranchModal from '@/Pages/Branches/BranchModal';
import UserModal from '@/Pages/Users/UserModal';
import StatRing from '@/Components/StatRing';
import CountUp from '@/Components/CountUp';
import Icon from '@/Components/Icon';
import StatusPill from '@/Components/DataTable/StatusPill';
import { initials } from '@/lib/initials';

/** The big card at the top: subscribers when the user may see them, else users, else branches. */
const HERO_SECTIONS = {
    subscribers: 'المشتركون النشطون',
    users: 'المستخدمون النشطون',
    branches: 'الفروع النشطة',
};

const TODAY_FORMAT = new Intl.DateTimeFormat('ar-SY-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** "3 فروع نشطة · 227 مشترك نشط · 16 مستخدم عبر النظام", from whichever sections the user may see. */
function buildSubtitle(sections, scopedToBranch) {
    const parts = [];

    if (sections.branches && !scopedToBranch) {
        parts.push(`${sections.branches.active} فروع نشطة`);
    }
    if (sections.subscribers) {
        parts.push(`${sections.subscribers.active} مشترك نشط`);
    }
    if (sections.users) {
        parts.push(`${sections.users.total} مستخدم`);
    }
    if (parts.length === 0 && sections.meterBoxes) {
        parts.push(`${sections.meterBoxes.total} طبلون`);
    }
    if (parts.length === 0 && sections.tariffs) {
        parts.push(`${sections.tariffs.total} تعرفة معرّفة`);
    }

    return parts.length > 0 ? `${parts.join(' · ')} ${scopedToBranch ? 'في فرعك' : 'عبر النظام'}` : null;
}

function ViewAllLink({ href }) {
    return (
        <Link href={href} prefetch className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 transition hover:text-gray-900">
            عرض الكل
            <Icon name="chevron-left" className="h-4 w-4" strokeWidth={2} />
        </Link>
    );
}

/** A dashboard panel with a title and, optionally, a "view all" link. */
function Panel({ title, viewAll, className = '', style, children }) {
    return (
        <section className={`rise-in rounded-panel border border-gray-100 bg-surface p-6 shadow-card ${className}`} style={style}>
            <div className="mb-5 flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                {viewAll && <ViewAllLink href={viewAll} />}
            </div>
            {children}
        </section>
    );
}

function IconTile({ icon, className = 'h-11 w-11' }) {
    return (
        <span className={`flex shrink-0 items-center justify-center rounded-[13px] border border-gray-100 bg-gray-50 text-gray-500 ${className}`}>
            <Icon name={icon} className="h-5 w-5" />
        </span>
    );
}

function InitialsTile({ name, className = 'h-11 w-11 text-[14.5px]' }) {
    return (
        <span
            className={`flex shrink-0 items-center justify-center rounded-[13px] bg-graphite-gradient font-display font-bold text-white dark:ring-1 dark:ring-white/10 ${className}`}
        >
            {initials(name)}
        </span>
    );
}

function EmptyList() {
    return <p className="py-8 text-center text-sm text-gray-400">لا توجد بيانات بعد.</p>;
}

/** The graphite overview card: active count, total/inactive tiles and the activity ring. */
function HeroCard({ label, section, className }) {
    return (
        <div className={`rise-in relative overflow-hidden rounded-hero bg-graphite-gradient p-8 text-white shadow-lift ${className}`}>
            <div className="pointer-events-none absolute -end-16 -top-24 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl" aria-hidden="true" />
            <div className="relative flex h-full flex-wrap items-center justify-between gap-8">
                <div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-[#c9ced6]">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-400" aria-hidden="true" />
                        نظرة عامة
                    </span>
                    <p className="mt-5 text-sm font-semibold text-[#c9ced6]">{label}</p>
                    <div className="mt-2 bg-gradient-to-b from-white to-[#9aa3ae] bg-clip-text font-display text-6xl font-bold leading-none text-transparent sm:text-7xl">
                        <CountUp value={section.active} />
                    </div>
                    <div className="mt-6 flex gap-3">
                        {[
                            ['الإجمالي', section.total],
                            ['غير نشط', section.total - section.active],
                        ].map(([tileLabel, value]) => (
                            <div key={tileLabel} className="min-w-[72px] rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
                                <div className="text-[12px] text-[#9aa3ae]">{tileLabel}</div>
                                <div className="font-display text-xl font-bold">{value.toLocaleString('en')}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="relative">
                    <StatRing
                        percent={section.activePct}
                        size={168}
                        color="text-brand-400"
                        trackClass="text-white/10"
                        labelSize="text-4xl"
                        labelClass="text-white"
                    />
                    <span className="absolute inset-x-0 top-[62%] text-center text-[12px] text-[#9aa3ae]">نسبة النشاط</span>
                </div>
            </div>
            <div className="brand-spectrum absolute inset-x-8 bottom-0" aria-hidden="true" />
        </div>
    );
}

function TeamCard({ section, className }) {
    const team = section.recent.slice(0, 4);

    return (
        <Panel title="فريق العمل" viewAll="/users" className={className}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="font-display text-4xl font-bold text-gray-900">
                        <CountUp value={section.total} />
                    </div>
                    <p className="mt-1 whitespace-nowrap text-sm text-gray-500">
                        {section.active} مستخدم نشط من {section.total}
                    </p>
                </div>
                <div className="flex shrink-0 -space-x-2.5 space-x-reverse pt-2" aria-hidden="true">
                    {team.map((user) => (
                        <InitialsTile key={user.id} name={user.name} className="h-9 w-9 rounded-full border-2 border-surface text-[12px]" />
                    ))}
                </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
                {[
                    ['مدراء الفروع', section.branchAdmins],
                    ['المحصّلون', section.collectors],
                ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="text-xs text-gray-500">{label}</div>
                        <div className="mt-1 font-display text-2xl font-bold text-gray-900">{value}</div>
                    </div>
                ))}
            </div>
            {section.recent.length > 0 && (
                <ul className="mt-5 space-y-3">
                    {section.recent.slice(0, 3).map((user) => (
                        <li key={user.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate font-semibold text-gray-900">{user.name}</span>
                            <span className="shrink-0 text-xs text-gray-500">{user.subtitle}</span>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}

/** A small count card with an icon, and a footer link (or a progress bar). */
function StatCard({ icon, label, value, href, percent, style }) {
    return (
        <div
            className="rise-in flex flex-col rounded-panel border border-gray-100 bg-surface p-6 shadow-card transition hover:shadow-lift"
            style={style}
        >
            <div className="flex items-center gap-3">
                <IconTile icon={icon} />
                <span className="text-sm font-semibold text-gray-700">{label}</span>
            </div>
            <div className="mt-5 font-display text-4xl font-bold text-gray-900">
                <CountUp value={value} />
            </div>
            <div className="mt-5 border-t border-gray-100 pt-4">
                {typeof percent === 'number' ? (
                    <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${percent}%` }} />
                        </div>
                        <Link
                            href={href}
                            prefetch
                            className="inline-flex items-center gap-1 font-display text-xs font-bold text-gray-700 hover:text-gray-900"
                        >
                            {percent}%
                            <Icon name="chevron-left" className="h-4 w-4" strokeWidth={2} />
                        </Link>
                    </div>
                ) : (
                    <Link
                        href={href}
                        prefetch
                        className="flex items-center justify-between text-sm font-semibold text-gray-500 transition hover:text-gray-900"
                    >
                        عرض وإدارة
                        <Icon name="chevron-left" className="h-4 w-4" strokeWidth={2} />
                    </Link>
                )}
            </div>
        </div>
    );
}

export default function Dashboard({ greeting, sections, scopedToBranch, auth, canCreateBranch, canCreateUser, branchForm, userForm }) {
    const [creating, setCreating] = useState(null);
    const hasAnyData = Object.keys(sections).length > 0;
    const heroKey = Object.keys(HERO_SECTIONS).find((key) => sections[key]);
    const subtitle = buildSubtitle(sections, scopedToBranch);
    const { branches, users, subscribers, meterBoxes, tariffs } = sections;

    const statCards = [
        branches && { key: 'branches', icon: 'pin', label: 'الفروع النشطة', value: branches.active, href: '/branches', percent: branches.activePct },
        meterBoxes && { key: 'meterBoxes', icon: 'table', label: 'إجمالي الطبلونات', value: meterBoxes.total, href: '/meter-boxes' },
        tariffs && { key: 'tariffs', icon: 'dollar', label: 'فئات التعرفة', value: tariffs.total, href: '/tariffs' },
    ].filter(Boolean);

    /**
     * Opens the "new branch" or "new user" pop-up — the same one as on its
     * own page — fetching its dropdown options the first time.
     */
    function openCreateForm(kind) {
        const optionsProp = kind === 'branch' ? 'branchForm' : 'userForm';

        if ({ branchForm, userForm }[optionsProp]) {
            setCreating(kind);
            return;
        }

        router.reload({ only: [optionsProp], onSuccess: () => setCreating(kind) });
    }

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-500">{TODAY_FORMAT.format(new Date())}</p>
                        <h2 className="mt-1 text-3xl font-bold text-gray-900 sm:text-4xl">
                            {greeting}، <span className="text-brand-600">{auth.user.name}</span>
                        </h2>
                        {subtitle && <p className="mt-2 text-sm text-gray-500">{subtitle}</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-3">
                        {canCreateUser && (
                            <AddButton variant={canCreateBranch ? 'outline' : 'primary'} onClick={() => openCreateForm('user')}>
                                مستخدم جديد
                            </AddButton>
                        )}
                        {canCreateBranch && <AddButton onClick={() => openCreateForm('branch')}>فرع جديد</AddButton>}
                    </div>
                </>
            }
        >
            <Head title="لوحة التحكم" />

            {!hasAnyData ? (
                <div className="rounded-card border border-dashed border-gray-200 bg-surface px-6 py-16 text-center">
                    <p className="text-sm text-gray-500">لا توجد بيانات لعرضها حاليًا — لم يتم منحك صلاحية عرض أي جدول بعد.</p>
                </div>
            ) : (
                <div className="grid gap-6 lg:grid-cols-3">
                    {heroKey && (
                        <HeroCard label={HERO_SECTIONS[heroKey]} section={sections[heroKey]} className={users ? 'lg:col-span-2' : 'lg:col-span-3'} />
                    )}
                    {users && <TeamCard section={users} className={heroKey ? '' : 'lg:col-span-3'} />}

                    {statCards.length > 0 && (
                        <div className="grid gap-6 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-3">
                            {statCards.map(({ key, ...card }, index) => (
                                <StatCard key={key} {...card} style={{ '--rise-delay': `${80 + index * 70}ms` }} />
                            ))}
                        </div>
                    )}

                    {subscribers && (
                        <Panel title="أحدث المشتركين" viewAll="/subscribers" className={branches ? 'lg:col-span-2' : 'lg:col-span-3'}>
                            {subscribers.recent.length === 0 ? (
                                <EmptyList />
                            ) : (
                                <ul className="space-y-4">
                                    {subscribers.recent.map((subscriber) => (
                                        <li key={subscriber.id} className="flex items-center gap-3">
                                            <InitialsTile name={subscriber.name} />
                                            <div className="min-w-0">
                                                <div className="truncate font-semibold text-gray-900">{subscriber.name}</div>
                                                <div className="truncate text-sm text-gray-500" dir="ltr">
                                                    {subscriber.subtitle ?? '—'}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Panel>
                    )}

                    {branches && (
                        <Panel title="الفروع" viewAll="/branches" className={subscribers ? '' : 'lg:col-span-3'}>
                            {branches.recent.length === 0 ? (
                                <EmptyList />
                            ) : (
                                <ul className="space-y-4">
                                    {branches.recent.map((branch) => (
                                        <li key={branch.id} className="flex items-center justify-between gap-3">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <IconTile icon="pin" />
                                                <div className="min-w-0">
                                                    <div className="truncate font-semibold text-gray-900">{branch.name}</div>
                                                    <div className="truncate text-sm text-gray-500" dir="ltr">
                                                        {branch.subtitle ?? '—'}
                                                    </div>
                                                </div>
                                            </div>
                                            <StatusPill tone={branch.active ? 'green' : 'gray'} label={branch.active ? 'نشط' : 'متوقف'} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Panel>
                    )}

                    {meterBoxes && (
                        <Panel title="أحدث الطبلونات" viewAll="/meter-boxes" className="lg:col-span-3">
                            {meterBoxes.recent.length === 0 ? (
                                <EmptyList />
                            ) : (
                                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {meterBoxes.recent.map((meterBox) => (
                                        <li key={meterBox.id} className="flex min-w-0 items-center gap-3">
                                            <IconTile icon="table" />
                                            <div className="min-w-0">
                                                <div className="truncate font-semibold text-gray-900">{meterBox.name ?? '—'}</div>
                                                <div className="truncate text-sm text-gray-500">{meterBox.subtitle}</div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Panel>
                    )}
                </div>
            )}

            {branchForm && (
                <BranchModal
                    show={creating === 'branch'}
                    onClose={() => setCreating(null)}
                    branch={null}
                    governorates={branchForm.governorates}
                    areas={branchForm.areas}
                />
            )}
            {userForm && (
                <UserModal
                    show={creating === 'user'}
                    onClose={() => setCreating(null)}
                    user={null}
                    branches={userForm.branches}
                    canChooseBranch={userForm.canChooseBranch}
                    roleOptions={userForm.roleOptions}
                />
            )}
        </AuthenticatedLayout>
    );
}
