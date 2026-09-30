import InputLabel from '@/Components/InputLabel';
import InputError from '@/Components/InputError';
import TextInput from '@/Components/TextInput';

export function userTypeFormData(userType) {
    return { name: userType?.name ?? '' };
}

export default function UserTypeForm({ data, setData, errors }) {
    return (
        <div>
            <InputLabel htmlFor="name" value="اسم نوع المستخدم" />
            <TextInput
                id="name"
                required
                maxLength={255}
                autoFocus
                className="mt-1 block w-full"
                value={data.name}
                placeholder="مثل: كهربائي، محصل، فني"
                onChange={(event) => setData('name', event.target.value)}
            />
            <InputError message={errors.name} className="mt-2" />
        </div>
    );
}
