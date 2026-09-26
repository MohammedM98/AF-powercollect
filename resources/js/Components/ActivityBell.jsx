import { useEffect, useRef, useState } from 'react';
import { useHttp, usePage } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import { ACTION_MESSAGES } from '@/lib/actionMessages';

const relativeTime = new Intl.RelativeTimeFormat('ar-u-nu-latn', { numeric: 'auto' });

/** When an action happened: "الآن", "قبل 5 دقائق", … and a plain date after a week. */
function timeAgo(isoDate) {
    const date = new Date(isoDate);
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (Math.abs(seconds) < 60) {
        return relativeTime.format(0, 'second');
    }
    if (Math.abs(minutes) < 60) {
        return relativeTime.format(minutes, 'minute');
    }
    if (Math.abs(hours) < 24) {
        return relativeTime.format(hours, 'hour');
    }
    if (Math.abs(days) < 7) {
        return relativeTime.format(days, 'day');
    }

    return date.toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * The bell in the top bar: the user's own latest saved actions (the
 * shared `activity` prop), with a count of the ones they haven't seen.
 * Opening it marks them all as seen.
 */
export default function ActivityBell() {
    const { activity } = usePage().props;
    const [open, setOpen] = useState(false);
    // The `activity` whose unread items were just marked as seen here; the next page visit brings a fresh one from the server.
    const [seenActivity, setSeenActivity] = useState(null);
    const menuRef = useRef(null);
    const http = useHttp();

    useEffect(() => {
        if (!open) {
            return;
        }

        function onPointerDown(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setOpen(false);
            }
        }

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        }

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    if (!activity) {
        return null;
    }

    const unreadCount = seenActivity === activity ? 0 : activity.unreadCount;

    function toggle() {
        setOpen(!open);

        if (!open && unreadCount > 0) {
            setSeenActivity(activity);
            http.post('/notifications/read').catch(() => {});
        }
    }

    return (
        <div ref={menuRef} className="relative shrink-0">
            <button
                type="button"
                onClick={toggle}
                aria-label={unreadCount > 0 ? `آخر الإجراءات، ${unreadCount} جديدة` : 'آخر الإجراءات'}
                title="آخر الإجراءات"
                aria-expanded={open}
                aria-haspopup="true"
                className={`relative flex h-11 w-11 items-center justify-center rounded-control border bg-surface shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${
                    open ? 'border-gray-300 text-gray-900' : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:text-gray-900'
                }`}
            >
                <Icon name="bell" className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span
                        dir="ltr"
                        className="absolute -end-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold leading-none tabular-nums text-white ring-2 ring-surface"
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="animate-dropdown fixed inset-x-4 top-[84px] z-40 overflow-hidden rounded-card border border-gray-100 bg-surface shadow-lift sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-3 sm:w-96">
                    <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                            <Icon name="bell" className="h-[18px] w-[18px]" />
                        </span>
                        <div>
                            <h3 className="font-bold text-gray-900">آخر الإجراءات</h3>
                            <p className="text-xs text-gray-500">ما حفظته مؤخرًا والتنبيهات الموجّهة إليك</p>
                        </div>
                    </div>

                    {activity.recent.length === 0 ? (
                        <div className="flex flex-col items-center px-6 py-10 text-center">
                            <Icon name="clock" className="h-9 w-9 text-gray-300" />
                            <p className="mt-3 text-sm font-medium text-gray-600">لا توجد إجراءات بعد.</p>
                            <p className="mt-1 text-xs text-gray-400">ستظهر هنا الإضافات والتعديلات التي تحفظها.</p>
                        </div>
                    ) : (
                        <ul className="max-h-[min(28rem,calc(100dvh-8rem))] divide-y divide-gray-100 overflow-y-auto">
                            {activity.recent.map((item) => {
                                const isCreation = item.action.endsWith('-created') || item.action === 'payment-recorded';
                                const isAlert = item.action === 'meter-reading-needs-reapproval';

                                return (
                                    <li key={item.id} className={`flex items-start gap-3 px-5 py-3.5 ${item.read ? '' : 'bg-brand-50/60'}`}>
                                        <span
                                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                                isAlert
                                                    ? 'bg-amber-500/10 text-amber-600'
                                                    : isCreation
                                                      ? 'bg-emerald-500/10 text-emerald-600'
                                                      : 'bg-gray-500/10 text-gray-600'
                                            }`}
                                        >
                                            <Icon name={isAlert ? 'alert' : isCreation ? 'plus' : 'pencil'} className="h-4 w-4" strokeWidth={2} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-gray-900">{ACTION_MESSAGES[item.action] ?? item.action}</p>
                                            {item.subject && <p className="mt-0.5 truncate text-sm text-gray-600">{item.subject}</p>}
                                            <time dateTime={item.createdAt} className="mt-1 block text-xs text-gray-400">
                                                {timeAgo(item.createdAt)}
                                            </time>
                                        </div>
                                        {!item.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" title="جديد" />}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
