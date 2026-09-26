import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, router } from '@inertiajs/react';
import Icon from '@/Components/Icon';

/**
 * Quick search (Ctrl+K / ⌘K from any page): type to find a page, arrows to
 * move, Enter to open. `links` are the pages this user may open, each
 * {href, label, icon, group}.
 */
export default function CommandPalette({ open, onOpenChange, links }) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef(null);

    useEffect(() => {
        function onKeyDown(event) {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                onOpenChange(!open);
            }
        }

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open, onOpenChange]);

    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIndex(0);
            inputRef.current?.focus();
        }
    }, [open]);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();

        return q ? links.filter((link) => link.label.toLowerCase().includes(q) || link.group.includes(q)) : links;
    }, [links, query]);

    if (!open) {
        return null;
    }

    function go(link) {
        if (link) {
            onOpenChange(false);
            router.visit(link.href);
        }
    }

    function onKeyDown(event) {
        if (event.key === 'Escape') {
            onOpenChange(false);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, results.length - 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            go(results[activeIndex]);
        }
    }

    return (
        <div className="fixed inset-0 z-[60] px-4 pt-[12vh]" onClick={() => onOpenChange(false)}>
            <div className="animate-modal-backdrop fixed inset-0 bg-graphite-900/60 backdrop-blur-sm" />
            <div
                role="dialog"
                aria-modal="true"
                aria-label="البحث السريع"
                onClick={(event) => event.stopPropagation()}
                className="animate-modal-panel relative mx-auto w-full max-w-xl overflow-hidden rounded-panel bg-surface shadow-2xl ring-1 ring-black/5"
            >
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-16 top-0 h-[2px] rounded-full bg-spectrum opacity-80" />
                <div className="flex items-center gap-3 border-b border-gray-100 px-5">
                    <Icon name="search" className="h-5 w-5 shrink-0 text-gray-400" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setActiveIndex(0);
                        }}
                        onKeyDown={onKeyDown}
                        placeholder="ابحث أو انتقل إلى صفحة..."
                        aria-label="ابحث أو انتقل إلى صفحة"
                        className="h-14 w-full border-0 bg-transparent px-0 text-base shadow-none focus:border-0 focus:ring-0"
                    />
                    <span className="kbd shrink-0">Esc</span>
                </div>

                <ul className="max-h-80 overflow-y-auto p-2" role="listbox">
                    {results.length === 0 ? (
                        <li className="px-4 py-8 text-center text-sm text-gray-400">لا توجد صفحات مطابقة.</li>
                    ) : (
                        results.map((link, index) => (
                            <li key={link.href} role="option" aria-selected={index === activeIndex}>
                                <Link
                                    href={link.href}
                                    onClick={() => onOpenChange(false)}
                                    onPointerEnter={() => setActiveIndex(index)}
                                    className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
                                        index === activeIndex ? 'bg-gray-50 text-gray-900' : 'text-gray-700'
                                    }`}
                                >
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-surface text-gray-500">
                                        <Icon name={link.icon} className="h-[18px] w-[18px]" />
                                    </span>
                                    <span className="flex-1 font-semibold">{link.label}</span>
                                    <span className="text-xs text-gray-400">{link.group}</span>
                                    {index === activeIndex && <Icon name="enter" className="h-4 w-4 text-gray-400" />}
                                </Link>
                            </li>
                        ))
                    )}
                </ul>

                <div className="flex items-center gap-4 border-t border-gray-100 bg-gray-50 px-5 py-2.5 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5">
                        <span className="kbd">↑</span>
                        <span className="kbd">↓</span>
                        للتنقل
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="kbd">Enter</span>
                        للفتح
                    </span>
                </div>
            </div>
        </div>
    );
}
