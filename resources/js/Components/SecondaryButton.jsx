/**
 * Cancel and side actions: a quiet outlined button.
 */
export default function SecondaryButton({ className = '', disabled, children, type = 'button', ...props }) {
    return (
        <button
            {...props}
            type={type}
            disabled={disabled}
            className={
                'inline-flex items-center justify-center gap-2 rounded-control border border-gray-200 bg-surface px-4 py-2.5 text-sm font-semibold text-gray-900 transition ' +
                'hover:border-gray-300 hover:bg-gray-50 active:translate-y-px focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ' +
                'disabled:cursor-not-allowed disabled:opacity-40 ' +
                className
            }
        >
            {children}
        </button>
    );
}
