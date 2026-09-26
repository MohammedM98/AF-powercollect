/**
 * Every page in the sidebar and the Ctrl+K search. `can` names the flag in
 * the shared `can` props (HandleInertiaRequests) that must be true for the
 * link to show; links without it are always shown.
 */
export const MAIN_LINKS = [
    { href: '/dashboard', label: 'لوحة التحكم', icon: 'grid' },
    { href: '/subscribers', label: 'المشتركون', icon: 'users', can: 'viewSubscribers' },
    { href: '/meter-readings', label: 'القراءات', icon: 'chart', can: 'viewMeterReadings' },
    { href: '/meter-reading-approvals', label: 'اعتماد القراءات', icon: 'check', can: 'approveMeterReadings' },
    { href: '/users', label: 'المستخدمون', icon: 'user', can: 'viewUsers' },
];

export const SETTINGS_LINKS = [
    { href: '/branches', label: 'الفروع', icon: 'pin', can: 'viewBranches' },
    { href: '/tariffs', label: 'التعرفات', icon: 'dollar', can: 'viewTariffs' },
    { href: '/circuit-breakers', label: 'القواطع', icon: 'bolt', can: 'viewCircuitBreakers' },
    { href: '/meter-boxes', label: 'الطبلونات', icon: 'table', can: 'viewMeterBoxes' },
    { href: '/governorates', label: 'المحافظات', icon: 'map', can: 'viewGovernorates' },
    { href: '/settings/permissions', label: 'الصلاحيات', icon: 'shield', can: 'manageSettings' },
    { href: '/settings/reading-schedule', label: 'مواعيد القراءات', icon: 'calendar', can: 'manageReadingSchedule' },
];

/** The links the current user may open. */
export function allowedLinks(links, can) {
    return links.filter((link) => !link.can || can?.[link.can]);
}

/** Whether `url` (the current page, query string included) is inside the link's section. */
export function isActiveLink(link, url) {
    const path = url.split('?')[0];

    return path === link.href || path.startsWith(`${link.href}/`);
}
