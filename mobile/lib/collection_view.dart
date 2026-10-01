import 'package:flutter/material.dart';

import 'app_identity.dart';

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
    return ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                  color: AppIdentity.sunken,
                  borderRadius: BorderRadius.circular(15)),
              child: Row(children: [
                segment('المشتركون', false),
                segment('دفعاتي اليوم', true),
              ])),
          const SizedBox(height: 12),
          if (widget.onWeeklyReadings != null)
            Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                    onPressed: widget.onWeeklyReadings,
                    icon: const Icon(Icons.history_outlined),
                    label: const Text('القراءات الأسبوعية'))),
          if (!showingToday) ...[
            TextField(
                controller: widget.search,
                maxLength: 100,
                onChanged: (_) => widget.onSearchChanged(),
                onSubmitted: (_) => widget.onSearch(),
                decoration: InputDecoration(
                    counterText: '',
                    hintText: 'اسم المشترك أو رقم الحساب',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: widget.search.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'مسح البحث',
                            icon: const Icon(Icons.close),
                            onPressed: () {
                              widget.search.clear();
                              widget.onSearch();
                            }))),
            const SizedBox(height: 10),
            if (widget.busy) const LinearProgressIndicator(),
            if (widget.error != null) ...[
              AppNotice(widget.error!, error: true),
              TextButton(
                  onPressed: widget.busy ? null : widget.onSearch,
                  child: const Text('إعادة المحاولة')),
            ],
            Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Row(children: [
                  Text('المشتركون في منطقتك', style: AppIdentity.heading(16)),
                  const Spacer(),
                  Text(
                      '${widget.results.length}${widget.hasMore ? '+' : ''} مشترك',
                      style: AppIdentity.body(12, color: AppIdentity.faint)),
                ])),
            if (widget.results.isEmpty && !widget.busy && widget.error == null)
              AppPanel(
                  child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 20),
                      child: Column(children: [
                        const Icon(Icons.person_search_outlined,
                            size: 36, color: AppIdentity.faint),
                        const SizedBox(height: 10),
                        Text(
                            widget.search.text.trim().isNotEmpty
                                ? 'لا توجد نتائج'
                                : 'لا يوجد مشتركون متاحون',
                            style: AppIdentity.heading(17)),
                        Text('اكتب الاسم أو رقم الحساب لتسجيل دفعة.',
                            textAlign: TextAlign.center,
                            style:
                                AppIdentity.body(13, color: AppIdentity.faint)),
                      ]))),
            if (widget.results.isNotEmpty)
              AppPanel(
                  padding: EdgeInsets.zero,
                  child: Column(children: [
                    for (final subscriber in widget.results)
                      subscriberRow(subscriber),
                  ])),
            if (widget.hasMore)
              Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: AppAction(
                      label: 'عرض المزيد',
                      primary: false,
                      busy: widget.busy,
                      onPressed: widget.busy ? null : widget.onLoadMore)),
          ] else ...[
            Row(children: [
              Expanded(
                  child:
                      AppStat('حُصّل اليوم', '${AppIdentity.money(total)} ₪')),
              const SizedBox(width: 8),
              Expanded(
                  child: AppStat('نقدًا اليوم', '${AppIdentity.money(cash)} ₪',
                      color: AppIdentity.brand)),
            ]),
            Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child:
                    Text('الدفعات المسجّلة', style: AppIdentity.heading(16))),
            if (widget.today.isEmpty)
              const AppPanel(
                  child: Center(child: Text('لم تُسجّل دفعات اليوم بعد.'))),
            if (widget.today.isNotEmpty)
              AppPanel(
                  padding: EdgeInsets.zero,
                  child: Column(children: [
                    for (final payment in widget.today) paymentRow(payment)
                  ])),
          ],
          const SizedBox(height: 16),
          const AppNotice(
              'تسجيل الدفعات يتطلب اتصالًا بالإنترنت. تُسجّل مباشرة في السجل المالي بعد تأكيد استلامها.'),
        ]);
  }

  Widget segment(String text, bool value) => Expanded(
          child: Container(
        decoration: BoxDecoration(
            color: showingToday == value
                ? AppIdentity.surface
                : Colors.transparent,
            borderRadius: BorderRadius.circular(11)),
        child: TextButton(
            onPressed: () => setState(() => showingToday = value),
            child: Text(text,
                style: AppIdentity.body(14.5,
                    weight: FontWeight.w700,
                    color: showingToday == value
                        ? AppIdentity.ink
                        : AppIdentity.muted))),
      ));

  Widget subscriberRow(Map<String, dynamic> subscriber) => InkWell(
        onTap: widget.online ? () => widget.onOpen(subscriber) : null,
        child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: const BoxDecoration(
                border:
                    Border(bottom: BorderSide(color: AppIdentity.lineSoft))),
            child: Row(children: [
              const Icon(Icons.person_outline, color: AppIdentity.muted),
              const SizedBox(width: 10),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text('${subscriber['full_name']}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppIdentity.body(15, weight: FontWeight.w700)),
                    Text('حساب ${subscriber['account_number']}',
                        style: AppIdentity.body(12, color: AppIdentity.faint)),
                  ])),
              const SizedBox(width: 8),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(AppIdentity.money(subscriber['balance']),
                    style: AppIdentity.number(15, color: AppIdentity.bad)),
                const SizedBox(height: 5),
                Text('+ دفعة',
                    style: AppIdentity.body(13,
                        weight: FontWeight.w700, color: AppIdentity.brand)),
              ]),
            ])),
      );

  /// What a payment took off the balance; older servers sent shekels only.
  double inShekels(Map<String, dynamic> payment) =>
      double.tryParse('${payment['amount_in_shekels'] ?? payment['amount']}') ??
      0;

  Widget paymentRow(Map<String, dynamic> payment) => Container(
        padding: const EdgeInsets.all(14),
        decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: AppIdentity.lineSoft))),
        child: Row(children: [
          Icon(
              payment['payment_method'] == 'cash'
                  ? Icons.payments_outlined
                  : Icons.account_balance_outlined,
              color: AppIdentity.muted),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('${payment['subscriber']}',
                    style: AppIdentity.body(15, weight: FontWeight.w700)),
                Text(
                    '${payment['payment_method'] == 'cash' ? 'نقد' : 'تحويل${payment['bank_name'] == null ? '' : ' إلى ${payment['bank_name']}'}'} · سند ${payment['voucher_number'] ?? '—'}',
                    style: AppIdentity.body(12, color: AppIdentity.faint)),
              ])),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(
                '${AppIdentity.money(payment['amount'])} ${const {
                      'USD': r'$',
                      'JOD': 'JD'
                    }[payment['currency']] ?? '₪'}',
                style: AppIdentity.number(15, color: AppIdentity.good)),
            Text('مسجّلة',
                style: AppIdentity.body(12, color: AppIdentity.good)),
          ]),
        ]),
      );
}
