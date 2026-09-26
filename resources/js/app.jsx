import '../css/app.css';
import { createInertiaApp, router } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';
import FlashNotifications from '@/Components/FlashNotifications';

// Pages load ahead of time when a link is hovered. A save can change any
// list or count, so forget those early copies once it finishes.
router.on('finish', (event) => {
    if (event.detail.visit.method !== 'get') {
        router.flushAll();
    }
});

// Paper is white: print in the light theme, whichever theme is on screen.
let printedThemeClasses = [];

window.addEventListener('beforeprint', () => {
    const root = document.documentElement;
    printedThemeClasses = ['dark', 'dim'].filter((name) => root.classList.contains(name));
    root.classList.remove(...printedThemeClasses);
});

window.addEventListener('afterprint', () => {
    document.documentElement.classList.add(...printedThemeClasses);
});

createInertiaApp({
    // Each page's code is downloaded only when that page is first opened.
    resolve: (name) => {
        const pages = import.meta.glob('./Pages/**/*.jsx');
        return pages[`./Pages/${name}.jsx`]();
    },
    setup({ el, App, props }) {
        createRoot(el).render(
            <>
                <App {...props} />
                <FlashNotifications initialStatus={props.initialPage.props.status} />
            </>,
        );
    },
    // The loading bar for slow page changes, in the brand burgundy.
    progress: {
        color: '#A51D26',
    },
});
