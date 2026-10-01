import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:power_collect/api_client.dart';
import 'package:power_collect/app_identity.dart';
import 'package:power_collect/payment_page.dart';

class RetryTransferApi extends ApiClient {
  final requests = <Map<String, dynamic>>[];
  @override
  Future<Map<String, dynamic>> sendCollection(
      Map<String, dynamic> collection) async {
    requests.add(Map<String, dynamic>.from(collection));
    if (requests.length == 1) throw const ApiException('Timeout', 0);
    return {
      'id': 77,
      'status': 'recorded',
      'amount': '25.00',
      'voucher_number': 'P-77'
    };
  }
}

class RecordingApi extends ApiClient {
  final requests = <Map<String, dynamic>>[];
  @override
  Future<Map<String, dynamic>> sendCollection(
      Map<String, dynamic> collection) async {
    requests.add(Map<String, dynamic>.from(collection));
    return {
      'id': 78,
      'status': 'recorded',
      'amount': '25.00',
      'voucher_number': 'P-78'
    };
  }
}

void main() {
  testWidgets(
      'wallet payment requires transfer details and retries the same operation',
      (tester) async {
    final api = RetryTransferApi();
    await tester.pumpWidget(MaterialApp(
        theme: AppIdentity.theme,
        home: PaymentPage(
          api: api,
          subscriber: {
            'id': 42,
            'full_name': 'Subscriber',
            'account_number': 'A42',
            'balance': '100.00'
          },
        )));
    await tester.pumpAndSettle();
    for (final digit in ['2', '5']) {
      await tester.tap(find.byKey(ValueKey('payment-key-$digit')));
      await tester.pump();
    }
    final scrollable = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.text('محفظة'), 150,
        scrollable: scrollable);
    await tester.tap(find.text('محفظة'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byType(CheckboxListTile), 150,
        scrollable: scrollable);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    await tester.tap(find.text('تسجيل الدفعة'));
    await tester.pumpAndSettle();
    expect(api.requests, isEmpty);

    final sender = find.byWidgetPredicate((widget) =>
        widget is TextField && widget.decoration?.hintText == 'اسم المرسل');
    final reference = find.byWidgetPredicate((widget) =>
        widget is TextField && widget.decoration?.hintText == 'رقم التحويل');
    await tester.scrollUntilVisible(sender, -150, scrollable: scrollable);
    await tester.enterText(sender, 'Account Holder');
    await tester.scrollUntilVisible(reference, 150, scrollable: scrollable);
    await tester.enterText(reference, 'TRANSFER-42');
    await tester.tap(find.text('تسجيل الدفعة'));
    await tester.pumpAndSettle();
    expect(api.requests, hasLength(1));
    expect(find.text('تم تسجيل الدفعة'), findsNothing);
    await tester.tap(find.text('تسجيل الدفعة'));
    await tester.pumpAndSettle();

    expect(api.requests, hasLength(2));
    expect(api.requests.last['mobile_operation_id'],
        api.requests.first['mobile_operation_id']);
    expect(api.requests.last, containsPair('payment_method', 'bank_transfer'));
    expect(api.requests.last, containsPair('bank_name', 'جوال باي'));
    expect(api.requests.last, containsPair('sender_name', 'Account Holder'));
    expect(api.requests.last, containsPair('reference_number', 'TRANSFER-42'));
    expect(api.requests.last, containsPair('collector_confirmed', true));
    expect(find.text('تم تسجيل الدفعة'), findsOneWidget);
    expect(find.text('P-77'), findsOneWidget);
  });

  testWidgets('PalPay payments use the wallet name the server accepts',
      (tester) async {
    final api = RecordingApi();
    await tester.pumpWidget(MaterialApp(
        theme: AppIdentity.theme,
        home: PaymentPage(
          api: api,
          subscriber: {
            'id': 42,
            'full_name': 'Subscriber',
            'account_number': 'A42',
            'balance': '100.00'
          },
        )));
    await tester.pumpAndSettle();
    for (final digit in ['2', '5']) {
      await tester.tap(find.byKey(ValueKey('payment-key-$digit')));
      await tester.pump();
    }
    final scrollable = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.text('محفظة'), 150,
        scrollable: scrollable);
    await tester.tap(find.text('محفظة'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('محفظة بالباي'), 150,
        scrollable: scrollable);
    await tester.tap(find.text('محفظة بالباي'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byType(CheckboxListTile), 150,
        scrollable: scrollable);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();

    final sender = find.byWidgetPredicate((widget) =>
        widget is TextField && widget.decoration?.hintText == 'اسم المرسل');
    final reference = find.byWidgetPredicate((widget) =>
        widget is TextField && widget.decoration?.hintText == 'رقم التحويل');
    await tester.scrollUntilVisible(sender, -150, scrollable: scrollable);
    await tester.enterText(sender, 'Account Holder');
    await tester.scrollUntilVisible(reference, 150, scrollable: scrollable);
    await tester.enterText(reference, 'TRANSFER-43');
    await tester.tap(find.text('تسجيل الدفعة'));
    await tester.pumpAndSettle();

    expect(api.requests.single, containsPair('bank_name', 'محفظة بالباي'));
  });
}
