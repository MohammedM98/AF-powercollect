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
      return AppPanel(
          child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 18),
              child: Column(children: [
                Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                        color: AppIdentity.good.withValues(alpha: .1),
                        borderRadius: BorderRadius.circular(18)),
                    child: const Icon(Icons.cloud_done_outlined,
                        color: AppIdentity.good, size: 28)),
                const SizedBox(height: 12),
                Text('لا يوجد شيء بانتظار الإرسال',
                    style: AppIdentity.body(15, weight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text('كل القراءات وصلت إلى النظام الأساسي.',
                    style: AppIdentity.body(13, color: AppIdentity.faint)),
              ])));
    }
    return AppPanel(
        padding: EdgeInsets.zero,
        child: Column(children: [
          for (var index = 0; index < queue.length; index++)
            _tile(queue[index], last: index == queue.length - 1),
        ]));
  }

  Widget _tile(Map<String, dynamic> reading, {required bool last}) {
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
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
      decoration: BoxDecoration(
          border: last
              ? null
              : const Border(bottom: BorderSide(color: AppIdentity.lineSoft))),
      child: Row(children: [
        Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
                color: color.withValues(alpha: .1),
                borderRadius: BorderRadius.circular(13)),
            child: Icon(rejected ? Icons.error_outline : Icons.schedule,
                color: color, size: 21)),
        const SizedBox(width: 12),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
              '${subscriber?['full_name'] ?? 'مشترك #${reading['subscriber_id']}'}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppIdentity.body(15, weight: FontWeight.w700)),
          Text(
              [
                'الجديدة ${AppIdentity.reading(reading['current_reading'])}',
                if (previous != null)
                  'السابقة ${AppIdentity.reading(previous)}',
                if (consumption != null && consumption >= 0)
                  '${AppIdentity.reading(consumption)} ك.و.س',
              ].join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppIdentity.body(12.5, color: AppIdentity.faint)),
          const SizedBox(height: 2),
          Text(rejected ? '${reading['sync_error']}' : 'بانتظار الاتصال',
              style:
                  AppIdentity.body(12, weight: FontWeight.w600, color: color)),
        ])),
        TextButton(
            key: ValueKey('reenter-${reading['mobile_operation_id']}'),
            onPressed: onReenter == null ? null : () => onReenter!(reading),
            child: const Text('تعديل')),
        if (rejected)
          IconButton(
              tooltip: 'حذف القراءة المرفوضة',
              icon: const Icon(Icons.delete_outline, color: AppIdentity.muted),
              onPressed: () => onDiscard(reading)),
      ]),
    );
  }
}
