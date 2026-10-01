import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:power_collect/api_client.dart';
import 'package:power_collect/app_identity.dart';
import 'package:power_collect/payment_page.dart';
import 'package:power_collect/receipt_review_page.dart';
import 'package:power_collect/receipt_scan.dart';

class TestReceiptScanner extends ReceiptScanner {
  TestReceiptScanner(this.path);
  final String path;
  int prepared = 0;
  bool cancelled = false;
  @override
  Future<ReceiptImage?> pick(ReceiptImageSource source) async => cancelled
      ? null
      : ReceiptImage(
          originalPath: path,
          previewPath: path,
          width: 600,
          height: 900,
          corners: [0, 0, 1, 0, 1, 1, 0, 1]);
  @override
  Future<String> prepare(ReceiptImage image, {required bool contrast}) async {
    prepared++;
    return path;
  }

  @override
  Future<void> discard(ReceiptImage image) async {}
}

class TestReceiptApi extends ApiClient {
  bool offline = false;
  bool failFirstConfirmation = false;
  String? recognizedCurrency = 'ILS';
  final confirmations = <Map<String, dynamic>>[];
  final receiptIds = <int>[];
  final manualUploads = <bool>[];
  @override
  Future<Map<String, dynamic>> receiptProviders() async {
    if (offline) throw const ApiException('لا يوجد اتصال', 0);
    return {
      'data': [
        {
          'id': 1,
          'code': 'bank_of_palestine',
          'name_ar': 'بنك فلسطين',
          'type': 'bank'
        },
        {
          'id': 2,
          'code': 'jawwal_pay',
          'name_ar': 'جوال باي',
          'type': 'wallet'
        },
      ]
    };
  }

  @override
  Future<Map<String, dynamic>> analyzeReceipt(
      String originalPath, String processedPath,
      {int? providerId, bool manual = false}) async {
    if (offline) throw const ApiException('لا يوجد اتصال', 0);
    manualUploads.add(manual);
    return {
      'receipt_id': 44,
      'ocr_status': manual ? 'failed' : 'processed',
      'fields': {
        'provider': 'bank_of_palestine',
        'provider_id': 1,
        'amount': '99.00',
        'sender_name': 'OCR Sender',
        'transaction_reference': '00123456',
        'currency': recognizedCurrency,
        'transferred_at': '2026-09-29T14:30:00+03:00',
        'raw_text': 'Synthetic OCR result',
      },
      'warnings': [
        {
          'field': 'sender_name',
          'code': 'low_confidence',
          'message': 'راجع اسم المرسل'
        }
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> confirmReceipt(
      int receiptId, Map<String, dynamic> fields) async {
    receiptIds.add(receiptId);
    confirmations.add(Map<String, dynamic>.from(fields));
    if (offline || (failFirstConfirmation && confirmations.length == 1)) {
      throw const ApiException('Timeout', 0);
    }
    return {
      'id': 77,
      'receipt_id': receiptId,
      'amount': fields['amount'],
      'currency': fields['currency'],
      'voucher_number': '000077',
      'status': 'recorded'
    };
  }
}

const subscriber = {
  'id': 42,
  'full_name': 'Test Subscriber',
  'account_number': 'A42',
  'balance': '100.00'
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  String imageFile() {
    final directory = Directory.systemTemp.createTempSync('receipt-test-');
    addTearDown(() => directory.deleteSync(recursive: true));
    final file = File('${directory.path}/receipt.png');
    file.writeAsBytesSync(base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ioAAAAASUVORK5CYII='));
    return file.path;
  }

  Future<void> showReview(WidgetTester tester, TestReceiptApi api,
      TestReceiptScanner scanner) async {
    tester.view.resetPhysicalSize();
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final image = (await scanner.pick(ReceiptImageSource.gallery))!;
    await tester.pumpWidget(MaterialApp(
        theme: AppIdentity.theme,
        home: ReceiptReviewPage(
            api: api,
            subscriber: subscriber,
            image: image,
            scanner: scanner,
            initialFields: const {'provider': 'bank_of_palestine'})));
    await tester.pumpAndSettle();
  }

  Future<void> edit(WidgetTester tester, String key, String value) async {
    final field = find.byKey(ValueKey(key));
    tester
        .state<ScrollableState>(find.byType(Scrollable).first)
        .position
        .jumpTo(0);
    await tester.pump();
    await tester.scrollUntilVisible(field, 150,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.enterText(field, value);
    await tester.pump();
  }

  Future<void> acknowledge(WidgetTester tester) async {
    for (final key in ['receipt-reviewed', 'receipt-received']) {
      final box = find.byKey(ValueKey(key));
      await tester.scrollUntilVisible(box, 150,
          scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      await tester.tap(box);
      await tester.pump();
    }
  }

  testWidgets('analyzing fills editable fields and never records a payment',
      (tester) async {
    final api = TestReceiptApi();
    final scanner = TestReceiptScanner(await imageFile());
    await showReview(tester, api, scanner);

    await tester.tap(find.byKey(const ValueKey('receipt-analyze')));
    await tester.pumpAndSettle();

    expect(scanner.prepared, 1);
    expect(api.manualUploads, [false]);
    expect(api.confirmations, isEmpty);
    expect(find.text('مراجعة بيانات الإيصال'), findsOneWidget);
    expect(find.text('راجع اسم المرسل'), findsOneWidget);
    expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('receipt-reference')))
            .controller!
            .text,
        '00123456');
    await edit(tester, 'receipt-amount', '١٢٥٫٥٠');
    await edit(tester, 'receipt-sender', 'Reviewed Sender');
    await acknowledge(tester);
    await tester.tap(find.byKey(const ValueKey('receipt-confirm')));
    await tester.pumpAndSettle();

    expect(api.receiptIds, [44]);
    expect(api.confirmations.single, containsPair('amount', '125.50'));
    expect(api.confirmations.single,
        containsPair('sender_name', 'Reviewed Sender'));
    expect(api.confirmations.single,
        containsPair('transaction_reference', '00123456'));
    expect(api.confirmations.single, containsPair('collector_confirmed', true));
  });

  testWidgets(
      'editing after review clears confirmation and prevents submission',
      (tester) async {
    final api = TestReceiptApi();
    await showReview(tester, api, TestReceiptScanner(await imageFile()));
    await tester.tap(find.byKey(const ValueKey('receipt-analyze')));
    await tester.pumpAndSettle();
    await acknowledge(tester);

    await edit(tester, 'receipt-reference', 'CORRECTED-42');
    await tester.tap(find.byKey(const ValueKey('receipt-confirm')));
    await tester.pumpAndSettle();

    expect(api.confirmations, isEmpty);
    expect(
        tester
            .widget<CheckboxListTile>(
                find.byKey(const ValueKey('receipt-reviewed')))
            .value,
        false);
    expect(
        tester
            .widget<CheckboxListTile>(
                find.byKey(const ValueKey('receipt-received')))
            .value,
        false);
  });

  testWidgets(
      'unknown currency requires an explicit choice before confirmation',
      (tester) async {
    final api = TestReceiptApi()..recognizedCurrency = null;
    await showReview(tester, api, TestReceiptScanner(imageFile()));
    await tester.tap(find.byKey(const ValueKey('receipt-analyze')));
    await tester.pumpAndSettle();
    await acknowledge(tester);
    await tester.tap(find.byKey(const ValueKey('receipt-confirm')));
    await tester.pumpAndSettle();

    expect(api.confirmations, isEmpty);
    expect(
        find.text(
            'أكمل المزود والمبلغ واسم المرسل ورقم التحويل والتاريخ وسعر الصرف المطلوب.'),
        findsOneWidget);
  });

  testWidgets(
      'a timed out confirmation retries the same receipt and reviewed values',
      (tester) async {
    final api = TestReceiptApi()..failFirstConfirmation = true;
    await showReview(tester, api, TestReceiptScanner(await imageFile()));
    await tester.tap(find.byKey(const ValueKey('receipt-analyze')));
    await tester.pumpAndSettle();
    await acknowledge(tester);
    await tester.tap(find.byKey(const ValueKey('receipt-confirm')));
    await tester.pumpAndSettle();

    expect(api.confirmations, hasLength(1));
    tester
        .state<ScrollableState>(find.byType(Scrollable).first)
        .position
        .jumpTo(0);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('receipt-amount')), 100,
        scrollable: find.byType(Scrollable).first);
    expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('receipt-amount')))
            .enabled,
        false);
    await tester.tap(find.byKey(const ValueKey('receipt-confirm')));
    await tester.pumpAndSettle();

