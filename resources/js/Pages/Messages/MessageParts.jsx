import StatusPill from '@/Components/DataTable/StatusPill';

const KIND_TONES = { weekly_reading: 'blue', balance_reminder: 'amber', custom: 'gray' };

const STATUS_TONES = { pending: 'amber', sent: 'green', failed: 'red' };

/** What a send is about, as a colored pill. */
export function KindPill({ kind, label }) {
    return <StatusPill tone={KIND_TONES[kind] ?? 'gray'} label={label} />;
}

/** How one message went: waiting, sent or failed. */
export function MessageStatusPill({ status, label }) {
    return <StatusPill tone={STATUS_TONES[status] ?? 'gray'} label={label} />;
}

/** "12 أُرسلت · 3 بانتظار الإرسال · 1 فشلت" for a send, leaving out the empty ones. */
export function DeliveryCounts({ batch }) {
    const parts = [
        { count: batch.sent, label: 'أُرسلت', className: 'text-emerald-700 dark:text-emerald-400' },
        { count: batch.pending, label: 'بانتظار الإرسال', className: 'text-amber-700 dark:text-amber-400' },
        { count: batch.failed, label: 'فشلت', className: 'text-brand-600' },
    ].filter((part) => part.count > 0);

    return (
        <span className="flex flex-wrap gap-x-2 text-xs font-semibold">
            <span className="text-gray-500">{batch.total.toLocaleString('en')} رسالة:</span>
            {parts.map((part) => (
                <span key={part.label} className={part.className}>
                    {part.count.toLocaleString('en')} {part.label}
                </span>
            ))}
        </span>
    );
}

/**
 * The text a subscriber gets: every `{placeholder}` replaced by their own
 * value, the same way the server fills it in (MessageComposer::render()).
 */
export function renderMessage(body, variables) {
    return (body ?? '').replace(/\{([^{}]+)\}/gu, (match, name) => variables?.[name.trim()] ?? match);
}
