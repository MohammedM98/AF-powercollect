import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_identity.dart';
import 'app_balance.dart';

class SubscriberHistoryPage extends StatefulWidget {
  const SubscriberHistoryPage(
      {required this.api, required this.subscriber, super.key});
  final ApiClient api;
  final Map<String, dynamic> subscriber;

  @override
  State<SubscriberHistoryPage> createState() => _SubscriberHistoryPageState();
}

class _SubscriberHistoryPageState extends State<SubscriberHistoryPage> {
  final lines = <Map<String, dynamic>>[];
  bool loading = false;
  int page = 0;
  int lastPage = 1;
  int total = 0;
  String? error;
  bool refreshFailed = false;

  @override
  void initState() {
    super.initState();
    load(refresh: true);
  }

  Future<void> load({bool refresh = false}) async {
    if (loading) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await widget.api.subscriberTransactions(
          widget.subscriber['id'] as int,
          page: refresh ? 1 : page + 1);
      if (!mounted) return;
      setState(() {
        if (refresh) lines.clear();
        lines.addAll((result['data'] as List)
            .map((line) => Map<String, dynamic>.from(line as Map)));
        page = result['current_page'] as int;
        lastPage = result['last_page'] as int;
        total = result['total'] as int;
      });
    } on ApiException catch (exception) {
      if (mounted)
        setState(() {
          error = exception.message;
          refreshFailed = refresh;
        });
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
          body: SafeArea(
              child: Column(children: [
        AppHeader(
            title: 'السجل المالي',
            subtitle: '${widget.subscriber['full_name']}',
            onBack: () => Navigator.pop(context)),
        Expanded(
            child: RefreshIndicator(
                onRefresh: () => load(refresh: true),
                color: AppIdentity.brand,
                child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
                    children: [
                      AppSection('جميع الحركات',
                          note: page > 0 ? '$total حركة' : null),
                      if (lines.isNotEmpty)
                        AppRows(children: [
                          for (final line in lines)
                            SubscriberTransactionRow(line)
                        ]),
                      if (!loading && error == null && lines.isEmpty)
                        const AppEmpty('hist', 'لا توجد حركات بعد',
                            'تظهر هنا القراءات والدفعات والحركات المالية.'),
                      if (error != null) ...[
                        const SizedBox(height: 12),
                        AppNotice(error!, error: true),
                        TextButton(
                            onPressed: loading
                                ? null
                                : () =>
                                    load(refresh: refreshFailed || page == 0),
                            child: const Text('إعادة المحاولة')),
                      ] else if (page < lastPage || loading) ...[
                        const SizedBox(height: 12),
                        AppAction(
                            label: page == 0 ? 'تحميل السجل' : 'عرض حركات أقدم',
                            icon: 'hist',
                            busy: loading,
                            onPressed: loading ? null : () => load()),
                      ],
                    ]))),
      ])));
}

class SubscriberTransactionRow extends StatelessWidget {
  const SubscriberTransactionRow(this.line, {super.key});
  final Map<String, dynamic> line;

  @override
  Widget build(BuildContext context) {
    final credit = line['is_credit'] == true;
    final cancelled = line['is_cancelled'] == true;
    final color = cancelled
        ? AppIdentity.faint
        : credit
            ? AppIdentity.good
            : AppIdentity.bad;
    final icon = cancelled
        ? 'x'
        : switch (line['type']) {
            'meter_reading' => 'meter',
            'discount' || 'reading_discount' => 'tag',
            'invoice' || 'subscription_fee' => 'note',
            'refund' || 'reversal' || 'cancellation' => 'rotate',
            'clearing' => 'sync',
            _ => credit ? 'cash' : 'note',
          };
    final (iconColor, tint) = cancelled
        ? (AppIdentity.faint, AppIdentity.sunken)
        : switch (icon) {
            'cash' => (AppIdentity.good, AppIdentity.goodTint),
            'meter' => (AppIdentity.warning, AppIdentity.warningTint),
            'tag' => (AppIdentity.brand, AppIdentity.brandTint),
            _ => (AppIdentity.info, AppIdentity.infoTint),
          };
    return AppRow(
        adaptiveTrailing: true,
        crossAxisAlignment: CrossAxisAlignment.start,
        leading: AppIconTile(icon, iconColor, tint, size: 38, iconSize: 18),
        title: Text('${line['description'] ?? line['type_label']}',
            style: AppIdentity.body(14,
                weight: FontWeight.w600,
                color: cancelled ? AppIdentity.faint : null)),
        subtitle: AppRowNote(
            '${line['date']} · الرصيد بعدها ${balanceText(double.tryParse('${line['balance_after']}') ?? 0)}'),
        trailing: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('${AppIdentity.grouped(line['amount'])} ₪',
              style: AppIdentity.number(14.5, color: color)),
          Text(
              cancelled
                  ? 'ملغاة'
                  : credit
                      ? 'له'
                      : 'عليه',
              style:
                  AppIdentity.body(12, weight: FontWeight.w600, color: color)),
        ]));
  }
}
