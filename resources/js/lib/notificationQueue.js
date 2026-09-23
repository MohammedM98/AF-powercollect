export function createNotificationQueue(onChange) {
    let notifications = [];
    let sequence = 0;
    const timers = new Map();

    function dismiss(id) {
        clearTimeout(timers.get(id));
        timers.delete(id);
        notifications = notifications.filter((notification) => notification.id !== id);
        onChange([...notifications]);
    }

    return {
        push(message, type = 'success') {
            if (typeof message !== 'string' || !message.trim()) { return; }
            const id = ++sequence;
            notifications = [...notifications, { id, message, type }];
            timers.set(id, setTimeout(() => dismiss(id), 3000));
            onChange([...notifications]);
        },
        dismiss,
        dispose() {
            timers.forEach((timer) => clearTimeout(timer));
            timers.clear();
            notifications = [];
        },
    };
}
