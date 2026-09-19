import { usePage } from '@inertiajs/react';

// Every destination here (dashboard, subscribers, users, settings…) is
// still a plain Blade page, not an Inertia page — so these are real <a>
// tags, not Inertia's <Link>. <Link> only belongs on links between two
// Inertia-rendered pages; pointed at a Blade route, its XHR-style visit
// gets back full HTML instead of an Inertia response and just fails
// silently. Swap to <Link> once a destination is itself converted.
function NavLink({ href, active, children }) {
    return (
        <a
            href={href}
            className={
                'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition ' +
                (active ? 'bg-brand-600 text-white shadow-sm' : 'text-violet-200 hover:bg-white/5 hover:text-white')
            }
        >
            {children}
        </a>
    );
}

export default function AuthenticatedLayout({ header, children }) {
    const { props, url } = usePage();
    const { appName, auth, can } = props;

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
            {/* Top bar */}
            <header className="bg-violet-950">
                <div className="mx-auto flex max-w-screen-2xl items-center justify-end gap-4 px-4 py-4 sm:px-6 lg:px-8">
                    <div className="group relative">
                        <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white transition hover:bg-white/20">
                            {auth?.user?.name?.substring(0, 1)}
                        </button>
                        <div className="invisible absolute start-0 z-50 mt-2 w-56 rounded-md bg-white opacity-0 shadow-lg ring-1 ring-black/5 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                            <div className="border-b border-gray-100 px-4 py-3">
                                <div className="truncate text-sm font-semibold text-gray-900">{auth?.user?.name}</div>
                                <div className="truncate text-xs text-gray-500">{auth?.user?.roleLabel}</div>
                            </div>
                            <a href="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                الملف الشخصي
                            </a>
                            <form method="POST" action="/logout">
                                <input type="hidden" name="_token" value={csrfToken} />
                                <button type="submit" className="block w-full px-4 py-2 text-start text-sm text-gray-700 hover:bg-gray-50">
                                    تسجيل الخروج
                                </button>
                            </form>
                        </div>
                    </div>

                    <a href="/dashboard" className="flex min-w-0 items-center gap-3">
                        <span className="min-w-0 text-right">
                            <span className="block truncate text-lg font-extrabold leading-tight text-white">{appName}</span>
                            <span className="block truncate text-xs text-violet-300">
                                {auth?.user?.branchName ?? 'نظام التحصيل الكهربائي'}
                            </span>
                        </span>
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-sm">
                            <img src="/images/logo.png" alt={appName} className="h-full w-full object-contain" />
                        </span>
                    </a>
                </div>
            </header>

            {/* Section nav */}
            <nav className="bg-[#170f38]">
                <div className="mx-auto flex max-w-screen-2xl items-center gap-1.5 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-8">
                    <NavLink href="/dashboard" active={url === '/dashboard'}>
                        لوحة التحكم
                        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                        </svg>
                    </NavLink>

                    {can?.viewBranches && (
                        <NavLink href="/branches" active={url.startsWith('/branches')}>
                            الفروع
                            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                            </svg>
                        </NavLink>
                    )}

                    {can?.viewSubscribers && (
                        <NavLink href="/subscribers" active={url.startsWith('/subscribers')}>
                            المشتركون
                            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3.75m8.5-3.75l1 3.75m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                            </svg>
                        </NavLink>
                    )}

                    {can?.viewUsers && (
                        <NavLink href="/users" active={url.startsWith('/users')}>
                            المستخدمون
                            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.294M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                            </svg>
                        </NavLink>
                    )}

                    {can?.manageSettings && (
                        <NavLink href="/settings/permissions" active={url.startsWith('/settings')}>
                            الإعدادات
                            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </NavLink>
                    )}
                </div>
            </nav>

            {header && (
                <div className="border-b border-gray-100 bg-white">
                    <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                        {header}
                    </div>
                </div>
            )}

            <main className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
                {children}
            </main>
        </div>
    );
}
