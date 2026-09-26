const DOT_CLASSES = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    gray: 'bg-gray-400',
    red: 'bg-brand-500',
};

/**
 * A short list of choices shown as pill buttons, one of which is picked
 * (a radio group). Each option is `{ value, label, hint?, dot? }`: `hint`
 * is a quiet second line beside the label, `dot` a status color. Arrow keys
 * move the choice, like native radio buttons.
 */
export default function ChoiceChips({ id, value, onChange, options, label, disabled = false }) {
    const selectedIndex = options.findIndex((option) => String(option.value) === String(value));

    function onKeyDown(event, index) {
        const step = { ArrowLeft: 1, ArrowDown: 1, ArrowRight: -1, ArrowUp: -1 }[event.key];

        if (!step) {
            return;
        }

        event.preventDefault();
        const next = (index + step + options.length) % options.length;
        onChange(String(options[next].value));
        event.currentTarget.parentElement.children[next]?.focus();
    }

    return (
        <div id={id} role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
            {options.map((option, index) => {
                const checked = index === selectedIndex;

                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={disabled}
                        tabIndex={checked || (selectedIndex === -1 && index === 0) ? 0 : -1}
                        onClick={() => onChange(String(option.value))}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        className={`inline-flex items-center gap-2 rounded-control border px-3.5 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:cursor-not-allowed disabled:opacity-50 ${
                            checked
                                ? 'border-gray-400 bg-gray-100 text-gray-900 shadow-sm'
                                : 'border-gray-200 bg-surface text-gray-700 hover:border-gray-300 hover:text-gray-900'
                        }`}
                    >
                        {option.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASSES[option.dot]}`} aria-hidden="true" />}
                        {option.label}
                        {option.hint && (
                            <span className="text-xs font-medium text-gray-500" dir="ltr">
                                {option.hint}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
