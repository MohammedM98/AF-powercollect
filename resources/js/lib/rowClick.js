/** Clicks on these do their own thing and never open the row. */
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="option"], [data-row-click-ignore]';

/**
 * Props that make a whole table row open when clicked anywhere, the same
 * as its main button ("عرض", or "تعديل" where there is nothing to view):
 * `<tr {...rowClickProps(() => open(row))}>`. Clicks on the row's own
 * buttons, links and fields, and a click that ends a text selection, are
 * left alone. Keyboard users reach the same action through the row's
 * button. Pass null when the row has nothing to open.
 */
export function rowClickProps(open) {
    if (!open) {
        return {};
    }

    return {
        'data-row-click': '',
        onClick(event) {
            if (event.target.closest?.(INTERACTIVE) || window.getSelection?.().toString()) {
                return;
            }

            open();
        },
    };
}
