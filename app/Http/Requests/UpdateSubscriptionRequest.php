<?php

namespace App\Http\Requests;

/**
 * Same rules as StoreSubscriptionRequest; only the authorization differs.
 */
class UpdateSubscriptionRequest extends StoreSubscriptionRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('subscription'));
    }
}
