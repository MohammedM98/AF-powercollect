/**
 * The main action on a screen, using the brand color and a clear focus outline.
 */
export default function PrimaryButton({ className = '', disabled, children, ...props }) {
    return (
        <button
            {...props}
            disabled={disabled}
            className={
                'inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors ' +
                'hover:bg-brand-600 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ' +
                'disabled:cursor-not-allowed disabled:opacity-40 ' +
                className
            }
        >
            {children}
        </button>
    );
}
