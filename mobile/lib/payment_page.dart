import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api_client.dart';
import 'app_identity.dart';
import 'field_store.dart';
import 'receipt_reader_page.dart';
import 'receipt_scan.dart';

/// The banks and e-wallets a transfer can go to, used until the server
/// sends its own list with the signed-in user.
const defaultTransferBanks = [
  'بنك فلسطين',
  'محفظة بالباي',
  'جوال باي',
  'البنك الإسلامي الفلسطيني',
  'البنك الوطني الإسلامي',
];

/// Each bank or e-wallet's logo, brand colour and kind, as on the website;
/// one not listed here gets a plain tile.
const _bankLooks = {
  'بنك فلسطين': (
    'assets/images/banks/bank-of-palestine.webp',
    Color(0xFFB8007A),
    'تحويل بنكي'
  ),
  'جوال باي': (
    'assets/images/banks/jawwal-pay.webp',
    Color(0xFF7CB342),
    'محفظة'
  ),
  'محفظة بالباي': (
    'assets/images/banks/palpay.webp',
    Color(0xFF9B30E0),
    'محفظة'
  ),
};

/// Currency code, symbol and name, in the website's order.
const _currencies = [
  ('ILS', '₪', 'شيكل'),
  ('USD', '\$', 'دولار'),
  ('JOD', 'JD', 'دينار'),
];

/// A balance as the website words it: owed (عليه), in credit (له) or settled.
String balanceText(double balance) => balance > 0
    ? '${AppIdentity.money(balance)} ₪ عليه'
    : balance < 0
        ? '${AppIdentity.money(-balance)} ₪ له'
        : '0.00 ₪ مسدّد';

/// Record a payment the way the website's payment form does: the amount in
/// shekels, dollars or dinars (at an exchange rate), paid in cash or by a
/// transfer to one of the company's banks or e-wallets, with who sent it
/// and its reference. A transfer receipt can be read on the phone to fill
/// in its numbers.
class PaymentPage extends StatefulWidget {
  const PaymentPage(
      {required this.api,
      required this.subscriber,
      this.transferBanks = defaultTransferBanks,
      this.receiptScanner = const ReceiptScanner(),
      this.receiptReader = const DeviceReceiptTextReader(),
      super.key});
  final ApiClient api;
  final Map<String, dynamic> subscriber;
  final List<String> transferBanks;
  final ReceiptScanner receiptScanner;
  final ReceiptTextReader receiptReader;
  @override
  State<PaymentPage> createState() => _PaymentPageState();
}

class _PaymentPageState extends State<PaymentPage> {
  final amount = TextEditingController();
  final rate = TextEditingController();
  final sender = TextEditingController();
  final reference = TextEditingController();
  final notes = TextEditingController();
  final voucher = TextEditingController();
  String currency = 'ILS';
  // The website's payment form starts on a transfer too.
  String method = 'bank_transfer';
  String? bank;
  String? senderBank;
  bool senderIsSubscriber = true;
  bool busy = false;
  bool scanning = false;
  bool collectorConfirmed = false;
  bool showKeypad = true;
  bool recordedAny = false;
  late double balance = double.tryParse('${widget.subscriber['balance']}') ?? 0;
  String? error;
  Map<String, dynamic>? submission;
  Map<String, dynamic>? receipt;

  String get subscriberName => '${widget.subscriber['full_name']}';
  bool get editable => !busy && !scanning && submission == null;
  bool get throughBank => method == 'bank_transfer';
  bool get isShekel => currency == 'ILS';
  double get value => double.tryParse(amount.text) ?? 0;
  double? get rateValue => isShekel ? 1 : double.tryParse(rate.text);
  double? get inShekels => rateValue == null || rateValue! <= 0
      ? null
      : (value * rateValue! * 100).roundToDouble() / 100;
  double get owed => max(balance, 0);
  (String, String, String) get currencyLook =>
      _currencies.firstWhere((look) => look.$1 == currency);
  String get methodText => throughBank
      ? bank == null
          ? 'تحويل بنكي'
          : 'تحويل ${senderBank == null ? '' : 'من $senderBank '}إلى $bank'
      : 'نقد';

