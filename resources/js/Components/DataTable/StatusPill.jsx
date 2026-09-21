const TONE_CLASSES = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    gray: 'border-gray-300 bg-gray-100 text-gray-600',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    blue: 'border-sky-200 bg-sky-50 text-sky-700',
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
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[tone]}`} />
            {label}
        </span>
    );
}
