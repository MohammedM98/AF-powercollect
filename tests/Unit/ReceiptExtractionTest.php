<?php

namespace Tests\Unit;

use App\Support\BankOfPalestineReceiptParser;
use App\Support\JawwalPayReceiptParser;
use App\Support\PalestineIslamicBankReceiptParser;
use App\Support\PalPayReceiptParser;
use App\Support\ReceiptExtraction;
use App\Support\ReceiptText;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ReceiptExtractionTest extends TestCase
{
    public function test_arabic_labels_and_both_digit_sets_are_normalized_without_losing_leading_reference_zeroes(): void
    {
        $fields = (new BankOfPalestineReceiptParser)->parse("بنك فلسطين\nاسم المرسل: مرسل تجريبي\nرقم التحويل: ٠٠١٢٣٤٥٦\nالمبلغ: ۱٬۲۵۰٫۵۰ شيكل\nتاريخ التحويل: 2026-09-29 18:30", 0.98);

        $this->assertSame('مرسل تجريبي', $fields['sender_name']);
        $this->assertSame('00123456', $fields['transaction_reference']);
        $this->assertSame('1250.50', $fields['amount']);
        $this->assertSame('ILS', $fields['currency']);
        $this->assertStringStartsWith('2026-09-29T18:30:00', $fields['transferred_at']);
        $this->assertSame('2026-09-29T18:30:00+03:00', $fields['transferred_at']);
    }

    #[DataProvider('providerParsers')]
    public function test_each_provider_extracts_labeled_fields_and_ignores_balance_and_phone_numbers(string $parser): void
    {
        $fields = (new $parser)->parse("Sender name\nTest Sender\nTransaction ID: TX-0042\nAmount: 100.25 ILS\nAvailable balance: 9876.00 ILS\nPhone: 0599000000\nDate: 29/09/2026 12:00", 0.97);

        $this->assertSame('Test Sender', $fields['sender_name']);
        $this->assertSame('TX-0042', $fields['transaction_reference']);
        $this->assertSame('100.25', $fields['amount']);
        $this->assertSame('ILS', $fields['currency']);
    }

    public static function providerParsers(): array
    {
        return [[BankOfPalestineReceiptParser::class], [JawwalPayReceiptParser::class],
            [PalPayReceiptParser::class], [PalestineIslamicBankReceiptParser::class]];
    }

    public function test_ambiguous_amounts_missing_fields_and_low_confidence_are_visible(): void
    {
        $fields = (new BankOfPalestineReceiptParser)->parse("Amount: 100 ILS\nAmount: 200 ILS\nTransaction ID: TX-5", 0.4);

        $this->assertNull($fields['amount']);
        $this->assertNull($fields['sender_name']);
        $this->assertContains('ambiguous', array_column($fields['warnings'], 'code'));
        $this->assertContains('missing', array_column($fields['warnings'], 'code'));
        $this->assertContains('low_confidence', array_column($fields['warnings'], 'code'));
    }

    public function test_non_shekel_currency_is_preserved_and_no_amount_is_invented_from_unlabeled_text(): void
    {
        $fields = (new JawwalPayReceiptParser)->parse("Amount: 20 USD\n0599000000\nAccount balance: 300 ILS", 0.98);

        $this->assertSame('20.00', $fields['amount']);
        $this->assertNull($fields['currency']);
        $this->assertNull($fields['transaction_reference']);
        $this->assertNull(ReceiptText::amount('0'));
        $this->assertNull(ReceiptText::amount('-10'));
        $this->assertNull(ReceiptText::amount('2026/09/29'));
        $this->assertNull(ReceiptText::date('31/02/2026'));
        $this->assertNull(ReceiptText::date('2026-02-31T12:00:00+03:00'));
        $this->assertSame('2026-09-23T12:00:00+00:00', ReceiptText::date('2026-09-23T12:00:00Z'));
        $this->assertSame('00123ABC', ReceiptText::reference('٠٠١٢٣ - aBc'));
    }

    public function test_future_transfer_dates_are_flagged_for_review(): void
    {
        $warnings = ReceiptExtraction::dateWarnings(now()->addDay()->toIso8601String());
        $this->assertContains('future_date', array_column($warnings, 'code'));
    }

    #[DataProvider('bankNotificationLayouts')]
    public function test_bank_of_palestine_notification_layouts_keep_sender_separate_from_recipient(string $text, string $amount, string $currency): void
    {
        $fields = (new BankOfPalestineReceiptParser)->parse($text, 0.98);

        $this->assertSame('مرسل تجريبي للاختبار', $fields['sender_name']);
        $this->assertSame('TEST0099', $fields['transaction_reference']);
        $this->assertSame($amount, $fields['amount']);
        $this->assertSame($currency, $fields['currency']);
        $this->assertStringStartsWith('2026-09-23', $fields['transferred_at']);
        $this->assertNotSame('مستفيد تجريبي', $fields['sender_name']);
    }

    public static function bankNotificationLayouts(): array
    {
        return [
            'iburaq labels before values' => ["إشعار حوالة iBURAQ\nالتاريخ 23/09/2026\nالرقم المرجعي TEST0099\nبيانات المرسل\nمن حساب مرسل تجريبي للاختبار\nالحساب 000111222333\nالبنك بنك فلسطين\nمعلومات المرسل إليه\nإلى المستفيد مستفيد تجريبي\nالآيبان 0590000000\nاسم البنك / المحفظة بال باي\nبيانات الحوالة\nالمبلغ الإجمالي 75 شيكل", '75.00', 'ILS'],
            'iburaq values to left of labels' => ["إشعار حوالة iBURAQ\n23/09/2026 التاريخ\nTEST0099 الرقم المرجعي\nبيانات المرسل\nمرسل تجريبي للاختبار من حساب\n000111222333 الحساب\nبنك فلسطين البنك\nمعلومات المرسل إليه\nمستفيد تجريبي إلى المستفيد\n0590000000 الآيبان\nبال باي اسم البنك / المحفظة\nبيانات الحوالة\n75 شيكل المبلغ الإجمالي", '75.00', 'ILS'],
            'beneficiary notification with dollars' => ["إشعار تحويل لمستفيد في بنك\nفلسطين\nمن\nمرسل تجريبي للاختبار\n80.0 دولار أمريكي\nإلى\nمستفيد تجريبي\n80.0 دولار أمريكي\n0000 - 12345 رقم حساب المستفيد\n23/09/2026 تاريخ الحركة\nTEST0099 الرقم المرجعي", '80.00', 'USD'],
        ];
    }
}
