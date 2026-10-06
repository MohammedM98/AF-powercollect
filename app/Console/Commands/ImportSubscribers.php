<?php

namespace App\Console\Commands;

use App\Enums\AccountingType;
use App\Enums\SubscriberStatus;
use App\Enums\TariffCategory;
use App\Models\MeterBox;
use App\Models\SubArea;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\Tariff;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class ImportSubscribers extends Command
{
    /** The columns the file must have, in any order. */
    private const COLUMNS = ['subscription_number', 'name', 'phone_number', 'balance', 'subscription_type', 'minimum_limit', 'area'];

    protected $signature = 'subscribers:import
        {file : CSV file with a header row: subscription_number, name, phone_number, balance, subscription_type, minimum_limit, area}
        {--user= : Username of the user registering the subscribers; they join that user\'s branch}
        {--dry-run : Check the file and report what would be imported without saving anything}';

    protected $description = 'Import subscribers from the old system, with their balance as an opening line on the account';

    /**
     * Each row becomes a subscriber of the user's branch, found later by
     * its old number. A row already imported is skipped, so the file can be
     * run again. The area becomes a sub-area of the branch's area, holding a
     * meter box of the subscriber's own. A positive balance is what the
     * subscriber owes; a negative one is credit in their favour.
     */
    public function handle(): int
    {
        $user = User::query()->with('branch')->where('username', $this->option('user'))->first();

        if ($user === null || $user->branch_id === null || $user->branchAreaId() === null) {
            $this->error('Pass --user=<username> of a user whose branch has an area.');

            return self::FAILURE;
        }

        $handle = is_readable($this->argument('file')) ? fopen($this->argument('file'), 'r') : false;

        if ($handle === false) {
            $this->error('The file cannot be read.');

            return self::FAILURE;
        }

        $header = array_map(fn (?string $name): string => trim(ltrim((string) $name, "\xEF\xBB\xBF")), fgetcsv($handle) ?: []);

        if (array_diff(self::COLUMNS, $header) !== []) {
            $this->error('The header row must contain: '.implode(', ', self::COLUMNS));

            return self::FAILURE;
        }

        $imported = $skipped = 0;
        $failures = [];

        for ($line = 2; ($values = fgetcsv($handle)) !== false; $line++) {
            if ($values === [null]) {
                continue;
            }

            $row = array_combine($header, array_pad(array_slice($values, 0, count($header)), count($header), null));

            try {
                if ($this->option('dry-run')) {
                    $this->check($row);
                    $imported++;
                } else {
                    $this->import($row, $user, $skipped, $imported);
                }
            } catch (RuntimeException $exception) {
                $failures[] = "Line {$line} ({$row['subscription_number']}): {$exception->getMessage()}";
            }
        }

        fclose($handle);

        $this->info(($this->option('dry-run') ? 'Checked' : 'Imported')." {$imported} · already imported {$skipped} · failed ".count($failures));
        array_map(fn (string $failure) => $this->warn($failure), $failures);

        return $failures === [] ? self::SUCCESS : self::FAILURE;
    }

    /** @param array<string, ?string> $row */
    private function check(array $row): void
    {
        $this->tariffFor($row);
        $this->balanceOf($row);
    }

    /** @param array<string, ?string> $row */
    private function import(array $row, User $user, int &$skipped, int &$imported): void
    {
        $legacyNumber = trim((string) $row['subscription_number']);

        if ($legacyNumber === '' || trim((string) $row['name']) === '') {
            throw new RuntimeException('The subscription number and the name are required.');
        }

        if (Subscriber::query()->where('legacy_number', $legacyNumber)->exists()) {
            $skipped++;

            return;
        }

        $tariff = $this->tariffFor($row);
        $balance = $this->balanceOf($row);

        DB::transaction(function () use ($row, $user, $legacyNumber, $tariff, $balance): void {
            $subArea = $this->subAreaFor(trim((string) $row['area']), $user);

            $meterBox = MeterBox::create([
                'name' => trim($row['name']),
                'box_number' => $legacyNumber,
                'branch_id' => $user->branch_id,
                'sub_area_id' => $subArea?->id,
            ]);

            $subscriber = Subscriber::create([
                'legacy_number' => $legacyNumber,
                'full_name' => trim($row['name']),
                'phone' => filled($row['phone_number']) ? trim($row['phone_number']) : null,
                'branch_id' => $user->branch_id,
                'meter_box_id' => $meterBox->id,
                'tariff_id' => $tariff->id,
                'minimum_charge' => is_numeric($row['minimum_limit']) ? $row['minimum_limit'] : null,
                'status' => SubscriberStatus::Active,
                'accounting_type' => str_contains((string) $row['subscription_type'], 'شهري') ? AccountingType::Monthly : AccountingType::Weekly,
                'registered_by' => $user->id,
            ]);

            if ($balance !== 0.0) {
                $subscriber->transactions()->create([
                    'recorded_by' => $user->id,
                    'type' => $balance > 0 ? SubscriberTransaction::TYPE_INVOICE : SubscriberTransaction::TYPE_CREDIT,
                    'source_key' => 'import:'.$legacyNumber,
                    'amount' => number_format($balance, 2, '.', ''),
                    'notes' => 'رصيد افتتاحي من النظام القديم',
                ]);
            }
        });

        $imported++;
    }

    /** @param array<string, ?string> $row */
    private function tariffFor(array $row): Tariff
    {
        $category = match (true) {
            str_contains((string) $row['subscription_type'], 'منزلي') => TariffCategory::Residential,
            str_contains((string) $row['subscription_type'], 'تجاري') => TariffCategory::Commercial,
            default => throw new RuntimeException("Unknown subscription type «{$row['subscription_type']}»."),
        };

        return Tariff::query()->where('category', $category->value)->first()
            ?? throw new RuntimeException("There is no {$category->value} tariff; run the TariffSeeder first.");
    }

    /** @param array<string, ?string> $row */
    private function balanceOf(array $row): float
    {
        return is_numeric($row['balance']) ? round((float) $row['balance'], 2) : throw new RuntimeException("The balance «{$row['balance']}» is not a number.");
    }

    /** The branch's area holds the sub-area; a sub-area name is unique across areas. */
    private function subAreaFor(string $name, User $user): ?SubArea
    {
        if ($name === '') {
            return null;
        }

        $subArea = SubArea::firstOrCreate(['name' => $name], ['area_id' => $user->branchAreaId()]);

        if ($subArea->area_id !== $user->branchAreaId()) {
            throw new RuntimeException("The sub-area «{$name}» already belongs to another area.");
        }

        return $subArea;
    }
}
