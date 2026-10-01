import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_identity.dart';
import 'receipt_scan.dart';

/// The payment fields a collector can fill from a receipt's text.
enum ReceiptField {
  amount('المبلغ', 'amount'),
  reference('الرقم المرجعي', 'reference_number'),
  sender('اسم المحوِّل', 'sender_name');

  const ReceiptField(this.label, this.key);
  final String label;
  final String key;
}

/// Reads a receipt photo on the phone and lets the collector tap the text
/// they need into the payment form. Nothing is uploaded; the page returns
/// the chosen values keyed by [ReceiptField.key].
class ReceiptReaderPage extends StatefulWidget {
  const ReceiptReaderPage(
      {required this.image,
      required this.scanner,
      this.reader = const DeviceReceiptTextReader(),
      super.key});
  final ReceiptImage image;
  final ReceiptScanner scanner;
  final ReceiptTextReader reader;

  @override
  State<ReceiptReaderPage> createState() => _ReceiptReaderPageState();
}

class _ReceiptReaderPageState extends State<ReceiptReaderPage> {
  final picked = <ReceiptField, String>{};
  List<String>? lines;
  String? processedPath;
  String? error;
  bool contrast = true;
  bool busy = false;
  int rotation = 0;

  Future<void> rotate() async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await widget.scanner.rotate(widget.image);
      await FileImage(File(widget.image.previewPath)).evict();
      if (mounted) setState(() => rotation++);
    } on PlatformException catch (exception) {
      if (mounted) setState(() => error = exception.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> readText() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final path =
          await widget.scanner.prepare(widget.image, contrast: contrast);
      final found = await widget.reader.read(path);
      if (mounted)
        setState(() {
          processedPath = path;
          lines = found;
        });
    } on MissingPluginException {
      if (mounted)
        setState(() => error = 'قراءة الإيصالات متاحة في تطبيق Android فقط.');
    } on PlatformException catch (exception) {
      if (mounted)
        setState(() => error = exception.message ??
            'تعذر قراءة الصورة. جرّب صورة أوضح أو أدخل البيانات يدويًا.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> chooseFrom(String line) async {
    final pieces = receiptLinePieces(line);
    final choice = await showModalBottomSheet<(String, ReceiptField?)>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (context) => _PieceSheet(pieces: pieces));
    if (choice == null || !mounted) return;
    final (piece, field) = choice;
    if (field == null) {
      await Clipboard.setData(ClipboardData(text: piece));
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('نُسخ: $piece')));
      return;
    }
    setState(() => picked[field] =
        field == ReceiptField.amount ? receiptAmount(piece)! : piece);
  }

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: !busy,
        child: Scaffold(
            body: SafeArea(
                child: Column(children: [
          AppHeader(
              title:
                  lines == null ? 'تجهيز صورة الإيصال' : 'اختر من نص الإيصال',
              subtitle: lines == null
                  ? 'حدد الإيصال ثم اقرأ النص'
                  : 'اضغط على سطر لنقله إلى حقل في الدفعة',
              onBack: busy ? null : () => Navigator.pop(context)),
          Expanded(
              child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: lines == null ? cropStep() : pickStep())),
          Padding(
              padding: const EdgeInsets.all(16),
              child: lines == null
                  ? AppAction(
                      key: const ValueKey('receipt-read'),
                      label: busy ? 'جارٍ قراءة النص...' : 'قراءة النص',
                      icon: Icons.document_scanner_outlined,
                      busy: busy,
                      onPressed: busy ? null : readText)
                  : AppAction(
                      key: const ValueKey('receipt-use'),
                      label: picked.isEmpty
                          ? 'اختر قيمة واحدة على الأقل'
                          : 'نقل البيانات إلى الدفعة',
                      icon: Icons.check,
                      onPressed: picked.isEmpty
                          ? null
                          : () => Navigator.pop(context, {
                                for (final entry in picked.entries)
                                  entry.key.key: entry.value
                              }))),
        ]))),
      );

  List<Widget> cropStep() => [
        const AppNotice(
            'حرّك الزوايا حول الإيصال. تُقرأ الصورة على الجوال ولا تُرفع إلى النظام.'),
        const SizedBox(height: 12),
        cropPreview(),
        Row(children: [
          TextButton.icon(
              onPressed: busy ? null : rotate,
              icon: const Icon(Icons.rotate_right),
              label: const Text('تدوير')),
          TextButton(
              onPressed: busy
                  ? null
                  : () => setState(
                      () => widget.image.corners = [0, 0, 1, 0, 1, 1, 0, 1]),
              child: const Text('الصورة كاملة')),
        ]),
        SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('تحسين التباين'),
            value: contrast,
            onChanged:
                busy ? null : (value) => setState(() => contrast = value)),
        if (error != null) AppNotice(error!, error: true),
      ];

  List<Widget> pickStep() => [
        ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Image.file(File(processedPath ?? widget.image.previewPath),
                height: 160,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const SizedBox.shrink())),
        const SizedBox(height: 12),
        AppPanel(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            child: Column(children: [
              for (final field in ReceiptField.values)
                Row(children: [
                  Expanded(
                      child: Text(field.label,
                          style: AppIdentity.body(13.5,
                              color: AppIdentity.faint))),
                  Flexible(
                      flex: 2,
                      child: Text(picked[field] ?? '—',
                          key: ValueKey('receipt-picked-${field.key}'),
                          textAlign: TextAlign.end,
                          overflow: TextOverflow.ellipsis,
                          style:
                              AppIdentity.body(14, weight: FontWeight.w700))),
                  IconButton(
                      tooltip: 'مسح',
                      onPressed: picked[field] == null
                          ? null
                          : () => setState(() => picked.remove(field)),
                      icon: const Icon(Icons.close, size: 18)),
                ]),
            ])),
        const SizedBox(height: 12),
        const AppNotice(
            'يقرأ الجوال الأرقام والحروف الإنجليزية فقط؛ اكتب الأسماء العربية يدويًا في الدفعة. راجع كل قيمة مع الإيصال.'),
        const SizedBox(height: 12),
        if (lines!.isEmpty)
          const AppNotice(
              'لم يُعثر على نص في الصورة. ارجع وجرّب صورة أوضح، أو أدخل البيانات يدويًا.',
              error: true)
        else
          AppPanel(
              padding: EdgeInsets.zero,
              child: Column(children: [
                for (final (index, line) in lines!.indexed)
                  ListTile(
                      key: ValueKey('receipt-line-$index'),
                      title: Text(line,
                          textDirection: TextDirection.ltr,
                          style: AppIdentity.body(14.5)),
                      trailing: const Icon(Icons.touch_app_outlined,
                          color: AppIdentity.faint),
                      onTap: () => chooseFrom(line)),
              ])),
      ];

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
                        onPanUpdate: busy
                            ? null
                            : (details) => setState(() {
                                  widget.image.corners[index * 2] =
                                      (widget.image.corners[index * 2] +
                                              details.delta.dx / size.width)
                                          .clamp(0.0, 1.0);
                                  widget.image.corners[index * 2 + 1] =
                                      (widget.image.corners[index * 2 + 1] +
                                              details.delta.dy / size.height)
                                          .clamp(0.0, 1.0);
                                }),
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

