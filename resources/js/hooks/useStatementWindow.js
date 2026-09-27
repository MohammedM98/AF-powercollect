import { useRef, useState } from 'react';
import { router } from '@inertiajs/react';

/** The current address without the open statement. */
function urlWithoutStatement() {
    const url = new URL(window.location.href);
    url.searchParams.delete('statement');

    return `${url.pathname}${url.search}`;
}

/**
 * The statement window of a page whose controller sends the `statement`
 * prop (BuildsSubscriberStatement::requestedStatement): a subscriber's
 * financial history shown over the page. It is open while a statement is
 * loading or once one is in the page props; the subscriber is kept in the
 * address (?statement=…) so the window stays open after a payment, charge
 * or discount is saved in it, and Back closes it.
 *
 * Returns `subscriber` (the header to show, or null when closed), `form`
 * (the form to open at once, if any), `open(header, form?)` and `close()`.
 * `header` is { id, fullName, … } as StatementModal reads it.
 */
export function useStatementWindow(statement) {
    const [loading, setLoading] = useState(null);
    const [form, setForm] = useState(null);
    const request = useRef(null);

    function open(header, initialForm = null) {
        setLoading(header);
        setForm(initialForm);
        router.reload({
            data: { statement: header.id },
            only: ['statement'],
            onCancelToken: (token) => (request.current = token),
            onFinish: () => {
                request.current = null;
                setLoading(null);
            },
        });
    }

    function close() {
        request.current?.cancel();
        setLoading(null);
        setForm(null);
        router.replace({
            url: urlWithoutStatement(),
            props: (props) => ({ ...props, statement: null }),
            preserveScroll: true,
            preserveState: true,
        });
    }

    const subscriber = loading ?? statement?.subscriber ?? null;

    return {
        subscriber,
        // The loaded statement, once it is the one asked for.
        statement: subscriber && statement?.subscriber.id === subscriber.id ? statement : null,
        form,
        open,
        close,
    };
}
