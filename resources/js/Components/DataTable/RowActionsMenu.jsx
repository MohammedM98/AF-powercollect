import { Children, cloneElement, isValidElement, useCallback, useRef, useState } from 'react';
import Icon from '@/Components/Icon';
import RowMoreMenu from '@/Components/DataTable/RowMoreMenu';

/** What each action word does: its icon, and its color through data-action (see .row-action in app.css). */
const ACTIONS = {
    تعديل: { action: 'edit', icon: 'pencil' },
    حذف: { action: 'delete', icon: 'trash' },
    'إدارة الصلاحيات': { action: 'permissions', icon: 'shield' },
    'كشف الحساب': { action: 'statement', icon: 'ledger' },
};

function labelOf(child) {
    return typeof child.props.children === 'string' ? child.props.children.trim() : '';
}

/**
 * A row's actions, e.g. <RowActionsMenu><button onClick={…}>تعديل</button></RowActionsMenu>.
 * The buttons keep their own handlers; their look comes from here: icon
 * buttons of one size with the word as a tooltip, each colored by what it
 * does (edit is blue), and "عرض" last and strongest — graphite, turning
 * burgundy when pointed at. `menu` (groups of actions, see RowMoreMenu)
 * adds a "More" button and an arrow on "عرض" that open it; `menuHeader`
 * ({ name, subtitle }) says whose row it is, and `menuKey` names the
 * table so the menu remembers the action used last.
 *
 * On a computer with a mouse a table row keeps its buttons quiet (only a
 * faint "⋯") until the pointer or the keyboard reaches it; on touch
 * screens they always show.
 */
export default function RowActionsMenu({ children, menu = null, menuHeader = null, menuKey = 'row' }) {
    const [menuAnchor, setMenuAnchor] = useState(null);
    const menuAnchorRef = useRef(null);
    const hasMenu = Boolean(menu?.some((group) => group.items.length > 0));
    const buttons = Children.toArray(children).filter(isValidElement);
    const view = buttons.find((child) => labelOf(child) === 'عرض');
    const others = buttons.filter((child) => child !== view);

    function toggleMenu(event) {
        const trigger = event.currentTarget;
        const next = menuAnchorRef.current === trigger ? null : trigger;

        menuAnchorRef.current = next;
        setMenuAnchor(next);
    }

    const closeMenu = useCallback((restoreFocus) => {
        if (restoreFocus) {
            menuAnchorRef.current?.focus();
        }

        menuAnchorRef.current = null;
        setMenuAnchor(null);
    }, []);

    return (
        <div className={`row-actions${hasMenu ? ' has-menu' : ''}`} data-open={menuAnchor ? '' : undefined}>
            {hasMenu && (
                <span className="row-actions-idle" aria-hidden="true">
                    <Icon name="dots" strokeWidth={2.5} className="h-5 w-5" />
                </span>
            )}
            <div className="row-actions-buttons">
                {hasMenu && (
                    <button
                        type="button"
                        className="row-action"
                        data-action="more"
                        data-tip="أخرى"
                        aria-label="إجراءات أخرى"
                        aria-haspopup="dialog"
                        aria-expanded={menuAnchor !== null && menuAnchor.dataset.action === 'more'}
                        onClick={toggleMenu}
                    >
                        <Icon name="dots" strokeWidth={2.5} />
                    </button>
                )}
                {others.map((child) => {
                    const label = labelOf(child);
                    const meta = ACTIONS[label];

                    return cloneElement(child, {
                        type: child.props.type ?? 'button',
                        className: 'row-action',
                        'data-action': meta?.action ?? 'other',
                        'data-tip': meta ? label : undefined,
                        'aria-label': label || undefined,
                        children: meta ? <Icon name={meta.icon} /> : child.props.children,
                    });
                })}
                {view && (
                    <span className="row-view-split">
                        {cloneElement(view, {
                            type: view.props.type ?? 'button',
                            className: 'row-view',
                            'data-action': 'view',
                            children: (
                                <>
                                    <Icon name="eye" />
                                    عرض
                                </>
                            ),
                        })}
                        {hasMenu && (
                            <button
                                type="button"
                                className="row-view-caret"
                                data-action="view-menu"
                                aria-label="الإجراءات السريعة"
                                aria-haspopup="dialog"
                                aria-expanded={menuAnchor !== null && menuAnchor.dataset.action === 'view-menu'}
                                onClick={toggleMenu}
                            >
                                <Icon name="chevron-down" strokeWidth={2} />
                            </button>
                        )}
                    </span>
                )}
            </div>
            {hasMenu && <RowMoreMenu anchor={menuAnchor} onClose={closeMenu} groups={menu} header={menuHeader} menuKey={menuKey} />}
        </div>
    );
}
