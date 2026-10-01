import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_identity.dart';
import 'field_store.dart';

class PaymentPage extends StatefulWidget {
  const PaymentPage({required this.api, required this.subscriber, super.key});
  final ApiClient api;
  final Map<String, dynamic> subscriber;
  @override
  State<PaymentPage> createState() => _PaymentPageState();
}

class _PaymentPageState extends State<PaymentPage> {
  final amount = TextEditingController();
  final sender = TextEditingController();
  final reference = TextEditingController();
  final notes = TextEditingController();
  final voucher = TextEditingController();
  String method = 'cash';
  String bank = 'بنك فلسطين';
  bool busy = false;
  bool collectorConfirmed = false;
  bool showKeypad = true;
  String? error;
  Map<String, dynamic>? submission;
  Map<String, dynamic>? receipt;

  bool get editable => !busy && submission == null;
  double get value => double.tryParse(amount.text) ?? 0;

  @override
  void dispose() {
    for (final controller in [amount, sender, reference, notes, voucher]) {
      controller.dispose();
    }
    super.dispose();
  }

  void enterAmount(String key) {
    if (!editable) return;
    final current = amount.text;
    var next = current;
    if (key == 'delete') {
      next = current.isEmpty ? '' : current.substring(0, current.length - 1);
    } else if (key == '.') {
      if (!current.contains('.')) next = '${current.isEmpty ? '0' : current}.';
    } else if (current.length < 10 &&
        !(current.contains('.') && current.split('.').last.length >= 2)) {
      next = current == '0' ? key : '$current$key';
    }
    setState(() => amount.text = next);
  }

