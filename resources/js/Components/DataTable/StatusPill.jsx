import { TONE_DOT_CLASSES } from '@/lib/subscriberStatus';

/**
 * A status shown as a word with a dot, never by color alone. Tints are
 * translucent so the pill reads well in every theme. Red is the warning
 * red, not the brand's burgundy.
 */
const TONE_CLASSES = {
    green: 'border-success/25 bg-success/10 text-success-ink',
    gray: 'border-gray-200 bg-gray-100 text-gray-500',
    amber: 'border-warning/25 bg-warning/10 text-warning-ink',
    red: 'border-danger/25 bg-danger/10 text-danger-ink',
    blue: 'border-info/25 bg-info/10 text-info-ink',
};

export default function StatusPill({ tone = 'gray', label }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}
        >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT_CLASSES[tone]}`} />
            {label}
        </span>
    );
}
