import Icon from '@/Components/Icon';

/**
 * One figure on a card: an icon and a label, the figure itself with its
 * unit (شيكل…), and a quiet line of context under it. `hero` is the
 * graphite card a page leads with (one per page), with room for a `badge`
 * such as a change against the period before. `children` go under it all
 * (a small breakdown of the figure).
 */
export default function KpiTile({ icon, label, value, unit, hint, badge, hero = false, className = '', valueClassName = '', style, children }) {
    if (hero) {
        return (
            <div
                className={`rise-in relative overflow-hidden rounded-panel bg-graphite-gradient p-6 text-white shadow-lift ${className}`}
                style={style}
            >
                <div className="pointer-events-none absolute -end-12 -top-20 h-60 w-60 rounded-full bg-brand-500/25 blur-3xl" aria-hidden="true" />
                <div className="relative flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-white/75">{label}</p>
                    {badge}
                </div>
                <p className="relative mt-4 flex flex-wrap items-baseline gap-x-2">
                    <span className={`kpi-value font-display text-5xl font-bold ${valueClassName}`}>{value}</span>
                    {unit && <span className="text-base text-white/70">{unit}</span>}
                </p>
                {hint && <p className="relative mt-3 text-xs text-white/60">{hint}</p>}
                {children && <div className="relative">{children}</div>}
                <div className="brand-spectrum absolute inset-x-6 bottom-0" aria-hidden="true" />
            </div>
        );
    }

    return (
        <div className={`rise-in rounded-panel border border-gray-100 bg-surface p-6 shadow-card ${className}`} style={style}>
            <div className="flex items-center gap-2.5 text-sm font-semibold text-gray-700">
                {icon && (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-500">
                        <Icon name={icon} className="h-[18px] w-[18px]" />
                    </span>
                )}
                {label}
            </div>
            <p className="mt-5 flex flex-wrap items-baseline gap-x-1.5">
                <span className={`kpi-value font-display text-3xl font-bold ${valueClassName || 'text-gray-900'}`}>{value}</span>
                {unit && <span className="text-sm text-gray-500">{unit}</span>}
            </p>
            {hint && <p className="mt-2 text-sm leading-7 text-gray-500">{hint}</p>}
            {children}
        </div>
    );
}
