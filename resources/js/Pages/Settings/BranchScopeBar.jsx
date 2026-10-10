import { router } from '@inertiajs/react';
import Icon from '@/Components/Icon';

/**
 * Whose schedule a schedule page shows: the company's default or one
 * branch's. The Super Admin picks it from the list; a Branch Admin only ever
 * has their own branch, so sees its name. A branch with no schedule of its
 * own follows the company's until its first save.
 */
export default function BranchScopeBar({ path, branch, branches, followsCompany, branchesWithOwn, locked }) {
    let note;
    if (!branch) {
        note = `هذه إعدادات الشركة الافتراضية، وتتبعها الفروع التي لم تضبط مواعيدها بنفسها${branchesWithOwn > 0 ? ` (لدى ${branchesWithOwn} من الفروع مواعيد خاصة بها)` : ''}.`;
    } else if (followsCompany) {
        note = `الفرع «${branch.name}» يتبع حاليًا إعدادات الشركة. عند أول حفظ تصبح له مواعيد خاصة به وحده، ولا يتأثر بتغييرات الشركة بعدها.`;
    } else {
        note = `مواعيد خاصة بالفرع «${branch.name}» وحده؛ لا تغيّر غيره من الفروع.`;
    }

    function pick(event) {
        const value = event.target.value;
        router.get(path, value ? { branch: value } : {});
    }

    return (
        <section className="rs-scope" aria-label="نطاق المواعيد">
            <span className="rs-panel-icon" aria-hidden="true">
                <Icon name="building" />
            </span>
            {branches.length > 0 ? (
                <div className="rs-scope-picker">
                    <label htmlFor="schedule-branch">مواعيد</label>
                    <select id="schedule-branch" value={branch?.id ?? ''} disabled={locked} onChange={pick} title={locked ? 'احفظ التغييرات أو تراجع عنها قبل تغيير الفرع.' : undefined}>
                        <option value="">إعدادات الشركة الافتراضية</option>
                        {branches.map((item) => (
                            <option key={item.value} value={item.value}>
                                {item.label}
                                {item.hasOwn ? ' · مواعيد خاصة' : ''}
                            </option>
                        ))}
                    </select>
                </div>
            ) : (
                <b className="rs-scope-name">{branch?.name}</b>
            )}
            <p className="rs-scope-note">{note}</p>
        </section>
    );
}
