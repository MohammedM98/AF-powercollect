import { Link } from '@inertiajs/react';

/**
 * The financial boxes page's two tabs beside its title, as the users page
 * draws its own: the branch's boxes and the entries of its open boxes,
 * each with how many there are. `tabs` come from the server with their
 * links; `current` is the key of the one shown.
 */
export default function BoxTabs({ tabs, current }) {
    return (
        <nav aria-label="الصناديق المالية" className="inline-flex gap-0.5 rounded-xl border border-gray-100 bg-gray-100 p-[3px]">
            {tabs.map((tab) => {
                const active = tab.key === current;

                return (
                    <Link
                        key={tab.key}
                        href={tab.url}
                        prefetch
                        preserveScroll
                        aria-current={active ? 'page' : undefined}
                        className={`inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[13.5px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${
                            active ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        {tab.label}
                        <span className={`rounded-full px-1.5 font-display text-xs ${active ? 'bg-gray-100 text-gray-700' : 'bg-surface/60 text-gray-500'}`}>{tab.count.toLocaleString('en')}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
