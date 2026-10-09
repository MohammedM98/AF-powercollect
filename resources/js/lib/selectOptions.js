import { Children, isValidElement } from 'react';

function labelText(children) {
    return Children.toArray(children).map((child) => isValidElement(child) ? labelText(child.props.children) : String(child)).join('');
}

/** Preserve option values, labels and disabled choices when replacing native menus. */
export function selectOptions(children) {
    return Children.toArray(children).flatMap((child) => {
        if (!isValidElement(child)) return [];
        if (child.type !== 'option') return selectOptions(child.props.children);
        const label = labelText(child.props.children);
        return [{ value: String(child.props.value ?? label), label, disabled: Boolean(child.props.disabled) }];
    });
}
