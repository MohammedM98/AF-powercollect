import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, router } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import { BALANCE_LABELS, BALANCE_TEXT } from '@/Components/FinancialBalance';
import { describeBalance } from '@/lib/accountStatement';
import { formatMoney, initials } from '@/lib/format';
import { isSearchable, moveActive, paletteItems, subscriberSearchUrl } from '@/lib/subscriberSearch';

const NO_SUBSCRIBERS = { results: [], hasMore: false };

/** How long typing pauses before the subscribers are looked up. */
const SEARCH_DELAY = 250;

/**
 * Quick search (Ctrl+K / ⌘K from any page): type to find a page or — for
 * someone who may open subscriptions or record payments — a subscriber by
 * name, account number, phone or meter box. Arrows to move, Enter to open.
 * `links` are the pages this user may open, each {href, label, icon, group}.
 */
export default function CommandPalette({ open, onOpenChange, links, canSearchSubscribers = false }) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [subscribers, setSubscribers] = useState(NO_SUBSCRIBERS);
    const [searching, setSearching] = useState(false);
    const [failed, setFailed] = useState(false);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const lookingForSubscribers = canSearchSubscribers && isSearchable(query);

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

    // Looks subscribers up once typing pauses; a newer search cancels the one still on its way.
    useEffect(() => {
        if (!open || !lookingForSubscribers) {
            setSubscribers(NO_SUBSCRIBERS);
            setSearching(false);
            setFailed(false);
            return undefined;
        }

        const controller = new AbortController();
        setSearching(true);

        const timer = setTimeout(async () => {
            try {
                const response = await fetch(subscriberSearchUrl(query), {
                    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    credentials: 'same-origin',
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`Search failed: ${response.status}`);
                }

                setSubscribers(await response.json());
                setFailed(false);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    setSubscribers(NO_SUBSCRIBERS);
                    setFailed(true);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setSearching(false);
                }
            }
        }, SEARCH_DELAY);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [open, query, lookingForSubscribers]);

    const pages = useMemo(() => {
        const q = query.trim().toLowerCase();

        return q ? links.filter((link) => link.label.toLowerCase().includes(q) || link.group.includes(q)) : links;
    }, [links, query]);

    const items = useMemo(() => paletteItems(pages, subscribers.results), [pages, subscribers.results]);

    useEffect(() => {
        listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    if (!open) {
        return null;
    }

    function go(item) {
        if (item) {
            onOpenChange(false);
            router.visit(item.href);
        }
    }

    function onKeyDown(event) {
        if (event.key === 'Escape') {
            onOpenChange(false);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => moveActive(index, 1, items.length));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => moveActive(index, -1, items.length));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            go(items[activeIndex]);
        }
    }

    const placeholder = canSearchSubscribers ? 'ابحث عن مشترك أو انتقل إلى صفحة...' : 'ابحث أو انتقل إلى صفحة...';

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
                        placeholder={placeholder}
                        aria-label={placeholder.replace('...', '')}
                        className="h-14 w-full border-0 bg-transparent px-0 text-base shadow-none focus:border-0 focus:ring-0"
                    />
                    <span className="kbd shrink-0">Esc</span>
                </div>

                <ul ref={listRef} className="max-h-96 overflow-y-auto p-2" role="listbox" aria-label="نتائج البحث">
                    {pages.length === 0 && !lookingForSubscribers && (
                        <li role="presentation" className="px-4 py-8 text-center text-sm text-gray-500">لا توجد صفحات مطابقة.</li>
                    )}

                    {pages.map((link, index) => (
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
                                <span className="text-xs text-gray-500">{link.group}</span>
                                {index === activeIndex && <Icon name="enter" className="h-4 w-4 text-gray-400" />}
                            </Link>
                        </li>
                    ))}

                    {lookingForSubscribers && (
                        <>
                            <li role="presentation" className="px-3 pb-1 pt-3 text-xs font-semibold text-gray-500">المشتركون</li>

                            {subscribers.results.map((subscriber, position) => {
                                const index = pages.length + position;
                                const balance = describeBalance(subscriber.balance);
                                const details = [subscriber.accountNumber, subscriber.subAreaName, subscriber.branchName].filter(Boolean).join(' · ');

                                return (
                                    <li key={subscriber.id} role="option" aria-selected={index === activeIndex}>
                                        <Link
                                            href={subscriber.href}
                                            onClick={() => onOpenChange(false)}
                                            onPointerEnter={() => setActiveIndex(index)}
                                            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
                                                index === activeIndex ? 'bg-gray-50 text-gray-900' : 'text-gray-700'
                                            }`}
                                        >
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-graphite-gradient font-display text-[13px] font-bold text-white dark:ring-1 dark:ring-white/10">
                                                {initials(subscriber.name)}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span dir="auto" className="block truncate font-semibold">{subscriber.name}</span>
                                                <span dir="auto" className="block truncate text-xs text-gray-500">
                                                    {details}
                                                    {subscriber.phone && (
                                                        <>
                                                            {details && ' · '}
                                                            <bdi dir="ltr">{subscriber.phone}</bdi>
                                                        </>
                                                    )}
                                                </span>
                                            </span>
                                            <span title={BALANCE_LABELS[balance.tone]} className={`shrink-0 whitespace-nowrap text-end font-display text-sm font-semibold ${BALANCE_TEXT[balance.tone]}`}>
                                                <bdi dir="ltr">{formatMoney(subscriber.balance)} ₪</bdi>
                                                <span className="sr-only">{BALANCE_LABELS[balance.tone]}</span>
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}

                            {searching && subscribers.results.length === 0 && (
                                <li role="presentation" aria-live="polite" className="px-4 py-5 text-center text-sm text-gray-500">جارٍ البحث عن مشتركين...</li>
                            )}
                            {!searching && !failed && subscribers.results.length === 0 && (
                                <li role="presentation" aria-live="polite" className="px-4 py-5 text-center text-sm text-gray-500">لا يوجد مشترك مطابق.</li>
                            )}
                            {failed && (
                                <li role="alert" className="px-4 py-5 text-center text-sm text-red-700 dark:text-red-400">تعذّر البحث عن المشتركين الآن، حاول مرة أخرى.</li>
                            )}
                            {subscribers.hasMore && (
                                <li role="presentation" className="px-4 py-3 text-center text-xs text-gray-500">هناك نتائج أخرى — أضف جزءًا من الاسم أو رقم الحساب لتضييق البحث.</li>
                            )}
                        </>
                    )}
                </ul>

                <div className="flex items-center gap-4 border-t border-gray-100 bg-gray-50 px-5 py-2.5 text-xs text-gray-500">
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
