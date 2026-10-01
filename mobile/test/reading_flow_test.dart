import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:power_collect/field_store.dart';
import 'package:power_collect/main.dart';

import 'field_app_test.dart' show MemoryStore, OfflineApi;

MemoryStore readerStore({List<Map<String, dynamic>> queued = const []}) =>
    MemoryStore()
      ..state = {
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
            'id': 1,
            'full_name': 'Subscriber One',
            'account_number': 'A1',
            'meter_box_id': 7,
            'meter_box_number': 'B1',
            'previous_reading': 1200,
            'reading_status': null,
            'recent_readings': [
              {
                'week_start': '2026-09-14',
                'current_reading': 1200,
                'consumption': 40
              },
              {
                'week_start': '2026-09-07',
                'current_reading': 1160,
                'consumption': 50
              },
            ],
          },
          {
            'id': 2,
            'full_name': 'Subscriber Two',
            'account_number': 'A2',
            'meter_box_id': 7,
            'meter_box_number': 'B1',
            'previous_reading': 300,
            'reading_status': null,
          },
        ],
        'queued_readings': queued,
      };

Future<void> openBox(WidgetTester tester, MemoryStore store) async {
  await tester
      .pumpWidget(PowerCollectApp(apiClient: OfflineApi(), fieldStore: store));
  await tester.pumpAndSettle();
  await tester.tap(find.text('إدخال القراءات').last);
  await tester.pumpAndSettle();
  await tester.tap(find.text('B1'));
  await tester.pumpAndSettle();
}

Future<void> typeReading(WidgetTester tester, String digits) async {
  for (final digit in digits.split('')) {
    await tester.tap(find.byKey(ValueKey('reading-key-$digit')));
    await tester.pump();
  }
}

void main() {
  test('drafts belong to the roster week and leave once queued', () async {
    final directory =
        await Directory.systemTemp.createTemp('powercollect-drafts-');
    try {
      final store = FieldStore(directory: directory)
        ..state['week_start'] = '2026-09-21';
      await store.saveReadingDrafts({1: '1250', 2: ''});
      final restored = FieldStore(directory: directory);
      await restored.load();
      expect(restored.readingDrafts, {1: '1250'});

      await restored.queueReading({
        'mobile_operation_id': 'operation-1',
        'subscriber_id': 1,
        'current_reading': '1250',
      });
      expect(restored.readingDrafts, isEmpty);

      await restored.reopenReading('operation-1');
      expect(restored.queuedReadings, isEmpty);
      expect(restored.readingDrafts, {1: '1250'});

      restored.state['week_start'] = '2026-09-28';
      expect(restored.readingDrafts, isEmpty);
    } finally {
      await directory.delete(recursive: true);
    }
  });

  testWidgets(
      'a typed reading is compared with past weeks and survives leaving the box',
      (tester) async {
    final store = readerStore();
    await openBox(tester, store);

    await typeReading(tester, '1300');
    expect(find.textContaining('أعلى من المعتاد بكثير'), findsOneWidget);
    for (var index = 0; index < 3; index++) {
      await tester.tap(find.byKey(const ValueKey('reading-key-delete')));
      await tester.pump();
    }
    await typeReading(tester, '245');
    expect(find.text('ضمن المعتاد'), findsOneWidget);

    await tester.tap(find.byTooltip('رجوع'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('reading-key-1')), findsNothing,
        reason: 'back first hides the keypad');
    await tester.tap(find.byTooltip('رجوع'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(store.readingDrafts, {1: '1245'});
    expect(find.byKey(const ValueKey('resume-drafts')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('resume-drafts')));
    await tester.pumpAndSettle();
    expect(find.text('1245'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('the keypad closes and reopens on the chosen subscriber',
      (tester) async {
    final store = readerStore();
    await openBox(tester, store);

    await tester.tap(find.byKey(const ValueKey('reading-keypad-close')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('reading-key-1')), findsNothing);

    await tester.tap(find.text('Subscriber Two'));
    await tester.pumpAndSettle();
    await typeReading(tester, '350');
    expect(find.text('350'), findsWidgets);
    expect(store.queuedReadings, isEmpty);
    await tester.tap(find.text('حفظ قراءة واحدة وإرسالها للمراجعة'));
    await tester.pumpAndSettle();
    expect(store.queuedReadings.single['subscriber_id'], 2);
    expect(store.queuedReadings.single['current_reading'], '350');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a reading saved on the phone can be re-entered before sending',
      (tester) async {
    final store = readerStore(queued: [
      {
        'mobile_operation_id': 'operation-1',
        'subscriber_id': 1,
        'week_start': '2026-09-21',
        'current_reading': '1290',
      }
    ]);
    await openBox(tester, store);

    await tester.tap(find.text('Subscriber One'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('إعادة إدخال القراءة'));
    await tester.pumpAndSettle();
    expect(store.queuedReadings, isEmpty);
    expect(store.readingDrafts, {1: '1290'});

    await tester.tap(find.byKey(const ValueKey('reading-key-delete')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('reading-key-delete')));
    await tester.pump();
    await typeReading(tester, '40');
    await tester.tap(find.text('حفظ قراءة واحدة وإرسالها للمراجعة'));
    await tester.pumpAndSettle();
    expect(store.queuedReadings.single['current_reading'], '1240');
    expect(store.queuedReadings.single['mobile_operation_id'],
        isNot('operation-1'));
    await tester.pumpWidget(const SizedBox());
  });
}
