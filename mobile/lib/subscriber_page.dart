import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_identity.dart';
import 'payment_page.dart';

/// A subscriber's account as the collector sees it before taking a payment:
/// what they owe, who they are, their last payment and the latest lines of
/// their statement, with the payment one tap away. Pops with whether any
/// payment was recorded.
class SubscriberPage extends StatefulWidget {
  const SubscriberPage(
      {required this.api,
      required this.subscriber,
      this.transferBanks = defaultTransferBanks,
      super.key});
  final ApiClient api;

  /// The subscriber as the search listed them, shown until their page loads.
  final Map<String, dynamic> subscriber;
  final List<String> transferBanks;
  @override
  State<SubscriberPage> createState() => _SubscriberPageState();
}

class _SubscriberPageState extends State<SubscriberPage> {
  Map<String, dynamic>? details;
  bool loading = true;
  String? error;
  bool recordedAny = false;

  Map<String, dynamic> get subscriber => {
        ...widget.subscriber,
        if (details?['subscriber'] is Map)
          ...Map<String, dynamic>.from(details!['subscriber'] as Map),
      };
  double get balance => double.tryParse('${subscriber['balance']}') ?? 0;
  List<Map<String, dynamic>> get transactions => [
        for (final line in (details?['transactions'] as List?) ?? const [])
          Map<String, dynamic>.from(line as Map),
      ];
  Map<String, dynamic>? get lastPayment => details?['last_payment'] is Map
      ? Map<String, dynamic>.from(details!['last_payment'] as Map)
      : null;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result =
          await widget.api.collectionSubscriber(widget.subscriber['id'] as int);
      if (mounted) setState(() => details = result);
    } on ApiException catch (exception) {
      if (mounted) setState(() => error = exception.message);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> recordPayment() async {
    final submitted = await Navigator.of(context).push<bool>(MaterialPageRoute(
        builder: (_) => PaymentPage(
            api: widget.api,
            subscriber: subscriber,
            transferBanks: widget.transferBanks)));
    if (!mounted || submitted != true) return;
    recordedAny = true;
    showAppToast(context, 'سُجلت الدفعة مباشرة في السجل المالي.');
    await load();
  }

  void close() => Navigator.pop(context, recordedAny);

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) close();
        },
        child: Scaffold(
          body: SafeArea(
            child: Column(children: [
              AppHeader(
                  title: '${subscriber['full_name']}',
                  subtitle: 'حساب ${subscriber['account_number']}',
                  onBack: close),
              Expanded(
                child: RefreshIndicator(
                  color: AppIdentity.brand,
                  onRefresh: load,
                  child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
                      children: [
                        balanceCard(),
                        if (loading)
                          Padding(
                              padding: const EdgeInsets.only(top: 12),
                              child: ClipRRect(
                                  borderRadius: BorderRadius.circular(4),
                                  child: LinearProgressIndicator(
                                      minHeight: 3,
                                      color: AppIdentity.brand,
                                      backgroundColor: AppIdentity.sunken))),
                        if (error != null) ...[
                          const SizedBox(height: 12),
                          AppNotice(error!, error: true),
                          TextButton(
                              onPressed: loading ? null : load,
                              child: const Text('إعادة المحاولة')),
                        ],
                        const AppSection('بيانات المشترك'),
                        AppRows(children: [
                          for (final (icon, label, value) in facts())
                            AppRow(
                                leading: AppIconTile(
                                    icon, AppIdentity.muted, AppIdentity.sunken,
                                    size: 38, iconSize: 18),
                                title: Text(label,
                                    style: AppIdentity.body(12.5,
                                        color: AppIdentity.faint)),
                                subtitle: Text(value,
                                    style: AppIdentity.body(15,
                                        weight: FontWeight.w700))),
                        ]),
                        if (lastPayment != null) ...[
                          const AppSection('آخر دفعة'),
                          AppRows(children: [lastPaymentRow(lastPayment!)]),
                        ],
                        if (details != null) ...[
                          AppSection('آخر الحركات',
                              note: transactions.isEmpty
                                  ? null
                                  : '${transactions.length} حركات'),
                          AppRows(children: [
                            if (transactions.isEmpty)
                              const AppEmpty('hist', 'لا توجد حركات بعد',
                                  'تظهر هنا القراءات والدفعات المسجّلة.')
                            else
                              for (final line in transactions)
                                transactionRow(line),
                          ]),
                        ],
                      ]),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                    color: AppIdentity.background,
                    border:
                        Border(top: BorderSide(color: AppIdentity.lineSoft))),
                child: AppAction(
                    key: const ValueKey('subscriber-record-payment'),
                    label: 'تسجيل دفعة',
                    icon: 'cash',
                    onPressed: recordPayment),
              ),
            ]),
          ),
        ),
      );

  Widget balanceCard() {
    final status = subscriber['status'];
    final unusual = status != null && status != 'active';
    return AppHero(
        padding: const EdgeInsets.all(16),
        child: Row(children: [
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('الرصيد الحالي',
                    style:
                        AppIdentity.body(12.5, color: AppIdentity.heroFaint)),
                Text(balanceText(balance),
                    key: const ValueKey('subscriber-balance'),
                    style: AppIdentity.number(25,
                        weight: FontWeight.w800,
                        color: balance > 0
                            ? AppIdentity.heroBad
                            : AppIdentity.heroGood)),
              ])),
          if (unusual)
            Container(
                height: 26,
                padding: const EdgeInsets.symmetric(horizontal: 10),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                    color: const Color(0x18FFFFFF),
                    borderRadius: BorderRadius.circular(99)),
                child: Text('${subscriber['status_label'] ?? status}',
                    style: AppIdentity.body(12,
                        weight: FontWeight.w600, color: AppIdentity.heroWarn))),
        ]));
  }

  /// The details worth knowing at the door, leaving out any not on file.
  List<(String, String, String)> facts() {
    String? text(Object? value) =>
        value == null || '$value'.trim().isEmpty ? null : '$value'.trim();
    final box = [
      text(subscriber['meter_box_number']),
      text(subscriber['meter_box_name']),
    ].whereType<String>().join(' · ');
    return [
      ('card', 'رقم الحساب', '${subscriber['account_number']}'),
      if (box.isNotEmpty) ('bolt', 'الطبلون', box),
      if (text(subscriber['meter_box_location']) case final location?)
        ('pin', 'موقع الطبلون', location),
      if (text(subscriber['address']) case final address?)
        ('home', 'العنوان', address),
      if (text(subscriber['phone']) case final phone?)
        ('user', 'رقم التواصل', phone),
    ];
  }

  Widget lastPaymentRow(Map<String, dynamic> payment) {
    final cash = payment['payment_method'] == 'cash';
    final symbol = const {'USD': r'$', 'JOD': 'JD'}[payment['currency']] ?? '₪';
    final date = '${payment['recorded_at'] ?? ''}';
    return AppRow(
      leading: AppIconTile(
          cash ? 'cash' : 'bank', AppIdentity.good, AppIdentity.goodTint),
      title: AppRowTitle(cash
          ? 'نقد'
          : 'تحويل${payment['bank_name'] == null ? '' : ' إلى ${payment['bank_name']}'}'),
      subtitle: AppRowNote(
          '${date.length >= 10 ? date.substring(0, 10) : date} · سند ${payment['voucher_number'] ?? '—'}'),
      trailing: Text('${AppIdentity.grouped(payment['amount'])} $symbol',
          style: AppIdentity.number(15, color: AppIdentity.good)),
    );
  }

  Widget transactionRow(Map<String, dynamic> line) {
    final credit = line['is_credit'] == true;
    final cancelled = line['is_cancelled'] == true;
    final color = cancelled
        ? AppIdentity.faint
        : credit
            ? AppIdentity.good
            : AppIdentity.bad;
    return AppRow(
      crossAxisAlignment: CrossAxisAlignment.start,
      title: Text('${line['description'] ?? line['type_label']}',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: AppIdentity.body(14,
              weight: FontWeight.w600,
              color: cancelled ? AppIdentity.faint : null)),
      subtitle: AppRowNote(
          '${line['date']} · الرصيد بعدها ${balanceText(double.tryParse('${line['balance_after']}') ?? 0)}'),
      trailing: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text('${AppIdentity.grouped(line['amount'])} ₪',
            style: AppIdentity.number(14.5, color: color)),
        Text(cancelled ? 'ملغاة' : (credit ? 'له' : 'عليه'),
            style: AppIdentity.body(12, weight: FontWeight.w600, color: color)),
      ]),
    );
  }
}
