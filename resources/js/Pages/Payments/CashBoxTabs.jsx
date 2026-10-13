import { Link, usePage } from '@inertiajs/react';

/**
 * The financial boxes page's views for those who close the branch's boxes:
 * their own boxes when they collect too, the staff's boxes with how many
 * wait on their confirmation, and every entry of the staff's boxes.
 */
export default function CashBoxTabs({ urls, active, branchPendingCount = 0 }) {
    const { can } = usePage().props;

    if (!can.viewBranchReconciliation) {
        return null;
    }

    const tabs = [
        ...(can.viewOwnCashBoxes ? [{ key: 'own', label: 'صناديقي', href: urls.cashBoxes }] : []),
        { key: 'branch', label: 'صناديق الموظفين', href: urls.branchCashBoxes },
        { key: 'branchEntries', label: 'حركات الموظفين', href: urls.branchEntries },
    ];

    return (
        <nav aria-label="عرض الصناديق" className="inline-flex gap-0.5 rounded-control border border-gray-100 bg-surface p-[3px] shadow-sm">
            {tabs.map((tab) => (
                <Link key={tab.key} href={tab.href} prefetch aria-current={active === tab.key ? 'page' : undefined}
                    className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${active === tab.key ? 'bg-gray-900 text-surface shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                    {tab.label}
                    {tab.key === 'branch' && branchPendingCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] text-white" aria-label={`${branchPendingCount} صناديق بانتظار تأكيد الإغلاق`}>{branchPendingCount}</span>}
                </Link>
            ))}
        </nav>
    );
}