  @override
  void initState() {
    super.initState();
    sender.text = subscriberName;
  }

  @override
  void dispose() {
    for (final controller in [
      amount,
      rate,
      sender,
      reference,
      notes,
      voucher
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  void enterAmount(String key) {
    if (!editable) return;
    final current = amount.text;
    var next = current;
    if (key == 'clear') {
      next = '';
    } else if (key == 'delete') {
      next = current.isEmpty ? '' : current.substring(0, current.length - 1);
    } else if (key == '.') {
      if (!current.contains('.')) next = '${current.isEmpty ? '0' : current}.';
    } else if (current.length < 10 &&
        !(current.contains('.') && current.split('.').last.length >= 2)) {
      next = current == '0' ? key : '$current$key';
    }
    setState(() => amount.text = next);
  }

  /// The balance the server reports after the payment; the app's own sum
  /// when an older server sends none.
  double balanceAfter(double recordedInShekels) =>
      double.tryParse('${receipt?['balance_after']}') ??
      balance - recordedInShekels;

  /// Back to an empty form for another payment from the same subscriber,
  /// starting from the balance the last one left, as the website's
  /// «دفعة جديدة» does.
  void startAnother(double newBalance) => setState(() {
        for (final controller in [amount, rate, reference, notes, voucher]) {
          controller.clear();
        }
        balance = newBalance;
        currency = 'ILS';
        method = 'bank_transfer';
        bank = null;
        senderBank = null;
        senderIsSubscriber = true;
        sender.text = subscriberName;
        collectorConfirmed = false;
        showKeypad = true;
        submission = null;
        receipt = null;
        error = null;
      });

  void toggleSender(bool isSubscriber) => setState(() {
        senderIsSubscriber = isSubscriber;
        sender.text = isSubscriber ? subscriberName : '';
      });

  Future<void> readReceipt(ReceiptImageSource source) async {
    if (!editable) return;
    FocusScope.of(context).unfocus();
    setState(() {
      scanning = true;
      showKeypad = false;
      error = null;
    });
    ReceiptImage? image;
    try {
      image = await widget.receiptScanner.pick(source);
      if (image == null || !mounted) return;
      final picked = await Navigator.push<Map<String, String>>(
          context,
          MaterialPageRoute(
              builder: (_) => ReceiptReaderPage(
                  image: image!,
                  scanner: widget.receiptScanner,
                  reader: widget.receiptReader)));
      if (picked == null || !mounted) return;
      setState(() {
        if (picked['amount'] != null) amount.text = picked['amount']!;
        if (picked['reference_number'] != null) {
          reference.text = picked['reference_number']!;
        }
        if (picked['sender_name'] != null) {
          senderIsSubscriber = false;
          sender.text = picked['sender_name']!;
        }
      });
    } on PlatformException catch (exception) {
      if (mounted)
        setState(() => error = exception.message ??
            'تعذر فتح صورة الإيصال. جرّب صورة أخرى أو أدخل البيانات يدويًا.');
    } on MissingPluginException {
      if (mounted)
        setState(() => error = 'قراءة الإيصالات متاحة في تطبيق Android فقط.');
    } finally {
      if (image != null) {
        try {
          await widget.receiptScanner.discard(image);
        } on PlatformException {
          // Temporary images are also cleared by the Android scanner on restart.
        } on MissingPluginException {
          // Tests and unsupported platforms have no native image cache.
        }
      }
      if (mounted) setState(() => scanning = false);
    }
  }

  String? get missingDetail {
    if (!(value > 0) || !value.isFinite) return 'أدخل مبلغًا أكبر من صفر.';
    if (inShekels == null) return 'أدخل سعر الصرف لتحويل المبلغ إلى شيكل.';
    if (throughBank) {
      if (bank == null) return 'اختر البنك أو المحفظة التي حُوّل إليها المبلغ.';
      if (sender.text.trim().isEmpty) {
        return 'أدخل اسم صاحب الحساب الذي حُوّل منه المبلغ.';
      }
      if (reference.text.trim().isEmpty) {
        return 'أدخل الرقم المرجعي من إشعار الحوالة.';
      }
    }
    return null;
  }

  Future<void> submit() async {
    if (busy || scanning || !collectorConfirmed) return;
    if (submission == null && missingDetail != null) {
      setState(() => error = missingDetail);
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
        'amount': amount.text.trim().replaceFirst(RegExp(r'\.$'), ''),
        'currency': currency,
        if (!isShekel) 'exchange_rate': rate.text.trim(),
        'payment_method': method,
        if (throughBank) ...{
          'bank_name': bank,
          if (senderBank != null) 'sender_bank_name': senderBank,
          'sender_name': sender.text.trim(),
          'reference_number': reference.text.trim(),
        },
        if (!throughBank && voucher.text.trim().isNotEmpty)
          'manual_voucher_number': voucher.text.trim(),
        'notes': notes.text.trim(),
      };
      final result = await widget.api.sendCollection(submission!);
      recordedAny = true;
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
        canPop: !busy && !scanning,
        child: Scaffold(
            body: SafeArea(
                child: receipt != null
                    ? success()
                    : Column(children: [
                        AppHeader(
                            title: subscriberName,
                            subtitle:
                                'حساب ${widget.subscriber['account_number']} · تسجيل دفعة',
                            onBack: busy || scanning
                                ? null
                                : () => Navigator.pop(context, recordedAny)),
                        Expanded(
                            child: ListView(
                                padding:
                                    const EdgeInsets.fromLTRB(16, 4, 16, 20),
                                children: [
                              balanceStrip(),
                              label('المبلغ المستلم',
                                  hint: 'بالعملة التي استُلم بها'),
                              amountPanel(),
                              label('طريقة الدفع'),
                              Row(children: [
                                methodTile(
                                    'bank_transfer',
                                    'تحويل بنكي أو محفظة',
                                    Icons.account_balance),
                                const SizedBox(width: 8),
                                methodTile(
                                    'cash', 'نقد', Icons.payments_outlined),
                              ]),
                              const SizedBox(height: 12),
                              if (throughBank)
                                transferDetails()
                              else ...[
                                label('رقم السند اليدوي',
                                    hint: 'رقم الوصل الورقي'),
                                detailField('مثال: 00412', voucher,
                                    key: 'payment-voucher', ltr: true),
                              ],
                              label('ملاحظة',
                                  hint: 'اختياري · تظهر في كشف الحساب'),
                              detailField('أي تفصيل يُحفظ مع الدفعة', notes,
                                  key: 'payment-notes'),
                              const SizedBox(height: 12),
                              summary(),
                              const SizedBox(height: 12),
                              AppPanel(
                                  padding: const EdgeInsets.all(4),
                                  child: CheckboxListTile(
                                    value: collectorConfirmed,
                                    onChanged: busy || scanning
                                        ? null
                                        : (checked) => setState(() =>
                                            collectorConfirmed =
                                                checked ?? false),
                                    controlAffinity:
                                        ListTileControlAffinity.leading,
                                    title: Text(
                                        'أؤكد استلام هذه الدفعة من $subscriberName وتسجيلها مباشرة في السجل المالي.',
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
                                key: const ValueKey('payment-submit'),
                                label: busy
                                    ? 'جارٍ التسجيل...'
                                    : value > 0
                                        ? 'تسجيل ${AppIdentity.money(value)} ${currencyLook.$3}'
                                        : 'تسجيل الدفعة',
                                icon: Icons.check,
                                busy: busy,
                                onPressed: busy ||
                                        scanning ||
                                        !collectorConfirmed ||
                                        value <= 0
                                    ? null
                                    : submit)),
                        if (showKeypad &&
                            MediaQuery.viewInsetsOf(context).bottom == 0)
                          AppKeypad(
                              decimal: true,
                              enabled: editable,
                              onClose: () => setState(() => showKeypad = false),
                              onKey: enterAmount),
                      ]))),
      );

  Widget balanceStrip() => Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          gradient: AppIdentity.hero, borderRadius: BorderRadius.circular(20)),
      child: Row(children: [
        Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: .08),
                borderRadius: BorderRadius.circular(14)),
            child: const Icon(Icons.person_outline, color: Colors.white)),
        const SizedBox(width: 12),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('الرصيد الحالي',
              style: AppIdentity.body(12.5, color: const Color(0xFFAEB6C1))),
          const SizedBox(height: 6),
          Text(balanceText(balance),
              style: AppIdentity.number(22,
                  color: balance > 0
                      ? const Color(0xFFFCA5A5)
                      : const Color(0xFF6EE7B7))),
        ])),
      ]));

  Widget amountPanel() => AppPanel(
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
                hintStyle: AppIdentity.number(34, color: AppIdentity.faint)),
          )),
          const SizedBox(width: 10),
          Text(currencyLook.$2,
              style: AppIdentity.number(20, color: AppIdentity.faint)),
        ]),
        const SizedBox(height: 10),
        SegmentedButton<String>(
            key: const ValueKey('payment-currency'),
            showSelectedIcon: false,
            segments: [
              for (final (code, symbol, name) in _currencies)
                ButtonSegment(value: code, label: Text('$symbol $name')),
            ],
            selected: {currency},
            onSelectionChanged: editable
                ? (selection) => setState(() => currency = selection.first)
                : null),
        const Divider(color: AppIdentity.lineSoft),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final quick in ['50', '100', '200'])
            ActionChip(
                label: Text(quick),
                onPressed: editable
                    ? () => setState(() => amount.text = quick)
                    : null),
          if (owed > 0)
            ActionChip(
                key: const ValueKey('payment-full-debt'),
                label: const Text('تسديد كامل الدين'),
                onPressed: editable && (rateValue ?? 0) > 0
                    ? () => setState(() =>
                        amount.text = (owed / rateValue!).toStringAsFixed(2))
                    : null),
        ]),
        if (!isShekel) ...[
          const SizedBox(height: 10),
          Row(children: [
            Text('سعر الصرف',
                style: AppIdentity.body(13.5, color: AppIdentity.muted)),
            const SizedBox(width: 8),
            SizedBox(
                width: 96,
                child: TextField(
                    key: const ValueKey('payment-rate'),
                    controller: rate,
                    enabled: editable,
                    onTap: () => setState(() => showKeypad = false),
                    onChanged: (_) => setState(() {}),
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                          RegExp(r'^\d{0,4}(\.\d{0,4})?'))
                    ],
                    textDirection: TextDirection.ltr,
                    textAlign: TextAlign.center,
                    decoration: InputDecoration(
                        isDense: true,
                        hintText: currency == 'USD' ? '3.70' : '5.20'))),
            const SizedBox(width: 8),
            Expanded(
                child: Text(
                    inShekels == null
                        ? 'كم شيكل يساوي 1 ${currencyLook.$3}'
                        : '= ${AppIdentity.money(inShekels)} ₪',
                    style: AppIdentity.body(13.5,
                        weight: FontWeight.w700, color: AppIdentity.ink))),
          ]),
        ],
      ]));

  Widget transferDetails() => AppPanel(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('قراءة إيصال التحويل',
            style: AppIdentity.body(14, weight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text(
            'صوّر الإيصال أو اختر صورته، ثم اضغط على الأرقام لنقلها إلى الحقول. تُقرأ الصورة على الجوال ولا تُرفع.',
            style: AppIdentity.body(12.5, color: AppIdentity.muted)),
        const SizedBox(height: 8),
        if (scanning)
          const Row(children: [
            SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2)),
            SizedBox(width: 10),
            Text('جارٍ فتح الإيصال...')
          ])
        else
          Wrap(spacing: 8, children: [
            OutlinedButton.icon(
                key: const ValueKey('receipt-camera'),
                onPressed: editable
                    ? () => readReceipt(ReceiptImageSource.camera)
                    : null,
                icon: const Icon(Icons.document_scanner_outlined),
                label: const Text('تصوير الإيصال')),
            OutlinedButton.icon(
                key: const ValueKey('receipt-gallery'),
                onPressed: editable
                    ? () => readReceipt(ReceiptImageSource.gallery)
                    : null,
                icon: const Icon(Icons.image_outlined),
                label: const Text('اختيار صورة')),
          ]),
        const Divider(height: 28, color: AppIdentity.lineSoft),
        Text('البنك المستلم (إلى)',
            style: AppIdentity.body(14, weight: FontWeight.w700)),
        const SizedBox(height: 8),
        GridView(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                mainAxisExtent: 60),
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              for (final name in widget.transferBanks) bankTile(name)
            ]),
        label('البنك المحوّل منه (من)', hint: 'اختياري'),
        DropdownButtonFormField<String?>(
            key: const ValueKey('payment-sender-bank'),
            initialValue: senderBank,
            isExpanded: true,
            decoration: const InputDecoration(
                hintText: 'اختر البنك أو المحفظة المحوّل منها'),
            items: [
              const DropdownMenuItem<String?>(
                  value: null, child: Text('غير محدد')),
              for (final name in widget.transferBanks)
                DropdownMenuItem<String?>(value: name, child: Text(name)),
            ],
            onChanged: editable
                ? (value) => setState(() => senderBank = value)
                : null),
        Padding(
            padding: const EdgeInsets.fromLTRB(2, 14, 2, 4),
            child: Row(children: [
              Expanded(
                  child: Text('اسم المحوِّل',
                      style: AppIdentity.body(14, weight: FontWeight.w700))),
              Flexible(
                  child: Text('المشترك نفسه',
                      textAlign: TextAlign.end,
                      style: AppIdentity.body(13, color: AppIdentity.muted))),
              Switch(
                  key: const ValueKey('payment-sender-is-subscriber'),
                  value: senderIsSubscriber,
                  onChanged: editable ? toggleSender : null),
            ])),
        TextField(
            key: const ValueKey('payment-sender'),
            controller: sender,
            enabled: editable,
            readOnly: senderIsSubscriber,
            onTap: () => setState(() => showKeypad = false),
            decoration: const InputDecoration(
                hintText: 'اسم صاحب الحساب الذي حُوّل منه المبلغ')),
        label('الرقم المرجعي', hint: 'من إشعار الحوالة'),
        detailField('مثال: TRX-48213', reference,
            key: 'payment-reference', ltr: true),
      ]));

  Widget bankTile(String name) {
    final look = _bankLooks[name];
    final selected = bank == name;
    final color = look?.$2 ?? AppIdentity.ink;
    return InkWell(
        key: ValueKey('payment-bank-$name'),
        onTap: editable ? () => setState(() => bank = name) : null,
        borderRadius: BorderRadius.circular(14),
        child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(
                color: selected
                    ? color.withValues(alpha: .06)
                    : AppIdentity.surface,
                border: Border.all(
                    color: selected ? color : AppIdentity.lineSoft, width: 1.5),
                borderRadius: BorderRadius.circular(14)),
            child: Row(children: [
              ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: look == null
                      ? Container(
                          width: 34,
                          height: 34,
                          color: AppIdentity.sunken,
                          child: const Icon(Icons.account_balance,
                              size: 18, color: AppIdentity.muted))
                      : Image.asset(look.$1,
                          width: 34, height: 34, fit: BoxFit.cover)),
              const SizedBox(width: 8),
              Expanded(
                  child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppIdentity.body(12.5, weight: FontWeight.w700)),
                    Text(look?.$3 ?? 'تحويل',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppIdentity.body(11, color: AppIdentity.faint)),
                  ])),
            ])));
  }

  Widget summary() {
    final after = inShekels == null ? null : balance - inShekels!;
    final coverage = owed > 0 && inShekels != null
        ? min(100, (inShekels! / owed * 100).round())
        : null;
    return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            gradient: AppIdentity.hero,
            borderRadius: BorderRadius.circular(20)),
        child: Column(children: [
          summaryRow('الرصيد الحالي', balanceText(balance)),
          summaryRow('هذه الدفعة', '+${AppIdentity.money(inShekels ?? 0)} ₪'),
          const Divider(color: Color(0x1FFFFFFF)),
          summaryRow(
              'الرصيد بعد الدفعة', after == null ? '—' : balanceText(after),
              color: after == null
                  ? const Color(0x80FFFFFF)
                  : after > 0
                      ? const Color(0xFFFCA5A5)
                      : const Color(0xFF6EE7B7)),
          if (coverage != null)
            summaryRow('تغطية المبلغ المستحق', '$coverage%'),
          summaryRow('الطريقة', methodText),
        ]));
  }

  Widget summaryRow(String title, String text, {Color color = Colors.white}) =>
      Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(children: [
            Text(title,
                style: AppIdentity.body(13.5, color: const Color(0xBFFFFFFF))),
            const SizedBox(width: 12),
            Expanded(
                child: Text(text,
                    textAlign: TextAlign.end,
                    style: AppIdentity.body(14,
                        weight: FontWeight.w700, color: color))),
          ]));

  Widget label(String title, {String? hint}) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 14, 2, 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(
              child: Text(title,
                  style: AppIdentity.body(14, weight: FontWeight.w700))),
          if (hint != null)
            Flexible(
                child: Text(hint,
                    textAlign: TextAlign.end,
                    style: AppIdentity.body(12, color: AppIdentity.faint)))
        ]),
      );

  Widget detailField(String hint, TextEditingController controller,
          {required String key, bool ltr = false}) =>
      TextField(
        key: ValueKey(key),
        controller: controller,
        enabled: editable,
        textDirection: ltr ? TextDirection.ltr : null,
        onTap: () => setState(() => showKeypad = false),
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(hintText: hint),
      );

  Widget methodTile(String key, String title, IconData icon) => Expanded(
        child: InkWell(
            key: ValueKey('payment-method-$key'),
            onTap: editable ? () => setState(() => method = key) : null,
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
                Text(title,
                    textAlign: TextAlign.center,
                    style: AppIdentity.body(13.5, weight: FontWeight.w700))
              ]),
            )),
      );

  Widget success() {
    final recordedInShekels =
        double.tryParse('${receipt?['amount_in_shekels']}') ?? inShekels ?? 0;
    final newBalance = balanceAfter(recordedInShekels);
    return ListView(
        padding: const EdgeInsets.fromLTRB(20, 50, 20, 24),
        children: [
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
          Text(
              '${AppIdentity.money(receipt?['amount'] ?? amount.text)} ${currencyLook.$3} من $subscriberName · سُجّلت مباشرة في السجل المالي.',
              textAlign: TextAlign.center,
              style: AppIdentity.body(14, color: AppIdentity.muted)),
          const SizedBox(height: 20),
          AppPanel(
              child: Column(children: [
            receiptRow('رقم السند', '${receipt?['voucher_number'] ?? '—'}'),
            receiptRow('المبلغ',
                '${AppIdentity.money(receipt?['amount'] ?? amount.text)} ${currencyLook.$2}'),
            if (!isShekel)
              receiptRow(
                  'بالشيكل', '${AppIdentity.money(recordedInShekels)} ₪'),
            receiptRow('الطريقة', methodText),
            receiptRow('الرصيد بعد الدفعة', balanceText(newBalance)),
          ])),
          const SizedBox(height: 20),
          AppAction(
              label: 'العودة إلى التحصيل',
              onPressed: () => Navigator.pop(context, true)),
          const SizedBox(height: 10),
          AppAction(
              key: const ValueKey('payment-another'),
              label: 'دفعة جديدة',
              icon: Icons.add,
              primary: false,
              onPressed: () => startAnother(newBalance)),
        ]);
  }

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
