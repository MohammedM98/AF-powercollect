import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import AddButton from '@/Components/AddButton';
import BranchModal from '@/Pages/Branches/BranchModal';
import UserModal from '@/Pages/Users/UserModal';
import StatRing from '@/Components/StatRing';
import CountUp from '@/Components/CountUp';
import Icon from '@/Components/Icon';
import KpiTile from '@/Components/KpiTile';
import { formatMoney, formatNumber } from '@/lib/format';
import { allowedNavigationGroups } from '@/lib/navigation';

const ICONS = {
    branches: (
        <>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
            />
        </>
    ),
    users: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
        />
    ),
    subscriptions: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z"
        />
    ),
    meterBoxes: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3.75 3.75v16.5h16.5V3.75H3.75zM3.75 9h16.5M9 3.75v16.5" />,
    tariffs: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
    ),
};

const RING_COLORS = ['text-brand-500', 'text-gray-400', 'text-amber-500', 'text-emerald-500', 'text-sky-500'];

const SECTION_LABELS = {
    branches: { title: 'الفروع', statLabel: 'الفروع النشطة', viewAll: '/branches' },
    users: { title: 'أحدث المستخدمين', statLabel: 'المستخدمون النشطون', viewAll: '/users' },
    subscriptions: { title: 'أحدث المشتركين', statLabel: 'المشتركون النشطون', viewAll: '/subscriptions' },
    meterBoxes: { title: 'أحدث الطبلونات', statLabel: 'الطبلونات', viewAll: '/meter-boxes' },
    tariffs: { title: 'التعرفات', statLabel: 'التعرفات', viewAll: '/tariffs' },
};

function buildSubtitle(sections, scopedToBranch) {
    const scopeSuffix = scopedToBranch ? 'في فرعك' : 'عبر النظام';

    if (sections.users) {
        return sections.branches && !scopedToBranch
            ? `${sections.branches.total} فرع — ${sections.users.active} مستخدم نشط ${scopeSuffix}`
            : `${sections.users.active} مستخدم نشط ${scopeSuffix}`;
    }
    if (sections.subscriptions) {
        return `${sections.subscriptions.active} مشترك نشط ${scopeSuffix}`;
    }
    if (sections.meterBoxes) {
        return `${sections.meterBoxes.total} طبلون ${scopeSuffix}`;
    }
    if (sections.branches) {
        return `${sections.branches.active} من ${sections.branches.total} فرع نشط حاليًا`;
    }
    if (sections.tariffs) {
        return `${sections.tariffs.total} تعرفة معرّفة في النظام`;
    }
    return null;
}

/**
 * What the user's branch took in: today's collection as the figure the page
 * leads with, then the week, the month and how much of what was charged
 * this month came in.
 */
function CollectionHero({ money }) {
    const { collected, charged, collectionRate } = money;

    return (
        <div className="rise-in relative overflow-hidden rounded-hero bg-graphite-gradient px-6 py-8 text-white shadow-lift sm:px-8 sm:py-9">
            <div className="pointer-events-none absolute -bottom-24 -start-10 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" aria-hidden="true" />
            <div className="relative flex flex-wrap items-center justify-between gap-x-8 gap-y-6">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-white/70">المحصَّل اليوم</p>
                    <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                        <span className="bg-gradient-to-b from-white to-[#9aa3ae] bg-clip-text font-display text-5xl font-bold leading-none text-transparent sm:text-7xl">
                            {formatMoney(collected.today)}
                        </span>
                        <span className="text-base text-white/70">شيكل</span>
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                    {collectionRate !== null ? (
                        <StatRing percent={collectionRate} size={96} color="text-brand-400" trackClass="text-white/10" labelClass="text-base text-white" />
                    ) : (
                        <span className="flex h-24 w-24 items-center justify-center rounded-full border border-white/15 font-display text-lg text-white/60">—</span>
                    )}
                    <div className="max-w-[12rem]">
                        <p className="text-sm font-semibold text-white">نسبة التحصيل</p>
                        <p className="mt-1 text-xs leading-6 text-white/60">
                            {collectionRate !== null ? 'المحصَّل ÷ المُحمَّل هذا الشهر' : 'لا تحميلات هذا الشهر بعد'}
                        </p>
                    </div>
                </div>
            </div>
            <div className="brand-spectrum relative mt-7 w-40" />
            <dl className="relative mt-5 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                <div>
                    <dt className="text-xs text-white/60">هذا الأسبوع</dt>
                    <dd className="mt-1 font-display text-lg font-bold">{formatMoney(collected.week)} ₪</dd>
                </div>
                <div>
                    <dt className="text-xs text-white/60">هذا الشهر</dt>
                    <dd className="mt-1 font-display text-lg font-bold">{formatMoney(collected.month)} ₪</dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                    <dt className="text-xs text-white/60">المُحمَّل هذا الشهر</dt>
                    <dd className="mt-1 font-display text-lg font-bold">{formatMoney(charged.month)} ₪</dd>
                </div>
            </dl>
        </div>
    );
}

