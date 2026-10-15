import { useCallback, useEffect, useRef, useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import CommandPalette from '@/Components/CommandPalette';
import PrintDesigner from '@/Components/Print/PrintDesigner';
import TopBar from '@/Components/TopBar/TopBar';
import NavigationDrawer from '@/Components/TopBar/NavigationDrawer';
import KeyboardShortcuts from '@/Components/TopBar/KeyboardShortcuts';
import QuickTour from '@/Components/TopBar/QuickTour';
import { Breadcrumb, SectionPages } from '@/Components/TopBar/PageTrail';
import { useTheme } from '@/hooks/useTheme';
import { currentPrintSettings } from '@/lib/print';
import { HOME_LINK, MAIN_LINKS, allowedNavigationGroups, pageTrail } from '@/lib/navigation';
import { useResponsiveTables } from '@/hooks/useResponsiveTables';

const NO_BADGES = {};

// How far down the floating bar reaches, so content under it counts as scrolled away.
const BAR_CLEARANCE = 90;

/** Whether the user is typing, so a single-key shortcut must not fire. */
function isTyping(target) {
    return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

/**
 * Every signed-in page: the floating top bar with the sections, the trail to
 * the page, the section's other pages, the page's title, then the page itself.
 * Only the top bar stays on screen while scrolling, so tables keep the room.
 * `badges` counts what waits on a page, by its link: { '/payments/summary': 2 }.
 */
export default function AuthenticatedLayout({ header, badges = NO_BADGES, children }) {
    const { props, url } = usePage();
    const { can } = props;
    const { dark, changePreference } = useTheme();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [tourOpen, setTourOpen] = useState(false);
    const [printSettings] = useState(currentPrintSettings);
    const menuButtonRef = useRef(null);
    const titleEndRef = useRef(null);
    const [pastTitle, setPastTitle] = useState(false);
    useResponsiveTables();

    const groups = allowedNavigationGroups(can);
    const trail = pageTrail(groups, url);
    const searchesSubscribers = Boolean(can?.recordPayments && can?.viewSubscriptions);
    const anyLayerOpen = drawerOpen || paletteOpen || shortcutsOpen || tourOpen;

    const paletteSections = [[HOME_LINK.label, [MAIN_LINKS[0]]], ...groups.map((group) => [group.label, group.links])];
    const commands = [
        ...(can?.recordPayments ? [{ id: 'pay', label: 'تسجيل دفعة', icon: 'banknotes', key: 'N' }] : []),
        { id: 'theme', label: 'تبديل الوضع الفاتح والداكن', icon: dark ? 'sun' : 'moon' },
        { id: 'tour', label: 'جولة سريعة في الشريط', icon: 'sparkles' },
        { id: 'keys', label: 'اختصارات لوحة المفاتيح', icon: 'keyboard', key: '?' },
    ];

    const onPaletteOpenChange = useCallback((open) => {
        if (open) {
            setDrawerOpen(false);
        }

        setPaletteOpen(open);
    }, []);

    const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
    const closeTour = useCallback(() => setTourOpen(false), []);
    const closeDrawer = useCallback(() => setDrawerOpen(false), []);

    function runCommand(id) {
        if (id === 'pay') {
            router.visit('/payments');
        } else if (id === 'theme') {
            changePreference(dark ? 'light' : 'dark');
        } else if (id === 'tour') {
            setTourOpen(true);
        } else if (id === 'keys') {
            setShortcutsOpen(true);
        }
    }

    // From any page: / opens the search, ? the keys, N the payment page.
    useEffect(() => {
        function onKeyDown(event) {
            if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey || anyLayerOpen) {
                return;
            }

            if (event.key === '?' || event.key === '؟' || (event.code === 'Slash' && event.shiftKey)) {
                event.preventDefault();
                setShortcutsOpen(true);
            } else if (event.key === '/' || event.code === 'Slash') {
                event.preventDefault();
                setPaletteOpen(true);
            } else if (can?.recordPayments && (event.key === 'n' || event.key === 'N' || event.code === 'KeyN') && !document.querySelector('dialog[open]')) {
                event.preventDefault();
                router.visit('/payments');
            }
        }

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [anyLayerOpen, can?.recordPayments]);

    // Whether the page's title has scrolled up under the bar.
    useEffect(() => {
        const marker = titleEndRef.current;

        if (!marker) {
            return undefined;
        }

        const observer = new IntersectionObserver(([entry]) => setPastTitle(!entry.isIntersecting && entry.boundingClientRect.top < BAR_CLEARANCE), {
            rootMargin: `-${BAR_CLEARANCE}px 0px 0px 0px`,
        });
        observer.observe(marker);

        return () => observer.disconnect();
    }, []);

    // The phone menu is for narrow screens only.
    useEffect(() => {
        const media = window.matchMedia('(min-width: 1024px)');
        const onChange = () => media.matches && setDrawerOpen(false);

        media.addEventListener('change', onChange);

        return () => media.removeEventListener('change', onChange);
    }, []);

    // Opened from a table's print button: the page without the menus (see lib/print.js).
    if (printSettings) {
        return <PrintDesigner settings={printSettings}>{children}</PrintDesigner>;
    }

    return (
        <div className="min-h-screen text-gray-900">
            <div className="tn-backdrop" aria-hidden="true" />
            <a href="#main-content" className="fixed start-4 -top-24 z-[100] rounded-xl bg-surface px-4 py-3 font-semibold shadow-lift focus:top-3">
                تخطي إلى المحتوى
            </a>

            <TopBar
                groups={groups}
                badges={badges}
                where={pastTitle && trail ? { section: trail.group?.shortLabel, page: trail.link.label } : null}
                drawerOpen={drawerOpen}
                onOpenPalette={() => onPaletteOpenChange(true)}
                onOpenDrawer={(event) => {
                    menuButtonRef.current = event.currentTarget;
                    setDrawerOpen(true);
                }}
                onShowShortcuts={() => setShortcutsOpen(true)}
                onStartTour={() => setTourOpen(true)}
            />

            <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1720px] px-[var(--tn-gutter)] pb-16 pt-8 outline-none">
                <Breadcrumb trail={trail} />
                <SectionPages trail={trail} url={url} badges={badges} />
                {header && <div className="rise-in mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">{header}</div>}
                <div ref={titleEndRef} aria-hidden="true" />
                {children}
            </main>

            <NavigationDrawer
                open={drawerOpen}
                groups={groups}
                badges={badges}
                onClose={closeDrawer}
                onOpenPalette={() => onPaletteOpenChange(true)}
                returnFocusTo={menuButtonRef}
            />
            <CommandPalette
                open={paletteOpen}
                onOpenChange={onPaletteOpenChange}
                sections={paletteSections}
                commands={commands}
                onCommand={runCommand}
                searchSubscribers={searchesSubscribers}
            />
            <KeyboardShortcuts open={shortcutsOpen} onClose={closeShortcuts} canRecordPayments={Boolean(can?.recordPayments)} />
            <QuickTour open={tourOpen} onClose={closeTour} searchesSubscribers={searchesSubscribers} />
        </div>
    );
}
