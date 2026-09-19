import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import StatRing from '@/Components/StatRing';

export default function Dashboard({ greeting, stats, recentBranches, recentUsers, scopedToBranch, auth, canCreateBranch, canCreateUser }) {
    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">
                            {greeting}، <span className="text-brand-600">{auth.user.name}</span>
                        </h2>
                        <p className="mt-1 text-sm text-gray-500">
                            {scopedToBranch
                                ? `${stats.users_active} مستخدم نشط في فرعك`
                                : `${stats.branches_total} فرع — ${stats.users_active} مستخدم نشط عبر النظام`}
                        </p>
                    </div>
                    <div className="shrink-0">
                        {canCreateBranch ? (
                            <a
                                href="/branches/create"
                                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                فرع جديد
                            </a>
                        ) : canCreateUser ? (
                            <a
                                href="/users/create"
                                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                مستخدم جديد
                            </a>
                        ) : null}
                    </div>
                </>
            }
        >
            <Head title="لوحة التحكم" />

            <div className="mb-4 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-xs font-medium text-brand-700">
                تجربة React عبر Inertia — بقية النظام لا يزال Blade.
            </div>

            <div className="space-y-6">
                {/* Hero banner */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-brand-600 to-pink-500 px-8 py-10 text-white">
                    <svg className="pointer-events-none absolute inset-y-0 start-0 h-full w-1/2 max-w-md opacity-20" viewBox="0 0 300 200" fill="none">
                        <circle cx="40" cy="150" r="4" fill="white" />
                        <circle cx="110" cy="90" r="4" fill="white" />
                        <circle cx="170" cy="140" r="4" fill="white" />
                        <circle cx="230" cy="60" r="4" fill="white" />
                        <circle cx="260" cy="120" r="4" fill="white" />
                        <path d="M40 150L110 90L170 140L230 60L260 120M110 90L170 140" stroke="white" strokeWidth="1.5" />
                    </svg>
                    <div className="relative">
                        <div className="text-5xl font-black">{stats.branches_active_pct}%</div>
                        <p className="mt-2 max-w-sm text-brand-50">
                            {stats.branches_active} من {stats.branches_total} فرع نشط حاليًا
                        </p>
                        <p className="text-sm text-white/70">وصول قائم على الأدوار · بيانات مقسّمة حسب الفرع · بلا جداول بيانات</p>
                    </div>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                        <StatRing percent={stats.branches_active_pct} color="text-brand-500" />
                        <div>
                            <div className="text-2xl font-extrabold text-gray-900">{stats.branches_active}</div>
                            <div className="text-sm text-gray-500">الفروع النشطة</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                        <StatRing percent={stats.users_active_pct} color="text-pink-500" />
                        <div>
                            <div className="text-2xl font-extrabold text-gray-900">{stats.users_active}</div>
                            <div className="text-sm text-gray-500">المستخدمون النشطون</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                        <StatRing percent={stats.branch_admins_pct} color="text-amber-500" />
                        <div>
                            <div className="text-2xl font-extrabold text-gray-900">{stats.branch_admins}</div>
                            <div className="text-sm text-gray-500">مديرو الفروع</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                        <StatRing percent={stats.collectors_pct} color="text-emerald-500" />
                        <div>
                            <div className="text-2xl font-extrabold text-gray-900">{stats.collectors}</div>
                            <div className="text-sm text-gray-500">المحصّلون</div>
                        </div>
                    </div>
                </div>

                {/* Recent branches */}
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="font-bold text-gray-900">الفروع</h3>
                        <a href="/branches" className="text-sm font-medium text-brand-600 hover:underline">
                            عرض الكل
                        </a>
                    </div>

                    {recentBranches.length === 0 ? (
                        <p className="py-6 text-center text-sm text-gray-500">لا توجد فروع بعد — أنشئ فرعًا أولاً.</p>
                    ) : (
                        recentBranches.map((branch) => (
                            <div key={branch.id} className="flex items-center justify-between gap-4 border-t border-gray-50 py-3 first:border-t-0">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="truncate font-medium text-gray-900">{branch.name}</div>
                                        <div className="truncate text-sm text-gray-500">{branch.location ?? '—'}</div>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                    {branch.is_active ? (
                                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">نشط</span>
                                    ) : (
                                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">متوقف</span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Recent users */}
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="font-bold text-gray-900">أحدث المستخدمين</h3>
                        <a href="/users" className="text-sm font-medium text-brand-600 hover:underline">
                            عرض الكل
                        </a>
                    </div>

                    {recentUsers.length === 0 ? (
                        <p className="py-6 text-center text-sm text-gray-500">لا يوجد مستخدمون لإدارتهم بعد.</p>
                    ) : (
                        <div className="flex flex-wrap gap-6">
                            {recentUsers.map((user) => (
                                <div key={user.id} className="flex w-24 flex-col items-center text-center">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">
                                        {user.name.substring(0, 1)}
                                    </div>
                                    <div className="mt-2 w-full truncate text-sm font-medium text-gray-900">{user.name}</div>
                                    <div className="w-full truncate text-xs text-gray-500">{user.roleLabel}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
