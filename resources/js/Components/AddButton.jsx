import { Link } from '@inertiajs/react';
import Icon from '@/Components/Icon';

const STYLES = {
    primary: 'gap-2 bg-brand-gradient px-4 py-2.5 text-white shadow-glow hover:brightness-110 active:translate-y-px',
    soft: 'gap-1.5 bg-brand-500/10 px-3 py-1.5 text-brand-600 hover:bg-brand-500/15',
    outline: 'gap-2 border border-gray-200 bg-surface px-4 py-2.5 text-gray-900 hover:border-gray-300 hover:bg-gray-50 active:translate-y-px',
};

/**
 * A "+ Add …" button. Renders a link when given `href`, otherwise a
 * button that calls `onClick`. `variant="soft"` is the lighter style
 * used inside panels; `variant="outline"` sits beside a primary one.
 */
export default function AddButton({ href, onClick, variant = 'primary', children }) {
    const className = `inline-flex items-center rounded-control text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${STYLES[variant]}`;
    const content = (
        <>
            <Icon name="plus" className="h-4 w-4" strokeWidth={2} />
            {children}
        </>
    );

    return href ? (
        <Link href={href} prefetch className={className}>
            {content}
        </Link>
    ) : (
        <button type="button" onClick={onClick} className={className}>
            {content}
        </button>
    );
}
