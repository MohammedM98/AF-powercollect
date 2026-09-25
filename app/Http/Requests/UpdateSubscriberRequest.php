<?php

namespace App\Http\Requests;

/**
 * Same rules as StoreSubscriberRequest; only the authorization differs.
 */
class UpdateSubscriberRequest extends StoreSubscriberRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('subscriber'));
    }
}
