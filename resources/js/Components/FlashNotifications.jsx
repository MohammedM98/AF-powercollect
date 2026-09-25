import { useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import { createNotificationQueue } from '@/lib/notificationQueue';

const MESSAGES = {
    'user-created': 'تم إنشاء المستخدم بنجاح.',
    'user-updated': 'تم تحديث المستخدم بنجاح.',
    'subscriber-created': 'تم إنشاء المشترك بنجاح.',
    'subscriber-updated': 'تم تحديث المشترك بنجاح.',
    'branch-created': 'تم إنشاء الفرع بنجاح.',
    'branch-updated': 'تم تحديث الفرع بنجاح.',
    'meter-box-created': 'تم إنشاء الطبلون بنجاح.',
    'meter-box-updated': 'تم تحديث الطبلون بنجاح.',
    'meter-reading-created': 'تم حفظ القراءة بنجاح.',
    'meter-reading-updated': 'تم تحديث القراءة بنجاح.',
    'reading-schedule-updated': 'تم حفظ مواعيد القراءات بنجاح.',
    'tariff-created': 'تم إنشاء التعرفة بنجاح.',
    'tariff-updated': 'تم تحديث التعرفة بنجاح.',
    'circuit-breaker-created': 'تم إنشاء القاطع بنجاح.',
    'circuit-breaker-updated': 'تم تحديث القاطع بنجاح.',
    'governorate-created': 'تم إنشاء المحافظة بنجاح.',
    'governorate-updated': 'تم تحديث المحافظة بنجاح.',
    'area-created': 'تم إنشاء المنطقة بنجاح.',
    'area-updated': 'تم تحديث المنطقة بنجاح.',
    'sub-area-created': 'تم إنشاء منطقة 2 بنجاح.',
    'sub-area-updated': 'تم تحديث منطقة 2 بنجاح.',
    'permissions-updated': 'تم حفظ الصلاحيات بنجاح.',
    'profile-updated': 'تم حفظ الملف الشخصي بنجاح.',
    'password-updated': 'تم تحديث كلمة المرور بنجاح.',
};

export default function FlashNotifications({ initialStatus }) {
    const [notifications, setNotifications] = useState([]);
    const queue = useRef(null);

    useEffect(() => {
        const currentQueue = createNotificationQueue(setNotifications);
        queue.current = currentQueue;
        function showStatus(status) {
            currentQueue.push(MESSAGES[status] ?? status);
        }
        showStatus(initialStatus);
        const unsubscribeSuccess = router.on('success', (event) => showStatus(event.detail.page.props.status));
        // A single-field failure (e.g. a reading lower than the last one)
        // is shown with its own message; anything else gets the general one.
        const unsubscribeError = router.on('error', (event) => {
            const messages = Object.values(event.detail.errors ?? {});

            currentQueue.push(
                messages.length === 1 ? `تعذّر الحفظ: ${messages[0]}` : 'تعذّر الحفظ. يرجى مراجعة الحقول المحددة والمحاولة مجددًا.',
                'error',
            );
        });

        return () => {
            unsubscribeSuccess();
            unsubscribeError();
            currentQueue.dispose();
        };
    }, [initialStatus]);

    return (
        <div
            dir="rtl"
            aria-label="الإشعارات"
            className="pointer-events-none fixed left-4 top-4 z-[100] flex max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-sm flex-col gap-2 overflow-y-auto"
        >
            {notifications.map((notification) => (
                <div
                    key={notification.id}
                    role={notification.type === 'error' ? 'alert' : 'status'}
                    className="flash-notification pointer-events-auto relative shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
                >
                    <div className="flex items-start gap-3 p-4">
                        <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${notification.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}
                        >
                            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d={notification.type === 'error' ? 'M12 8v5m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' : 'M5 12l4 4L19 6'}
                                />
                            </svg>
                        </span>
                        <p className="min-w-0 flex-1 break-words pt-1 text-sm font-medium leading-6 text-gray-800">{notification.message}</p>
                        <button
                            type="button"
                            onClick={() => queue.current.dismiss(notification.id)}
                            aria-label="إغلاق الإشعار"
                            className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                        >
                            ✕
                        </button>
                    </div>
                    <div
                        aria-hidden="true"
                        className={`flash-notification-countdown h-0.5 ${notification.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}
                    />
                </div>
            ))}
        </div>
    );
}
