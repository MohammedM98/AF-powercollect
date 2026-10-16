/**
 * Every page in the top bar and the Ctrl+K search. `can` names the flag in
 * the shared `can` props (HandleInertiaRequests) that must be true for the
 * link to show; links without it are always shown. The top bar's sections
 * and the search share the same task groups and permission flags.
 */
export const MAIN_LINKS = [
    { href: '/dashboard', label: 'لوحة التحكم', description: 'نظرة اليوم: التحصيل والمهام', icon: 'grid' },
    { href: '/payments', label: 'تسجيل الدفعات', description: 'استلام دفعة من مشترك وطباعة الوصل', icon: 'banknotes', can: 'recordPayments', exact: true },
    { href: '/payments/summary', label: 'ملخص التحصيل', description: 'ما حُصّل اليوم وهذا الشهر', icon: 'gauge', can: 'viewOwnCashBoxes' },
    { href: '/payments/cash-boxes', label: 'الصناديق المالية', description: 'صناديق المحصّلين وتأكيد إغلاقها', icon: 'wallet', can: 'viewCashBoxes' },
    { href: '/payments/entries', label: 'الحركات', description: 'حركات الصناديق المفتوحة', icon: 'list', can: 'viewCashBoxes' },
    { href: '/ledger', label: 'السجل المالي', description: 'القيود حسب التاريخ والفرع', icon: 'ledger', can: 'viewLedger' },
    { href: '/reconciliation', label: 'الإغلاقات والكشوفات', description: 'الإغلاقات وكشوف البنك', icon: 'bank', can: 'viewBranchReconciliation' },
    { href: '/weekly-packages', label: 'الإغلاق الأسبوعي', description: 'حزمة الأسبوع: راجعها وأرسلها للتدقيق', icon: 'layers', can: 'viewWeeklyClosings' },
    { href: '/receivables', label: 'أعمار الديون', description: 'الذمم المتأخرة حسب مدتها', icon: 'clock', can: 'viewDebtAging' },
    { href: '/transaction-audit', label: 'سجل التدقيق', description: 'من غيّر ماذا ومتى', icon: 'history', can: 'viewTransactionAudit' },
    { href: '/branch-performance', label: 'أداء الفروع', description: 'مقارنة نسب التحصيل بين الفروع', icon: 'trend', can: 'viewBranchPerformance' },
    { href: '/reports', label: 'التقارير', description: 'تقارير التحصيل والقراءات الجاهزة', icon: 'receipt', can: 'viewReports' },
    { href: '/subscriptions', label: 'المشتركون', description: 'البحث عن مشترك وإضافته وتعديله', icon: 'users', can: 'viewSubscriptions' },
    { href: '/meter-readings', label: 'القراءات الأسبوعية', description: 'قراءات العدادات لهذه الدورة', icon: 'chart', can: 'viewMeterReadings' },
    { href: '/reading-cycles', label: 'توزيع القراءات', description: 'توزيع الطبلونات على القرّاء والكشوف الورقية', icon: 'layers', can: 'viewReadingCycles' },
    { href: '/disconnection-lists', label: 'قوائم القطع', description: 'المدرجون للقطع ومواعيدهم وإنذاراتهم', icon: 'power', can: 'viewDisconnections' },
    { href: '/messages', label: 'الرسائل', description: 'تنبيهات الدفع والقطع للمشتركين', icon: 'messages', can: 'viewMessages' },
    { href: '/users', label: 'المستخدمون', description: 'الحسابات والأدوار والفروع', icon: 'user', can: 'viewUsers' },
];

export const SETTINGS_LINKS = [
    { href: '/branches', label: 'الفروع', description: 'الفروع ومسؤولوها ومناطقها', icon: 'pin', can: 'viewBranches' },
    { href: '/tariffs', label: 'التعرفات', description: 'سعر الأمبير وشرائح الاشتراك', icon: 'dollar', can: 'viewTariffs' },
    { href: '/circuit-breakers', label: 'القواطع', description: 'أحجام القواطع المتاحة للمشتركين', icon: 'bolt', can: 'viewCircuitBreakers' },
    { href: '/meter-boxes', label: 'الطبلونات', description: 'الطبلونات وأماكنها ومشتركوها', icon: 'table', can: 'viewMeterBoxes' },
    { href: '/governorates', label: 'المحافظات', description: 'المحافظات والمناطق والأحياء', icon: 'map', can: 'viewGovernorates' },
    { href: '/settings/permissions', label: 'الصلاحيات', description: 'ما يراه كل دور وما يعدّله', icon: 'shield', can: 'manageSettings' },
    { href: '/settings/reading-schedule', label: 'مواعيد القراءات', description: 'أيام فتح وإغلاق دورة القراءة', icon: 'calendar', can: 'manageReadingSchedule' },
    { href: '/settings/print-templates', label: 'قوالب الطباعة', description: 'شكل الوصل والكشوفات المطبوعة', icon: 'printer', can: 'managePrintTemplates' },
];

