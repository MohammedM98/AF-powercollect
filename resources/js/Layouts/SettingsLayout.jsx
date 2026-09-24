import { usePage } from '@inertiajs/react';
import AuthenticatedLayout from './AuthenticatedLayout';

// Same Blade-route caveat as AuthenticatedLayout's NavLink — plain <a>
// tags, not Inertia's <Link>, until these destinations become Inertia
// pages end-to-end.
function SubTab({ href, active, children }) {
    return (
        <a
            href={href}
            className={
                'shrink-0 whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-sm font-semibold transition ' +
                (active ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700')
            }
        >
            {children}
        </a>
    );
}

const TABS = [
    { href: '/branches', label: 'الفروع', can: 'viewBranches' },
    { href: '/tariffs', label: 'التعرفات', can: 'viewTariffs' },
    { href: '/circuit-breakers', label: 'القواطع', can: 'viewCircuitBreakers' },
    { href: '/meter-boxes', label: 'الطبلونات', can: 'viewMeterBoxes' },
    { href: '/governorates', label: 'المحافظات', can: 'viewGovernorates' },
    { href: '/settings/permissions', label: 'الصلاحيات', can: 'manageSettings' },
    { href: '/settings/reading-schedule', label: 'مواعيد القراءات', can: 'manageReadingSchedule' },
];

// Wraps the "instances"/configuration pages (Branches, Tariffs, Circuit
// Breakers, Meter Boxes, Governorates, Permissions) with a shared sub-nav
// tab strip, so they read as one settings area instead of cluttering the
// main navigation alongside Dashboard/Subscribers/Users.
export default function SettingsLayout({ header, children }) {
    const { props, url } = usePage();
    const { can } = props;

    const visibleTabs = TABS.filter((tab) => can?.[tab.can]);

    return (
        <AuthenticatedLayout header={header}>
            {visibleTabs.length > 1 && (
                <div className="-mt-4 mb-6 border-b border-gray-200">
                    <nav className="-mb-px flex gap-6 overflow-x-auto">
                        {visibleTabs.map((tab) => (
                            <SubTab key={tab.href} href={tab.href} active={url.startsWith(tab.href)}>
                                {tab.label}
                            </SubTab>
                        ))}
                    </nav>
                </div>
            )}
            {children}
        </AuthenticatedLayout>
    );
}