  Future<void> submit() async {
    if (busy || !collectorConfirmed) return;
    if (value <= 0 ||
        !value.isFinite ||
        (method != 'cash' &&
            (sender.text.trim().isEmpty || reference.text.trim().isEmpty))) {
      setState(() => error = 'أدخل المبلغ واسم المرسل ورقم التحويل المطلوب.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      submission ??= {
        'mobile_operation_id': newOperationId(),
        'collector_confirmed': true,
        'subscriber_id': widget.subscriber['id'],
        'amount': amount.text.trim(),
        'currency': 'ILS',
        'payment_method': method == 'cash' ? 'cash' : 'bank_transfer',
        if (method != 'cash') ...{
          'bank_name': bank,
          'sender_name': sender.text.trim(),
          'reference_number': reference.text.trim(),
        },
        if (method == 'cash' && voucher.text.trim().isNotEmpty)
          'manual_voucher_number': voucher.text.trim(),
        'notes': notes.text.trim(),
      };
      final result = await widget.api.sendCollection(submission!);
      if (mounted) setState(() => receipt = result);
    } on ApiException catch (exception) {
      if (exception.statusCode >= 400 && exception.statusCode < 500)
        submission = null;
      if (mounted)
        setState(() => error = exception.isNetwork ||
                exception.statusCode >= 500
            ? 'تعذر تأكيد تسجيل الدفعة. أعد المحاولة من هذه الشاشة بنفس البيانات، أو تحقق من دفعات اليوم قبل إنشاء دفعة أخرى.'
            : exception.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: !busy,
        child: Scaffold(
            body: SafeArea(
                child: receipt != null
                    ? success()
                    : Column(children: [
                        AppHeader(
                            title: '${widget.subscriber['full_name']}',
                            subtitle:
                                'حساب ${widget.subscriber['account_number']} · تسجيل دفعة',
                            onBack: busy
                                ? null
                                : () => Navigator.pop(context, false)),
                        Expanded(
                            child: ListView(
                                padding:
                                    const EdgeInsets.fromLTRB(16, 4, 16, 20),
                                children: [
                              Container(
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                      gradient: AppIdentity.hero,
                                      borderRadius: BorderRadius.circular(20)),
                                  child: Row(children: [
                                    Container(
                                        width: 44,
                                        height: 44,
                                        decoration: BoxDecoration(
                                            color: Colors.white
                                                .withValues(alpha: .08),
                                            borderRadius:
                                                BorderRadius.circular(14)),
                                        child: const Icon(Icons.person_outline,
                                            color: Colors.white)),
                                    const SizedBox(width: 12),
                                    Expanded(
                                        child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                          Text('الرصيد الحالي',
                                              style: AppIdentity.body(12.5,
                                                  color:
                                                      const Color(0xFFAEB6C1))),
                                          const SizedBox(height: 6),
                                          Text(
                                              '${AppIdentity.money(widget.subscriber['balance'])} ₪',
                                              style: AppIdentity.number(24,
                                                  color:
                                                      const Color(0xFFFCA5A5))),
                                        ])),
                                  ])),
                              label('المبلغ المستلم', hint: 'بالشيكل'),
                              AppPanel(
                                  child: Column(children: [
                                Row(children: [
                                  Expanded(
                                      child: TextField(
                                    key: const ValueKey('payment-amount'),
                                    controller: amount,
                                    readOnly: true,
                                    showCursor: editable,
                                    onTap: () {
                                      FocusScope.of(context).unfocus();
                                      setState(() => showKeypad = true);
                                    },
                                    style: AppIdentity.number(34),
                                    textDirection: TextDirection.ltr,
                                    textAlign: TextAlign.right,
                                    decoration: InputDecoration(
                                        hintText: '0.00',
                                        filled: false,
                                        border: InputBorder.none,
                                        enabledBorder: InputBorder.none,
                                        focusedBorder: InputBorder.none,
                                        contentPadding: EdgeInsets.zero,
                                        hintStyle: AppIdentity.number(34,
                                            color: AppIdentity.faint)),
                                  )),
                                  const SizedBox(width: 10),
                                  Text('₪',
                                      style: AppIdentity.number(20,
                                          color: AppIdentity.faint)),
                                ]),
                                const Divider(color: AppIdentity.lineSoft),
                                Wrap(spacing: 6, runSpacing: 6, children: [
                                  for (final quick in ['50', '100', '200'])
                                    ActionChip(
                                        label: Text(quick),
                                        onPressed: editable
                                            ? () => setState(
                                                () => amount.text = quick)
                                            : null),
                                  if ((double.tryParse(
                                              '${widget.subscriber['balance']}') ??
                                          0) >
                                      0)
                                    ActionChip(
                                        label: const Text('كامل المبلغ'),
                                        onPressed: editable
                                            ? () => setState(() => amount.text =
                                                AppIdentity.money(widget
                                                    .subscriber['balance']))
                                            : null),
                                ]),
                              ])),
                              label('طريقة الدفع'),
                              Row(children: [
                                methodTile(
                                    'cash', 'نقدًا', Icons.payments_outlined),
                                const SizedBox(width: 8),
                                methodTile('bank', 'تحويل بنكي',
                                    Icons.account_balance_outlined),
                                const SizedBox(width: 8),
                                methodTile('wallet', 'محفظة',
                                    Icons.account_balance_wallet_outlined),
                              ]),
                              if (method != 'cash') ...[
                                const SizedBox(height: 12),
                                if (method == 'wallet')
                                  Row(children: [
                                    for (final wallet in [
                                      'جوال باي',
                                      'محفظة بالباي'
                                    ])
                                      Expanded(
                                          child: Padding(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                      horizontal: 4),
                                              child: ChoiceChip(
                                                  label: Text(wallet),
                                                  selected: bank == wallet,
                                                  onSelected: editable
                                                      ? (_) => setState(
                                                          () => bank = wallet)
                                                      : null))),
                                  ])
                                else
                                  Text('بنك فلسطين',
                                      style: AppIdentity.body(14,
                                          weight: FontWeight.w700)),
                                label('اسم المرسل'),
                                detailField('اسم المرسل', sender),
                                label('رقم التحويل'),
                                detailField('رقم التحويل', reference),
                              ] else ...[
                                label('رقم الوصل اليدوي', hint: 'اختياري'),
                                detailField('رقم الوصل اليدوي', voucher),
                              ],
                              label('ملاحظات', hint: 'اختياري'),
                              detailField('ملاحظات', notes),
                              const SizedBox(height: 12),
                              AppPanel(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 14, vertical: 10),
                                  child: Row(children: [
                                    const Expanded(
                                        child: Text('الرصيد بعد التسجيل')),
                                    Text(
                                        '${AppIdentity.money((double.tryParse('${widget.subscriber['balance']}') ?? 0) - value)} ₪',
                                        style: AppIdentity.number(16)),
                                  ])),
                              const SizedBox(height: 12),
                              AppPanel(
                                  padding: const EdgeInsets.all(4),
                                  child: CheckboxListTile(
                                    value: collectorConfirmed,
                                    onChanged: busy
                                        ? null
                                        : (checked) => setState(() =>
                                            collectorConfirmed =
                                                checked ?? false),
                                    controlAffinity:
                                        ListTileControlAffinity.leading,
                                    title: Text(
                                        'أؤكد استلام هذه الدفعة من ${widget.subscriber['full_name']} وتسجيلها مباشرة في السجل المالي.',
                                        style: AppIdentity.body(13.5)),
                                  )),
                              if (error != null) ...[
                                const SizedBox(height: 12),
                                AppNotice(error!, error: true)
                              ],
                            ])),
                        Padding(
                            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                            child: AppAction(
                                label:
                                    busy ? 'جارٍ التسجيل...' : 'تسجيل الدفعة',
                                icon: Icons.check,
                                busy: busy,
                                onPressed:
                                    busy || !collectorConfirmed || value <= 0
                                        ? null
                                        : submit)),
                        if (showKeypad &&
                            MediaQuery.viewInsetsOf(context).bottom == 0)
                          AppKeypad(
                              decimal: true,
                              enabled: editable,
                              onKey: enterAmount),
                      ]))),
      );

  Widget label(String title, {String? hint}) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 14, 2, 8),
        child: Row(children: [
          Text(title, style: AppIdentity.body(14, weight: FontWeight.w700)),
          const Spacer(),
          if (hint != null)
            Text(hint, style: AppIdentity.body(12, color: AppIdentity.faint))
        ]),
      );

  Widget detailField(String hint, TextEditingController controller) =>
      TextField(
        controller: controller,
        enabled: editable,
        onTap: () => setState(() => showKeypad = false),
        decoration: InputDecoration(hintText: hint),
      );

  Widget methodTile(String key, String label, IconData icon) => Expanded(
        child: InkWell(
            onTap: editable
                ? () => setState(() {
                      method = key;
                      bank = key == 'wallet' ? 'جوال باي' : 'بنك فلسطين';
                    })
                : null,
            borderRadius: BorderRadius.circular(16),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 12),
              decoration: BoxDecoration(
                  color: AppIdentity.surface,
                  border: Border.all(
                      color: method == key ? AppIdentity.ink : AppIdentity.line,
                      width: 1.5),
                  borderRadius: BorderRadius.circular(16)),
              child: Column(children: [
                Icon(icon,
                    color:
                        method == key ? AppIdentity.brand : AppIdentity.muted),
                const SizedBox(height: 7),
                Text(label,
                    style: AppIdentity.body(13.5, weight: FontWeight.w700))
              ]),
            )),
      );

  Widget success() =>
      ListView(padding: const EdgeInsets.fromLTRB(20, 50, 20, 24), children: [
        Center(
            child: Container(
                width: 84,
                height: 84,
                decoration: BoxDecoration(
                    color: const Color(0xFFE8F6F0),
                    borderRadius: BorderRadius.circular(28)),
                child: const Icon(Icons.check,
                    size: 42, color: AppIdentity.good))),
        const SizedBox(height: 16),
        Text('تم تسجيل الدفعة',
            textAlign: TextAlign.center, style: AppIdentity.heading(24)),
        Text('سُجّلت مباشرة في السجل المالي وتحدّث رصيد المشترك.',
            textAlign: TextAlign.center,
            style: AppIdentity.body(14, color: AppIdentity.muted)),
        const SizedBox(height: 20),
        AppPanel(
            child: Column(children: [
          receiptRow('المشترك', '${widget.subscriber['full_name']}'),
          receiptRow('المبلغ',
              '${AppIdentity.money(receipt?['amount'] ?? amount.text)} ₪'),
          receiptRow('طريقة الدفع', method == 'cash' ? 'نقدًا' : bank),
          receiptRow('رقم الوصل', '${receipt?['voucher_number'] ?? '—'}'),
          receiptRow('الحالة', 'مسجّلة في السجل المالي'),
        ])),
        const SizedBox(height: 20),
        AppAction(
            label: 'العودة إلى التحصيل',
            onPressed: () => Navigator.pop(context, true)),
      ]);

  Widget receiptRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: AppIdentity.body(14, color: AppIdentity.faint)),
          const SizedBox(width: 16),
          Expanded(
              child: Text(value,
                  textAlign: TextAlign.end,
                  style: AppIdentity.body(14, weight: FontWeight.w700))),
        ]),
      );
}
