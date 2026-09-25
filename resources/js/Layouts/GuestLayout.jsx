import { usePage } from '@inertiajs/react';

export default function GuestLayout({ children }) {
    const { appName } = usePage().props;

    return (
        <div className="flex min-h-screen flex-col items-center bg-gray-100 pt-6 sm:justify-center sm:pt-0">
            <div>
                <a href="/">
                    <img src="/images/logo.png" alt={appName} className="h-32 w-32 object-contain" />
                </a>
            </div>

            <div className="mt-6 w-full overflow-hidden bg-white px-6 py-4 shadow-md sm:max-w-md sm:rounded-lg">{children}</div>
        </div>
    );
}
