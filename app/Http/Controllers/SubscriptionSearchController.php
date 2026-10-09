<?php

namespace App\Http\Controllers;

use App\Models\Subscription;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * The top bar's search, as JSON: the subscriptions matching `?q=`, to jump to
 * one from any page. It is open to whoever may list subscriptions or record
 * payments, and finds only those of the user's own branch (any branch for
 * the Super Admin). A result leads to the page that user works in, with the
 * search already typed in.
 */
class SubscriptionSearchController extends Controller
{
    /** The most results listed; a longer list asks the user to narrow the search. */
    private const LIMIT = 8;

    /** A search shorter than this finds nothing yet. */
    private const MIN_LENGTH = 2;

    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();

        abort_unless($actor->canAny(['viewAny', 'recordAnyPayment'], Subscription::class), 403);

        $search = trim($request->validate(['q' => ['nullable', 'string', 'max:100']])['q'] ?? '');

        if (mb_strlen($search) < self::MIN_LENGTH) {
            return response()->json(['results' => [], 'hasMore' => false]);
        }

        $found = $this->matching($request, $search);
        $listsSubscriptions = $actor->can('viewAny', Subscription::class);

        return response()->json([
            'results' => $found->take(self::LIMIT)->map(fn (Subscription $subscription): array => [
                'id' => $subscription->id,
                'name' => $subscription->displayName(),
                'accountNumber' => $subscription->account_number,
                'phone' => $subscription->contactPhone(),
                'branchName' => $subscription->branch->name,
                'subAreaName' => $subscription->meterBox?->subArea?->name,
                'status' => $subscription->status->value,
                'statusLabel' => __($subscription->status->label()),
                'balance' => number_format((float) ($subscription->outstanding_balance ?? 0), 2, '.', ''),
                'href' => route($listsSubscriptions ? 'subscriptions.index' : 'payments.index', ['search' => $subscription->account_number], absolute: false),
            ])->values(),
            'hasMore' => $found->count() > self::LIMIT,
        ]);
    }

    /**
     * The subscriptions whose name, account name, account or old number or
     * meter box number match every word of the search, or whose phone
     * contains its digits.
     *
     * @return Collection<int, Subscription>
     */
    private function matching(Request $request, string $search): Collection
    {
        $digits = preg_replace('/\D/', '', $search);

        return Subscription::query()
            ->visibleTo($request->user())
            ->with(['branch', 'meterBox.subArea'])
            ->withSum('transactions as outstanding_balance', 'amount')
            ->where(function (Builder $matching) use ($search, $digits): void {
                $matching->matchingSearch($search);

                if (strlen($digits) >= 3) {
                    $matching->orWhere('phone', 'like', '%'.$digits.'%')->orWhere('subscription_phone', 'like', '%'.$digits.'%');
                }
            })
            ->orderBy('full_name')
            ->limit(self::LIMIT + 1)
            ->get();
    }
}
