/**
 * Linked dropdowns in a table's Filter menu: a group with `dependsOn` is
 * shown under the group it names and lists only the options whose
 * `parent` is that group's chosen value — e.g. a meter box's numbers
 * under its name.
 */

/** The top-level groups, and each child group keyed by its parent's key. */
export function nestFilterGroups(groups) {
    const childOf = {};

    for (const group of groups ?? []) {
        if (group.dependsOn) {
            childOf[group.dependsOn] = group;
        }
    }

    return { topLevel: (groups ?? []).filter((group) => !group.dependsOn), childOf };
}

/**
 * The parent's value to show: the one picked, or else the parent of a
 * picked child option (a link that only carries the child, e.g. one box).
 */
export function parentValue(parentKey, child, values) {
    if (values?.[parentKey]) {
        return values[parentKey];
    }

    const picked = child?.options.find((option) => String(option.value) === String(values?.[child.key] ?? ''));

    return picked?.parent ?? '';
}

/** The child's options for the chosen parent value; none until one is chosen. */
export function childOptions(child, parent) {
    return parent ? child.options.filter((option) => option.parent === parent) : [];
}

/** The filter updates for a new parent value: the child resets, since its choice belonged to the old one. */
export function parentChange(parentKey, child, value) {
    return child ? { [parentKey]: value, [child.key]: '' } : { [parentKey]: value };
}
