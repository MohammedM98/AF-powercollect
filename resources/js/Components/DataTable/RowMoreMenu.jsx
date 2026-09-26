import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { router } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import { initials } from '@/lib/initials';
import { itemForShortcut, matchRange, menuSections } from '@/lib/rowMenu';

const MENU_WIDTH = 320;
const SUBMENU_WIDTH = 220;
const PHONE_QUERY = '(max-width: 640px)';
const LOCKED_REASON = 'ليست لديك هذه الصلاحية. يمنحها المدير العام أو مدير فرعك من صفحة الصلاحيات.';

function readRecent(menuKey) {
    try {
        return localStorage.getItem(`row-menu-recent:${menuKey}`);
    } catch {
        return null;
    }
}

function saveRecent(menuKey, key) {
    try {
        localStorage.setItem(`row-menu-recent:${menuKey}`, key);
    } catch {
        // Storage may be blocked (private mode); the menu just won't remember.
    }
}

/**
 * Where the menu opens: under its button, or above it when there is more
 * room there, its left edge on the button's and kept on screen. Submenus
 * open on the left unless the menu is too close to that edge.
 */
function placement(anchor) {
    const rect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const below = spaceBelow >= 340 || spaceBelow >= spaceAbove;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - MENU_WIDTH - 8);

    return {
        style: below
            ? { left, top: rect.bottom + 6, '--menu-max-height': `${spaceBelow}px`, transformOrigin: 'top left' }
            : { left, bottom: window.innerHeight - rect.top + 6, '--menu-max-height': `${spaceAbove}px`, transformOrigin: 'bottom left' },
        submenuOnLeft: left >= SUBMENU_WIDTH + 16,
    };
}

/** The label with the searched letters marked. */
function Highlight({ text, query }) {
    const range = query ? matchRange(text, query) : null;

    if (!range) {
        return text;
    }

    return (
        <>
            {text.slice(0, range[0])}
            <mark className="rounded bg-brand-500/15 px-0.5 text-inherit">{text.slice(range[0], range[1])}</mark>
            {text.slice(range[1])}
        </>
    );
}

