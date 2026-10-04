<?php

namespace App\Http\Requests;

use App\Enums\CorrectionReason;
use App\Enums\TransactionAction;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ApplySubscriberTransactionActionRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        /** @var Subscriber $subscriber */
        $subscriber = $this->route('subscriber');

        return $this->user()->can('view', $subscriber);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'action' => ['required', Rule::enum(TransactionAction::class)],
            'amount' => ['required_if:action,edit,refund', 'nullable', 'numeric', 'gt:0', 'decimal:0,2'],
            'bank_name' => ['nullable', 'string', 'max:255'],
            'sender_bank_name' => ['nullable', 'string', 'max:255'],
            'sender_name' => ['nullable', 'string', 'max:255'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'amendment_reason' => ['required_if:action,edit,edit_metadata', 'nullable', 'string', 'max:1000'],
            'correction_reason' => ['nullable', Rule::enum(CorrectionReason::class)],
            'correction_notes' => ['required_if:action,delete,delete_reversal,delete_tree', 'nullable', 'string', 'max:1000'],
            'subscriber_id' => ['prohibited'],
            'subscription_id' => ['prohibited'],
            'type' => ['prohibited'],
            'status' => ['prohibited'],
            'reference_transaction_id' => ['prohibited'],
            'balance_after' => ['prohibited'],
            'created_at' => ['prohibited'],
        ];
    }

    public function action(): TransactionAction
    {
        return TransactionAction::from($this->validated('action'));
    }

    public function transaction(): SubscriberTransaction
    {
        return $this->route('transaction');
    }
}
