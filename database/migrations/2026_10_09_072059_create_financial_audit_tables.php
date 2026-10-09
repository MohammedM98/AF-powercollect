<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('financial_audit_statements', function (Blueprint $table): void {
            $table->id();
            $table->string('number')->unique();
            $table->foreignId('branch_id')->constrained()->restrictOnDelete();
            $table->foreignId('closing_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('type');
            $table->date('period_start');
            $table->date('period_end');
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->string('status')->default('pending');
            $table->json('snapshot');
            $table->foreignId('submitted_by')->constrained('users')->restrictOnDelete();
            $table->dateTime('submitted_at');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->dateTime('reviewed_at')->nullable();
            $table->timestamps();
            $table->unique(['branch_id', 'type', 'period_start', 'period_end'], 'audit_branch_period_unique');
            $table->index(['status', 'submitted_at']);
        });
        Schema::create('financial_audit_lines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('financial_audit_statement_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('subscription_transaction_id');
            $table->json('details');
            $table->string('status')->default('pending');
            $table->text('review_notes')->nullable();
            $table->text('response')->nullable();
            $table->unsignedBigInteger('correction_transaction_id')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->dateTime('reviewed_at')->nullable();
            $table->timestamps();
            $table->unique(['financial_audit_statement_id', 'subscription_transaction_id'], 'audit_statement_transaction_unique');
            $table->index(['financial_audit_statement_id', 'status'], 'audit_statement_status_index');
        });
        Schema::create('financial_audit_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('financial_audit_statement_id')->constrained()->restrictOnDelete();
            $table->foreignId('financial_audit_line_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('action');
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('correction_transaction_id')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_audit_events');
        Schema::dropIfExists('financial_audit_lines');
        Schema::dropIfExists('financial_audit_statements');
    }
};
