/**
 * A row of buttons in one pill, one of them chosen: the period a report
 * covers, the order of the branch cards. `options` are `{ value, label }`;
 * `label` names the group for screen readers.
 */
export default function SegmentedTabs({ options, value, onChange, label }) {
    return (
        <div role="group" aria-label={label} className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-control border border-gray-100 bg-surface p-[3px] shadow-sm">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
                    className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm sm:px-3.5 font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${
                        value === option.value ? 'bg-gray-900 text-surface shadow-sm' : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
