import '../css/app.css';
import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';
import FlashNotifications from '@/Components/FlashNotifications';

createInertiaApp({
    resolve: (name) => {
        const pages = import.meta.glob('./Pages/**/*.jsx', { eager: true });
        return pages[`./Pages/${name}.jsx`];
    },
    setup({ el, App, props }) {
        createRoot(el).render(
            <>
                <App {...props} />
                <FlashNotifications initialStatus={props.initialPage.props.status} />
            </>,
        );
    },
});
