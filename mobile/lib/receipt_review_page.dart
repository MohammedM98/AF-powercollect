import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api_client.dart';
import 'app_identity.dart';
import 'receipt_scan.dart';

const receiptProviderNames = {
  'bank_of_palestine': 'بنك فلسطين',
  'jawwal_pay': 'جوال باي',
  'palpay': 'محفظة بالباي',
  'palestine_islamic_bank': 'البنك الإسلامي الفلسطيني',
};

class ReceiptReviewPage extends StatefulWidget {
  const ReceiptReviewPage(
      {required this.api,
      required this.subscriber,
      required this.image,
      required this.scanner,
      this.initialFields = const {},
      super.key});
  final ApiClient api;
  final Map<String, dynamic> subscriber;
  final ReceiptImage image;
  final ReceiptScanner scanner;
  final Map<String, dynamic> initialFields;

  @override
  State<ReceiptReviewPage> createState() => _ReceiptReviewPageState();
}

class _ReceiptReviewPageState extends State<ReceiptReviewPage> {
  final amount = TextEditingController();
  final sender = TextEditingController();
  final reference = TextEditingController();
  final senderAccount = TextEditingController();
  final date = TextEditingController();
  final rate = TextEditingController();
  final notes = TextEditingController();
  List<Map<String, dynamic>> providers = [];
  List<Map<String, dynamic>> warnings = [];
  Map<String, dynamic>? confirmation;
  Map<String, dynamic>? analysis;
  String? providerCode;
  String? currency = 'ILS';
  String? processedPath;
  String? error;
  String rawText = '';
  bool reviewed = false;
  bool contrast = true;
  bool busy = false;
  bool acknowledged = false;
  bool received = false;
  int rotation = 0;
  int? get receiptId => (analysis?['receipt_id'] as num?)?.toInt();
  bool get editable => !busy && confirmation == null;

  @override
  void initState() {
    super.initState();
    amount.text = '${widget.initialFields['amount'] ?? ''}';
    sender.text = '${widget.initialFields['sender_name'] ?? ''}';
    reference.text = '${widget.initialFields['transaction_reference'] ?? ''}';
    notes.text = '${widget.initialFields['notes'] ?? ''}';
    providerCode = widget.initialFields['provider'] as String?;
    loadProviders();
  }

