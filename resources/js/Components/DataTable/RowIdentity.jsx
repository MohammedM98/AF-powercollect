import Icon from '@/Components/Icon';
import { initials } from '@/lib/initials';

const DOT_CLASSES = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    gray: 'bg-gray-400',
};

/**
 * The first cell of a row: a graphite tile (an icon, or the name's
 * initials), the name, and a quiet line under it. `status` adds a small dot
 * on the tile (green, amber or gray).
 */
export default function RowIdentity({ icon, name, subtitle, status, subtitleDir }) {
    return (
        <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-graphite-gradient font-display dark:ring-1 dark:ring-white/10 text-[13px] font-bold text-white">
                {icon ? <Icon name={icon} className="h-[18px] w-[18px]" /> : initials(name)}
                {status && (
                    <span className={`absolute -bottom-0.5 -start-0.5 h-3 w-3 rounded-full border-[2.5px] border-surface ${DOT_CLASSES[status]}`} />
                )}
            </span>
            <span className="min-w-0">
                <span className="block truncate font-semibold text-gray-900">{name}</span>
                {subtitle && (
                    <span className="block truncate text-[12.5px] text-gray-400">
                        <span dir={subtitleDir}>{subtitle}</span>
                    </span>
                )}
            </span>
        </div>
    );
}
