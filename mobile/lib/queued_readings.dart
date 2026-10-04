import 'package:flutter/material.dart';

import 'app_identity.dart';

/// The readings saved on this phone that have not reached the server yet.
/// Each can be reopened to correct its number, and one the server refused
/// can also be thrown away.
class QueuedReadingsList extends StatelessWidget {
  const QueuedReadingsList(
      {required this.queue,
      required this.subscribers,
      required this.onReenter,
      required this.onDiscard,
      super.key});
  final List<Map<String, dynamic>> queue;
  final List<Map<String, dynamic>> subscribers;
  final ValueChanged<Map<String, dynamic>>? onReenter;
  final ValueChanged<Map<String, dynamic>> onDiscard;

  @override
  Widget build(BuildContext context) {
    if (queue.isEmpty) {
      return AppRows(children: const [
        AppEmpty('cloud', 'لا يوجد شيء بانتظار الإرسال',
            'كل القراءات وصلت إلى النظام الأساسي.',
            good: true),
      ]);
    }
    return AppRows(children: [for (final reading in queue) _tile(reading)]);
  }

  Widget _tile(Map<String, dynamic> reading) {
    final subscriber = subscribers
        .where((item) => item['id'] == reading['subscriber_id'])
        .firstOrNull;
    final rejected = reading['sync_error'] != null;
    final color = rejected ? AppIdentity.bad : AppIdentity.warning;
    final previous = subscriber?['previous_reading'];
    final current = double.tryParse('${reading['current_reading']}');
    final consumption = current == null || previous == null
        ? null
        : current - (double.tryParse('$previous') ?? 0);
    return AppRow(
      crossAxisAlignment: CrossAxisAlignment.start,
      leading: Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
              color: rejected ? AppIdentity.badTint : AppIdentity.warningTint,
              borderRadius: BorderRadius.circular(15)),
          child: AppIcon(rejected ? 'err' : 'clock', color: color)),
      title: AppRowTitle(
          '${subscriber?['full_name'] ?? 'مشترك #${reading['subscriber_id']}'}'),
      subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        AppRowNote([
          'الجديدة ${AppIdentity.reading(reading['current_reading'])}',
          if (previous != null) 'السابقة ${AppIdentity.reading(previous)}',
          if (consumption != null && consumption >= 0)
            '${AppIdentity.reading(consumption)} ك.و.س',
        ].join(' · ')),
        Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
                rejected ? '${reading['sync_error']}' : 'بانتظار الاتصال',
                style: AppIdentity.body(12.5,
                    weight: FontWeight.w600, color: color))),
      ]),
      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
        AppIconButton(
            key: ValueKey('reenter-${reading['mobile_operation_id']}'),
            icon: 'edit',
            label: 'تعديل',
            size: 38,
            iconSize: 17,
            flat: true,
            onPressed: onReenter == null ? null : () => onReenter!(reading)),
        if (rejected) ...[
          const SizedBox(width: 4),
          AppIconButton(
              icon: 'trash',
              label: 'حذف القراءة المرفوضة',
              size: 38,
              iconSize: 17,
              flat: true,
              color: AppIdentity.bad,
              onPressed: () => onDiscard(reading)),
        ],
      ]),
    );
  }
}