/** What the subscriptions owe, and how much of it is old: each card opens the debts report. */
function DebtTiles({ outstanding, canOpenReport }) {
    const tiles = (
        <>
            <KpiTile
                icon="wallet"
                label="ديون مستحقة على المشتركين"
                value={formatMoney(outstanding.total)}
                unit="شيكل"
                hint={`${formatNumber(outstanding.debtors)} مشترك مدين`}
                valueClassName="text-amber-700 dark:text-amber-400"
            />
            <KpiTile
                icon="alert"
                label="أكثر من 90 يومًا"
                value={formatMoney(outstanding.overNinety)}
                unit="شيكل"
                hint={`${outstanding.overNinetyShare}% من إجمالي الديون`}
                valueClassName={outstanding.overNinety > 0 ? 'text-brand-600' : undefined}
            />
        </>
    );

    return canOpenReport ? (
        <Link href="/receivables" prefetch className="group grid gap-5 rounded-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-900 sm:grid-cols-2" aria-label="أعمار الديون">
            {tiles}
        </Link>
    ) : (
        <div className="grid gap-5 sm:grid-cols-2">{tiles}</div>
    );
}

/**
 * What is waiting on the user. Only what actually waits gets a card; when
 * nothing does, one quiet line says so and keeps the links to those pages.
 */
function AttentionStrip({ items }) {
    const waiting = items.filter((item) => item.count > 0);

    if (waiting.length === 0) {
        return (
            <section aria-label="بانتظارك" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-panel border border-gray-100 bg-surface px-5 py-4 shadow-card">
                <span className="inline-flex items-center gap-2 font-semibold text-gray-900">
                    <Icon name="check" className="h-5 w-5 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
                    لا شيء بانتظارك
                </span>
                {items.map((item) => (
                    <Link key={item.key} href={item.href} prefetch className="text-sm text-gray-500 transition hover:text-gray-900">
                        {item.label}: {formatNumber(item.count)}
                    </Link>
                ))}
            </section>
        );
    }

    return (
        <section aria-label="بانتظارك" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {waiting.map((item, index) => (
                <Link
                    key={item.key}
                    href={item.href}
                    prefetch
                    className="rise-in group flex items-center gap-4 rounded-panel border border-amber-500/40 bg-amber-500/10 p-5 shadow-card transition hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                    style={{ '--rise-delay': `${index * 70}ms` }}
                >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 font-display text-2xl font-bold text-amber-800 dark:text-amber-300">
                        {formatNumber(item.count)}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-gray-900">{item.label}</span>
                        <span className="block text-sm text-gray-600">افتح الصفحة لمتابعتها</span>
                    </span>
                    <Icon name="chevron-left" className="h-5 w-5 shrink-0 text-gray-500 transition group-hover:-translate-x-0.5 group-hover:text-gray-900" />
                </Link>
            ))}
        </section>
    );
}

/** The pages the user may open, as the sidebar groups them — for an account whose work is not in the counts above. */
function QuickLinks({ can }) {
    const groups = allowedNavigationGroups(can);

    if (groups.length === 0) {
        return null;
    }

    return (
        <section aria-label="صفحاتك" className="space-y-6">
            {groups.map((group) => (
                <div key={group.id}>
                    <h3 className="mb-3 text-sm font-semibold text-gray-500">{group.label}</h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {group.links.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                prefetch
                                className="flex min-h-14 items-center gap-3 rounded-panel border border-gray-100 bg-surface px-5 py-4 font-semibold text-gray-900 shadow-card transition hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-600">
                                    <Icon name={link.icon} className="h-5 w-5" />
                                </span>
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </div>
            ))}
        </section>
    );
}

/** For an account whose work is in the phone app: where to get it, and what the site still offers. */
function FieldAppNotice({ fieldApp, canRecordPayments }) {
    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4 rounded-card border border-gray-100 bg-surface p-6 shadow-card">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600">
                <Icon name="phone" className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1 basis-64">
                <h3 className="font-bold text-gray-900">حسابك للعمل الميداني</h3>
                <p className="mt-1 text-sm leading-7 text-gray-600">
                    تُسجَّل الدفعات والقراءات من تطبيق التحصيل على الهاتف، وتدخل إليه بنفس اسم المستخدم وكلمة المرور.
                    {canRecordPayments && ' ويمكنك أيضًا تسجيل الدفعات من هذا الموقع.'}
                </p>
            </div>
            {fieldApp.url && (
                <a
                    href={fieldApp.url}
                    className="inline-flex items-center justify-center gap-2 rounded-control bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
                >
                    <Icon name="arrow-down-tray" className="h-4 w-4" />
                    تحميل تطبيق التحصيل
                </a>
            )}
        </div>
    );
}

