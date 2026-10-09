import SelectInput from '@/Components/SelectInput';
import Icon from '@/Components/Icon';

/** The branch whose closings are shown; a plain label when the user sees only one. */
export default function BranchPicker({ branches, branchId, onChange }) {
    const branch = branches.find((option) => option.value === branchId);

    return (
        <label className="cb">
            <Icon name="pin" />
            <small>الفرع</small>
            {branches.length > 1 ? (
                <SelectInput
                    value={branchId ?? ''}
                    onChange={(event) => onChange(Number(event.target.value))}
                    aria-label="الفرع"
                    style={{ border: 0, fontWeight: 700 }}
                >
                    {branches.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </SelectInput>
            ) : (
                <b style={{ fontFamily: 'inherit', fontWeight: 700 }}>{branch?.label ?? '—'}</b>
            )}
        </label>
    );
}
