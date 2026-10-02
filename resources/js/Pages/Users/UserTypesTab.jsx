import { useEffect, useRef, useState } from 'react';
import { useForm } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import InlineAddRow, { InlineField, inlineInputClass } from '@/Components/InlineAddRow';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import { useDeleteRecord } from '@/hooks/useDeleteRecord';

/**
 * The Users page's types tab: the job titles chosen when adding users,
 * with how many users have each. Types are added — and renamed — in place
 * in the row at the foot of the list.
 */
export default function UserTypesTab({ userTypes, canCreate, addRequested, onAddHandled }) {
    const [search, setSearch] = useState('');
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState(null);
    const nameInput = useRef(null);
    const form = useForm({ name: '' });
    const { requestDelete, deleteDialog } = useDeleteRecord('نوع المستخدم');
    const open = adding || editing !== null;
    const query = search.trim().toLowerCase();
    const shown = query ? userTypes.filter((type) => type.name.toLowerCase().includes(query)) : userTypes;

    useEffect(() => {
        if (addRequested) {
            startAdding();
            onAddHandled();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addRequested]);

    useEffect(() => {
        if (open) {
            nameInput.current?.focus();
            nameInput.current?.select();
        }
    }, [open, editing]);

    function startAdding() {
        setEditing(null);
        form.setData('name', '');
        form.clearErrors();
        setAdding(true);
    }

    function startEditing(type) {
        setAdding(false);
        form.setData('name', type.name);
        form.clearErrors();
        setEditing(type);
    }

    function close() {
        setAdding(false);
        setEditing(null);
        form.reset();
        form.clearErrors();
    }

    function save() {
        const options = { preserveScroll: true, onSuccess: close };

        if (editing) {
            form.put(`/user-types/${editing.id}`, options);
        } else {
            form.post('/user-types', options);
        }
    }

    return (
        <section className="data-table-container">
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3.5">
                <label className="relative min-w-[220px] max-w-[420px] flex-1">
                    <Icon name="search" className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400" />
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="بحث بنوع المستخدم..."
                        aria-label="بحث بنوع المستخدم"
                        className={`${inlineInputClass} bg-gray-50 ps-11 focus:bg-surface`}
                    />
                </label>
                <span className="ms-auto font-display text-sm text-gray-500">{shown.length} نوع</span>
            </div>

            <table className="data-table w-full text-sm text-start">
                <thead>
                    <tr>
                        <th>نوع المستخدم</th>
                        <th>المستخدمون</th>
                        <ActionsTh />
                    </tr>
                </thead>
                <tbody>
                    {shown.length === 0 ? (
                        <tr>
                            <td colSpan={3} className="text-gray-500">
                                {query ? 'لا توجد أنواع مطابقة.' : 'لا توجد أنواع بعد. أضف أول نوع من الأسفل.'}
                            </td>
                        </tr>
                    ) : (
                        shown.map((type) => (
                            <tr key={type.id} className={editing?.id === type.id ? 'bg-gray-50' : undefined}>
                                <td>
                                    <RowIdentity icon="users" name={type.name} />
                                </td>
                                <td className="font-display text-gray-600">{type.usersCount ? `${type.usersCount} مستخدم` : '—'}</td>
                                <td className="text-end">
                                    {(type.canUpdate || type.canDelete) && (
                                        <RowActionsMenu>
                                            {type.canUpdate && <button onClick={() => startEditing(type)}>تعديل</button>}
                                            {type.canDelete && <button onClick={() => requestDelete(`/user-types/${type.id}`, type.name)}>حذف</button>}
                                        </RowActionsMenu>
                                    )}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            {(canCreate || editing) && (
                <InlineAddRow
                    open={open}
                    onOpen={startAdding}
                    onCancel={close}
                    onSubmit={save}
                    processing={form.processing}
                    icon={editing ? 'pencil' : 'users'}
                    title={editing ? `تعديل «${editing.name}»` : 'نوع مستخدم جديد'}
                    submitLabel={editing ? 'حفظ' : 'إضافة'}
                    openLabel="إضافة نوع مستخدم"
                    hint="مثل: كهربائي، محصل، فني"
                >
                    <InlineField id="user_type_name" label="اسم نوع المستخدم" error={form.errors.name} className="min-w-[220px] flex-1">
                        <input
                            ref={nameInput}
                            id="user_type_name"
                            maxLength={255}
                            value={form.data.name}
                            onChange={(event) => {
                                form.setData('name', event.target.value);
                                form.clearErrors('name');
                            }}
                            placeholder="مثلاً: كهربائي"
                            aria-invalid={Boolean(form.errors.name)}
                            className={`${inlineInputClass} ${form.errors.name ? 'border-brand-500 ring-4 ring-brand-500/10 focus:border-brand-500 focus:ring-brand-500/10' : ''}`}
                        />
                    </InlineField>
                </InlineAddRow>
            )}

            {deleteDialog}
        </section>
    );
}
