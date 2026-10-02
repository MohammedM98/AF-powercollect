import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/Components/Icon';
import { initials } from '@/lib/format';

const MENU_WIDTH = 290;

/**
 * The colour an item's icon takes when it is hovered or focused, by its
 * `tone` — each action its own, rather than all of them red. Written out
 * whole so Tailwind keeps every class.
 */
const TONES = {
    graphite: 'group-hover/item:bg-graphite-gradient group-focus-visible/item:bg-graphite-gradient',
    blue: 'group-hover/item:bg-blue-600 group-focus-visible/item:bg-blue-600',
    indigo: 'group-hover/item:bg-indigo-600 group-focus-visible/item:bg-indigo-600',
    sky: 'group-hover/item:bg-sky-600 group-focus-visible/item:bg-sky-600',
    emerald: 'group-hover/item:bg-emerald-600 group-focus-visible/item:bg-emerald-600',
    amber: 'group-hover/item:bg-amber-600 group-focus-visible/item:bg-amber-600',
    violet: 'group-hover/item:bg-violet-600 group-focus-visible/item:bg-violet-600',
    teal: 'group-hover/item:bg-teal-600 group-focus-visible/item:bg-teal-600',
    brand: 'group-hover/item:bg-brand-gradient group-focus-visible/item:bg-brand-gradient',
};
const GAP = 6;

/** Phones get the menu as a sheet rising from the bottom of the screen. */
function isPhone() {
    return window.matchMedia('(max-width: 639px)').matches;
}

/**
 * Where the menu opens beside its button: under it, or over it when there
 * is no room below, with its left edge on the button's (the row's end in
 * right-to-left), kept on screen.
 */
function placeBeside(anchor, menu) {
    const rect = anchor.getBoundingClientRect();
    const height = menu.offsetHeight;
    const below = window.innerHeight - rect.bottom - GAP;
    const top = below >= height || below >= rect.top ? rect.bottom + GAP : Math.max(GAP, rect.top - GAP - height);
    const left = Math.min(Math.max(GAP, rect.left), window.innerWidth - MENU_WIDTH - GAP);

    return { top, left, maxHeight: below >= height || below >= rect.top ? below : rect.top - GAP * 2 };
}

/**
 * A row's "more" menu: a header naming the record, then its actions in
 * titled groups, each with its own icon. `menu` is
 * { title, subtitle, groups: [{ label, items: [{ label, icon, onSelect, tone?, shortcut?, hint?, disabled?, lockedReason? }] }] }.
 * `tone` (see TONES) colours the item's icon on hover; dark by default.
 * An item with `lockedReason` is shown faded with a lock ("بدون صلاحية")
 * and the reason as its tooltip; `disabled` with `hint` explains why it
 * can't be used now. Arrow keys move, Enter runs, a shortcut letter runs
 * its item, Esc or a click outside closes and returns focus to `anchor`.
 */
