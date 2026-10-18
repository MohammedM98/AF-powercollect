import { useState } from 'react';
import { useForm } from '@inertiajs/react';
import AddButton from '@/Components/AddButton';
import FormModal from '@/Components/FormModal';
import FormField from '@/Components/Form/FormField';
import FormSection from '@/Components/Form/FormSection';
import TextInput from '@/Components/TextInput';
import Switch from '@/Components/Switch';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import Pagination from '@/Components/DataTable/Pagination';
import StatusPill from '@/Components/DataTable/StatusPill';
import { BankMark } from '@/Pages/Subscriptions/PaymentModal';

function BankModal({ bank, storeUrl, onClose }) {
    const form = useForm({ name: bank?.name ?? '', is_receiver: bank?.is_receiver ?? true, is_sender: bank?.is_sender ?? true, is_active: bank?.is_active ?? true, logo: null, _method: bank ? 'put' : 'post' });
    const resourceForm = { ...form, isEdit: Boolean(bank), save: (options) => form.post(bank?.updateUrl ?? storeUrl, { ...options, forceFormData: true }) };

    return <FormModal show onClose={onClose} form={resourceForm} title={bank ? 'تعديل البنك' : 'إضافة بنك أو محفظة'} icon="bank" maxWidth="2xl">
        <FormSection icon="bank" title="بيانات البنك أو المحفظة" description="اختر ظهوره ضمن بنوك الاستلام أو الإرسال أو كليهما." columns={1}>
            <FormField id="bank-name" label="الاسم" required error={form.errors.name}><TextInput name="name" required maxLength={255} className="w-full" value={form.data.name} onChange={(event) => form.setData('name', event.target.value)} /></FormField>
            <FormField id="bank-logo" label="الشعار" hint="PNG أو JPG أو WebP، بحد أقصى 2 ميجابايت. اتركه فارغًا للاحتفاظ بالشعار الحالي." error={form.errors.logo}>
                <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm text-gray-600" onChange={(event) => form.setData('logo', event.target.files?.[0] ?? null)} />
            </FormField>
            {bank?.logoUrl && <img src={bank.logoUrl} alt={`شعار ${bank.name}`} className="h-16 w-16 rounded-control border border-gray-100 bg-white object-contain" />}
            <FormField id="bank-receiver" label="البنك المحوّل له" error={form.errors.is_receiver}><Switch checked={form.data.is_receiver} onChange={(value) => form.setData('is_receiver', value)} label="متاح لاستلام دفعات المشتركين" /></FormField>
            <FormField id="bank-sender" label="البنك المحوّل منه" error={form.errors.is_sender}><Switch checked={form.data.is_sender} onChange={(value) => form.setData('is_sender', value)} label="متاح كبنك المرسل" /></FormField>
            <FormField id="bank-active" label="الحالة" error={form.errors.is_active}><Switch checked={form.data.is_active} onChange={(value) => form.setData('is_active', value)} label="نشط ويظهر عند تسجيل دفعة جديدة" /></FormField>
        </FormSection>
    </FormModal>;
}

export default function BanksSection({ banks, storeUrl }) {
    const [editing, setEditing] = useState(null);
    const [creating, setCreating] = useState(false);
    const [search, setSearch] = useState('');
    const [perPage, setPerPage] = useState(15);
    const [page, setPage] = useState(1);
    const filtered = banks.filter((bank) => bank.name.includes(search.trim()));
    const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
    const currentPage = Math.min(page, lastPage);
    const shown = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
    const meta = { current_page: currentPage, last_page: lastPage, from: (currentPage - 1) * perPage + 1, to: Math.min(currentPage * perPage, filtered.length), total: filtered.length };

    return <section aria-labelledby="payment-banks-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="payment-banks-title" className="text-xl font-bold text-gray-900">البنوك والمحافظ</h3><p className="mt-1 text-sm text-gray-500">أسماء وشعارات بنوك الاستلام والإرسال.</p></div><AddButton onClick={() => setCreating(true)}>إضافة بنك أو محفظة</AddButton></div>
        <DataTableToolbar search={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} perPage={perPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} placeholder="ابحث باسم البنك أو المحفظة" total={filtered.length} printable={false} />
        <div className="data-table-container"><table className="data-table w-full text-start text-sm">
            <thead><tr><th>البنك أو المحفظة</th><th>الاستخدام</th><th>الحالة</th><ActionsTh /></tr></thead>
            <tbody>{shown.map((bank) => <tr key={bank.id}>
                <td><div className="flex items-center gap-3"><BankMark bank={bank.name} /><span className="font-semibold text-gray-900">{bank.name}</span></div></td>
                <td className="text-gray-600">{[bank.is_receiver && 'استلام', bank.is_sender && 'إرسال'].filter(Boolean).join(' و')}</td>
                <td><StatusPill label={bank.is_active ? 'نشط' : 'غير نشط'} tone={bank.is_active ? 'green' : 'gray'} /></td>
                <td><RowActionsMenu onEdit={() => setEditing(bank)} /></td>
            </tr>)}{shown.length === 0 && <tr><td colSpan={4} className="text-gray-500">لا توجد بنوك مطابقة.</td></tr>}</tbody>
        </table></div>
        <Pagination meta={meta} onPageChange={setPage} />
        {(creating || editing) && <BankModal key={editing?.id ?? 'new'} bank={editing} storeUrl={storeUrl} onClose={() => { setCreating(false); setEditing(null); }} />}
    </section>;
}
