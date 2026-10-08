import { useState } from 'react';
import Icon from '@/Components/Icon';
import { formatMoney } from '@/lib/format';
import SplitPaymentDetails from './SplitPaymentDetails';

/**
 * Marks a payment that is one part of a split bank transfer, beside its
 * reference; it opens the transfer's details. `split` is `{ id, total }`.
 */
export default function SplitPaymentBadge({ split, className = '' }) {
    const [open, setOpen] = useState(false);

    if (!split) {
        return null;
    }

    return (
        <>
            <button
                type="button"
                onClick={(event) => {
                    // A row that opens on click must not open under the badge's own click.
                    event.stopPropagation();
                    setOpen(true);
                }}
                title="جزء من تحويل واحد وُزّع على عدة مشتركين — اضغط لعرض أجزائه"
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-bold text-violet-700 transition hover:bg-violet-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:text-violet-300 ${className}`}
            >
                <Icon name="layers" className="h-3 w-3" />
                دفعة مقسّمة · {formatMoney(split.total)} ₪
            </button>
            {open && <SplitPaymentDetails id={split.id} onClose={() => setOpen(false)} />}
        </>
    );
}
