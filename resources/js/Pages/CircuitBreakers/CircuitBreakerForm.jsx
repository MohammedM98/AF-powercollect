import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

export default function CircuitBreakerForm({ data, setData, errors }) {
    return (
        <>
            <div>
                <InputLabel htmlFor="ampere" value="الأمبير" />
                <TextInput
                    id="ampere"
                    type="number"
                    min={1}
                    step={1}
                    required
                    className="mt-1 block w-full"
                    value={data.ampere}
                    onChange={(event) => setData('ampere', event.target.value)}
                />
                <InputError message={errors.ampere} className="mt-2" />
            </div>
            <div className="mt-4">
                <InputLabel htmlFor="minimum_payment" value="الحد الأدنى للدفع (شيكل)" />
                <TextInput
                    id="minimum_payment"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    className="mt-1 block w-full"
                    value={data.minimum_payment}
                    onChange={(event) => setData('minimum_payment', event.target.value)}
                />
                <InputError message={errors.minimum_payment} className="mt-2" />
            </div>
        </>
    );
}