  @override
  void dispose() {
    for (final controller in [
      amount,
      sender,
      reference,
      senderAccount,
      date,
      rate,
      notes
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> loadProviders() async {
    try {
      final result = await widget.api.receiptProviders();
      if (!mounted) return;
      setState(() => providers = (result['data'] as List)
          .map((value) => Map<String, dynamic>.from(value as Map))
          .toList());
    } on ApiException {
      // Provider codes remain selectable offline and are resolved before upload.
    }
  }

  Future<void> rotate() async {
    if (!editable) return;
    setState(() => busy = true);
    try {
      await widget.scanner.rotate(widget.image);
      await FileImage(File(widget.image.previewPath)).evict();
      if (mounted)
        setState(() {
          rotation++;
          processedPath = null;
        });
    } on PlatformException catch (exception) {
      if (mounted) setState(() => error = exception.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<Map<String, dynamic>> upload({bool manual = false}) async {
    if (providers.isEmpty) {
      final result = await widget.api.receiptProviders();
      providers = (result['data'] as List)
          .map((value) => Map<String, dynamic>.from(value as Map))
          .toList();
    }
    final selected =
        providers.where((value) => value['code'] == providerCode).firstOrNull;
    processedPath ??=
        await widget.scanner.prepare(widget.image, contrast: contrast);
    return widget.api.analyzeReceipt(widget.image.originalPath, processedPath!,
        providerId: (selected?['id'] as num?)?.toInt(), manual: manual);
  }

  Future<void> analyze() async {
    if (!editable) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await upload();
      if (!mounted) return;
      final fields = Map<String, dynamic>.from(result['fields'] as Map? ?? {});
      setState(() {
        analysis = result;
        providerCode = fields['provider'] as String? ?? providerCode;
        if (fields['amount'] != null) amount.text = '${fields['amount']}';
        if (fields['sender_name'] != null)
          sender.text = '${fields['sender_name']}';
        if (fields['transaction_reference'] != null)
          reference.text = '${fields['transaction_reference']}';
        if (fields['sender_account'] != null)
          senderAccount.text = '${fields['sender_account']}';
        if (fields['transferred_at'] != null) {
          final parsedDate = DateTime.tryParse('${fields['transferred_at']}');
          date.text = parsedDate == null
              ? '${fields['transferred_at']}'
              : displayDate(parsedDate.toLocal());
        }
        currency = ['ILS', 'USD', 'JOD'].contains(fields['currency'])
            ? '${fields['currency']}'
            : null;
        warnings = (result['warnings'] as List? ?? [])
            .map((value) => Map<String, dynamic>.from(value as Map))
            .toList();
        if (fields['currency'] != null &&
            !['ILS', 'USD', 'JOD'].contains(fields['currency'])) {
          amount.clear();
          warnings.add({
            'message':
                'عملة الإيصال غير مدعومة؛ أدخل قيمة الدفعة بإحدى العملات المتاحة.'
          });
        }
        rawText = '${fields['raw_text'] ?? ''}';
        reviewed = true;
        acknowledged = false;
        received = false;
      });
    } on ApiException catch (exception) {
      if (mounted) setState(() => error = exception.message);
    } on PlatformException catch (exception) {
      if (mounted)
        setState(() => error = exception.message ?? 'تعذر تجهيز الصورة.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  String displayDate(DateTime value) =>
      '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')} ${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';

  Future<void> chooseDate() async {
    final current = DateTime.tryParse(normalizeReceiptDigits(date.text.trim()))
            ?.toLocal() ??
        DateTime.now();
    final firstDate = DateTime(2000);
    final lastDate = DateTime(DateTime.now().year + 5, 12, 31);
    final selected = await showDatePicker(
        context: context,
        initialDate: current.isBefore(firstDate) || current.isAfter(lastDate)
            ? DateTime.now()
            : current,
        firstDate: firstDate,
        lastDate: lastDate);
    if (selected == null || !mounted) return;
    final time = await showTimePicker(
        context: context, initialTime: TimeOfDay.fromDateTime(current));
    if (time == null || !mounted) return;
    setState(() {
      date.text = displayDate(DateTime(
          selected.year, selected.month, selected.day, time.hour, time.minute));
      acknowledged = false;
      received = false;
    });
  }

  String? get dateWarning {
    final value = DateTime.tryParse(normalizeReceiptDigits(date.text.trim()));
    if (value == null) return null;
    if (value.isAfter(DateTime.now()))
      return 'تاريخ التحويل في المستقبل؛ راجعه من الإيصال.';
    if (value.isBefore(DateTime.now().subtract(const Duration(days: 30))))
      return 'تاريخ التحويل أقدم من 30 يومًا؛ تأكد أن الدفعة لم تُسجل سابقًا.';
    return null;
  }

  Future<void> confirm() async {
    if (busy || !acknowledged || !received) return;
    final parsedAmount = receiptAmount(amount.text);
    final transferDate =
        DateTime.tryParse(normalizeReceiptDigits(date.text.trim()));
    if (providerCode == null ||
        currency == null ||
        parsedAmount == null ||
        sender.text.trim().isEmpty ||
        reference.text.trim().isEmpty ||
        transferDate == null ||
        (currency != 'ILS' && (double.tryParse(rate.text) ?? 0) <= 0)) {
      setState(() => error =
          'أكمل المزود والمبلغ واسم المرسل ورقم التحويل والتاريخ وسعر الصرف المطلوب.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (receiptId == null) {
        final result = await upload(manual: true);
        if (!mounted) return;
        analysis = result;
      }
      final selected =
          providers.where((value) => value['code'] == providerCode).firstOrNull;
      if (selected == null)
        throw const ApiException(
            'اختر بنكًا أو محفظة متاحة ثم أعد المحاولة.', 422);
      confirmation ??= {
        'subscriber_id': widget.subscriber['id'],
        'provider_id': selected['id'],
        'transaction_reference': normalizeReceiptDigits(reference.text.trim()),
        'sender_name': sender.text.trim(),
        'sender_account': senderAccount.text.trim(),
        'amount': parsedAmount,
        'currency': currency,
        if (currency != 'ILS') 'exchange_rate': rate.text.trim(),
        'transferred_at': transferDate.toUtc().toIso8601String(),
        'notes': notes.text.trim(),
        'collector_confirmed': true,
        'review_acknowledged': true,
      };
      final result = await widget.api.confirmReceipt(receiptId!, confirmation!);
      if (mounted)
        Navigator.pop(context,
            {...result, 'bank_name': receiptProviderNames[providerCode]});
    } on ApiException catch (exception) {
      if (exception.statusCode >= 400 && exception.statusCode < 500)
        confirmation = null;
      if (mounted)
        setState(() => error = confirmation != null
            ? 'تعذر تأكيد التسجيل. أعد المحاولة بالإيصال نفسه؛ لن تُنشأ دفعة ثانية.'
            : exception.message);
    } on PlatformException catch (exception) {
      if (mounted)
        setState(() => error = exception.message ?? 'تعذر تجهيز الصورة.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: !busy,
        child: Scaffold(
            body: SafeArea(
                child: Column(children: [
          AppHeader(
              title: reviewed ? 'مراجعة بيانات الإيصال' : 'تجهيز صورة الإيصال',
              subtitle:
                  '${widget.subscriber['full_name']} · ${widget.subscriber['account_number']}',
              onBack: busy ? null : () => Navigator.pop(context)),
          Expanded(
              child: ListView(padding: const EdgeInsets.all(16), children: [
            if (!reviewed) ...[
              const AppNotice(
                  'حرّك الزوايا حول الإيصال. ستُحفظ الصورة الأصلية ويُرسل الجزء المحدد للقراءة.'),
              const SizedBox(height: 12),
              cropPreview(),
              Row(children: [
                TextButton.icon(
                    onPressed: editable ? rotate : null,
                    icon: const Icon(Icons.rotate_right),
                    label: const Text('تدوير')),
                TextButton(
                    onPressed: editable
                        ? () => setState(() {
                              widget.image.corners = [0, 0, 1, 0, 1, 1, 0, 1];
                              processedPath = null;
                            })
                        : null,
                    child: const Text('الصورة كاملة')),
              ]),
              SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('تحسين التباين'),
                  value: contrast,
                  onChanged: editable
                      ? (value) => setState(() {
                            contrast = value;
                            processedPath = null;
                          })
                      : null),
            ] else ...[
              const AppNotice(
                  'راجع جميع الحقول قبل التسجيل. صورة الإيصال لا تؤكد وصول المبلغ إلى حساب الشركة.'),
              const SizedBox(height: 12),
              ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Image.file(
                      File(processedPath ?? widget.image.previewPath),
                      height: 180,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const SizedBox.shrink())),
              const SizedBox(height: 12),
              for (final warning in warnings)
                Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: AppNotice('${warning['message']}', error: true)),
            ],
            DropdownButtonFormField<String>(
                key: ValueKey('receipt-provider-${providerCode ?? 'auto'}'),
                initialValue: providerCode,
                isExpanded: true,
                decoration:
                    const InputDecoration(labelText: 'البنك أو المحفظة'),
                items: [
                  const DropdownMenuItem<String>(
                      value: null, child: Text('كشف تلقائي / اختر المزود')),
                  for (final entry in receiptProviderNames.entries)
                    DropdownMenuItem(
                        value: entry.key, child: Text(entry.value)),
                ],
                onChanged: editable
                    ? (value) => setState(() {
                          providerCode = value;
                          acknowledged = false;
                          received = false;
                        })
                    : null),
            if (reviewed) ...[
              const SizedBox(height: 16),
              field('المبلغ', 'receipt-amount', amount, numeric: true),
              DropdownButtonFormField<String>(
                  key: ValueKey('receipt-currency-$currency'),
                  initialValue: currency,
                  decoration: const InputDecoration(labelText: 'العملة'),
                  items: [
                    const DropdownMenuItem<String>(
                        value: null, child: Text('اختر عملة الإيصال')),
                    for (final value in ['ILS', 'USD', 'JOD'])
                      DropdownMenuItem(value: value, child: Text(value))
                  ],
                  onChanged: editable
                      ? (value) => setState(() {
                            currency = value;
                            acknowledged = false;
                            received = false;
                          })
                      : null),
              const SizedBox(height: 16),
              if (currency != null && currency != 'ILS')
                field('سعر الصرف إلى الشيكل', 'receipt-rate', rate,
                    numeric: true),
              field('اسم المرسل', 'receipt-sender', sender),
              field('رقم التحويل / العملية', 'receipt-reference', reference),
              field('حساب أو محفظة المرسل (اختياري)', 'receipt-account',
                  senderAccount),
              field('تاريخ ووقت التحويل', 'receipt-date', date,
                  hint: '2026-09-30 14:30', onChoose: chooseDate),
              if (dateWarning != null) AppNotice(dateWarning!, error: true),
              field('ملاحظات (اختياري)', 'receipt-notes', notes),
              if (rawText.isNotEmpty)
                AppPanel(
                    child: ExpansionTile(
                        title: const Text('النص المقروء من الصورة'),
                        children: [SelectableText(rawText)])),
              CheckboxListTile(
                  key: const ValueKey('receipt-reviewed'),
                  contentPadding: EdgeInsets.zero,
                  value: acknowledged,
                  onChanged: editable
                      ? (value) => setState(() => acknowledged = value ?? false)
                      : null,
                  title: const Text(
                      'راجعت الحقول والتنبيهات وصححت البيانات من الإيصال.')),
              CheckboxListTile(
                  key: const ValueKey('receipt-received'),
                  contentPadding: EdgeInsets.zero,
                  value: received,
                  onChanged: editable
                      ? (value) => setState(() => received = value ?? false)
                      : null,
                  title: Text(
                      'أؤكد استلام الدفعة وتسجيلها للمشترك ${widget.subscriber['full_name']}.')),
              Text(
                  'لن تُسجل الدفعة دون اتصال بالخادم. عند انقطاع الاتصال، اكتب البيانات هنا ثم أعد المحاولة عند عودته.',
                  style: AppIdentity.body(12.5, color: AppIdentity.muted)),
            ],
            if (error != null) ...[
              const SizedBox(height: 12),
              AppNotice(error!, error: true)
            ],
          ])),
          Padding(
              padding: const EdgeInsets.all(16),
              child: Column(children: [
                AppAction(
                    key: ValueKey(
                        reviewed ? 'receipt-confirm' : 'receipt-analyze'),
                    label: busy
                        ? 'جارٍ المعالجة...'
                        : reviewed
                            ? 'تأكيد وتسجيل الدفعة'
                            : 'قراءة الإيصال',
                    icon: reviewed
                        ? Icons.check
                        : Icons.document_scanner_outlined,
                    busy: busy,
                    onPressed:
                        busy || (reviewed && (!acknowledged || !received))
                            ? null
                            : reviewed
                                ? confirm
                                : analyze),
                if (!reviewed)
                  TextButton(
                      key: const ValueKey('receipt-manual'),
                      onPressed: editable
                          ? () => setState(() => reviewed = true)
                          : null,
                      child: const Text('إدخال بيانات الإيصال يدويًا')),
              ])),
        ]))),
      );

  Widget field(String label, String key, TextEditingController controller,
          {bool numeric = false, String? hint, VoidCallback? onChoose}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: TextField(
              key: ValueKey(key),
              controller: controller,
              enabled: editable,
              onChanged: (_) => setState(() {
                    acknowledged = false;
                    received = false;
                  }),
              textDirection:
                  numeric || key == 'receipt-reference' || key == 'receipt-date'
                      ? TextDirection.ltr
                      : null,
              keyboardType: numeric
                  ? const TextInputType.numberWithOptions(decimal: true)
                  : TextInputType.text,
              decoration: InputDecoration(
                  labelText: label,
                  hintText: hint,
                  suffixIcon: onChoose == null
                      ? null
                      : IconButton(
                          onPressed: editable ? onChoose : null,
                          icon: const Icon(Icons.calendar_month),
                          tooltip: 'اختيار التاريخ والوقت'))));

  Widget cropPreview() => AspectRatio(
      aspectRatio: widget.image.width / widget.image.height,
      child: LayoutBuilder(builder: (context, constraints) {
        final size = constraints.biggest;
        return Directionality(
            textDirection: TextDirection.ltr,
            child: Stack(clipBehavior: Clip.none, children: [
              Positioned.fill(
                  child: Image.file(File(widget.image.previewPath),
                      key: ValueKey(rotation),
                      fit: BoxFit.fill,
                      errorBuilder: (_, __, ___) =>
                          const Center(child: Icon(Icons.image_outlined)))),
              Positioned.fill(
                  child: IgnorePointer(
                      child: CustomPaint(
                          painter: _ReceiptBoundary(widget.image.corners)))),
              for (var index = 0; index < 4; index++)
                Positioned(
                    left: widget.image.corners[index * 2] * size.width - 18,
                    top: widget.image.corners[index * 2 + 1] * size.height - 18,
                    child: GestureDetector(
                        onPanUpdate: editable
                            ? (details) => setState(() {
                                  widget.image.corners[index * 2] =
                                      (widget.image.corners[index * 2] +
                                              details.delta.dx / size.width)
                                          .clamp(0.0, 1.0);
                                  widget.image.corners[index * 2 + 1] =
                                      (widget.image.corners[index * 2 + 1] +
                                              details.delta.dy / size.height)
                                          .clamp(0.0, 1.0);
                                  processedPath = null;
                                })
                            : null,
                        child: Semantics(
                            label: 'زاوية الإيصال ${index + 1}',
                            child: Container(
                                width: 36,
                                height: 36,
                                decoration: BoxDecoration(
                                    color: Colors.white,
                                    border: Border.all(
                                        color: AppIdentity.brand, width: 3),
                                    shape: BoxShape.circle))))),
            ]));
      }));
}

class _ReceiptBoundary extends CustomPainter {
  const _ReceiptBoundary(this.corners);
  final List<double> corners;
  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(corners[0] * size.width, corners[1] * size.height);
    for (var index = 1; index < 4; index++) {
      path.lineTo(corners[index * 2] * size.width,
          corners[index * 2 + 1] * size.height);
    }
    path.close();
    canvas.drawPath(
        path,
        Paint()
          ..color = AppIdentity.brand
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2);
  }

  @override
  bool shouldRepaint(_ReceiptBoundary oldDelegate) => true;
}