const linksByHref = new Map([...MAIN_LINKS, ...SETTINGS_LINKS].map((link) => [link.href, link]));

/** The first section of the top bar: the dashboard, under the name of home. */
export const HOME_LINK = { href: '/dashboard', label: 'الرئيسية', icon: 'home' };

/** A page outside the sections, named in the page trail when it is open. */
export const PROFILE_LINK = { href: '/profile', label: 'الملف الشخصي', description: 'بياناتك وكلمة المرور', icon: 'user' };

/** A collector's own boxes and entries, named as theirs. */
const OWN_LABELS = { '/payments/cash-boxes': 'صناديقي', '/payments/entries': 'حركاتي' };

/** Whether the user sees only their own boxes, not the branch's. */
function seesOwnBoxesOnly(can) {
    return Boolean(can?.viewOwnCashBoxes && !can?.viewBranchReconciliation);
}

export const NAVIGATION_GROUPS = [
    { id: 'daily', label: 'المشتركون', shortLabel: 'المشتركون', icon: 'users', description: 'المشتركون والقراءات والرسائل', hrefs: ['/subscriptions', '/meter-readings', '/reading-cycles', '/disconnection-lists', '/messages'] },
    { id: 'finance', label: 'المالية والتحصيل', shortLabel: 'المالية', icon: 'wallet', description: 'الدفعات والصناديق والإغلاق', hrefs: ['/payments', '/payments/summary', '/payments/cash-boxes', '/payments/entries', '/ledger', '/receivables', '/reconciliation', '/weekly-packages'] },
    { id: 'reports', label: 'التقارير والرقابة', shortLabel: 'التقارير', icon: 'trend', description: 'التقارير والأداء والتدقيق', hrefs: ['/reports', '/branch-performance', '/transaction-audit'] },
    { id: 'infrastructure', label: 'الفروع والشبكة', shortLabel: 'الشبكة', icon: 'bolt', description: 'الفروع والبنية الكهربائية', hrefs: ['/branches', '/governorates', '/meter-boxes', '/circuit-breakers'] },
    { id: 'administration', label: 'الإدارة والإعدادات', shortLabel: 'الإدارة', icon: 'cog', description: 'المستخدمون والصلاحيات والإعدادات', hrefs: ['/users', '/settings/permissions', '/tariffs', '/settings/reading-schedule', '/settings/print-templates'], featured: ['/users', '/settings/permissions'] },
];

/** Task groups containing only the pages the current user may open. */
export function allowedNavigationGroups(can) {
    return NAVIGATION_GROUPS.map(({ hrefs, ...group }) => {
        const links = allowedLinks(hrefs.map((href) => linksByHref.get(href)), can)
            .map((link) => (seesOwnBoxesOnly(can) && OWN_LABELS[link.href] ? { ...link, label: OWN_LABELS[link.href] } : link));

        return { ...group, links, complete: links.length === hrefs.length };
    }).filter((group) => group.links.length > 0);
}

/**
 * What a group holds, for its menu heading: the group's own description when
 * the user sees all of its pages, otherwise the pages they do see, so it never
 * names a page hidden from them ("القراءات والرسائل", "… وغيرها" past three).
 */
export function groupSummary(group) {
    if (group.complete) {
        return group.description;
    }

    const labels = group.links.map((link) => link.label);

    return labels.slice(0, 3).map((label, index) => (index ? `و${label}` : label)).join(' ') + (labels.length > 3 ? ' وغيرها' : '');
}

/**
 * What the top bar shows in its middle: home, then one button per section
 * that opens its pages. A user with a single section sees its pages directly.
 */
export function topBarItems(groups) {
    const home = { key: 'home', link: HOME_LINK };

    if (groups.length === 1) {
        return [home, ...groups[0].links.map((link) => ({ key: link.href, link }))];
    }

    return [home, ...groups.map((group) => ({ key: group.id, group }))];
}

/** The group holding the current page, if any. */
export function currentGroup(groups, url) {
    return groups.find((group) => isInsideAnyLink(group.links, url));
}

/**
 * The page the user is on, its group and the group's pages, for the trail
 * above the page and the strip of the section's pages below its title.
 */
export function pageTrail(groups, url) {
    const group = currentGroup(groups, url);
    const link = group?.links.find((candidate) => isActiveLink(candidate, url))
        ?? [MAIN_LINKS[0], PROFILE_LINK].find((candidate) => isActiveLink(candidate, url));

    return link ? { group, link, exact: url.split('?')[0] === link.href } : null;
}

/** The links the current user may open. */
export function allowedLinks(links, can) {
    return links.filter((link) => !link.can || can?.[link.can]);
}

/** Whether `url` (the current page, query string included) is inside the link's section. */
export function isActiveLink(link, url) {
    const path = url.split('?')[0];

    return [link.href, ...(link.activePaths ?? [])].some((href) => path === href || (!link.exact && path.startsWith(`${href}/`)));
}

/** Whether `url` is inside any of the links' sections. */
export function isInsideAnyLink(links, url) {
    return links.some((link) => isActiveLink(link, url));
}
