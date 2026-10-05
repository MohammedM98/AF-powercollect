<?php

use App\Enums\PermissionKey;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    private const SPLITS = [
        'meter_readings.record' => [PermissionKey::CorrectMeterReadings],
        'collections.correct' => [PermissionKey::AmendTransactionDetails],
        'collections.delete' => [PermissionKey::RefundPayments],
        'subscribers.update' => [PermissionKey::BulkUpdateSubscribers],
        'closings.prepare' => [PermissionKey::ViewOwnClosings, PermissionKey::ExportFinancialReports],
        'closings.audit' => [PermissionKey::ExportFinancialReports],
        'closings.view_all' => [PermissionKey::ExportFinancialReports],
    ];

    public function up(): void
    {
        foreach (self::SPLITS as $existingKey => $newKeys) {
            $ids = Permission::idsFor($newKeys);

            User::query()
                ->whereHas('permissions', fn ($permissions) => $permissions->where('key', $existingKey))
                ->each(fn (User $user) => $user->permissions()->syncWithoutDetaching($ids));
        }

        Permission::query()->where('key', PermissionKey::DeleteTransactions->value)
            ->update(['label' => PermissionKey::DeleteTransactions->label()]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $newKeys = collect(self::SPLITS)->flatten()->unique()
            ->map(fn (PermissionKey $key): string => $key->value)->all();

        Permission::query()->whereIn('key', $newKeys)->delete();
        Permission::query()->where('key', PermissionKey::DeleteTransactions->value)->update(['label' => 'Delete Transactions']);
    }
};
