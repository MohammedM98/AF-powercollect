<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('closing_settings', function (Blueprint $table): void {
            $table->boolean('weekly_enabled')->default(true);
            $table->unsignedTinyInteger('weekly_closing_day')->nullable();
            $table->time('weekly_closing_time')->nullable();
            $table->string('weekly_timezone')->nullable();
            $table->unsignedSmallInteger('grace_period_minutes')->default(0);
            $table->boolean('auto_prepare')->default(true);
        });
        Schema::create('closing_periods', function (Blueprint $table): void {
            $table->id();
            $table->string('number')->unique();
            $table->date('period_start');
            $table->date('period_end');
            $table->dateTime('starts_at')->index();
            $table->dateTime('cutoff_at')->index();
            $table->dateTime('eligible_at');
            $table->string('timezone');
            $table->string('status')->default('open');
            $table->foreignId('closing_id')->nullable()->unique()->constrained()->restrictOnDelete();
            $table->dateTime('prepared_at')->nullable();
            $table->dateTime('closed_at')->nullable();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('reviewed_at')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->json('reconciliation')->nullable();
            $table->text('audit_notes')->nullable();
            $table->timestamps();
        });
        Schema::table('closing_events', function (Blueprint $table): void {
            $table->foreignId('closing_id')->nullable()->change();
            $table->foreignId('closing_period_id')->nullable()->constrained()->restrictOnDelete();
        });
        Schema::table('subscription_transactions', function (Blueprint $table): void {
            $table->dateTime('actual_at')->nullable();
            $table->dateTime('recorded_at')->nullable()->index();
            $table->foreignId('closing_period_id')->nullable()->constrained()->restrictOnDelete();
            $table->decimal('cash_effect_amount', 12, 2)->nullable();
            $table->string('adjustment_type')->nullable();
            $table->text('adjustment_reason')->nullable();
            $table->boolean('is_late_entry')->default(false);
        });
        Schema::table('closings', function (Blueprint $table): void {
            $table->json('snapshot')->nullable();
        });
        Schema::create('closing_snapshot_lines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('closing_id')->constrained()->restrictOnDelete();
            $table->foreignId('subscription_transaction_id')->constrained()->restrictOnDelete();
            $table->string('classification');
            $table->decimal('ledger_effect', 12, 2);
            $table->decimal('collection_effect', 12, 2);
            $table->string('payment_method')->nullable();
            $table->string('channel')->nullable();
            $table->json('details');
            $table->timestamp('created_at')->nullable();
            $table->unique(['closing_id', 'subscription_transaction_id'], 'closing_snapshot_transaction_unique');
        });
        Schema::create('closing_setting_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->json('before');
            $table->json('after');
            $table->text('reason')->nullable();
            $table->timestamp('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('closing_setting_events');
        Schema::dropIfExists('closing_snapshot_lines');
        Schema::table('closings', fn (Blueprint $table) => $table->dropColumn('snapshot'));
        Schema::table('subscription_transactions', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('closing_period_id');
            $table->dropColumn(['actual_at', 'recorded_at', 'cash_effect_amount', 'adjustment_type', 'adjustment_reason', 'is_late_entry']);
        });
        Schema::table('closing_events', fn (Blueprint $table) => $table->dropConstrainedForeignId('closing_period_id'));
        Schema::dropIfExists('closing_periods');
        Schema::table('closing_settings', fn (Blueprint $table) => $table->dropColumn(['weekly_enabled', 'weekly_closing_day', 'weekly_closing_time', 'weekly_timezone', 'grace_period_minutes', 'auto_prepare']));
    }
};
