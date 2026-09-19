export default function SecondaryButton({ className = '', disabled, children, type = 'button', ...props }) {
    return (
        <button
            {...props}
            type={type}
            disabled={disabled}
            className={
                `inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gray-700 shadow-sm transition duration-150 ease-in-out hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${disabled ? 'opacity-25' : ''} ` +
                className
            }
        >
            {children}
        </button>
    );
}
