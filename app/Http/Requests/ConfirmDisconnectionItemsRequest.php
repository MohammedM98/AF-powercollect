<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;

class ConfirmDisconnectionItemsRequest extends DisconnectionItemsRequest
{
    /** The most disconnections one confirmation may reach. */
    public const MAX_CONFIRMED = 500;

    protected function ability(): string
    {
        return 'execute';
    }

    /**
     * The items confirmed, each with the fee the person was shown, and the
     * explicit statement that the disconnection was carried out.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'ids' => ['required', 'array', 'min:1', 'max:'.self::MAX_CONFIRMED],
            'ids.*' => ['integer', 'distinct'],
            'fees' => ['required', 'array'],
            'fees.*' => ['numeric', 'min:0'],
            'confirmed' => ['accepted'],
        ];
    }

    /**
     * The fee shown for the item, or null when none was sent for it.
     */
    public function expectedFee(int $itemId): ?string
    {
        $fee = $this->validated('fees')[$itemId] ?? null;

        return $fee === null ? null : (string) $fee;
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            ...parent::messages(),
            'ids.max' => 'يمكن تأكيد قطع '.self::MAX_CONFIRMED.' مشترك على الأكثر في المرة الواحدة.',
            'confirmed.accepted' => 'أكّد أن القطع نُفّذ فعلًا للمشتركين المحددين.',
            'fees.required' => 'افتح المعاينة قبل التأكيد.',
        ];
    }
}
