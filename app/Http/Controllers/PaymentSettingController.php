<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateBoxPeriodSettingRequest;
use App\Models\Bank;
use App\Models\ClosingSetting;
use App\Models\CurrencyRate;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class PaymentSettingController extends Controller
{
    public function index(): InertiaResponse
    {
        $this->authorize('manage', CurrencyRate::class);
        $this->authorize('manage', Bank::class);

        return Inertia::render('Settings/Payments', [
            'boxPeriod' => ['week_starts_on' => ClosingSetting::company()->week_starts_on, 'updateUrl' => route('settings.payments.update')],
            'currencies' => CurrencyRate::query()->orderBy('id')->get()->map(fn (CurrencyRate $currencyRate): array => [
                'id' => $currencyRate->id, 'code' => $currencyRate->currency->value, 'label' => __($currencyRate->currency->label()),
                'rate' => $currencyRate->rate, 'updatedAt' => $currencyRate->updated_at,
                'updateUrl' => route('settings.currencies.update', $currencyRate),
            ])->all(),
            'banks' => Bank::query()->orderBy('name')->get()->map(fn (Bank $bank): array => [
                'id' => $bank->id, 'name' => $bank->name, 'logoUrl' => $bank->logoUrl(),
                'is_receiver' => $bank->is_receiver, 'is_sender' => $bank->is_sender, 'is_active' => $bank->is_active,
                'updateUrl' => route('settings.banks.update', $bank),
            ])->all(),
            'storeUrl' => route('settings.banks.store'),
        ]);
    }

    public function update(UpdateBoxPeriodSettingRequest $request): RedirectResponse
    {
        ClosingSetting::company()->update([...$request->validated(), 'updated_by' => $request->user()->id]);

        return to_route('settings.payments.index')->with('status', 'تم حفظ يوم بداية فترة الصناديق.');
    }
}
