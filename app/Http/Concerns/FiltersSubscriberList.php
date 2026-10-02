<?php

namespace App\Http\Concerns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The subscribers list's search and filters, shared by the list itself and
 * by its bulk actions, so "every matching subscriber" means exactly the
 * rows the list shows. Needs FiltersDataTable.
 */
trait FiltersSubscriberList
{
    /** Sortable columns of the subscribers list. */
    private const SUBSCRIBER_SORTABLE = ['account_number', 'full_name', 'display_name', 'status', 'created_at'];

    /**
     * Apply the list's search, sort and filters to a subscribers query,
     * plus `?filter[ids]=1,2,3` to keep only the given subscribers (a
     * printout of the selected ones).
     */
    protected function applySubscriberListFilters(Builder $query, Request $request): Builder
    {
        $subscriberNumber = DB::raw('(select subscriber_number from subscriber_profiles where subscriber_profiles.id = subscribers.subscriber_profile_id)');
        $this->applyDataTableFilters($query, $request, ['full_name', 'subscription_name', 'phone', 'subscription_phone', 'account_number', $subscriberNumber], self::SUBSCRIBER_SORTABLE, 'display_name');
        $this->applyDataTableFilterSelects($query, $request, ['status', 'branch_id', 'tariff_id', 'tariff_segment_id', 'meter_box_id']);
        $this->applyMeterBoxNameFilter($query, $request);
        $this->applyCircuitBreakerFilter($query, $request);

        $ids = ((array) $request->input('filter', []))['ids'] ?? null;

        if (is_string($ids) && $ids !== '') {
            $query->whereIn('subscribers.id', array_map('intval', explode(',', $ids)));
        }

        return $query;
    }
}
