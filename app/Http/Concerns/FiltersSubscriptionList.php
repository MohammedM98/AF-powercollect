<?php

namespace App\Http\Concerns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The subscriptions list's search and filters, shared by the list itself and
 * by its bulk actions, so "every matching subscription" means exactly the
 * rows the list shows. Needs FiltersDataTable.
 */
trait FiltersSubscriptionList
{
    /** Sortable columns of the subscriptions list. */
    private const SUBSCRIPTION_SORTABLE = ['account_number', 'full_name', 'display_name', 'status', 'created_at'];

    /**
     * Apply the list's search, sort and filters to a subscriptions query,
     * plus `?filter[ids]=1,2,3` to keep only the given subscriptions (a
     * printout of the selected ones).
     */
    protected function applySubscriptionListFilters(Builder $query, Request $request): Builder
    {
        $subscriberNumber = DB::raw('(select subscriber_number from subscriber_profiles where subscriber_profiles.id = subscriptions.subscriber_profile_id)');
        $this->applyDataTableFilters($query, $request, ['full_name', 'subscription_name', 'phone', 'subscription_phone', 'account_number', 'legacy_number', $subscriberNumber], self::SUBSCRIPTION_SORTABLE, 'display_name');
        $this->applyDataTableFilterSelects($query, $request, ['status', 'branch_id', 'tariff_id', 'tariff_segment_id', 'meter_box_id']);
        $this->applyMeterBoxNameFilter($query, $request);
        $this->applySubAreaFilter($query, $request);
        $this->applyCircuitBreakerFilter($query, $request);
        $this->applyMinimumChargeFilter($query, $request);

        $ids = ((array) $request->input('filter', []))['ids'] ?? null;

        if (is_string($ids) && $ids !== '') {
            $query->whereIn('subscriptions.id', array_map('intval', explode(',', $ids)));
        }

        return $query;
    }

    /**
     * Apply `?filter[sub_area_id]=…`: the subscriptions on a meter box in
     * that منطقة 2.
     */
    protected function applySubAreaFilter(Builder $query, Request $request): Builder
    {
        $value = ((array) $request->input('filter', []))['sub_area_id'] ?? null;

        if (is_string($value) && ctype_digit($value)) {
            $query->whereHas('meterBox', fn (Builder $box) => $box->where('sub_area_id', (int) $value));
        }

        return $query;
    }

    /**
     * Apply `?filter[minimum_charge]=…`: the subscriptions whose minimum
     * charge (الحد الأدنى), which follows their circuit breaker's, is that
     * amount.
     */
    protected function applyMinimumChargeFilter(Builder $query, Request $request): Builder
    {
        $value = ((array) $request->input('filter', []))['minimum_charge'] ?? null;

        if (is_string($value) && is_numeric($value)) {
            $query->where($query->qualifyColumn('minimum_charge'), $value);
        }

        return $query;
    }
}
