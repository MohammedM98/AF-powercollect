<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscriber_profiles', function (Blueprint $table): void {
            $table->id();
            $table->string('full_name');
            $table->string('national_id', 9)->nullable()->unique();
            $table->string('phone')->nullable();
            $table->text('address')->nullable();
            $table->timestamps();
        });

        Schema::table('subscribers', function (Blueprint $table): void {
            $table->foreignId('subscriber_profile_id')->nullable()->constrained()->restrictOnDelete();
        });

        DB::table('subscribers')->orderBy('id')->chunkById(200, function ($subscribers): void {
            DB::transaction(function () use ($subscribers): void {
                foreach ($subscribers as $subscriber) {
                    $profileId = DB::table('subscriber_profiles')->insertGetId([
                        'full_name' => $subscriber->full_name,
                        'national_id' => $subscriber->national_id,
                        'phone' => $subscriber->phone,
                        'address' => $subscriber->address,
                        'created_at' => $subscriber->created_at,
                        'updated_at' => $subscriber->updated_at,
                    ]);

                    DB::table('subscribers')->where('id', $subscriber->id)->update(['subscriber_profile_id' => $profileId]);
                }
            });
        });

        Schema::table('subscribers', function (Blueprint $table): void {
            $table->dropUnique(['national_id']);
            $table->index('national_id');
        });
    }

    public function down(): void
    {
        if (DB::table('subscribers')->whereNotNull('national_id')->groupBy('national_id')->havingRaw('COUNT(*) > 1')->exists()) {
            throw new RuntimeException('Cannot roll back shared subscriber profiles while a subscriber has multiple subscriptions.');
        }

        Schema::table('subscribers', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('subscriber_profile_id');
            $table->dropIndex(['national_id']);
            $table->unique('national_id');
        });

        Schema::dropIfExists('subscriber_profiles');
    }
};
