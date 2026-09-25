import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import AddButton from '@/Components/AddButton';
import StatRing from '@/Components/StatRing';
import CountUp from '@/Components/CountUp';
import Icon from '@/Components/Icon';

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
    subscribers: (
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
    subscribers: { title: 'أحدث المشتركين', statLabel: 'المشتركون النشطون', viewAll: '/subscribers' },
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
    if (sections.subscribers) {
        return `${sections.subscribers.active} مشترك نشط ${scopeSuffix}`;
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

export default function Dashboard({ greeting, sections, scopedToBranch, auth, canCreateBranch, canCreateUser }) {
    const sectionKeys = Object.keys(sections);
    const hasAnyData = sectionKeys.length > 0;
    const heroKey = ['branches', 'users', 'subscribers'].find((key) => sections[key]);
    const hero = heroKey ? sections[heroKey] : null;
    const subtitle = buildSubtitle(sections, scopedToBranch);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-3xl font-bold text-gray-900">
                            {greeting}، <span className="text-brand-600">{auth.user.name}</span>
                        </h2>
                        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
                    </div>
                    <div className="shrink-0">
                        {canCreateBranch ? (
                            <AddButton href="/branches/create">فرع جديد</AddButton>
                        ) : canCreateUser ? (
                            <AddButton href="/users/create">مستخدم جديد</AddButton>
                        ) : null}
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
                <div className="space-y-6">
                    {hero && (
                        <div className="rise-in relative overflow-hidden rounded-hero bg-graphite-gradient px-8 py-9 text-white shadow-lift">
                            <div
                                className="pointer-events-none absolute -bottom-24 -start-10 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl"
                                aria-hidden="true"
                            />
                            <div className="relative flex flex-wrap items-center justify-between gap-8">
                                <div>
                                    <p className="text-sm font-semibold text-gray-300">{SECTION_LABELS[heroKey].statLabel}</p>
                                    <div className="mt-2 bg-gradient-to-b from-white to-[#9aa3ae] bg-clip-text font-display text-6xl font-bold leading-none text-transparent sm:text-7xl">
                                        <CountUp value={hero.active} />
                                    </div>
                                    <p className="mt-3 text-sm text-[#9aa3ae]">
                                        من {hero.total} · {hero.total - hero.active} غير نشط
                                    </p>
                                </div>
                                <StatRing
                                    percent={hero.activePct}
                                    size={104}
                                    color="text-brand-400"
                                    trackClass="text-white/10"
                                    labelClass="text-base text-white"
                                />
                            </div>
                            <div className="brand-spectrum relative mt-7 w-40" />
                            <p className="relative mt-3 text-xs text-[#9aa3ae]">وصول قائم على الأدوار · بيانات مقسّمة حسب الفرع · بلا جداول بيانات</p>
                        </div>
                    )}

                    {/* Stat cards */}
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
                        {sectionKeys.map((key, index) => {
                            const section = sections[key];
                            const hasPct = typeof section.activePct === 'number';

                            return (
                                <div
                                    key={key}
                                    className="rise-in flex items-center gap-4 rounded-card border border-gray-100 bg-surface p-5 shadow-card transition hover:shadow-lift"
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

                    {/* Recent lists */}
                    {['branches', 'users', 'subscribers', 'meterBoxes']
                        .filter((key) => sections[key]?.recent)
                        .map((key) => {
                            const section = sections[key];
                            const { title, viewAll } = SECTION_LABELS[key];

                            return (
                                <div key={key} className="rise-in rounded-card border border-gray-100 bg-surface p-6 shadow-card">
                                    <div className="mb-4 flex items-center justify-between">
                                        <h3 className="font-bold text-gray-900">{title}</h3>
                                        <a
                                            href={viewAll}
                                            className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 transition hover:text-gray-900"
                                        >
                                            عرض الكل
                                            <Icon name="chevron-left" className="h-4 w-4" strokeWidth={2} />
                                        </a>
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
                                                    <div className="mt-2 w-full truncate text-sm font-medium text-gray-900">{item.name}</div>
                                                    <div className="w-full truncate text-xs text-gray-500">{item.subtitle}</div>
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
            )}
        </AuthenticatedLayout>
    );
}
