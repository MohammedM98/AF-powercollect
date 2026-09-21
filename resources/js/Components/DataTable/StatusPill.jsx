const TONE_CLASSES = {
    green: 'bg-emerald-50 text-emerald-700',
    gray: 'bg-gray-100 text-gray-500',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-sky-50 text-sky-700',
};

const DOT_CLASSES = {
    green: 'bg-emerald-500',
    gray: 'bg-gray-400',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    blue: 'bg-sky-500',
};

export default function StatusPill({ tone = 'gray', label }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASSES[tone]}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[tone]}`} />
            {label}
        </span>
    );
}
