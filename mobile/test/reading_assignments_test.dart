import 'package:flutter_test/flutter_test.dart';
import 'package:power_collect/reading_assignments.dart';

Map<String, dynamic> work(int id, String date, {bool open = false}) => {
      'id': id,
      'version': 3,
      'authorization': 'signed-$id',
      'cycle': {
        'id': id,
        'week_start': date,
        'week_end': date,
        'reading_date': date,
        'entry_open': open,
        'entry_starts_at': '${date}T00:00:00+03:00',
        'entry_ends_at': '${date}T23:59:59+03:00',
      },
      'meter_box': {
        'id': id,
        'name': 'Box $id',
        'number': 'B$id',
        'location': 'Street',
        'sub_area_id': 7,
        'sub_area_name': 'Area Seven',
      },
      'subscriptions': [
        {'id': id, 'name': 'Subscriber $id', 'previous_reading': '100.00'}
      ],
    };

void main() {
  test(
      'the nearest assigned round carries its area and signed work into the roster',
      () {
    final roster = assignedReadingRoster({
      'business_date': '2026-10-21',
      'assignments': [
        work(1, '2026-10-20'),
        work(2, '2026-10-22'),
        work(3, '2026-10-29')
      ],
    });
    expect(roster['reading_date'], '2026-10-22');
    final subscriber = (roster['data'] as List).single;
    expect(subscriber['full_name'], 'Subscriber 2');
    expect(subscriber['meter_box_number'], 'B2');
    expect(subscriber['sub_area_name'], 'Area Seven');
    expect(subscriber['assignment_id'], 2);
    expect(subscriber['authorization'], 'signed-2');
    expect(roster['can_record_readings_now'], false);
  });

  test(
      'today takes priority and the latest uploadable round remains after its day',
      () {
    final assignments = [
      work(1, '2026-10-20'),
      work(2, '2026-10-22', open: true)
    ];
    expect(
        assignedReadingRoster({
          'business_date': '2026-10-22',
          'assignments': assignments
        })['can_record_readings_now'],
        true);
    expect(
        assignedReadingRoster({
          'business_date': '2026-10-23',
          'assignments': assignments
        })['reading_date'],
        '2026-10-22');
    expect(
        assignedReadingRoster(
            {'business_date': '2026-10-23', 'assignments': []})['data'],
        isEmpty);
  });

  test(
      'downloaded work opens offline on its business day and closes the next day',
      () {
    final roster = assignedReadingRoster({
      'business_date': '2026-10-21',
      'assignments': [work(2, '2026-10-22')]
    });
    expect(readingEntryIsOpen(roster, DateTime.parse('2026-10-21T20:59:59Z')),
        false);
    expect(readingEntryIsOpen(roster, DateTime.parse('2026-10-21T21:00:00Z')),
        true);
    expect(readingEntryIsOpen(roster, DateTime.parse('2026-10-22T20:59:59Z')),
        true);
    expect(readingEntryIsOpen(roster, DateTime.parse('2026-10-22T21:00:00Z')),
        false);
  });
}
