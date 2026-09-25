import Icon from '@/Components/Icon';

const STYLES = {
    primary: 'gap-2 bg-brand-500 px-4 py-2.5 text-white shadow-sm hover:bg-brand-600',
    soft: 'gap-1.5 bg-brand-50 px-3 py-1.5 text-brand-700 hover:bg-brand-100',
};

/**
 * A "+ Add …" button. Renders a link when given `href`, otherwise a
 * button that calls `onClick`. `variant="soft"` is the lighter style
 * used inside panels.
 */
export default function AddButton({ href, onClick, variant = 'primary', children }) {
    const className = `inline-flex items-center rounded-lg text-sm font-semibold transition ${STYLES[variant]}`;
    const content = (
        <>
            <Icon name="plus" className="h-4 w-4" strokeWidth={2} />
            {children}
        </>
    );

    return href ? (
        <a href={href} className={className}>
            {content}
        </a>
    ) : (
        <button type="button" onClick={onClick} className={className}>
            {content}
        </button>
    );
}
