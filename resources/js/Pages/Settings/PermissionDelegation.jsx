import Icon from '@/Components/Icon';
import InfoTip from '@/Components/InfoTip';
import { permissionEntries } from '@/lib/permissions';

/**
 * The right to hand permissions on, which only the Super Admin gives, and
 * only to someone who manages permissions: each of the employee's own
 * delegable permissions, keyed when they may grant it to their branch's
 * staff. `grantsGiven` counts, per permission, the staff who hold it from
 * them, who lose it when they do.
 */
export default function GrantRightPanel({ sections, selected, grantable, delegableIds, grantsGiven = {}, firstName, disabled, onChange }) {
    const held = permissionEntries(sections).filter((entry) => selected.includes(entry.id) && delegableIds.includes(entry.id));
    const bySection = Object.values(
        held.reduce((groups, entry) => {
            groups[entry.sectionKey] ??= { key: entry.sectionKey, label: entry.section, entries: [] };
            groups[entry.sectionKey].entries.push(entry);

            return groups;
        }, {}),
    );
    const keyed = held.filter((entry) => grantable.includes(entry.id)).length;

    function toggle(id) {
        onChange(grantable.includes(id) ? grantable.filter((item) => item !== id) : [...grantable, id]);
    }

    return (
        <section className="pm-card p-5 sm:p-6" aria-label="حق المنح">
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <span className="pm-card-icon">
                    <Icon name="key" className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                    <h4 className="flex items-center gap-1.5 font-bold text-gray-900">
                        حق المنح
                        <InfoTip label="عن حق المنح">
                            {`ما يحمل المفتاح يستطيع ${firstName} منحه لموظفي فرعه فقط، ويعمل فورًا ويصلك إشعار به. إذا سحبت منه صلاحية تُسحب ممن منحهم إياها، وإذا سحبت المفتاح وحده يبقى ما منحه.`}
                        </InfoTip>
                    </h4>
                    <p className="text-sm text-gray-500">
                        <b className="font-display text-gray-900">{keyed}</b> من <b className="font-display text-gray-900">{held.length}</b> يمنحها
                        لموظفيه
                    </p>
                </div>
                <div className="ms-auto flex gap-2">
                    <button
                        type="button"
                        disabled={disabled || keyed === held.length}
                        onClick={() => onChange([...new Set([...grantable, ...held.map((entry) => entry.id)])])}
                        className="rounded-control border border-gray-200 bg-surface px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        منح الكل
                    </button>
                    <button
                        type="button"
                        disabled={disabled || keyed === 0}
                        onClick={() => onChange([])}
                        className="rounded-control border border-gray-200 bg-surface px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        لا شيء
                    </button>
                </div>
            </div>

            {bySection.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                    لا يملك {firstName} صلاحيات يمكن منحها بعد. امنحه صلاحيات من تبويب «الصلاحيات» أولًا.
                </p>
            ) : (
                <div className="divide-y divide-gray-100">
                    {bySection.map((section) => (
                        <div key={section.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                            <b className="w-36 shrink-0 text-sm text-gray-900">{section.label}</b>
                            <div className="flex flex-1 flex-wrap gap-2">
                                {section.entries.map((entry) => {
                                    const on = grantable.includes(entry.id);

                                    return (
                                        <button
                                            key={entry.id}
                                            type="button"
                                            aria-pressed={on}
                                            disabled={disabled}
                                            onClick={() => toggle(entry.id)}
                                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${
                                                on
                                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                                    : 'border-gray-200 bg-surface text-gray-500 hover:border-gray-300 hover:text-gray-900'
                                            }`}
                                        >
                                            <Icon name="key" className={`h-3.5 w-3.5 ${on ? '' : 'opacity-40'}`} />
                                            {entry.label}
                                            {grantsGiven[entry.id] > 0 && (
                                                <span
                                                    className="font-display text-[11px] font-bold text-gray-400"
                                                    title={`منحها لـ ${grantsGiven[entry.id]} موظف`}
                                                >
                                                    · {grantsGiven[entry.id]}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

/** The permissions in `next` that are not in `previous`, and those gone, as two counts. */
export function grantRightChanges(previous, next) {
    return {
        added: next.filter((id) => !previous.includes(id)).length,
        removed: previous.filter((id) => !next.includes(id)).length,
    };
}
