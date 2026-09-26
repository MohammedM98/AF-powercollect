import { Head, Link } from '@inertiajs/react';

/**
 * Shown for any address that doesn't exist (and any record that is gone),
 * on its own without the sidebar, since the visitor may not be signed in.
 */
export default function NotFound() {
    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 px-4 py-16 text-gray-900">
            <Head title="الصفحة غير موجودة" />
            <div
                className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl"
                aria-hidden="true"
            />

            <main className="rise-in relative w-full max-w-lg overflow-hidden rounded-hero border border-gray-100 bg-surface px-8 py-12 text-center shadow-lift">
                <span className="absolute inset-x-24 top-0 h-[2px] rounded-full bg-spectrum" aria-hidden="true" />
                <img src="/images/logo-af.webp" alt="AF Powercollect" className="mx-auto h-20 w-auto" />
                <p
                    className="mt-6 bg-gradient-to-b from-gray-400 to-gray-700 bg-clip-text font-display text-8xl font-bold leading-none text-transparent"
                    aria-hidden="true"
                >
                    404
                </p>
                <h1 className="mt-5 text-2xl font-bold text-gray-900">الصفحة غير موجودة</h1>
                <p className="mt-3 text-sm text-gray-500">الصفحة التي تبحث عنها غير موجودة أو تم نقلها.</p>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center rounded-control bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
                    >
                        العودة إلى لوحة التحكم
                    </Link>
                    <button
                        type="button"
                        onClick={() => window.history.back()}
                        className="inline-flex items-center rounded-control border border-gray-200 bg-surface px-5 py-2.5 text-sm font-semibold text-gray-900 transition hover:border-gray-300 hover:bg-gray-50"
                    >
                        رجوع
                    </button>
                </div>
            </main>
        </div>
    );
}
