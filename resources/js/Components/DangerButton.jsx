/**
 * Destructive actions: a soft red button that fills in on hover. Red, not
 * the brand's burgundy, so deleting never looks like the Save button.
 */
export default function DangerButton({ className = '', disabled, children, ...props }) {
    return (
        <button
            {...props}
            disabled={disabled}
            className={
                'inline-flex items-center justify-center gap-2 rounded-control border border-danger/35 bg-danger/10 px-4 py-2.5 text-sm font-semibold text-danger-ink transition ' +
                'hover:border-danger hover:bg-danger hover:text-white active:translate-y-px focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger ' +
                'disabled:cursor-not-allowed disabled:opacity-40 ' +
                className
            }
        >
            {children}
        </button>
    );
}
