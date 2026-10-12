import { Link, usePage } from '@inertiajs/react';
import Icon from '@/Components/Icon';

export default function CollectionNavigation({ urls, active, pendingCount = 0 }) {
    const { can } = usePage().props;
    const items = [
        { key: 'payments', label: 'تسجيل الدفعات', icon: 'banknotes' },
        { key: 'summary', label: 'ملخص التحصيل', icon: 'gauge' },
        { key: 'cashBoxes', label: 'كل الصناديق', icon: 'wallet' },
    ];

    return (
        <nav aria-label="صفحات المحصّل" className="mb-6 inline-flex max-w-full gap-0.5 rounded-control border border-gray-100 bg-surface p-[3px] shadow-sm">
            {items.filter((item) => item.key !== 'payments' || can.recordPayments).map((item) => (
                <Link key={item.key} href={urls[item.key]} aria-current={active === item.key ? 'page' : undefined}
                    className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${active === item.key ? 'bg-gray-900 text-surface shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                    <Icon name={item.icon} className="h-4 w-4" />
                    {item.label}
                    {item.key === 'summary' && pendingCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] text-white" aria-label={`${pendingCount} أمور تنتظرك`}>{pendingCount}</span>}
                </Link>
            ))}
        </nav>
    );
}