    expect(api.receiptIds, [44, 44]);
    expect(api.confirmations.last, api.confirmations.first);
    expect(api.manualUploads, [false]);
  });

  testWidgets(
      'manual fields remain editable offline and require an image upload after reconnection',
      (tester) async {
    final api = TestReceiptApi()..offline = true;
    await showReview(tester, api, TestReceiptScanner(await imageFile()));
    await tester.tap(find.byKey(const ValueKey('receipt-manual')));
    await tester.pumpAndSettle();
    await edit(tester, 'receipt-amount', '50');
    await edit(tester, 'receipt-sender', 'Manual Sender');
    await edit(tester, 'receipt-reference', 'MANUAL-42');
    await edit(tester, 'receipt-date', '2026-09-29T10:00:00+03:00');
    await acknowledge(tester);
    await tester.tap(find.byKey(const ValueKey('receipt-confirm')));
    await tester.pumpAndSettle();

    expect(api.confirmations, isEmpty);
    expect(api.manualUploads, isEmpty);
    expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('receipt-sender')))
            .controller!
            .text,
        'Manual Sender');

    api.offline = false;
    await tester.tap(find.byKey(const ValueKey('receipt-confirm')));
    await tester.pumpAndSettle();

    expect(api.manualUploads, [true]);
    expect(
        api.confirmations.single, containsPair('sender_name', 'Manual Sender'));
    expect(api.confirmations.single, containsPair('amount', '50.00'));
  });

  testWidgets('cancelling image selection keeps the existing payment form',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final api = TestReceiptApi();
    final scanner = TestReceiptScanner(await imageFile())..cancelled = true;
    await tester.pumpWidget(MaterialApp(
        theme: AppIdentity.theme,
        home: PaymentPage(
            api: api, subscriber: subscriber, receiptScanner: scanner)));
    await tester.pumpAndSettle();
    final transferTile = find
        .ancestor(of: find.text('تحويل بنكي'), matching: find.byType(InkWell))
        .first;
    await tester.scrollUntilVisible(transferTile, 100,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(transferTile);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('receipt-gallery')), 100,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.byKey(const ValueKey('receipt-gallery')));
    await tester.pumpAndSettle();

    expect(find.text('تجهيز صورة الإيصال'), findsNothing);
    expect(find.text('تسجيل الدفعة'), findsOneWidget);
    expect(api.manualUploads, isEmpty);
    expect(api.confirmations, isEmpty);
  });
}