/** One action in the list: icon, label, and at the end its shortcut, submenu hint, or lock. */
function MenuOption({ id, item, active, query, showShortcut = true, onPointerEnter, onClick }) {
    const locked = Boolean(item.disabled);

    return (
        <div
            id={id}
            role="option"
            aria-selected={active}
            aria-disabled={locked || undefined}
            aria-haspopup={item.children ? 'listbox' : undefined}
            onPointerEnter={onPointerEnter}
            onClick={onClick}
            className={`flex cursor-pointer select-none items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors ${
                active ? 'bg-gray-100' : ''
            } ${locked ? 'cursor-not-allowed' : ''}`}
        >
            <span
                className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    active && !locked ? 'border-transparent bg-brand-gradient text-white shadow-glow' : 'border-gray-100 bg-gray-50 text-gray-600'
                } ${locked ? 'opacity-[0.55]' : ''}`}
            >
                <Icon name={item.icon} className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className={`block truncate font-semibold ${locked ? 'text-gray-500' : 'text-gray-900'}`}>
                    <Highlight text={item.label} query={query} />
                </span>
                {locked && (
                    <span className={active ? 'mt-0.5 block text-xs leading-5 text-gray-500' : 'sr-only'}>
                        {item.disabledReason ?? LOCKED_REASON}
                    </span>
                )}
            </span>
            {locked ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
                    <Icon name="lock" className="h-3.5 w-3.5" />
                    {item.disabledLabel ?? 'بدون صلاحية'}
                </span>
            ) : item.children ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-gray-500" dir="ltr">
                    <Icon name="chevron-left" className="h-3.5 w-3.5" />
                    {item.children
                        .map((child) => child.hint)
                        .filter(Boolean)
                        .join(' · ')}
                </span>
            ) : (
                showShortcut &&
                item.shortcut && (
                    <span className="kbd shrink-0" dir="ltr">
                        ⇧{item.shortcut}
                    </span>
                )
            )}
        </div>
    );
}

function MenuPanel({ anchor, onClose, groups, header, menuKey }) {
    const id = useId();
    const panelRef = useRef(null);
    const inputRef = useRef(null);
    const [isPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
    const [place] = useState(() => placement(anchor));
    const [recentKey] = useState(() => readRecent(menuKey));
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    // The open submenu: its parent item, where it sits, and the highlighted entry (-1 while the pointer, not the keyboard, is in it).
    const [submenu, setSubmenu] = useState(null);

    const sections = useMemo(() => menuSections(groups, query, recentKey), [groups, query, recentKey]);
    const entries = sections.flatMap((section, sectionIndex) => section.items.map((item) => ({ item, id: `${id}-${sectionIndex}-${item.key}` })));
    const active = entries[Math.min(activeIndex, entries.length - 1)] ?? null;
    const listId = `${id}-list`;

    useEffect(() => {
        if (!isPhone) {
            inputRef.current?.focus({ preventScroll: true });
        }
    }, [isPhone]);

    // Close when the pointer goes down elsewhere, or (on a computer) when the window resizes or the page scrolls
    // under the menu. The phone's sheet covers the page, and its keyboard resizes the window, so neither counts there.
    useEffect(() => {
        function onPointerDown(event) {
            if (!panelRef.current?.contains(event.target) && !anchor.contains(event.target)) {
                onClose(false);
            }
        }

        function onScroll(event) {
            if (!panelRef.current?.contains(event.target)) {
                onClose(false);
            }
        }

        function onResize() {
            onClose(false);
        }

        document.addEventListener('pointerdown', onPointerDown, true);

        if (!isPhone) {
            window.addEventListener('scroll', onScroll, true);
            window.addEventListener('resize', onResize);
        }

        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
        };
    }, [anchor, onClose, isPhone]);

    const activeId = active?.id;

    // Keep the highlighted action in view by scrolling the list only; scrolling the page would close the menu.
    useEffect(() => {
        const list = document.getElementById(listId);
        const option = activeId ? document.getElementById(activeId) : null;

        if (!list || !option) {
            return;
        }

        const listRect = list.getBoundingClientRect();
        const optionRect = option.getBoundingClientRect();

        if (optionRect.top < listRect.top) {
            list.scrollTop -= listRect.top - optionRect.top + 8;
        } else if (optionRect.bottom > listRect.bottom) {
            list.scrollTop += optionRect.bottom - listRect.bottom + 8;
        }
    }, [activeId, listId]);

    function openSubmenu(entry, fromKeyboard) {
        const option = document.getElementById(entry.id);
        const top = option && panelRef.current ? option.getBoundingClientRect().top - panelRef.current.getBoundingClientRect().top - 6 : 0;

        setSubmenu({ item: entry.item, top, activeIndex: fromKeyboard ? 0 : -1 });
    }

    function run(item, entry = null, fromKeyboard = false) {
        if (item.disabled) {
            return;
        }

        if (item.children) {
            if (submenu?.item === item && !fromKeyboard) {
                setSubmenu(null);
            } else if (entry) {
                openSubmenu(entry, fromKeyboard);
            }
            return;
        }

        saveRecent(menuKey, item.key);
        onClose(true);

        if (item.onSelect) {
            item.onSelect();
        } else if (item.href && item.download) {
            window.location.assign(item.href);
        } else if (item.href) {
            router.visit(item.href);
        }
    }

    function move(step) {
        if (submenu && submenu.activeIndex >= 0) {
            const count = submenu.item.children.length;
            setSubmenu({ ...submenu, activeIndex: (submenu.activeIndex + step + count) % count });
        } else if (entries.length > 0) {
            setSubmenu(null);
            setActiveIndex((index) => (Math.min(index, entries.length - 1) + step + entries.length) % entries.length);
        }
    }

    function onKeyDown(event) {
        const inSubmenu = submenu && submenu.activeIndex >= 0;

        if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
            event.preventDefault();
            move(1);
        } else if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
            event.preventDefault();
            move(-1);
        } else if (event.key === 'ArrowLeft' && active?.item.children && !active.item.disabled && !inSubmenu) {
            event.preventDefault();
            openSubmenu(active, true);
        } else if (event.key === 'ArrowRight' && submenu) {
            event.preventDefault();
            setSubmenu(null);
        } else if (event.key === 'Enter') {
            event.preventDefault();

            if (inSubmenu) {
                run(submenu.item.children[submenu.activeIndex]);
            } else if (active) {
                run(active.item, active, true);
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();

            if (submenu) {
                setSubmenu(null);
            } else {
                onClose(true);
            }
        } else if (event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && query === '') {
            const match = itemForShortcut(groups, event.code);

            if (match) {
                event.preventDefault();
                run(match.item);
            }
        }
    }

    const submenuOptions = submenu && (
        <div
            role="listbox"
            aria-label={submenu.item.label}
            className={
                isPhone
                    ? 'mb-1 ms-11 space-y-0.5 border-s border-gray-100 ps-2'
                    : 'animate-row-menu absolute z-10 w-[220px] rounded-2xl border border-gray-100 bg-surface p-1.5 shadow-lift ring-1 ring-black/5'
            }
            style={
                isPhone ? undefined : { top: submenu.top, ...(place.submenuOnLeft ? { right: 'calc(100% + 8px)' } : { left: 'calc(100% + 8px)' }) }
            }
        >
            {submenu.item.children.map((child, index) => (
                <MenuOption
                    key={child.key}
                    id={`${id}-sub-${child.key}`}
                    item={child}
                    showShortcut={!isPhone}
                    active={index === submenu.activeIndex}
                    onPointerEnter={() => setSubmenu({ ...submenu, activeIndex: index })}
                    onClick={() => run(child)}
                />
            ))}
        </div>
    );

    const panel = (
        <div
            role="dialog"
            aria-label={header?.name ? `إجراءات ${header.name}` : 'إجراءات أخرى'}
            onKeyDown={onKeyDown}
            className={
                isPhone
                    ? 'animate-sheet absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-[24px] bg-surface shadow-2xl'
                    : 'animate-row-menu flex max-h-[min(34rem,var(--menu-max-height))] w-[320px] flex-col overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-lift ring-1 ring-black/5'
            }
        >
            {isPhone && <span className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-200" aria-hidden="true" />}
            {header && (
                <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-graphite-gradient font-display text-[14.5px] font-bold text-white dark:ring-1 dark:ring-white/10">
                        {initials(header.name)}
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate font-bold text-gray-900">{header.name}</span>
                        {header.subtitle && (
                            <span className="block text-xs text-gray-500">
                                <span dir="ltr">{header.subtitle}</span>
                            </span>
                        )}
                    </span>
                </div>
            )}
            <div className="flex shrink-0 items-center gap-2.5 border-b border-gray-100 px-4">
                <Icon name="search" className="h-[18px] w-[18px] shrink-0 text-gray-400" />
                <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={submenu?.activeIndex >= 0 ? `${id}-sub-${submenu.item.children[submenu.activeIndex].key}` : active?.id}
                    aria-label="ابحث عن إجراء"
                    placeholder="ابحث عن إجراء..."
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setActiveIndex(0);
                        setSubmenu(null);
                    }}
                    className="h-12 w-full border-0 bg-transparent px-0 text-sm shadow-none focus:border-0 focus:ring-0"
                />
                {!isPhone && <span className="kbd shrink-0">Esc</span>}
            </div>

            <div id={listId} role="listbox" aria-label="الإجراءات" className="min-h-0 flex-1 overflow-y-auto p-2">
                {sections.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-gray-500">لا توجد إجراءات مطابقة.</p>
                ) : (
                    sections.map((section, sectionIndex) => (
                        <div key={section.title} role="group" aria-labelledby={`${id}-group-${sectionIndex}`}>
                            <p id={`${id}-group-${sectionIndex}`} className="px-2.5 pb-1 pt-2 text-xs font-bold text-gray-500">
                                {section.title}
                            </p>
                            {section.items.map((item) => {
                                const entryIndex = entries.findIndex((entry) => entry.id === `${id}-${sectionIndex}-${item.key}`);
                                const entry = entries[entryIndex];

                                return (
                                    <div key={item.key}>
                                        <MenuOption
                                            id={entry.id}
                                            item={item}
                                            query={query}
                                            showShortcut={!isPhone}
                                            active={entry === active && !(submenu && submenu.activeIndex >= 0)}
                                            onPointerEnter={() => {
                                                if (isPhone) {
                                                    return;
                                                }

                                                setActiveIndex(entryIndex);

                                                if (item.children && !item.disabled) {
                                                    openSubmenu(entry, false);
                                                } else {
                                                    setSubmenu(null);
                                                }
                                            }}
                                            onClick={() => {
                                                setActiveIndex(entryIndex);
                                                run(item, entry);
                                            }}
                                        />
                                        {isPhone && submenu?.item === item && submenuOptions}
                                    </div>
                                );
                            })}
                        </div>
                    ))
                )}
            </div>

            {!isPhone && (
                <div className="flex shrink-0 items-center gap-4 border-t border-gray-100 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                        <span className="kbd">↑</span>
                        <span className="kbd">↓</span>
                        تنقّل
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="kbd">↵</span>
                        تنفيذ
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="kbd">‹</span>
                        قائمة فرعية
                    </span>
                </div>
            )}
        </div>
    );

    if (isPhone) {
        return (
            <div data-row-click-ignore className="fixed inset-0 z-[70]">
                <div className="animate-modal-backdrop absolute inset-0 bg-graphite-900/50 backdrop-blur-[2px]" aria-hidden="true" />
                <div ref={panelRef}>{panel}</div>
            </div>
        );
    }

    return (
        <div ref={panelRef} data-row-click-ignore className="fixed z-[70]" style={place.style}>
            {panel}
            {submenuOptions}
        </div>
    );
}

/**
 * A row's "More" menu, opened from `anchor` (a button) and closed with
 * `onClose(restoreFocus)`. The cursor starts in a search box: type a few
 * letters to find an action instead of reading the whole list. Without a
 * search it shows the action used last, then the groups. Arrows move,
 * Enter runs, the left arrow opens a submenu, Esc closes; Shift plus an
 * action's letter runs it straight away. An action the user may not use
 * stays in the list, faded and locked, and says who can grant it. On a
 * phone the menu slides up from the bottom of the screen.
 */
export default function RowMoreMenu({ anchor, onClose, groups, header = null, menuKey = 'row' }) {
    if (!anchor) {
        return null;
    }

    return createPortal(<MenuPanel anchor={anchor} onClose={onClose} groups={groups} header={header} menuKey={menuKey} />, document.body);
}
