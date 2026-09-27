import { Children, cloneElement, isValidElement, useCallback, useRef, useState } from 'react';
import Icon from '@/Components/Icon';
import RowMenu from './RowMenu';

/** Each action word gets its icon automatically. */
const ICONS = {
    عرض: 'eye',
    تعديل: 'pencil',
    حذف: 'trash',
    'إدارة الصلاحيات': 'shield',
    'كشف الحساب': 'ledger',
};

/**
 * A row's actions, at the end of the row:
 *
 * - `onView`: the graphite "عرض" button, the row's main action. With a
 *   `menu`, it is split and its arrow opens the menu.
 * - `onEdit`: a pencil button ("تعديل").
 * - `menu`: more actions in groups (see RowMenu); opened from "عرض"'s
 *   arrow, or from a ⋯ button when there is no "عرض".
 * - children, e.g. <RowActionsMenu><button onClick={…}>تعديل</button></RowActionsMenu>:
 *   each becomes a same-size icon button with its word as the tooltip.
 *
 * On screens with a mouse, the buttons show only while the row is
 * hovered or focused (faint dots otherwise).
 */
export default function RowActionsMenu({ onView, onEdit, menu, children }) {
    const [menuAnchor, setMenuAnchor] = useState(null);

    const toggleMenu = useCallback((event) => {
        const trigger = event.currentTarget;
        setMenuAnchor((current) => (current ? null : trigger));
    }, []);

    const closeMenu = useCallback(
        (restoreFocus) => {
            if (restoreFocus) {
                menuAnchor?.focus();
            }
            setMenuAnchor(null);
        },
        [menuAnchor],
    );

    const menuProps = (label) => ({
        'aria-label': label,
        title: label,
        'aria-haspopup': 'menu',
        'aria-expanded': Boolean(menuAnchor),
        onClick: toggleMenu,
    });

    return (
        <div className="row-actions">
            <span className="row-actions-ghost" aria-hidden="true">
                <Icon name="dots" className="h-5 w-5" strokeWidth={2} />
            </span>

            <div className="row-actions-buttons">
                {Children.map(children, (child) => {
                    if (!isValidElement(child)) {
                        return child;
                    }

                    const label = child.props.children;
                    const icon = typeof label === 'string' ? ICONS[label.trim()] : null;

                    return cloneElement(child, {
                        type: child.props.type ?? 'button',
                        className: 'row-action',
                        title: label,
                        'aria-label': label,
                        children: <Icon name={icon ?? 'dots'} className="h-[18px] w-[18px]" />,
                    });
                })}

                {menu && !onView && (
                    <button type="button" className="row-action" {...menuProps('إجراءات أخرى')}>
                        <Icon name="dots" className="h-[18px] w-[18px]" strokeWidth={2} />
                    </button>
                )}

                {onEdit && (
                    <button type="button" className="row-action" title="تعديل" aria-label="تعديل" onClick={onEdit}>
                        <Icon name="pencil" className="h-[18px] w-[18px]" />
                    </button>
                )}

                {onView && (
                    <span className="row-action-view">
                        <button type="button" onClick={onView}>
                            <Icon name="eye" className="h-4 w-4" />
                            عرض
                        </button>
                        {menu && (
                            <button type="button" {...menuProps('إجراءات أخرى')}>
                                <Icon name="chevron-down" className="h-4 w-4" strokeWidth={2} />
                            </button>
                        )}
                    </span>
                )}
            </div>

            {menuAnchor && menu && <RowMenu anchor={menuAnchor} menu={menu} onClose={closeMenu} />}
        </div>
    );
}
