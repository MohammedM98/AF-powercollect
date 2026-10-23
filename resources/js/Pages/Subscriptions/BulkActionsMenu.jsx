import { useState } from 'react';
import { router } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import RowMenu from '@/Components/DataTable/RowMenu';

const ACTIONS = [
    { key: 'minimum_charge', permission: 'minimumCharge', label: 'تعديل الحد الأدنى', icon: 'wallet', tone: 'amber' },
    { key: 'meter_box_id', permission: 'meterBox', label: 'نقل إلى طبلون آخر', icon: 'grid', tone: 'blue' },
    { key: 'message', permission: 'message', label: 'إرسال رسالة', icon: 'messages', tone: 'sky' },
    { key: 'status', permission: 'status', label: 'تغيير الحالة', icon: 'flag', tone: 'graphite' },
];

export function bulkActionOptions(abilities) {
    return ACTIONS.filter((action) => abilities[action.permission]);
}

export default function BulkActionsMenu({ abilities, onChoose }) {
    const [menu, setMenu] = useState(null);
    const actions = bulkActionOptions(abilities);

    function toggle(event, kind) {
        const anchor = event.currentTarget;
        setMenu((current) => current?.kind === kind ? null : { kind, anchor });
    }

    function close(restoreFocus) {
        if (restoreFocus) menu?.anchor.focus();
        setMenu(null);
    }

    return (
        <div className="inline-flex items-stretch rounded-control bg-[linear-gradient(135deg,#3b74e6,#1f4fb8)] text-sm font-semibold text-white shadow-[0_10px_22px_-10px_rgb(47_102_214/0.85)] ring-1 ring-inset ring-white/15">
            <button
                type="button"
                onClick={(event) => toggle(event, 'actions')}
                disabled={actions.length === 0}
                aria-haspopup="menu"
                aria-expanded={menu?.kind === 'actions'}
                className="inline-flex items-center gap-2 rounded-s-control px-4 py-2.5 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:opacity-50"
            >
                <Icon name="layers" className="h-4 w-4" />
                إجراءات جماعية
            </button>
            <button
                type="button"
                onClick={(event) => toggle(event, 'history')}
                aria-label="سجل التعديلات الجماعية"
                title="سجل التعديلات الجماعية"
                aria-haspopup="menu"
                aria-expanded={menu?.kind === 'history'}
                className="inline-flex items-center justify-center rounded-e-control border-s border-white/25 px-3 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
                <Icon name="chevron-down" className="h-4 w-4" />
            </button>
            {menu && (
                <RowMenu
                    anchor={menu.anchor}
                    onClose={close}
                    menu={{ title: menu.kind === 'history' ? 'سجل الإجراءات' : 'إجراءات جماعية', groups: [{ label: menu.kind === 'history' ? 'السجل' : 'اختر الإجراء ثم حدّد الاشتراكات', items: menu.kind === 'history'
                        ? [{ label: 'سجل التعديلات الجماعية', icon: 'history', tone: 'graphite', onSelect: () => router.visit('/subscriptions/bulk-changes') }]
                        : actions.map((action) => ({ ...action, onSelect: () => onChoose(action) })) }] }}
                />
            )}
        </div>
    );
}
