import { useEffect } from 'react';

/**
 * Gives every cell of every `.data-table` a `data-label` with its column's
 * title, so on a narrow screen (see app.css) each row can show as a card
 * with the title above each value. Re-runs whenever the page's rows change.
 */
export function useResponsiveTables() {
    useEffect(() => {
        function label() {
            document.querySelectorAll('table.data-table').forEach((table) => {
                const titles = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());

                table.querySelectorAll('tbody tr').forEach((row) => {
                    [...row.children].forEach((cell, index) => {
                        const title = titles[index] ?? '';

                        if (cell.dataset.label !== title) {
                            cell.dataset.label = title;
                        }
                    });
                });
            });
        }

        label();
        const observer = new MutationObserver(label);
        observer.observe(document.body, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, []);
}