/// Pick which part of a line to use, then which field it goes to.
class _PieceSheet extends StatefulWidget {
  const _PieceSheet({required this.pieces});
  final List<String> pieces;

  @override
  State<_PieceSheet> createState() => _PieceSheetState();
}

class _PieceSheetState extends State<_PieceSheet> {
  late String piece =
      widget.pieces.length > 1 ? widget.pieces[1] : widget.pieces.first;

  @override
  Widget build(BuildContext context) => SafeArea(
      child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('اختر الجزء المطلوب', style: AppIdentity.heading(17)),
                const SizedBox(height: 10),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final option in widget.pieces)
                    ChoiceChip(
                        key: ValueKey('receipt-piece-$option'),
                        label: Text(option,
                            textDirection: TextDirection.ltr,
                            overflow: TextOverflow.ellipsis),
                        selected: option == piece,
                        onSelected: (_) => setState(() => piece = option)),
                ]),
                const SizedBox(height: 16),
                Text('ضعه في',
                    style: AppIdentity.body(14, weight: FontWeight.w700)),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final field in ReceiptField.values)
                    FilledButton.tonal(
                        key: ValueKey('receipt-to-${field.key}'),
                        onPressed: field == ReceiptField.amount &&
                                receiptAmount(piece) == null
                            ? null
                            : () => Navigator.pop(context, (piece, field)),
                        child: Text(field.label)),
                  OutlinedButton.icon(
                      key: const ValueKey('receipt-copy'),
                      onPressed: () => Navigator.pop(context, (piece, null)),
                      icon: const Icon(Icons.copy, size: 18),
                      label: const Text('نسخ')),
                ]),
              ])));
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
