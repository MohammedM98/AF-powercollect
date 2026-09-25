import { useEffect, useState } from 'react';
import { usePage } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import ThemeToggle from '@/Components/ThemeToggle';
import CommandPalette from '@/Components/CommandPalette';
import { MAIN_LINKS, SETTINGS_LINKS, allowedLinks, isActiveLink } from '@/lib/navigation';
import { useResponsiveTables } from '@/hooks/useResponsiveTables';

/**
 * One sidebar link. The current page is a graphite pill with a burgundy edge.
 * Links are plain <a> tags, so every page opens with a full page load.
 */
function NavLink({ link, active }) {
    return (
        <a
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`group flex items-center gap-3 rounded-2xl px-2.5 py-2 text-sm font-semibold transition ${
                active
                    ? 'nav-link-active bg-graphite-gradient text-white dark:ring-1 dark:ring-white/10'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
            }`}
        >
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition ${
                    active ? 'border-white/10 bg-white/10 text-white' : 'border-gray-100 bg-gray-50 text-gray-500 group-hover:text-gray-900'
                }`}
            >
                <Icon name={link.icon} className="h-[18px] w-[18px]" />
            </span>
            {link.label}
        </a>
    );
}

/** The app name without the "AF" the logo already shows. */
function shortAppName(appName) {
    return (appName ?? '').replace(/^AF\s+/i, '');
}

function SidebarContent({ onNavigate }) {
    const { props, url } = usePage();
    const { appName, auth, can } = props;
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const mainLinks = allowedLinks(MAIN_LINKS, can);
    const settingsLinks = allowedLinks(SETTINGS_LINKS, can);

    return (
        <div className="flex h-full flex-col" onClick={(event) => event.target.closest('a') && onNavigate?.()}>
            <a href="/dashboard" className="flex items-center gap-3 px-6 pt-6">
                <img src="/images/logo-af.webp" alt={appName} className="h-11 w-auto shrink-0" />
                <span className="h-9 w-px bg-gray-200" aria-hidden="true" />
                <span className="min-w-0">
                    <span className="block truncate text-lg font-bold leading-tight text-gray-900">{shortAppName(appName)}</span>
                    <span className="block truncate text-xs text-gray-500">{auth?.user?.branchName ?? 'نظام التحصيل الكهربائي'}</span>
                </span>
            </a>
            <div className="brand-spectrum mx-6 mt-5" />

            <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5" aria-label="القائمة الرئيسية">
                {mainLinks.map((link) => (
                    <NavLink key={link.href} link={link} active={isActiveLink(link, url)} />
                ))}

                {settingsLinks.length > 0 && (
                    <>
                        <p className="px-3 pb-2 pt-6 text-xs font-semibold text-gray-400">الإعدادات</p>
                        {settingsLinks.map((link) => (
                            <NavLink key={link.href} link={link} active={isActiveLink(link, url)} />
                        ))}
                    </>
                )}
            </nav>

            <div className="m-4 flex items-center gap-3 rounded-2xl border border-gray-100 bg-surface p-3 shadow-card">
                <a href="/profile" title="الملف الشخصي" className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-graphite-gradient font-display text-sm font-bold text-white">
                        {auth?.user?.name?.substring(0, 1)}
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-900">{auth?.user?.name}</span>
                        <span className="block truncate text-xs text-gray-500">{auth?.user?.roleLabel}</span>
                    </span>
                </a>
                <form method="POST" action="/logout">
                    <input type="hidden" name="_token" value={csrfToken} />
                    <button
                        type="submit"
                        aria-label="تسجيل الخروج"
                        title="تسجيل الخروج"
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition hover:bg-brand-500/10 hover:text-brand-600"
                    >
                        <Icon name="logout" className="h-5 w-5" />
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function AuthenticatedLayout({ header, children }) {
    const { props } = usePage();
    const { appName, can } = props;
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);
    useResponsiveTables();

    const paletteLinks = [
        ...allowedLinks(MAIN_LINKS, can).map((link) => ({ ...link, group: 'الصفحات' })),
        ...allowedLinks(SETTINGS_LINKS, can).map((link) => ({ ...link, group: 'الإعدادات' })),
    ];

    useEffect(() => {
        if (!drawerOpen) {
            return;
        }

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                setDrawerOpen(false);
            }
        }

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [drawerOpen]);

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
            {/* Sidebar: fixed on large screens, a drawer on small ones. */}
            <aside className="fixed inset-y-0 start-0 z-40 hidden w-72 border-e border-gray-100 bg-surface lg:block">
                <SidebarContent />
            </aside>

            {drawerOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div
                        className="animate-modal-backdrop absolute inset-0 bg-graphite-900/60 backdrop-blur-sm"
                        onClick={() => setDrawerOpen(false)}
                    />
                    <aside className="animate-modal-panel absolute inset-y-0 start-0 w-72 max-w-[85vw] bg-surface shadow-2xl">
                        <SidebarContent onNavigate={() => setDrawerOpen(false)} />
                    </aside>
                </div>
            )}

            <div className="lg:ps-72">
                {/* Top bar */}
                <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-gray-100 bg-surface/75 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
                    <button
                        type="button"
                        onClick={() => setDrawerOpen(true)}
                        aria-label="فتح القائمة"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-gray-200 bg-surface text-gray-700 lg:hidden"
                    >
                        <Icon name="menu" className="h-5 w-5" />
                    </button>
                    <a href="/dashboard" className="shrink-0 lg:hidden">
                        <img src="/images/logo-af.webp" alt={appName} className="h-9 w-auto" />
                    </a>

                    <button
                        type="button"
                        onClick={() => setPaletteOpen(true)}
                        className="flex min-w-0 max-w-sm flex-1 items-center gap-2.5 rounded-control border border-gray-200 bg-surface px-3.5 py-2.5 text-start text-sm text-gray-400 shadow-sm transition hover:border-gray-300"
                    >
                        <Icon name="search" className="h-[18px] w-[18px] shrink-0" />
                        <span className="flex-1 truncate">ابحث أو انتقل إلى صفحة...</span>
                        <span className="kbd hidden shrink-0 sm:inline-flex" dir="ltr">
                            Ctrl K
                        </span>
                    </button>

                    <ThemeToggle className="ms-auto" />
                </header>

                <main className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-10">
                    {header && <div className="rise-in mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">{header}</div>}
                    {children}
                </main>
            </div>

            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} links={paletteLinks} />
        </div>
    );
}
