import { useEffect, useId, useRef, useState } from 'react';
import { Link, usePage } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import ThemeToggle from '@/Components/ThemeToggle';
import ActivityBell from '@/Components/ActivityBell';
import CommandPalette from '@/Components/CommandPalette';
import PrintDesigner from '@/Components/Print/PrintDesigner';
import { currentPrintSettings } from '@/lib/print';
import { MAIN_LINKS, allowedNavigationGroups, isActiveLink, isInsideAnyLink } from '@/lib/navigation';
import { useResponsiveTables } from '@/hooks/useResponsiveTables';

const SIDEBAR_STORAGE_KEY = 'sidebar';

/** Whether the user collapsed the sidebar to icons last time (remembered in this browser). */
function readSidebarCollapsed() {
    try {
        return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'collapsed';
    } catch {
        return false;
    }
}

/** Whether the screen is wide enough for the fixed sidebar (Tailwind's `lg`). */
function useIsDesktop() {
    const query = '(min-width: 1024px)';
    const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(query).matches);

    useEffect(() => {
        const media = window.matchMedia(query);
        const onChange = () => setIsDesktop(media.matches);

        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, []);

    return isDesktop;
}

/** The app name without the "AF" the logo already shows. */
function shortAppName(appName) {
    const name = (appName ?? '').trim();
    return !name || name.toLowerCase() === 'laravel' ? 'PowerCollect' : name.replace(/^AF\s+/i, '');
}

/**
 * One sidebar link: an icon with its label, or the icon alone when the
 * sidebar is collapsed (then `onHover` shows the label beside it). The
 * current page has a soft burgundy highlight and edge. The page starts
 * loading when the pointer rests on the link, so it opens almost at once.
 */
