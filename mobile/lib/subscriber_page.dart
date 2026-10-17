import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_balance.dart';
import 'app_identity.dart';
import 'payment_page.dart';
import 'subscriber_history_page.dart';
import 'subscriber_message_page.dart';

/// A subscriber's account as the collector sees it before taking a payment:
/// personal and subscription details, the previous reading and access to their
/// financial history. Pops with whether any payment was recorded.
class SubscriberPage extends StatefulWidget {
  const SubscriberPage(
      {required this.api,
      required this.subscriber,
      this.transferBanks = defaultTransferBanks,
      this.paymentMethods = const ['cash', 'bank_transfer'],
      super.key});
  final ApiClient api;

  /// The subscriber as the search listed them, shown until their page loads.
  final Map<String, dynamic> subscriber;
  final List<String> transferBanks;
  final List<String> paymentMethods;
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
        if (details?['subscription'] is Map)
          ...Map<String, dynamic>.from(details!['subscription'] as Map),
      };
  double get balance => double.tryParse('${subscriber['balance']}') ?? 0;
  Map get permissions => details?['permissions'] as Map? ?? const {};
  List<String> get paymentMethods => permissions['payment_methods'] is List
      ? List<String>.from(permissions['payment_methods'] as List)
      : widget.paymentMethods;
  bool get canRecordPayment =>
      permissions['record_payment'] as bool? ?? paymentMethods.isNotEmpty;
  Map<String, dynamic>? get lastReading => details?['last_reading'] is Map
      ? Map<String, dynamic>.from(details!['last_reading'] as Map)
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
    if (!canRecordPayment) return;
    final submitted = await Navigator.of(context).push<bool>(MaterialPageRoute(
        builder: (_) => PaymentPage(
            api: widget.api,
            subscriber: subscriber,
            paymentMethods: paymentMethods,
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
                  title: 'ملخص المشترك',
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
                        Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Text('${subscriber['full_name']}',
                                style: AppIdentity.heading(22))),
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
                        if (details != null) ...[
                          const AppSection('خدمات المشترك'),
                          subscriberActions(),
                          const AppSection('البيانات الشخصية'),
                          factRows(personalFacts()),
                        ],
                        const AppSection('معلومات الاشتراك'),
                        factRows(subscriptionFacts()),
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
                    onPressed: canRecordPayment ? recordPayment : null),
              ),
            ]),
          ),
        ),
      );

  Widget balanceCard() {
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
                        color: balanceColor(balance, onHero: true))),
              ])),
        ]));
  }

  String? text(Object? value) =>
      value == null || '$value'.trim().isEmpty ? null : '$value'.trim();

  Widget detailIcon(String icon, {bool muted = false}) {
    final (color, tint) = muted
        ? (AppIdentity.faint, AppIdentity.sunken)
        : switch (icon) {
            'phone' || 'cash' || 'check' => (
                AppIdentity.good,
                AppIdentity.goodTint
              ),
            'meter' || 'bolt' || 'breaker' || 'clock' => (
                AppIdentity.warning,
                AppIdentity.warningTint
              ),
            'home' || 'pin' || 'tag' => (
                AppIdentity.brand,
                AppIdentity.brandTint
              ),
            'err' => (AppIdentity.bad, AppIdentity.badTint),
            _ => (AppIdentity.info, AppIdentity.infoTint),
          };
    return AppIconTile(icon, color, tint, size: 38, iconSize: 18);
  }

  Widget factRows(List<(String, String, String)> facts) => AppRows(children: [
        for (final (icon, label, value) in facts)
          AppRow(
              leading: detailIcon(icon),
              title: Text(label,
                  style: AppIdentity.body(12.5, color: AppIdentity.faint)),
              subtitle: Text(value,
                  style: AppIdentity.body(15, weight: FontWeight.w700))),
      ]);

  List<(String, String, String)> personalFacts() => [
        if (text(subscriber['phone']) ?? text(subscriber['personal_phone'])
            case final phone?)
          ('phone', 'رقم الهاتف', phone),
        if (text(subscriber['address']) case final address?)
          ('home', 'العنوان', address),
      ];

  List<(String, String, String)> subscriptionFacts() {
    final box = [
      text(subscriber['meter_box_number']),
      text(subscriber['meter_box_name']),
    ].whereType<String>().join(' · ');
    final previousReading =
        lastReading?['current_reading'] ?? subscriber['initial_reading'];
    return [
      if (text(subscriber['status_label']) case final status?)
        (
          switch (subscriber['status']) {
            'active' => 'check',
            'disconnected' => 'err',
            _ => 'clock',
          },
          'حالة الاشتراك',
          status
        ),
      if (text(subscriber['accounting_type_label']) case final type?)
        ('sync', 'نوع المحاسبة', type),
      if (text(subscriber['subscription_date']) case final date?)
        ('calendar', 'تاريخ الاشتراك', date),
      if (text(subscriber['tariff_name']) case final tariff?)
        ('tag', 'نوع الاشتراك', tariff),
      if (text(subscriber['kilowatt_price']) case final price?)
        ('bolt', 'سعر الكيلوواط', '${AppIdentity.grouped(price)} ₪ / ك.و.س'),
      if (text(subscriber['minimum_payment']) case final minimum?)
        ('cash', 'الحد الأدنى الأسبوعي', '${AppIdentity.grouped(minimum)} ₪'),
      if (text(subscriber['circuit_breaker_ampere']) case final ampere?)
        ('breaker', 'القاطع', '${AppIdentity.reading(ampere)} أمبير'),
      if (box.isNotEmpty) ('meter', 'الطبلون', box),
      if (text(subscriber['meter_box_location']) case final location?)
        ('pin', 'موقع الطبلون', location),
      if (details != null)
        (
          'meter',
          'قراءة سابقة',
          previousReading == null
              ? 'غير متوفرة'
              : AppIdentity.reading(previousReading)
        ),
    ];
  }

  Widget subscriberActions() {
    final canViewHistory = permissions['view_history'] == true;
    final messaging = details?['messaging'] as Map?;
    final canSend = messaging?['can_send'] == true;
    final available = messaging?['sms_available'] == true;
    final hasPhone = text(subscriber['phone']) != null;
    final enabled = canSend && available && hasPhone;
    return AppRows(children: [
      AppRow(
          key: const ValueKey('subscriber-financial-history'),
          leading: detailIcon('hist'),
          title: const AppRowTitle('السجل المالي'),
          subtitle: AppRowNote(canViewHistory
              ? 'جميع الدفعات والقراءات والحركات'
              : 'تحتاج صلاحية عرض بيانات المشترك من الإدارة'),
          trailing: AppIcon(canViewHistory ? 'chev' : 'lock',
              size: 18, color: AppIdentity.faint),
          onTap: canViewHistory
              ? () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => SubscriberHistoryPage(
                      api: widget.api, subscriber: subscriber)))
              : null),
      AppRow(
          key: const ValueKey('subscriber-messaging'),
          leading: detailIcon('message', muted: !enabled),
          title: const AppRowTitle('إرسال رسالة'),
          subtitle: AppRowNote(!canSend
              ? 'تحتاج صلاحية إرسال الرسائل من الإدارة'
              : !hasPhone
                  ? 'لا يوجد رقم هاتف لهذا المشترك'
                  : !available
                      ? 'خدمة SMS غير مفعّلة؛ تواصل مع الإدارة'
                      : 'رسالة نصية إلى المشترك عبر SMS'),
          trailing: AppIcon(enabled ? 'chev' : 'lock',
              size: 18, color: AppIdentity.faint),
          onTap: enabled
              ? () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => SubscriberMessagePage(
                      api: widget.api, subscriber: subscriber)))
              : null),
    ]);
  }
}
