import 'package:flutter/material.dart';

import 'app_identity.dart';
import 'payment_page.dart' show balanceText, bankLogoAsset;

class CollectionView extends StatefulWidget {
  const CollectionView(
      {required this.search,
      required this.results,
      required this.today,
      required this.busy,
      required this.online,
      required this.error,
      required this.hasMore,
      required this.onSearchChanged,
      required this.onLoadMore,
      required this.onSearch,
      required this.onOpen,
      this.onWeeklyReadings,
      this.onRefresh,
      super.key});
  final TextEditingController search;
  final List<Map<String, dynamic>> results;
  final List<Map<String, dynamic>> today;
  final bool busy;
  final bool online;
  final String? error;
  final bool hasMore;
  final VoidCallback onSearchChanged;
  final VoidCallback onLoadMore;
  final VoidCallback onSearch;
  final ValueChanged<Map<String, dynamic>> onOpen;
  final VoidCallback? onWeeklyReadings;
  final Future<void> Function()? onRefresh;
  @override
  State<CollectionView> createState() => _CollectionViewState();
}

class _CollectionViewState extends State<CollectionView> {
  bool showingToday = false;
  @override
  Widget build(BuildContext context) {
    final total = widget.today
        .fold<double>(0, (sum, payment) => sum + inShekels(payment));
    final cash = widget.today
        .where((payment) => payment['payment_method'] == 'cash')
        .fold<double>(0, (sum, payment) => sum + inShekels(payment));
    final list = ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
        children: [
          AppSegment(
              selected: showingToday ? 1 : 0,
              onChanged: (index) => setState(() => showingToday = index == 1),
              labels: [
                (color) => Text('المشتركون',
                    style: AppIdentity.body(14.5,
                        weight: FontWeight.w700, color: color)),
                (color) => Text.rich(
                    TextSpan(children: [
                      const TextSpan(text: 'دفعاتي اليوم '),
                      TextSpan(
                          text: '${widget.today.length}',
                          style: AppIdentity.number(12,
                              color: color.withValues(alpha: .7))),
                    ]),
                    style: AppIdentity.body(14.5,
                        weight: FontWeight.w700, color: color)),
              ]),
          if (widget.onWeeklyReadings != null)
            InkWell(
              onTap: widget.onWeeklyReadings,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(4, 10, 4, 0),
                child: Row(children: [
                  AppIcon('hist', color: AppIdentity.info),
                  const SizedBox(width: 10),
                  Expanded(
                      child: Text('القراءات الأسبوعية',
                          style: AppIdentity.body(14,
                              weight: FontWeight.w600,
                              color: AppIdentity.info))),
                  AppIcon('chev', size: 18, color: AppIdentity.info),
                ]),
              ),
            ),
          if (!showingToday) ...[
            const SizedBox(height: 10),
            AppSearchField(
                controller: widget.search,
                hint: 'اسم المشترك أو رقم الحساب',
                maxLength: 100,
                onChanged: (_) => widget.onSearchChanged(),
                onSubmitted: (_) => widget.onSearch(),
                onClear: () {
                  widget.search.clear();
                  widget.onSearch();
                }),
            AppSection('المشتركون في منطقتك',
                note:
                    '${widget.results.length}${widget.hasMore ? '+' : ''} مشترك'),
            if (widget.busy)
              Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                          minHeight: 3,
                          color: AppIdentity.brand,
                          backgroundColor: AppIdentity.sunken))),
            if (widget.error != null) ...[
              AppNotice(widget.error!, error: true),
              TextButton(
                  onPressed: widget.busy ? null : widget.onSearch,
                  child: const Text('إعادة المحاولة')),
            ],
            if (widget.results.isEmpty && !widget.busy && widget.error == null)
              AppRows(children: [
                AppEmpty(
                    'search',
                    widget.search.text.trim().isNotEmpty
                        ? 'لا توجد نتائج'
                        : 'لا يوجد مشتركون متاحون',
                    'اكتب الاسم أو رقم الحساب لتسجيل دفعة.'),
              ]),
            if (widget.results.isNotEmpty)
              AppRows(children: [
                for (final subscriber in widget.results)
                  subscriberRow(subscriber),
              ]),
            if (widget.hasMore)
              Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: AppAction(
                      label: 'عرض المزيد',
                      primary: false,
                      busy: widget.busy,
                      onPressed: widget.busy ? null : widget.onLoadMore)),
          ] else ...[
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                  child: AppStat(
                      'حُصّل اليوم', '${AppIdentity.grouped(total)} ₪')),
              const SizedBox(width: 8),
              Expanded(
                  child: AppStat(
                      'نقدًا اليوم', '${AppIdentity.grouped(cash)} ₪',
                      color: AppIdentity.brand)),
            ]),
            const AppSection('الدفعات المسجّلة'),
            AppRows(children: [
              if (widget.today.isEmpty)
                Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 28),
                    child: Text('لم تُسجّل دفعات اليوم بعد.',
                        textAlign: TextAlign.center,
                        style: AppIdentity.body(13, color: AppIdentity.faint)))
              else
                for (final payment in widget.today.reversed)
                  paymentRow(payment),
            ]),
          ],
          const SizedBox(height: 12),
          const AppNotice(
              'تسجيل الدفعات يتطلب اتصالًا بالإنترنت. تُسجّل مباشرة في السجل المالي بعد تأكيد استلامها.'),
        ]);
    return widget.onRefresh == null
        ? list
        : RefreshIndicator(
            color: AppIdentity.brand,
            onRefresh: widget.onRefresh!,
            child: list);
  }

  Widget subscriberRow(Map<String, dynamic> subscriber) {
    final balance = balanceOf(subscriber);
    final unusual =
        subscriber['status'] != null && subscriber['status'] != 'active';
    return Opacity(
      opacity: widget.online ? 1 : .6,
      child: AppRow(
        onTap: widget.online ? () => widget.onOpen(subscriber) : null,
        leading: AppAvatar('${subscriber['full_name']}'),
        title: AppRowTitle('${subscriber['full_name']}'),
        // Suspended and disconnected subscribers can pay too; say which they are.
        subtitle: Text.rich(
            TextSpan(children: [
              TextSpan(text: 'حساب ${subscriber['account_number']}'),
              if (unusual)
                TextSpan(
                    text:
                        ' · ${subscriber['status_label'] ?? subscriber['status']}',
                    style: TextStyle(color: AppIdentity.warning)),
            ]),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppIdentity.body(12.5, color: AppIdentity.faint)),
        trailing: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(balanceText(balance),
              style: AppIdentity.number(14,
                  color: balance > 0 ? AppIdentity.bad : AppIdentity.good)),
          Text('+ دفعة',
              style: AppIdentity.body(13,
                  weight: FontWeight.w700, color: AppIdentity.brand)),
        ]),
      ),
    );
  }

  double balanceOf(Map<String, dynamic> subscriber) =>
      double.tryParse('${subscriber['balance']}') ?? 0;

  /// What a payment took off the balance; older servers sent shekels only.
  double inShekels(Map<String, dynamic> payment) =>
      double.tryParse('${payment['amount_in_shekels'] ?? payment['amount']}') ??
      0;

  Widget paymentRow(Map<String, dynamic> payment) {
    final logo = bankLogoAsset('${payment['bank_name']}');
    return AppRow(
      leading: payment['payment_method'] != 'cash' && logo != null
          ? ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child:
                  Image.asset(logo, width: 44, height: 44, fit: BoxFit.cover))
          : AppIconTile(
              payment['payment_method'] == 'cash' ? 'cash' : 'bank',
              payment['payment_method'] == 'cash'
                  ? AppIdentity.good
                  : AppIdentity.muted,
              AppIdentity.sunken,
              size: 44),
      title: AppRowTitle('${payment['subscriber']}'),
      subtitle: AppRowNote(
          '${payment['payment_method'] == 'cash' ? 'نقد' : 'تحويل${payment['bank_name'] == null ? '' : ' إلى ${payment['bank_name']}'}'} · سند ${payment['voucher_number'] ?? '—'}'),
      trailing: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text(
            '${AppIdentity.grouped(payment['amount'])} ${const {
                  'USD': r'$',
                  'JOD': 'JD'
                }[payment['currency']] ?? '₪'}',
            style: AppIdentity.number(14.5, color: AppIdentity.good)),
        Text('مسجّلة', style: AppIdentity.body(12, color: AppIdentity.good)),
      ]),
    );
  }
}
