import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:power_collect/api_client.dart';
import 'package:power_collect/field_store.dart';
import 'package:power_collect/main.dart';

class OfflineApi extends ApiClient {
  @override
  Future<Map<String, dynamic>> me() async =>
      throw const ApiException('Offline', 0);
}

class MemoryStore extends FieldStore {
  @override
  Future<void> load() async {}
  @override
  Future<void> save() async {}
}

class CollectorApi extends ApiClient {
  int submitted = 0;

  @override
  Future<Map<String, dynamic>> me() async => {'user': {}};

  @override
  Future<Map<String, dynamic>> collectionsToday() async => {'data': []};

  @override
  Future<Map<String, dynamic>> findCollectionSubscribers(String search) async =>
      {
        'data': [
          {
            'id': 42,
            'full_name': 'Collector Subscriber',
            'account_number': 'A42',
            'balance': '100.00'
          }
        ]
      };

  @override
  Future<Map<String, dynamic>> sendCollection(
      Map<String, dynamic> collection) async {
    submitted++;
    expect(collection['payment_method'], 'cash');
    expect(collection['amount'], '25');
    expect(collection['collector_confirmed'], true);
    return {'id': 1, 'status': 'recorded'};
  }
}

void main() {
  test('queued meter readings survive restart with the same operation id',
      () async {
    final directory =
        await Directory.systemTemp.createTemp('powercollect-test-');
    try {
      final store = FieldStore(directory: directory);
      final id = newOperationId();
      await store.queueReading({
        'mobile_operation_id': id,
        'subscriber_id': 42,
        'week_start': '2026-09-21',
        'current_reading': '1250',
      });
      final restored = FieldStore(directory: directory);
      await restored.load();
      expect(restored.queuedReadings.single['mobile_operation_id'], id);
      await restored.markReadingError(id, 'validation error');
      final again = FieldStore(directory: directory);
      await again.load();
      expect(again.queuedReadings.single['sync_error'], 'validation error');
      await again.removeReading(id);
      expect(again.queuedReadings, isEmpty);
    } finally {
      await directory.delete(recursive: true);
    }
  });

  testWidgets(
      'offline reading queue remains visible and payments are absent for reader',
      (tester) async {
    final store = MemoryStore();
    store.state = {
      'token': 'test-token',
      'user': {
        'id': 1,
        'username': 'reader',
        'name': 'Reader',
        'branch_name': 'Branch',
        'can_record_readings': true,
        'can_record_collections': false,
      },
      'week_start': '2026-09-21',
      'week_end': '2026-09-27',
      'can_record_readings_now': true,
      'subscribers': [
        {
          'id': 42,
          'full_name': 'Subscriber One',
          'account_number': 'A42',
          'meter_box_number': 'B1',
          'previous_reading': 1200,
          'reading_status': null,
        }
      ],
      'queued_readings': [
        {
          'mobile_operation_id': newOperationId(),
          'subscriber_id': 42,
          'week_start': '2026-09-21',
          'current_reading': '1250',
        }
      ],
    };
    await tester.pumpWidget(
        PowerCollectApp(apiClient: OfflineApi(), fieldStore: store));
    await tester.pumpAndSettle();
    expect(find.textContaining('1 قراءات بانتظار المزامنة'), findsOneWidget);
    expect(find.text('التحصيل'), findsNothing);
    await tester.tap(find.text('القراءات').last);
    await tester.pumpAndSettle();
    expect(find.text('Subscriber One'), findsOneWidget);
    expect(store.queuedReadings, hasLength(1));
    expect(find.byIcon(Icons.check_circle), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('collector submits payment online without an offline queue',
      (tester) async {
    final store = MemoryStore();
    store.state = {
      'token': 'test-token',
      'user': {
        'id': 2,
        'username': 'collector',
        'name': 'Collector',
        'branch_name': 'Branch',
        'can_record_readings': false,
        'can_record_collections': true,
      },
    };
    final api = CollectorApi();
    await tester.pumpWidget(PowerCollectApp(apiClient: api, fieldStore: store));
    await tester.pumpAndSettle();
    await tester.tap(find.text('التحصيل').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('بحث مباشر'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Collector Subscriber'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(1), '25');
    final recordButton = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'تسجيل الدفعة'));
    expect(recordButton.onPressed, isNull);
    await tester.ensureVisible(find.byType(CheckboxListTile));
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تسجيل الدفعة'));
    await tester.pumpAndSettle();
    expect(api.submitted, 1);
    expect(store.queuedReadings, isEmpty);
    await tester.pumpWidget(const SizedBox());
  });
}
