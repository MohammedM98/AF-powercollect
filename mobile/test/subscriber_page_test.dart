import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:power_collect/api_client.dart';
import 'package:power_collect/app_identity.dart';
import 'package:power_collect/payment_page.dart';
import 'package:power_collect/subscriber_page.dart';

const listed = {
  'id': 42,
  'full_name': 'أحمد علي',
  'account_number': 'A42',
  'balance': '100.00',
};

class SubscriberApi extends ApiClient {
  SubscriberApi({this.failures = 0});
  int failures;
  int loads = 0;
  int payments = 0;
  String balance = '120.00';
  Map<String, dynamic> subscriptionDetails = {};
  Map<String, dynamic> permissionDetails = {};
  Map<String, dynamic>? lastReading;

  @override
  Future<Map<String, dynamic>> collectionSubscriber(int id) async {
    loads++;
    if (failures > 0) {
      failures--;
      throw const ApiException('لا يمكن الوصول إلى خادم Laravel.', 0);
    }
    return {
      'subscription': {
        ...listed,
        'balance': balance,
        'meter_box_number': 'B7',
        'phone': '0599000111',
        ...subscriptionDetails,
      },
      'permissions': {
        'view_history': true,
        'record_payment': true,
        'payment_methods': ['cash', 'bank_transfer'],
        ...permissionDetails
      },
      'last_reading': lastReading,
      'last_payment': {
        'amount': '30.00',
        'currency': 'ILS',
        'payment_method': 'cash',
        'recorded_at': '2026-10-01T09:00:00+03:00',
        'voucher_number': 'P-9',
      },
      'transactions': [
        {
          'id': 2,
          'date': '2026-10-01',
          'description': 'دفعة نقدية',
          'amount': '30.00',
          'is_credit': true,
          'is_cancelled': false,
          'balance_after': balance,
        },
        {
          'id': 1,
          'date': '2026-09-28',
          'description': 'قراءة أسبوعية',
          'amount': '150.00',
          'is_credit': false,
          'is_cancelled': false,
          'balance_after': '150.00',
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> sendCollection(
      Map<String, dynamic> collection) async {
    payments++;
    balance = '95.00';
    return {
      'id': 77,
      'status': 'recorded',
      'amount': collection['amount'],
      'currency': collection['currency'],
      'voucher_number': 'P-77',
      'balance_after': balance,
    };
  }
}

/// Open the subscriber page from a host screen, so its result can be read.
Future<List<bool?>> openSubscriber(WidgetTester tester, ApiClient api) async {
  await tester.binding.setSurfaceSize(const Size(390, 844));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final results = <bool?>[];
  await tester.pumpWidget(MaterialApp(
      theme: AppIdentity.theme,
      builder: (context, child) =>
          Directionality(textDirection: TextDirection.rtl, child: child!),
      home: Builder(
          builder: (context) => TextButton(
              onPressed: () async {
                results.add(await Navigator.of(context).push<bool>(
                    MaterialPageRoute(
                        builder: (_) =>
                            SubscriberPage(api: api, subscriber: listed))));
              },
              child: const Text('open')))));
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return results;
}

void main() {
  testWidgets(
      'shows subscriber details and history access before recording a payment',
      (tester) async {
    final api = SubscriberApi();
    final results = await openSubscriber(tester, api);

    expect(find.text('أحمد علي'), findsOneWidget);
    expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('subscriber-balance')))
            .data,
        '\u2066120 ₪\u2069 عليه');
    final scrollable = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.text('B7'), 250,
        scrollable: scrollable);
    expect(find.text('B7'), findsOneWidget);
    expect(find.text('رقم تواصل الاشتراك'), findsNothing);
    expect(find.text('0599000111'), findsOneWidget);
    expect(find.text('آخر دفعة'), findsNothing);
    expect(find.text('آخر الحركات'), findsNothing);
    expect(find.text('السجل المالي'), findsOneWidget);
    expect(find.byType(PaymentPage), findsNothing);

    await tester.tap(find.byKey(const ValueKey('subscriber-record-payment')));
    await tester.pumpAndSettle();
    expect(find.byType(PaymentPage), findsOneWidget);
    expect(find.text('حساب A42 · تسجيل دفعة'), findsOneWidget);

    await tester.tap(find.byTooltip('رجوع').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('رجوع'));
    await tester.pumpAndSettle();
    expect(results, [false]);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('summary separates personal details and subscription terms',
      (tester) async {
    final api = SubscriberApi()
      ..subscriptionDetails = {
        'subscriber_name': 'أحمد محمد علي',
        'personal_phone': '0599111222',
        'address': 'شارع النور',
        'status': 'active',
        'status_label': 'فعال',
        'accounting_type_label': 'شهري',
        'subscription_date': '2026-09-01',
        'tariff_name': 'منزلي',
        'kilowatt_price': '2.50',
        'minimum_payment': '25.00',
        'circuit_breaker_ampere': 20,
      }
      ..lastReading = {
        'week_start': '2026-10-09',
        'week_end': '2026-10-15',
        'previous_reading': 1200,
        'current_reading': 1250.5,
        'consumption': 50.5,
        'status': 'pending',
        'status_label': 'قيد المراجعة',
      };
    await openSubscriber(tester, api);

    expect(find.byType(PaymentPage), findsNothing);
    final scrollable = find.byType(Scrollable).first;
    for (final value in [
      '0599000111',
      'شارع النور',
      'شهري',
      '2026-09-01',
      'منزلي',
      'سعر الكيلوواط',
      '2.50 ₪ / ك.و.س',
      '25.00 ₪',
      '20 أمبير',
      'قراءة سابقة',
      '1250.5',
    ]) {
      await tester.scrollUntilVisible(find.text(value), 150,
          scrollable: scrollable);
      expect(find.text(value), findsOneWidget);
    }
    await tester.tap(find.byKey(const ValueKey('subscriber-record-payment')));
    await tester.pumpAndSettle();
    expect(find.byType(PaymentPage), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('no recorded reading shows the initial value in the detail row',
      (tester) async {
    final api = SubscriberApi()..subscriptionDetails = {'initial_reading': 0};
    await openSubscriber(tester, api);

    await tester.scrollUntilVisible(find.text('قراءة سابقة'), 150,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('قراءة سابقة'), findsOneWidget);
    expect(find.text('0'), findsOneWidget);
    expect(find.byKey(const ValueKey('subscriber-last-reading')), findsNothing);
    expect(find.textContaining('null'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a failed load can be retried and payment stays available',
      (tester) async {
    final api = SubscriberApi(failures: 1);
    await openSubscriber(tester, api);

    expect(find.text('لا يمكن الوصول إلى خادم Laravel.'), findsOneWidget);
    expect(find.text('\u2066100 ₪\u2069 عليه'), findsOneWidget,
        reason: 'the balance from the search shows until the page loads');
    final record = tester.widget<AppAction>(
        find.byKey(const ValueKey('subscriber-record-payment')));
    expect(record.onPressed, isNotNull);

    await tester.tap(find.text('إعادة المحاولة'));
    await tester.pumpAndSettle();
    expect(api.loads, 2);
    expect(find.text('لا يمكن الوصول إلى خادم Laravel.'), findsNothing);
    expect(find.text('\u2066120 ₪\u2069 عليه'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a recorded payment reloads the page and is reported back',
      (tester) async {
    final api = SubscriberApi();
    final results = await openSubscriber(tester, api);

    await tester.tap(find.byKey(const ValueKey('subscriber-record-payment')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('payment-amount')));
    await tester.pumpAndSettle();
    for (final digit in ['2', '5']) {
      await tester.tap(find.byKey(ValueKey('payment-key-$digit')));
      await tester.pump();
    }
    final scrollable = find
        .descendant(
            of: find.byType(PaymentPage), matching: find.byType(Scrollable))
        .first;
    final cash = find.byKey(const ValueKey('payment-method-cash'));
    await tester.scrollUntilVisible(cash, 200, scrollable: scrollable);
    await tester.pumpAndSettle();
    await tester.tap(cash);
    await tester.pumpAndSettle();
    final confirm = find.byKey(const ValueKey('payment-confirm'));
    await tester.scrollUntilVisible(confirm, 200, scrollable: scrollable);
    await tester.tap(confirm);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('payment-submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('العودة إلى صفحة المشترك'));
    await tester.pumpAndSettle();

    expect(api.payments, 1);
    expect(api.loads, 2);
    expect(find.text('\u206695 ₪\u2069 عليه'), findsOneWidget);

    await tester.tap(find.byTooltip('رجوع'));
    await tester.pumpAndSettle();
    expect(results, [true]);
    await tester.pumpWidget(const SizedBox());
  });
}
