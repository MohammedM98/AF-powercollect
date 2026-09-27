import Icon from '@/Components/Icon';

/**
 * One part of a long form as its own card: an icon, a title and a short
 * line saying what belongs in it, then its fields in a grid.
 */
export default function FormSection({ icon, title, description, children, className = '' }) {
    return (
        <section className={`rounded-card border border-gray-100 bg-surface p-5 shadow-card sm:p-6 ${className}`}>
            <div className="mb-5 flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-graphite-gradient text-white dark:ring-1 dark:ring-white/10">
                    <Icon name={icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                    <h4 className="font-bold text-gray-900">{title}</h4>
                    {description && <p className="text-xs text-gray-500">{description}</p>}
                </div>
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
        </section>
    );
}