export default function Dashboard({ greeting, sections, money, attention, fieldApp, scopedToBranch, auth, canCreateBranch, canCreateUser, branchForm, userForm, can }) {
    const [creating, setCreating] = useState(null);
    const sectionKeys = Object.keys(sections);
    const hasCounts = sectionKeys.length > 0;
    const hasAnyData = hasCounts || money !== null || attention.length > 0;
    const hasLinks = allowedNavigationGroups(can).length > 0;
    const subtitle = buildSubtitle(sections, scopedToBranch);

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
                        <h1 className="text-3xl font-bold text-gray-900">
                            {greeting}، <span className="text-brand-600">{auth.user.name}</span>
                        </h1>
                        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        {can?.viewUserTypes && (
                            <Link href="/users?tab=types" className="text-sm font-semibold text-brand-600 hover:underline">أنواع المستخدمين</Link>
                        )}
                        {canCreateBranch ? (
                            <AddButton onClick={() => openCreateForm('branch')}>فرع جديد</AddButton>
                        ) : canCreateUser ? (
                            <AddButton onClick={() => openCreateForm('user')}>مستخدم جديد</AddButton>
                        ) : null}
                    </div>
                </>
            }
        >
            <Head title="لوحة التحكم" />

            <div className="space-y-6">
                {attention.length > 0 && <AttentionStrip items={attention} />}
                {money?.collected && <CollectionHero money={money} />}
                {money?.outstanding && <DebtTiles outstanding={money.outstanding} canOpenReport={can?.viewDebtAging} />}
                {fieldApp && <FieldAppNotice fieldApp={fieldApp} canRecordPayments={can?.recordPayments} />}
                {!hasCounts && <QuickLinks can={can} />}
                {!hasAnyData && !fieldApp && !hasLinks && (
                    <p className="rounded-card border border-dashed border-gray-200 bg-surface px-6 py-16 text-center text-sm text-gray-500">
                        لا توجد بيانات لعرضها حاليًا — لم يتم منحك صلاحية عرض أي جدول بعد.
                    </p>
                )}

                    {/* Stat cards */}
                    {hasCounts && (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))] sm:gap-4">
                            {sectionKeys.map((key, index) => {
                                const section = sections[key];
                                const hasPct = typeof section.activePct === 'number';

                                return (
                                    <div
                                        key={key}
                                        className="rise-in flex flex-col items-start gap-3 rounded-card border border-gray-100 bg-surface p-4 shadow-card transition hover:shadow-lift sm:flex-row sm:items-center sm:gap-4 sm:p-5"
                                        style={{ '--rise-delay': `${80 + index * 70}ms` }}
                                    >
                                        {hasPct ? (
                                            <StatRing percent={section.activePct} color={RING_COLORS[index % RING_COLORS.length]} />
                                        ) : (
                                            <span
                                                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-gray-100 bg-gray-50 ${RING_COLORS[index % RING_COLORS.length]}`}
                                            >
                                                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    {ICONS[key]}
                                                </svg>
                                            </span>
                                        )}
                                        <div>
                                            <div className="font-display text-3xl font-bold text-gray-900">
                                                <CountUp value={hasPct ? section.active : section.total} />
                                            </div>
                                            <div className="text-sm text-gray-500">{SECTION_LABELS[key].statLabel}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Recent lists */}
                    {['branches', 'users', 'subscriptions', 'meterBoxes']
                        .filter((key) => sections[key]?.recent)
                        .map((key) => {
                            const section = sections[key];
                            const { title, viewAll } = SECTION_LABELS[key];

                            return (
                                <div key={key} className="rise-in rounded-card border border-gray-100 bg-surface p-6 shadow-card">
                                    <div className="mb-4 flex items-center justify-between">
                                        <h3 className="font-bold text-gray-900">{title}</h3>
                                        <Link
                                            href={viewAll}
                                            prefetch
                                            className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 transition hover:text-gray-900"
                                        >
                                            عرض الكل
                                            <Icon name="chevron-left" className="h-4 w-4" strokeWidth={2} />
                                        </Link>
                                    </div>

                                    {section.recent.length === 0 ? (
                                        <p className="py-6 text-center text-sm text-gray-500">لا توجد بيانات بعد.</p>
                                    ) : key === 'users' ? (
                                        <div className="flex flex-wrap gap-6">
                                            {section.recent.map((item) => (
                                                <div key={item.id} className="flex w-24 flex-col items-center text-center">
                                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-graphite-gradient font-display text-lg font-bold text-white dark:ring-1 dark:ring-white/10">
                                                        {item.name.substring(0, 1)}
                                                    </div>
                                                    <div dir="auto" title={item.name} className="mt-2 w-full truncate text-center text-sm font-medium text-gray-900">{item.name}</div>
                                                    <div dir="auto" className="w-full truncate text-center text-xs text-gray-500">{item.subtitle}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        section.recent.map((item) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center justify-between gap-4 border-t border-gray-100 py-3 first:border-t-0"
                                            >
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-500">
                                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            {ICONS[key]}
                                                        </svg>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="truncate font-medium text-gray-900">{item.name}</div>
                                                        <div className="truncate text-sm text-gray-500" dir="auto">
                                                            {item.subtitle ?? '—'}
                                                        </div>
                                                    </div>
                                                </div>
                                                {key === 'branches' && (
                                                    <div className="flex shrink-0 items-center gap-3">
                                                        {item.active ? (
                                                            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                                                نشط
                                                            </span>
                                                        ) : (
                                                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                                                                متوقف
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            );
                        })}
            </div>

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
                    userTypeOptions={userForm.userTypeOptions}
                />
            )}
        </AuthenticatedLayout>
    );
}
