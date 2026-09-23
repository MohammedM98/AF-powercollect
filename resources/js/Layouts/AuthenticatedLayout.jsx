import { useState } from 'react';
import { usePage } from '@inertiajs/react';

function NavLink({ href, active, children }) {
    return (
        <a href={href} aria-current={active ? 'page' : undefined} className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${active ? 'bg-white/15 text-white shadow-sm ring-1 ring-white/10' : 'text-violet-200 hover:bg-white/10 hover:text-white'}`}>
            {children}
        </a>
    );
}

const SETTINGS_LINKS = [
    { can: 'viewBranches', href: '/branches' },
    { can: 'viewTariffs', href: '/tariffs' },
    { can: 'viewCircuitBreakers', href: '/circuit-breakers' },
    { can: 'viewMeterBoxes', href: '/meter-boxes' },
    { can: 'viewGovernorates', href: '/governorates' },
    { can: 'manageSettings', href: '/settings/permissions' },
];

export default function AuthenticatedLayout({ header, children }) {
    const { props, url } = usePage();
    const { appName, auth, can } = props;
    const [menuOpen, setMenuOpen] = useState(false);
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const accessibleSettingsLinks = SETTINGS_LINKS.filter((link) => can?.[link.can]);
    const settingsHref = accessibleSettingsLinks[0]?.href;
    const settingsActive = accessibleSettingsLinks.some((link) => url.startsWith(link.href));
    const sectionTitle = url.startsWith('/subscribers') ? 'المشتركون' : url.startsWith('/users') ? 'المستخدمون' : url.startsWith('/profile') ? 'الملف الشخصي' : settingsActive ? 'الإعدادات' : 'لوحة التحكم';

    return (
        <div className="min-h-screen bg-slate-50 text-gray-900">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:p-3">انتقل إلى المحتوى</a>
            <aside className="bg-violet-950 text-white lg:fixed lg:inset-y-0 lg:right-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:overflow-y-auto">
                <div className="flex items-center justify-between gap-3 px-5 py-5 lg:px-6 lg:py-8">
                    <a href="/dashboard" className="flex min-w-0 items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white p-1.5"><img src="/images/logo.png" alt="" className="h-full w-full object-contain" /></span>
                        <span className="min-w-0"><span className="block truncate text-base font-bold">{appName}</span><span className="mt-1 block text-xs text-violet-300">نظام التحصيل الكهربائي</span></span>
                    </a>
                    <button type="button" aria-label="القائمة الرئيسية" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)} className="rounded-lg p-2 hover:bg-white/10 lg:hidden">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" d={menuOpen ? 'M6 6l12 12M6 18L18 6' : 'M4 6h16M4 12h16M4 18h16'} /></svg>
                    </button>
                </div>
                <nav id="main-navigation" aria-label="التنقل الرئيسي" className={`${menuOpen ? 'block' : 'hidden'} space-y-2 px-4 pb-5 lg:block lg:flex-1`}>
                    <NavLink href="/dashboard" active={url === '/dashboard'}>
                        لوحة التحكم
                        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                        </svg>
                    </NavLink>

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

                    {settingsHref && (
                        <NavLink href={settingsHref} active={settingsActive}>
                            الإعدادات
                            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </NavLink>
                    )}
                </nav>
                <div className="hidden border-t border-white/10 px-6 py-5 lg:block"><p className="text-xs text-violet-300">الفرع الحالي</p><p className="mt-1 text-sm font-medium">{auth?.user?.branchName ?? 'جميع الفروع'}</p></div>
            </aside>
            <div className="min-w-0 lg:mr-64">
                <header className="border-b border-gray-200/70 bg-white">
                    <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-2 text-sm"><a href="/dashboard" className="text-gray-500 hover:text-brand-600">الرئيسية</a><span aria-hidden="true" className="text-gray-300">/</span><span className="font-medium text-gray-900">{sectionTitle}</span></div>
                        <details className="group relative">
                            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg p-1 text-start [&::-webkit-details-marker]:hidden">
                                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-700">{auth?.user?.name?.substring(0, 1)}</span>
                                <span className="hidden sm:block"><span className="block text-sm font-semibold">{auth?.user?.name}</span><span className="block text-xs text-gray-500">{auth?.user?.roleLabel}</span></span>
                            </summary>
                            <div className="absolute end-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                                <div className="border-b border-gray-100 px-4 py-3"><p className="truncate text-sm font-semibold">{auth?.user?.name}</p><p className="text-xs text-gray-500">{auth?.user?.roleLabel}</p></div>
                                <a href="/profile" className="block px-4 py-3 text-sm hover:bg-gray-50">الملف الشخصي</a>
                                <form method="POST" action="/logout"><input type="hidden" name="_token" value={csrfToken} /><button type="submit" className="block w-full px-4 py-3 text-start text-sm hover:bg-gray-50">تسجيل الخروج</button></form>
                            </div>
                        </details>
                    </div>
                </header>
                <main id="main-content" className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                    {header && <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">{header}</div>}
                    {children}
                </main>
            </div>
        </div>
    );
}