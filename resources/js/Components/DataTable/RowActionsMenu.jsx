import { Children, cloneElement, isValidElement } from 'react';
import Icon from '@/Components/Icon';

/** Each action word gets its icon automatically. */
const ICONS = {
    عرض: 'eye',
    تعديل: 'pencil',
    حذف: 'trash',
    'إدارة الصلاحيات': 'shield',
    'كشف الحساب': 'table',
};

/**
 * A row's actions, e.g. <RowActionsMenu><button onClick={…}>تعديل</button></RowActionsMenu>.
 * The buttons keep their own handlers; their look and icon come from here.
 */
export default function RowActionsMenu({ children }) {
    return (
        <div className="data-table-actions">
            {Children.map(children, (child) => {
                if (!isValidElement(child)) {
                    return child;
                }

                const label = child.props.children;
                const icon = typeof label === 'string' ? ICONS[label.trim()] : null;

                return cloneElement(child, {
                    type: child.props.type ?? 'button',
                    className: 'row-action',
                    children: (
                        <>
                            {icon && <Icon name={icon} className="h-[15px] w-[15px]" />}
                            {label}
                        </>
                    ),
                });
            })}
        </div>
    );
}
