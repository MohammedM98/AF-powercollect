import { Children, cloneElement, isValidElement, useCallback, useRef, useState } from 'react';
import Icon from '@/Components/Icon';
import RowMenu from './RowMenu';

/** Each action word gets its icon automatically. */
const ICONS = {
    عرض: 'eye',
    تعديل: 'pencil',
    حذف: 'trash',
    'حذف نهائي': 'close',
    'إدارة الصلاحيات': 'shield',
    'كشف الحساب': 'ledger',
};

/** Actions with a color of their own: blue to edit, burgundy to delete. */
const TONES = {
    تعديل: 'row-action-edit',
    حذف: 'row-action-delete',
    'حذف نهائي': 'row-action-delete',
};

/**
 * A row's actions, at the end of the row, always showing:
 *
 * - `onView`: the graphite "عرض" button, the row's main action. With a
 *   `menu`, it is split and its arrow opens the menu.
 * - `onEdit`: a blue pencil button ("تعديل").
 * - `onDelete`: a burgundy trash button ("حذف").
 * - `menu`: more actions in groups (see RowMenu); opened from "عرض"'s
 *   arrow, or from a ⋯ button when there is no "عرض".
 * - children, e.g. <RowActionsMenu><button onClick={…}>تعديل</button></RowActionsMenu>:
 *   each becomes a same-size icon button with its word as the tooltip
 *   (and its color, for تعديل and حذف).
 */
export default function RowActionsMenu({ onView, onEdit, onDelete, menu, children }) {
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
            <div className="row-actions-buttons">
                {Children.map(children, (child) => {
                    if (!isValidElement(child)) {
                        return child;
                    }

                    const label = child.props.children;
                    const word = typeof label === 'string' ? label.trim() : null;
                    const icon = word ? ICONS[word] : null;

                    return cloneElement(child, {
                        type: child.props.type ?? 'button',
                        className: `row-action ${TONES[word] ?? ''}`.trim(),
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

                {onDelete && (
                    <button type="button" className="row-action row-action-delete" title="حذف" aria-label="حذف" onClick={onDelete}>
                        <Icon name="trash" className="h-[18px] w-[18px]" />
                    </button>
                )}

                {onEdit && (
                    <button type="button" className="row-action row-action-edit" title="تعديل" aria-label="تعديل" onClick={onEdit}>
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