function NavLink({ link, active, collapsed, onHover }) {
    const showLabel = collapsed ? (event) => onHover(link.label, event.currentTarget) : undefined;
    const hideLabel = collapsed ? () => onHover(null) : undefined;

    return (
        <Link
            href={link.href}
            prefetch
            aria-current={active ? 'page' : undefined}
            onPointerEnter={showLabel}
            onFocus={showLabel}
            onPointerLeave={hideLabel}
            onBlur={hideLabel}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gray-900 motion-reduce:transition-none ${collapsed ? 'justify-center' : ''} ${
                active
                    ? 'nav-link-active bg-brand-50 font-semibold text-brand-600'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
            }`}
        >
            <Icon name={link.icon} className={`h-5 w-5 shrink-0 ${active ? 'text-brand-600' : 'text-gray-500'}`} />
            <span className={collapsed ? 'sr-only' : 'min-w-0'}>{link.label}</span>
        </Link>
    );
}

/**
 * Related tasks open together. Visiting a page reveals its group, including
 * when navigation happens through search or a link in the page content.
 */
function NavigationGroup({ group, url, collapsed, onHover }) {
    const { label, links } = group;
    const panelId = useId();
    const isInside = isInsideAnyLink(links, url);
    const [open, setOpen] = useState(group.defaultOpen || isInside);
    const showLabel = collapsed ? (event) => onHover(label, event.currentTarget) : undefined;
    const hideLabel = collapsed ? () => onHover(null) : undefined;

    useEffect(() => {
        if (isInside) {
            setOpen(true);
        }
    }, [url, isInside]);

    return (
        <div className="sidebar-group border-t border-gray-200 pt-2">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                data-active={isInside}
                onClick={() => {
                    setOpen(!open);
                    onHover(null);
                }}
                onPointerEnter={showLabel}
                onFocus={showLabel}
                onPointerLeave={hideLabel}
                onBlur={hideLabel}
                className={`sidebar-group-heading flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2 text-start text-sm font-semibold text-gray-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 motion-reduce:transition-none ${collapsed ? 'justify-center' : ''}`}
            >
                {collapsed && <Icon name={group.icon} className="h-5 w-5 shrink-0" />}
                <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1'}>{label}</span>
                {!collapsed && (
                    <Icon name="chevron-down" className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
                )}
            </button>

            <div id={panelId} hidden={!open} className="py-1">
                {links.map((link) => (
                    <NavLink
                        key={link.href}
                        link={link}
                        active={isActiveLink(link, url)}
                        collapsed={collapsed}
                        onHover={onHover}
                    />
                ))}
            </div>
        </div>
    );
}

function SidebarContent({ collapsed = false, onNavigate, onClose }) {
    const { props, url } = usePage();
    const { appName, auth, can } = props;
    const displayName = shortAppName(appName);
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const dashboardLink = MAIN_LINKS[0];
    const navigationGroups = allowedNavigationGroups(can);
    const [hoveredLink, setHoveredLink] = useState(null);

    /** Shows a collapsed link's label beside it (or hides it when `label` is null). */
    function onLinkHover(label, element) {
        setHoveredLink(label ? { label, top: element.getBoundingClientRect().top + element.offsetHeight / 2 } : null);
    }

    return (
        <div className="flex h-full flex-col font-sans" onClick={(event) => event.target.closest('a') && onNavigate?.()}>
            {onClose && (
                <div className="flex shrink-0 items-center justify-between px-4 pt-3">
                    <span className="text-xs font-semibold text-gray-500">القائمة الرئيسية</span>
                    <button
                        type="button"
                        autoFocus
                        onClick={onClose}
                        aria-label="إغلاق القائمة"
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gray-900"
                    >
                        <Icon name="close" className="h-5 w-5" />
                    </button>
                </div>
            )}
            <Link
                href="/dashboard"
                prefetch
                title={collapsed ? displayName : undefined}
                className={`flex shrink-0 items-center rounded-lg py-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gray-900 ${collapsed ? 'justify-center px-3' : 'gap-3 px-6'}`}
            >
                <img src="/images/logo-af.webp" alt={displayName} className={`w-auto shrink-0 ${collapsed ? 'h-9' : 'h-11'}`} />
                {!collapsed && (
                    <>
                        <span className="h-9 w-px bg-gray-200" aria-hidden="true" />
                        <span className="min-w-0">
                            {/* dir="auto": a Latin name is clipped at its end, not at its start as the Arabic page direction would. */}
                            <span dir="auto" className="block truncate text-right text-lg font-bold leading-tight text-gray-900">{shortAppName(appName)}</span>
                            <span dir="auto" title={auth?.user?.branchName ?? undefined} className="line-clamp-2 break-words text-right text-xs text-gray-500">
                                {auth?.user?.branchName ?? 'نظام التحصيل الكهربائي'}
                            </span>
                        </span>
                    </>
                )}
            </Link>

            <nav
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-4 pb-4"
                aria-label="القائمة الرئيسية"
                onScroll={() => setHoveredLink(null)}
            >
                <NavLink link={dashboardLink} active={isActiveLink(dashboardLink, url)} collapsed={collapsed} onHover={onLinkHover} />
                {navigationGroups.map((group) => (
                    <NavigationGroup key={group.id} group={group} url={url} collapsed={collapsed} onHover={onLinkHover} />
                ))}
            </nav>

            {collapsed && hoveredLink && (
                <span
                    aria-hidden="true"
                    style={{ top: hoveredLink.top }}
                    className="pointer-events-none fixed start-[100px] z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-graphite-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lift dark:ring-1 dark:ring-white/10"
                >
                    {hoveredLink.label}
                </span>
            )}

            <div
                className={`flex shrink-0 items-center border-t border-gray-200 ${
                    collapsed ? 'mx-3 flex-col gap-2 py-3' : 'mx-4 gap-2 py-3'
                }`}
            >
                <Link href="/profile" prefetch aria-label={`${auth?.user?.name ?? ''}، الملف الشخصي`} title="الملف الشخصي" className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gray-900">
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50 text-sm font-semibold text-gray-700">
                        {auth?.user?.name?.substring(0, 1)}
                    </span>
                    {!collapsed && (
                        <span className="min-w-0">
                            <span dir="auto" title={auth?.user?.name} className="block truncate text-right text-sm font-semibold text-gray-900">{auth?.user?.name}</span>
                            <span dir="auto" className="block truncate text-right text-xs text-gray-500">{auth?.user?.roleLabel}</span>
                        </span>
                    )}
                </Link>
                <form method="POST" action="/logout">
                    <input type="hidden" name="_token" value={csrfToken} />
                    <button
                        type="submit"
                        aria-label="تسجيل الخروج"
                        title="تسجيل الخروج"
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-brand-50 hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gray-900 motion-reduce:transition-none"
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
    const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
    const drawerRef = useRef(null);
    const isDesktop = useIsDesktop();
    const [printSettings] = useState(currentPrintSettings);
    useResponsiveTables();

    /**
     * On large screens the button switches the sidebar between icons with
     * text and icons only; on small screens it opens the drawer.
     */
    function onMenuButton() {
        if (!isDesktop) {
            setDrawerOpen(true);
            return;
        }

        const next = !sidebarCollapsed;
        setSidebarCollapsed(next);

        try {
            localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? 'collapsed' : 'expanded');
        } catch {
            // Storage may be blocked (private mode); the toggle still works for this visit.
        }
    }

    const menuButtonLabel = !isDesktop ? 'فتح القائمة' : sidebarCollapsed ? 'توسيع القائمة الجانبية' : 'تصغير القائمة الجانبية';

    const paletteLinks = [
        { ...MAIN_LINKS[0], group: 'عام' },
        ...allowedNavigationGroups(can).flatMap((group) => group.links.map((link) => ({ ...link, group: group.label }))),
    ];

    function onPaletteOpenChange(open) {
        if (open) {
            drawerRef.current?.close();
            setDrawerOpen(false);
        }

        setPaletteOpen(open);
    }

    useEffect(() => {
        const drawer = drawerRef.current;

        if (!drawer || !drawerOpen || isDesktop) {
            if (isDesktop && drawerOpen) {
                setDrawerOpen(false);
            }

            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        drawer.showModal();

        return () => {
            document.body.style.overflow = previousOverflow;
            drawer.close();
        };
    }, [drawerOpen, isDesktop]);

    // Opened from a table's print button: the page without the menus (see lib/print.js).
    if (printSettings) {
        return <PrintDesigner settings={printSettings}>{children}</PrintDesigner>;
    }

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
            <a href="#main-content" className="sr-only rounded-lg bg-surface text-gray-900 focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[70] focus:px-4 focus:py-3 focus:outline focus:outline-2 focus:outline-gray-900">
                تخطي إلى المحتوى
            </a>
            {/* Sidebar: fixed on large screens (full or icons only), a drawer on small ones. */}
            <aside
                id="app-sidebar"
                className={`fixed inset-y-0 start-0 z-40 hidden overflow-hidden border-e border-gray-200 bg-surface transition-[width] duration-300 ease-out motion-reduce:transition-none lg:block ${
                    sidebarCollapsed ? 'w-[88px]' : 'w-72'
                }`}
            >
                <SidebarContent collapsed={sidebarCollapsed} />
            </aside>

            <dialog
                ref={drawerRef}
                id="mobile-sidebar"
                aria-label="القائمة الرئيسية"
                onCancel={() => setDrawerOpen(false)}
                onClose={() => setDrawerOpen(false)}
                onClick={(event) => {
                    if (event.target === event.currentTarget) {
                        setDrawerOpen(false);
                    }
                }}
                className="fixed inset-y-0 start-0 end-auto m-0 h-[100dvh] max-h-none w-72 max-w-[85vw] overflow-hidden border-0 bg-surface p-0 text-gray-900 shadow-2xl backdrop:bg-graphite-900/60 backdrop:backdrop-blur-sm"
            >
                <SidebarContent onNavigate={() => setDrawerOpen(false)} onClose={() => setDrawerOpen(false)} />
            </dialog>

            <div className={`transition-[padding] duration-300 ease-out motion-reduce:transition-none ${sidebarCollapsed ? 'lg:ps-[88px]' : 'lg:ps-72'}`}>
                {/* Top bar */}
                <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-gray-100 bg-surface/75 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
                    <button
                        type="button"
                        onClick={onMenuButton}
                        aria-label={menuButtonLabel}
                        title={menuButtonLabel}
                        aria-controls={isDesktop ? 'app-sidebar' : 'mobile-sidebar'}
                        aria-expanded={isDesktop ? !sidebarCollapsed : drawerOpen}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-gray-200 bg-surface text-gray-700 shadow-sm transition hover:border-gray-300 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                    >
                        <Icon name={isDesktop ? 'sidebar' : 'menu'} className="h-5 w-5" />
                    </button>
                    <Link href="/dashboard" prefetch className="shrink-0 lg:hidden">
                        <img src="/images/logo-af.webp" alt={shortAppName(appName)} className="h-9 w-auto" />
                    </Link>

                    <button
                        type="button"
                        onClick={() => onPaletteOpenChange(true)}
                        className="flex min-w-0 max-w-sm flex-1 items-center gap-2.5 rounded-control border border-gray-200 bg-surface px-3.5 py-2.5 text-start text-sm text-gray-400 shadow-sm transition hover:border-gray-300"
                    >
                        <Icon name="search" className="h-[18px] w-[18px] shrink-0" />
                        <span className="flex-1 truncate">{can?.searchSubscriptions ? 'ابحث عن مشترك أو انتقل إلى صفحة...' : 'ابحث أو انتقل إلى صفحة...'}</span>
                        <span className="kbd hidden shrink-0 sm:inline-flex" dir="ltr">
                            Ctrl K
                        </span>
                    </button>

                    <ThemeToggle className="ms-auto" />
                    <ActivityBell />
                </header>

                <main id="main-content" tabIndex={-1} className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-10">
                    {header && <div className="rise-in mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">{header}</div>}
                    {children}
                </main>
            </div>

            <CommandPalette open={paletteOpen} onOpenChange={onPaletteOpenChange} links={paletteLinks} canSearchSubscribers={Boolean(can?.searchSubscriptions)} />
        </div>
    );
}
