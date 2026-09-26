/**
 * A small trend line (no axes) for a card, e.g. entries per day over two
 * weeks. Decorative: the card states the figures in words beside it.
 */
export default function Sparkline({ values, className = 'h-8 w-24' }) {
    if (values.length < 2) {
        return null;
    }

    const max = Math.max(1, ...values);
    const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${28 - (value / max) * 26}`).join(' ');

    return (
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={`text-brand-500 ${className}`} aria-hidden="true">
            <polyline
                points={points}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}