export default function RowMenu({ anchor, menu, onClose }) {
    const menuRef = useRef(null);
    const [phone] = useState(isPhone);
    const [position, setPosition] = useState(null);
    const items = menu.groups.flatMap((group) => group.items);

    // Hidden until placed, and a hidden item can't take focus: focus the first one once it shows.
    const placed = phone || position !== null;

    useLayoutEffect(() => {
        if (!phone) {
            setPosition(placeBeside(anchor, menuRef.current));
        }
    }, [anchor, phone]);

    useEffect(() => {
        if (placed) {
            menuRef.current?.querySelector('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
        }
    }, [placed]);

    useEffect(() => {
        function onPointerDown(event) {
            if (!menuRef.current?.contains(event.target) && !anchor.contains(event.target)) {
                onClose(false);
            }
        }

        // The menu is placed once; it closes instead of drifting away when the page moves.
        function onMove(event) {
            if (!menuRef.current?.contains(event.target)) {
                onClose(false);
            }
        }

        document.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('resize', onMove);
        if (!phone) {
            window.addEventListener('scroll', onMove, true);
        }

        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('resize', onMove);
            window.removeEventListener('scroll', onMove, true);
        };
    }, [anchor, onClose, phone]);

    function run(item) {
        if (item.disabled || item.lockedReason) {
            return;
        }

        onClose(false);
        item.onSelect();
    }

    function onKeyDown(event) {
        const enabled = [...menuRef.current.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')];
        const index = enabled.indexOf(document.activeElement);
        const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];

        if (move) {
            event.preventDefault();
            enabled[(index + move + enabled.length) % enabled.length]?.focus();
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            enabled[event.key === 'Home' ? 0 : enabled.length - 1]?.focus();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose(true);
        } else if (event.key === 'Tab') {
            onClose(false);
        } else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
            const item = items.find((candidate) => candidate.shortcut?.toLowerCase() === event.key.toLowerCase());

            if (item) {
                event.preventDefault();
                run(item);
            }
        }
    }

    const list = (
        <div
            ref={menuRef}
            role="menu"
            aria-label={`إجراءات ${menu.title}`}
            onKeyDown={onKeyDown}
            style={
                phone
                    ? undefined
                    : {
                          top: position?.top ?? 0,
                          left: position?.left ?? 0,
                          maxHeight: position?.maxHeight,
                          visibility: position ? 'visible' : 'hidden',
                      }
            }
            className={
                phone
                    ? 'animate-sheet fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-[24px] border-t border-gray-200 bg-surface p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lift'
                    : 'animate-menu fixed z-50 w-[290px] overflow-y-auto rounded-[20px] border border-gray-200 bg-surface p-2 shadow-lift'
            }
        >
            {phone && <div className="mx-auto mb-1 mt-1 h-1 w-10 rounded-full bg-gray-200" aria-hidden="true" />}

            <div className="mb-1 flex items-center gap-2.5 border-b border-gray-100 px-2 pb-3 pt-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-graphite-gradient font-display text-[12px] font-bold text-white dark:ring-1 dark:ring-white/10">
                    {initials(menu.title)}
                </span>
                <span className="min-w-0">
                    <b className="block truncate text-sm text-gray-900">{menu.title}</b>
                    {menu.subtitle && (
                        <span className="block truncate text-xs text-gray-500" dir="ltr" style={{ textAlign: 'right' }}>
                            {menu.subtitle}
                        </span>
                    )}
                </span>
            </div>

            {menu.groups.map((group) => (
                <div key={group.label} role="group" aria-label={group.label}>
                    <p className="px-2.5 pb-0.5 pt-2 text-[12px] font-bold text-gray-500" aria-hidden="true">
                        {group.label}
                    </p>
                    {group.items.map((item) => {
                        const unavailable = Boolean(item.disabled || item.lockedReason);

                        return (
                            <button
                                key={item.label}
                                type="button"
                                role="menuitem"
                                tabIndex={-1}
                                aria-disabled={unavailable || undefined}
                                aria-keyshortcuts={item.shortcut}
                                title={item.lockedReason ?? item.hint}
                                onClick={() => run(item)}
                                className={`group/item flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-start text-sm font-medium outline-none transition ${
                                    unavailable ? 'cursor-not-allowed opacity-55' : 'text-gray-900 hover:bg-gray-100 focus-visible:bg-gray-100'
                                }`}
                            >
                                <span
                                    className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] transition ${
                                        unavailable
                                            ? 'bg-gray-100 text-gray-500'
                                            : `bg-gray-100 text-gray-700 group-hover/item:text-white group-focus-visible/item:text-white ${TONES[item.tone] ?? TONES.graphite}`
                                    }`}
                                >
                                    <Icon name={item.icon} className="h-[17px] w-[17px]" />
                                </span>
                                <span className="flex-1 truncate">{item.label}</span>
                                {item.lockedReason ? (
                                    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-gray-500">
                                        <Icon name="lock" className="h-3.5 w-3.5" />
                                        بدون صلاحية
                                    </span>
                                ) : item.disabled && item.hint ? (
                                    <span className="shrink-0 text-[12px] text-gray-500">{item.hint}</span>
                                ) : (
                                    item.shortcut &&
                                    !phone && (
                                        <kbd className="kbd shrink-0" dir="ltr">
                                            {item.shortcut}
                                        </kbd>
                                    )
                                )}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );

    return createPortal(
        phone ? (
            <>
                <div className="animate-modal-backdrop fixed inset-0 z-50 bg-graphite-900/50" aria-hidden="true" />
                {list}
            </>
        ) : (
            list
        ),
        document.body,
    );
}
