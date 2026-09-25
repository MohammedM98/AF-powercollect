import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import AddButton from '@/Components/AddButton';
import StatRing from '@/Components/StatRing';

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
                        <h2 className="text-xl font-bold text-gray-900">
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

            <div className="mb-4 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-xs font-medium text-brand-700">
                تجربة React عبر Inertia — بقية النظام لا يزال Blade.
            </div>

            {!hasAnyData ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
                    <p className="text-sm text-gray-500">لا توجد بيانات لعرضها حاليًا — لم يتم منحك صلاحية عرض أي جدول بعد.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {hero && (
                        <div className="relative overflow-hidden rounded-2xl bg-graphite-gradient px-8 py-10 text-white">
                            <svg
                                className="pointer-events-none absolute inset-y-0 start-0 h-full w-1/2 max-w-md opacity-20"
                                viewBox="0 0 300 200"
                                fill="none"
                            >
                                <circle cx="40" cy="150" r="4" fill="white" />
                                <circle cx="110" cy="90" r="4" fill="white" />
                                <circle cx="170" cy="140" r="4" fill="white" />
                                <circle cx="230" cy="60" r="4" fill="white" />
                                <circle cx="260" cy="120" r="4" fill="white" />
                                <path d="M40 150L110 90L170 140L230 60L260 120M110 90L170 140" stroke="white" strokeWidth="1.5" />
                            </svg>
                            <div className="relative">
                                <div className="text-5xl font-black">{hero.activePct}%</div>
                                <p className="mt-2 max-w-sm text-gray-300">
                                    {hero.active} من {hero.total} {SECTION_LABELS[heroKey].statLabel} حاليًا
                                </p>
                                <p className="text-sm text-white/70">وصول قائم على الأدوار · بيانات مقسّمة حسب الفرع · بلا جداول بيانات</p>
                            </div>
                        </div>
                    )}

                    {/* Stat cards */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {sectionKeys.map((key, index) => {
                            const section = sections[key];
                            const hasPct = typeof section.activePct === 'number';

                            return (
                                <div key={key} className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                    {hasPct ? (
                                        <StatRing percent={section.activePct} color={RING_COLORS[index % RING_COLORS.length]} />
                                    ) : (
                                        <span
                                            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-50 ${RING_COLORS[index % RING_COLORS.length]}`}
                                        >
                                            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {ICONS[key]}
                                            </svg>
                                        </span>
                                    )}
                                    <div>
                                        <div className="text-2xl font-extrabold text-gray-900">{hasPct ? section.active : section.total}</div>
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
                                <div key={key} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <div className="mb-4 flex items-center justify-between">
                                        <h3 className="font-bold text-gray-900">{title}</h3>
                                        <a href={viewAll} className="text-sm font-medium text-brand-600 hover:underline">
                                            عرض الكل
                                        </a>
                                    </div>

                                    {section.recent.length === 0 ? (
                                        <p className="py-6 text-center text-sm text-gray-500">لا توجد بيانات بعد.</p>
                                    ) : key === 'users' ? (
                                        <div className="flex flex-wrap gap-6">
                                            {section.recent.map((item) => (
                                                <div key={item.id} className="flex w-24 flex-col items-center text-center">
                                                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">
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
                                                className="flex items-center justify-between gap-4 border-t border-gray-50 py-3 first:border-t-0"
                                            >
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            {ICONS[key]}
                                                        </svg>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="truncate font-medium text-gray-900">{item.name}</div>
                                                        <div className="truncate text-sm text-gray-500">{item.subtitle ?? '—'}</div>
                                                    </div>
                                                </div>
                                                {key === 'branches' && (
                                                    <div className="flex shrink-0 items-center gap-3">
                                                        {item.active ? (
                                                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
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
