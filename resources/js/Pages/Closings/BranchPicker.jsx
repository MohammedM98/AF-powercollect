import Icon from '@/Components/Icon';

/** The branch whose closings are shown; a plain label when the user sees only one. */
export default function BranchPicker({ branches, branchId, onChange }) {
    const branch = branches.find((option) => option.value === branchId);

    return (
        <label className="cb">
            <Icon name="pin" />
            <small>الفرع</small>
            {branches.length > 1 ? (
                <select
                    value={branchId ?? ''}
                    onChange={(event) => onChange(Number(event.target.value))}
                    aria-label="الفرع"
                    style={{ border: 0, background: 'transparent', fontWeight: 700 }}
                >
                    {branches.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            ) : (
                <b style={{ fontFamily: 'inherit', fontWeight: 700 }}>{branch?.label ?? '—'}</b>
            )}
        </label>
    );
}
