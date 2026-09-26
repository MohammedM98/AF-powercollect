import Icon from '@/Components/Icon';

/**
 * A small figure card: an icon and label, the figure itself (any node, so
 * it can carry a unit), and a quiet line of context under it.
 */
export default function MetricCard({ icon, label, children, hint, style }) {
    return (
        <div className="rise-in rounded-panel border border-gray-100 bg-surface p-6 shadow-card" style={style}>
            <div className="flex items-center gap-2.5 text-sm font-semibold text-gray-700">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-500">
                    <Icon name={icon} className="h-[18px] w-[18px]" />
                </span>
                {label}
            </div>
            <div className="mt-5 font-display text-3xl font-bold text-gray-900">{children}</div>
            {hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
        </div>
    );
}
