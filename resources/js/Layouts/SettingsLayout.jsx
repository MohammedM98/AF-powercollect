import { useEffect, useRef } from 'react';
import { Link, usePage } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import { SETTINGS_LINKS, allowedLinks, isActiveLink } from '@/lib/navigation';
import AuthenticatedLayout from './AuthenticatedLayout';

/**
 * The settings sections the user may open. On wide screens it is a list
 * beside the page; on smaller ones a row of chips above it that scrolls
 * sideways, brought round to show the current section.
 */
function SettingsNav({ links, url }) {
    const navRef = useRef(null);
    const activeRef = useRef(null);

    /** Scrolls the chips sideways only, so the page keeps its own scroll position. */
    useEffect(() => {
        const nav = navRef.current;
        const active = activeRef.current;

        if (!nav || !active || nav.scrollWidth <= nav.clientWidth) {
            return;
        }

        const navBox = nav.getBoundingClientRect();
        const activeBox = active.getBoundingClientRect();
        nav.scrollBy({ left: activeBox.left + activeBox.width / 2 - (navBox.left + navBox.width / 2) });
    }, [url]);

    return (
        <nav
            ref={navRef}
            aria-label="أقسام الإعدادات"
            className="rise-in -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 xl:sticky xl:top-[104px] xl:mx-0 xl:mb-0 xl:flex-col xl:gap-1 xl:overflow-visible xl:rounded-card xl:border xl:border-gray-100 xl:bg-surface xl:p-2.5 xl:shadow-card"
        >
            <p className="hidden px-3 pb-2 pt-1.5 text-xs font-semibold text-gray-400 xl:block">الإعدادات</p>
            {links.map((link) => {
                const active = isActiveLink(link, url);

                return (
                    <Link
                        key={link.href}
                        ref={active ? activeRef : undefined}
                        href={link.href}
                        prefetch
                        aria-current={active ? 'page' : undefined}
                        className={`group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold transition xl:gap-3 xl:rounded-2xl xl:border-0 xl:px-2.5 xl:py-2 ${
                            active
                                ? 'border-transparent bg-graphite-gradient text-white xl:bg-none xl:bg-brand-500/10 xl:text-brand-700 xl:shadow-[inset_-3px_0_0_rgb(var(--brand-500))] dark:ring-1 dark:ring-white/10 xl:dark:ring-0'
                                : 'border-gray-200 bg-surface text-gray-700 hover:border-gray-300 hover:text-gray-900 xl:hover:bg-gray-50'
                        }`}
                    >
                        <span
                            className={`flex shrink-0 items-center justify-center xl:h-8 xl:w-8 xl:rounded-[10px] ${
                                active ? 'xl:bg-brand-500 xl:text-white' : 'text-gray-500 group-hover:text-gray-900 xl:bg-gray-50'
                            }`}
                        >
                            <Icon name={link.icon} className="h-4 w-4" />
                        </span>
                        {link.label}
                    </Link>
                );
            })}
        </nav>
    );
}

/**
 * Layout for the settings pages (Branches, Tariffs, Circuit Breakers, Meter
 * Boxes, Governorates, Permissions, Reading Schedule). The sidebar has one
 * "الإعدادات" link for all of them; this lists the sections beside the page
 * so the user can move between them.
 */
export default function SettingsLayout({ header, children }) {
    const { props, url } = usePage();
    const links = allowedLinks(SETTINGS_LINKS, props.can);

    return (
        <AuthenticatedLayout>
            <div className={links.length > 0 ? 'xl:grid xl:grid-cols-[15rem_minmax(0,1fr)] xl:items-start xl:gap-8' : undefined}>
                {links.length > 0 && <SettingsNav links={links} url={url} />}
                <div className="min-w-0">
                    {header && <div className="rise-in mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">{header}</div>}
                    {children}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
