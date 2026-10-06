<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;
use RuntimeException;

class SubscriberImportSeeder extends Seeder
{
    /**
     * Import the subscribers of the old system from `data/subscribers.csv`
     * into the مخيم 2 branch, registered by its manager (see
     * ImportSubscribers). Safe to run again: a subscriber already imported
     * is kept. A row that cannot be imported — a number used twice in the
     * file, say — is listed and left out.
     */
    public function run(): void
    {
        $this->call(BranchManagerSeeder::class);
        $this->call(TariffSeeder::class);

        $manager = User::query()->where('username', config('powercollect.branch_manager.username'))->first()
            ?? throw new RuntimeException('The branch manager account is missing.');

        Artisan::call('subscribers:import', [
            'file' => __DIR__.'/data/subscribers.csv',
            '--user' => $manager->username,
        ]);

        $this->command?->getOutput()->write(Artisan::output());
    }
}
