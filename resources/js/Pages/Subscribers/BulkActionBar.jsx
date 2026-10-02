import { router } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import { printUrl } from '@/lib/print';

/** The most ticked subscribers a message or printout carries in its address. */
export const MAX_LINKED_IDS = 400;

/** The list filters the message page understands too. */
const MESSAGE_FILTERS = ['status', 'branch_id', 'meter_box_id', 'meter_box_name', 'circuit_breaker_id'];

const FOCUS_RING = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

/**
 * The address of the message page for the chosen subscribers: the ticked
 * ids, or every match of the list's search and filters — or null when
 * those filters can't be carried over (a tariff or segment filter).
 */
export function messageUrl({ all, ids, filters }) {
    const params = new URLSearchParams({ kind: 'custom' });

    if (!all) {
        params.set('status', '');
        ids.forEach((id) => params.append('subscriber_ids[]', id));

        return `/messages/create?${params}`;
    }

    const active = Object.entries(filters.filter ?? {}).filter(([, value]) => value !== '' && value !== null && value !== undefined);

    if (active.some(([key]) => !MESSAGE_FILTERS.includes(key))) {
        return null;
    }

    params.set('status', '');
    active.forEach(([key, value]) => params.set(key, value));

    if (filters.search) {
        params.set('search', filters.search);
    }

    return `/messages/create?${params}`;
}

function BarButton({ icon, label, onClick, disabled = false, hint }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={disabled ? hint : label}
            aria-describedby={undefined}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-control bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
        >
            <Icon name={icon} className="h-4 w-4" />
            {label}
        </button>
    );
}

/**
 * The bar shown while subscribers are chosen: how many, the actions —
 * change the minimum charge or the status (kept in the bulk changes log),
 * write them a message, print them — and clearing the choice. Actions the
 * user may not take don't show.
 */
export default function BulkActionBar({ count, selection, filters, abilities, onAction, onClear }) {
    const ids = selection.ids ?? [];
    const tooManyToLink = !selection.all && ids.length > MAX_LINKED_IDS;
    const linkHint = `اختر ${MAX_LINKED_IDS} مشتركًا أو أقل، أو «كل النتائج المطابقة»`;
    const toMessages = messageUrl({ all: selection.all, ids, filters });

    function print() {
        const url = printUrl(document.title);
        window.open(selection.all ? url : `${url}&filter%5Bids%5D=${ids.join(',')}`, '_blank');
    }

    return (
        <div
            role="region"
            aria-label="إجراءات على المشتركين المحددين"
            className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[calc(100%-2rem)] max-w-4xl flex-wrap items-center gap-2 rounded-2xl bg-graphite-gradient px-4 py-3 text-white shadow-lift ring-1 ring-white/10"
        >
            <span className="me-2 flex items-center gap-2 text-sm" aria-live="polite">
                <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-white px-2 font-display text-sm font-bold text-gray-900">
                    {count.toLocaleString('en')}
                </span>
                {selection.all ? 'مشترك (كل النتائج المطابقة)' : 'مشترك محدد'}
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-2">
                {abilities.minimumCharge && <BarButton icon="wallet" label="الحد الأدنى" onClick={() => onAction('minimum_charge')} />}
                {abilities.status && <BarButton icon="flag" label="الحالة" onClick={() => onAction('status')} />}
                {abilities.message && (
                    <BarButton
                        icon="messages"
                        label="رسالة"
                        onClick={() => router.visit(toMessages)}
                        disabled={!toMessages || tooManyToLink}
                        hint={!toMessages ? 'فلتر نوع الاشتراك لا ينتقل إلى صفحة الرسائل؛ حدّد المشتركين بدلًا منه' : linkHint}
                    />
                )}
                <BarButton icon="printer" label="طباعة" onClick={print} disabled={tooManyToLink} hint={linkHint} />
            </div>
            <button
                type="button"
                onClick={onClear}
                aria-label="إلغاء التحديد"
                title="إلغاء التحديد"
                className={`flex h-9 w-9 items-center justify-center rounded-control text-white/80 hover:bg-white/10 hover:text-white ${FOCUS_RING}`}
            >
                <Icon name="close" className="h-5 w-5" />
            </button>
        </div>
    );
}
