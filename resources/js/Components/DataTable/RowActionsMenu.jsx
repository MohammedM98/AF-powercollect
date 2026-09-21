export default function RowActionsMenu({ children }) {
    return (
        <div className="data-table-actions">
            <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M16.5 3.75a2.12 2.12 0 013 3L9 17.25l-4.5 1.5L6 14.25 16.5 3.75zM14.25 6l3 3M4.5 21h15"
                />
            </svg>
            {children}
        </div>
    );
}
