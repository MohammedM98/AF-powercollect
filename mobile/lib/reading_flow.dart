import 'package:flutter/material.dart';

import 'field_store.dart';
import 'app_identity.dart';

const _background = AppIdentity.background;
const _surface = AppIdentity.surface;
const _raised = AppIdentity.raised;
const _sunken = AppIdentity.sunken;
const _line = AppIdentity.line;
const _lineSoft = AppIdentity.lineSoft;
const _ink = AppIdentity.ink;
const _muted = AppIdentity.muted;
const _faint = AppIdentity.faint;
const _brand = AppIdentity.brand;
const _good = AppIdentity.good;
const _warning = AppIdentity.warning;
const _bad = AppIdentity.bad;
TextStyle _body(double size,
        {FontWeight weight = FontWeight.normal, Color color = _ink}) =>
    AppIdentity.body(size, weight: weight, color: color).copyWith(height: 1.15);
TextStyle _heading(double size, {Color color = _ink}) =>
    AppIdentity.heading(size, color: color);
TextStyle _number(double size, {Color color = _ink}) =>
    AppIdentity.number(size, color: color)
        .copyWith(height: 1.0, fontWeight: FontWeight.w800);
BoxDecoration _card({double radius = 20}) => AppIdentity.card(radius: radius);

class ReadingFlow extends StatefulWidget {
  const ReadingFlow({
    required this.store,
    required this.online,
    required this.syncing,
    required this.message,
    required this.requiresLogin,
    required this.onSync,
    required this.onSave,
    required this.onExit,
    required this.onReauthenticate,
    super.key,
  });

  final FieldStore store;
  final bool online;
  final bool syncing;
  final String? message;
  final bool requiresLogin;
  final VoidCallback onSync;
  final Future<void> Function(List<Map<String, dynamic>>) onSave;
  final VoidCallback onExit;
  final VoidCallback onReauthenticate;

  @override
  State<ReadingFlow> createState() => _ReadingFlowState();
}

class _ReadingFlowState extends State<ReadingFlow> {
  final search = TextEditingController();
  final drafts = <int, String>{};
  String? boxKey;
  int? selectedId;
  String view = 'boxes';
  bool saving = false;
  String? saveError;
  int savedCount = 0;
  String savedBox = '';
  List<String> savedOperationIds = [];

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  String _boxKey(Map<String, dynamic> subscriber) =>
      '${subscriber['meter_box_id'] ?? subscriber['meter_box_number'] ?? 'none'}';

  String _boxNumber(Map<String, dynamic> subscriber) =>
      '${subscriber['meter_box_number'] ?? '—'}';

  List<Map<String, dynamic>> _inBox(String key) => widget.store.subscribers
      .where((subscriber) => _boxKey(subscriber) == key)
      .toList();

  Map<String, List<Map<String, dynamic>>> _groups() {
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final subscriber in widget.store.subscribers) {
      groups.putIfAbsent(_boxKey(subscriber), () => []).add(subscriber);
    }
    return groups;
  }

  Map<String, dynamic>? _queued(Map<String, dynamic> subscriber) {
    for (final reading in widget.store.queuedReadings) {
      if (reading['subscriber_id'] == subscriber['id'] &&
          reading['week_start'] == widget.store.state['week_start']) {
        return reading;
      }
    }
    return null;
  }

  bool _done(Map<String, dynamic> subscriber) =>
      subscriber['reading_status'] != null || _queued(subscriber) != null;

  bool _editable(Map<String, dynamic> subscriber) =>
      widget.store.state['can_record_readings_now'] == true &&
      !_done(subscriber);

  double _previous(Map<String, dynamic> subscriber) =>
      double.tryParse('${subscriber['previous_reading'] ?? 0}') ?? 0;

  String _formatNumber(dynamic value) {
    final number = double.tryParse('$value');
    if (number == null) return '$value';
    return number == number.roundToDouble()
        ? number.toStringAsFixed(0)
        : number.toString();
  }

  bool _ready(Map<String, dynamic> subscriber) {
    if (!_editable(subscriber)) return false;
    final value = double.tryParse(drafts[subscriber['id']] ?? '');
    return value != null && value >= _previous(subscriber);
  }

  void _openBox(String key, {int? focusId}) {
    final subscribers = _inBox(key);
    setState(() {
      boxKey = key;
      selectedId = focusId ??
          subscribers
              .where(_editable)
              .map((subscriber) => subscriber['id'] as int)
              .firstOrNull;
      view = 'box';
      saveError = null;
    });
  }

  void _back() {
    if (view == 'boxes') {
      widget.onExit();
    } else if (view == 'sync') {
      setState(() => view = boxKey == null ? 'boxes' : 'box');
    } else {
      setState(() {
        view = 'boxes';
        boxKey = null;
        selectedId = null;
        drafts.clear();
      });
    }
  }

  void _key(String key) {
    if (selectedId == null || boxKey == null || saving) return;
    final subscribers = _inBox(boxKey!);
    final current = subscribers
        .where((subscriber) => subscriber['id'] == selectedId)
        .firstOrNull;
    if (current == null || !_editable(current)) return;
    if (key == 'next') {
      final index = subscribers.indexOf(current);
      final following = subscribers
          .skip(index + 1)
          .where(_editable)
          .map((subscriber) => subscriber['id'] as int)
          .firstOrNull;
      setState(() => selectedId = following);
      return;
    }
    final value = drafts[selectedId] ?? '';
    if (key == 'delete') {
      setState(() => drafts[selectedId!] =
          value.isEmpty ? '' : value.substring(0, value.length - 1));
    } else if (key == '.') {
      if (!value.contains('.')) {
        setState(() => drafts[selectedId!] = value.isEmpty ? '0.' : '$value.');
      }
    } else if (value.length < 9) {
      setState(() => drafts[selectedId!] = value == '0' ? key : '$value$key');
    }
  }

  Future<void> _save() async {
    if (boxKey == null || saving) return;
    final ready = _inBox(boxKey!).where(_ready).toList();
    if (ready.isEmpty) return;
    final readings = ready
        .map((subscriber) => <String, dynamic>{
              'mobile_operation_id': newOperationId(),
              'subscriber_id': subscriber['id'],
              'week_start': widget.store.state['week_start'],
              'current_reading': drafts[subscriber['id']],
              'notes': '',
            })
        .toList();
    setState(() {
      saving = true;
      saveError = null;
    });
    try {
      await widget.onSave(readings);
      if (!mounted) return;
      setState(() {
        savedBox = _boxNumber(ready.first);
        savedCount = ready.length;
        savedOperationIds = readings
            .map((reading) => reading['mobile_operation_id'] as String)
            .toList();
        view = 'done';
        saving = false;
        drafts.clear();
        selectedId = null;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          saving = false;
          saveError = 'تعذر حفظ القراءات على الجهاز. حاول مجددًا.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final content = switch (view) {
      'box' => _boxView(),
      'done' => _doneView(),
      'sync' => _syncView(),
      _ => _boxesView(),
    };
    return ColoredBox(
      color: _background,
      child: SafeArea(
        child: Column(children: [
          if (view != 'done') _header(),
          if (!widget.online && view != 'done') _offlineBanner(),
          if (widget.message != null &&
              (widget.online || widget.requiresLogin) &&
              view != 'done')
            _notice(widget.message!, Icons.info_outline, _warning,
                const Color(0xFFFFF4E8)),
          if (widget.requiresLogin && view != 'done')
            TextButton(
                onPressed: widget.onReauthenticate,
                child: const Text('تسجيل الدخول مجددًا')),
          Expanded(child: content),
          if (view == 'box') ...[_saveBar(), if (selectedId != null) _keypad()],
        ]),
      ),
    );
  }

  Widget _header() {
    final subscribers =
        boxKey == null ? <Map<String, dynamic>>[] : _inBox(boxKey!);
    final first = subscribers.firstOrNull;
    final title = switch (view) {
      'box' => 'طبلون ${first == null ? '—' : _boxNumber(first)}',
      'sync' => 'حالة الإرسال',
      _ => 'إدخال القراءات',
    };
    final subtitle = switch (view) {
      'box' =>
        '${first?['meter_box_name'] ?? 'الطبلون'} · ${first?['meter_box_location'] ?? ''}',
      'sync' => '',
      _ => 'اختر طبلونًا أو ابحث',
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 10),
      child: Row(children: [
        _squareIcon(Icons.arrow_forward, 'رجوع', _back),
        const SizedBox(width: 10),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title,
                style: _heading(19),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
            if (subtitle.isNotEmpty)
              Text(subtitle,
                  style: _body(12.5, color: _faint),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
          ]),
        ),
        Stack(clipBehavior: Clip.none, children: [
          _squareIcon(
              widget.online ? Icons.cloud_outlined : Icons.cloud_off_outlined,
              'حالة الإرسال',
              () => setState(() => view = 'sync')),
          if (widget.store.queuedReadings.isNotEmpty)
            Positioned(
              top: 1,
              left: 1,
              child: Container(
                constraints: const BoxConstraints(minWidth: 17, minHeight: 17),
                padding: const EdgeInsets.symmetric(horizontal: 3),
                decoration:
                    const BoxDecoration(color: _brand, shape: BoxShape.circle),
                alignment: Alignment.center,
                child: Text('${widget.store.queuedReadings.length}',
                    style: _number(10, color: Colors.white)),
              ),
            ),
        ]),
      ]),
    );
  }

  Widget _squareIcon(IconData icon, String label, VoidCallback onPressed) =>
      Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
            color: _surface,
            border: Border.all(color: _lineSoft),
            borderRadius: BorderRadius.circular(14)),
        child: IconButton(
            padding: EdgeInsets.zero,
            iconSize: 20,
            tooltip: label,
            onPressed: onPressed,
            icon: Icon(icon, color: _muted)),
      );

  Widget _offlineBanner() => Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        child: _notice(
            'لا يوجد اتصال. تُحفظ القراءات على الجهاز وتُرسل تلقائيًا.',
            Icons.cloud_off_outlined,
            _warning,
            const Color(0xFFFFF4E8)),
      );

  Widget _notice(String text, IconData icon, Color color, Color background) =>
      Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
            color: background, borderRadius: BorderRadius.circular(14)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 17, color: color),
          const SizedBox(width: 8),
          Expanded(
              child: Text(text,
                  style: _body(13, weight: FontWeight.w600, color: color))),
        ]),
      );

  Widget _boxesView() {
    final groups = _groups();
    final query = search.text.trim().toLowerCase();
    final matchingBoxes = groups.entries.where((entry) {
      final first = entry.value.first;
      return [
        _boxNumber(first),
        '${first['meter_box_name'] ?? ''}',
        '${first['meter_box_location'] ?? ''}'
      ].any((value) => value.toLowerCase().contains(query));
    }).toList();
    final matchingSubscribers = widget.store.subscribers.where((subscriber) {
      if (query.isEmpty) return false;
      return [subscriber['full_name'], subscriber['account_number']]
          .any((value) => '$value'.toLowerCase().contains(query));
    }).toList();
    final total = widget.store.subscribers.length;
    final done = widget.store.subscribers.where(_done).length;
    return ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Container(
            height: 56,
            decoration: _card(radius: 18),
            child: TextField(
              controller: search,
              onChanged: (_) => setState(() {}),
              style: _body(17),
              decoration: InputDecoration(
                hintText: 'رقم الطبلون أو اسم المشترك',
                hintStyle: _body(16, color: _faint),
                prefixIcon: const Icon(Icons.search, color: _faint),
                filled: false,
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          if (query.isEmpty) ...[
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: _stat('قُرئت هذا الأسبوع', '$done من $total')),
              const SizedBox(width: 8),
              Expanded(
                  child: _stat('بانتظار الإرسال',
                      '${widget.store.queuedReadings.length}',
                      accent: widget.store.queuedReadings.isNotEmpty)),
            ]),
          ],
          Padding(
            padding: const EdgeInsets.fromLTRB(2, 18, 2, 10),
            child: Row(children: [
              Text(query.isEmpty ? 'طبلونات منطقتك' : 'نتائج البحث',
                  style: _heading(16)),
              const Spacer(),
              Text(
                  query.isEmpty
                      ? 'اختر طبلونًا'
                      : '${matchingBoxes.length + matchingSubscribers.length} نتيجة',
                  style: _body(12.5, color: _faint)),
            ]),
          ),
          if (total == 0)
            _empty('لم تُحمّل الطبلونات بعد',
                'اتصل بالخادم لتحميل مشتركي منطقتك.'),
          if (total > 0 && matchingBoxes.isEmpty && matchingSubscribers.isEmpty)
            _empty('لا توجد نتائج لـ "$query"',
                'جرّب رقم الطبلون أو جزءًا من الاسم.'),
          if (matchingBoxes.isNotEmpty || matchingSubscribers.isNotEmpty)
            Container(
              decoration: _card(),
              clipBehavior: Clip.antiAlias,
              child: Column(children: [
                for (final entry in matchingBoxes)
                  _boxRow(entry.key, entry.value,
                      last: entry == matchingBoxes.last &&
                          matchingSubscribers.isEmpty),
                for (final subscriber in matchingSubscribers)
                  _subscriberResult(subscriber,
                      last: subscriber == matchingSubscribers.last),
              ]),
            ),
          if (widget.store.state['can_record_readings_now'] == false)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: _notice('إدخال قراءات هذا الأسبوع غير متاح حاليًا.',
                  Icons.info_outline, _warning, const Color(0xFFFFF4E8)),
            ),
        ]);
  }

  Widget _stat(String label, String value, {bool accent = false}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
            color: _surface,
            border: Border.all(color: _lineSoft),
            borderRadius: BorderRadius.circular(16)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: _body(12, color: _faint)),
          Text(value, style: _number(18, color: accent ? _warning : _ink)),
        ]),
      );

  Widget _boxRow(String key, List<Map<String, dynamic>> subscribers,
      {bool last = false}) {
    final first = subscribers.first;
    final done = subscribers.where(_done).length;
    final number = _boxNumber(first);
    return InkWell(
      onTap: () => _openBox(key),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
            border: last
                ? null
                : const Border(bottom: BorderSide(color: _lineSoft))),
        child: Row(children: [
          _boxBadge(number),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('${first['meter_box_name'] ?? 'طبلون $number'}',
                    style: _body(15.5, weight: FontWeight.w700),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                Text('${first['meter_box_location'] ?? ''}',
                    style: _body(12.5, color: _faint),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ])),
          SizedBox(
            width: 76,
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              if (done == subscribers.length)
                _tag('مكتمل', _good, const Color(0xFFE8F6F0))
              else ...[
                Text('$done من ${subscribers.length}', style: _number(14)),
                const SizedBox(height: 4),
                ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: LinearProgressIndicator(
                    value: subscribers.isEmpty ? 0 : done / subscribers.length,
                    minHeight: 6,
                    backgroundColor: _sunken,
                    color: _good,
                  ),
                ),
              ],
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _boxBadge(String number, {bool muted = false}) => Container(
        width: 50,
        height: 50,
        alignment: Alignment.center,
        decoration: BoxDecoration(
            color: muted ? const Color(0x26FFFFFF) : const Color(0xFF262C34),
            borderRadius: BorderRadius.circular(15)),
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
                number.replaceFirst(RegExp(r'^BOX-', caseSensitive: false), ''),
                maxLines: 1,
                softWrap: false,
                style: _number(15, color: Colors.white)),
          ),
        ),
      );

  Widget _subscriberResult(Map<String, dynamic> subscriber,
          {bool last = false}) =>
      InkWell(
        onTap: () =>
            _openBox(_boxKey(subscriber), focusId: subscriber['id'] as int),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
              border: last
                  ? null
                  : const Border(bottom: BorderSide(color: _lineSoft))),
          child: Row(children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                  color: _sunken, borderRadius: BorderRadius.circular(14)),
              child: Text('${subscriber['full_name']}'.characters.first,
                  style: _number(14)),
            ),
            const SizedBox(width: 12),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('${subscriber['full_name']}',
                      style: _body(15.5, weight: FontWeight.w700),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  Text(
                      'طبلون ${_boxNumber(subscriber)} · السابقة ${_formatNumber(subscriber['previous_reading'])}',
                      style: _body(12.5, color: _faint),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ])),
            _tag(
                _done(subscriber) ? 'قيد المراجعة' : 'لم تُقرأ',
                _done(subscriber) ? _warning : _muted,
                _done(subscriber) ? const Color(0xFFFFF4E8) : _sunken),
          ]),
        ),
      );

  Widget _tag(String label, Color color, Color background) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
            color: background, borderRadius: BorderRadius.circular(20)),
        child: Text(label,
            style: _body(11.5, weight: FontWeight.w700, color: color)),
      );

  Widget _empty(String title, String subtitle) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 36),
        decoration: _card(),
        child: Column(children: [
          Text(title, style: _body(16, weight: FontWeight.w700)),
          Text(subtitle,
              style: _body(13, color: _faint), textAlign: TextAlign.center),
        ]),
      );

  Widget _boxView() {
    final subscribers =
        boxKey == null ? <Map<String, dynamic>>[] : _inBox(boxKey!);
    if (subscribers.isEmpty)
      return _empty('الطبلون غير متاح', 'ارجع إلى قائمة الطبلونات.');
    final first = subscribers.first;
    final selected = subscribers
        .where((subscriber) => subscriber['id'] == selectedId)
        .firstOrNull;
    final draft = selected == null ? null : drafts[selected['id']];
    final value = double.tryParse(draft ?? '');
    final previous = selected == null ? 0 : _previous(selected);
    final low = value != null && value < previous;
    final done = subscribers.where(_done).length;
    return ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [
                  Color(0xFF262C34),
                  Color(0xFF1C2127),
                  Color(0xFF111418)
                ]),
                borderRadius: BorderRadius.circular(20)),
            child: Row(children: [
              _boxBadge(_boxNumber(first), muted: true),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${first['meter_box_name'] ?? 'الطبلون'}',
                          style: _body(16,
                              weight: FontWeight.w700, color: Colors.white),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                      Text('القراءة السابقة من النظام الأساسي',
                          style: _body(12.5, color: const Color(0xFFAEB6C1))),
                    ]),
              ),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('$done من ${subscribers.length}',
                    style: _number(20, color: Colors.white)),
                Text('قُرئت',
                    style: _body(12.5, color: const Color(0xFFAEB6C1))),
              ]),
            ]),
          ),
          const SizedBox(height: 12),
          Container(
            decoration: _card(),
            clipBehavior: Clip.antiAlias,
            child: Column(children: [
              for (var index = 0; index < subscribers.length; index++)
                _readingRow(subscribers[index], index,
                    last: index == subscribers.length - 1),
            ]),
          ),
          const SizedBox(height: 10),
          if (saveError != null)
            _notice(
                saveError!, Icons.error_outline, _bad, const Color(0xFFFFEEEE))
          else if (low)
            _notice(
                'القراءة الجديدة أقل من السابقة (${_formatNumber(previous)}). تحقّق من الرقم.',
                Icons.warning_amber_rounded,
                _bad,
                const Color(0xFFFFEEEE))
          else
            _notice(
                'بعد الحفظ تصل القراءات إلى النظام الأساسي بحالة «قيد المراجعة»، ويعتمدها المدقق.',
                Icons.info_outline,
                _muted,
                _raised),
        ]);
  }

  Widget _readingRow(Map<String, dynamic> subscriber, int index,
      {bool last = false}) {
    final selected = selectedId == subscriber['id'];
    final queued = _queued(subscriber);
    final finished = _done(subscriber);
    final draft = drafts[subscriber['id']];
    final value = double.tryParse(draft ?? '');
    final previous = _previous(subscriber);
    final low = value != null && value < previous;
    final consumption = value == null ? null : value - previous;
    final shownReading =
        queued?['current_reading'] ?? subscriber['current_reading'];
    return InkWell(
      onTap: _editable(subscriber)
          ? () => setState(() => selectedId = subscriber['id'] as int)
          : null,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFF9EEF0) : _surface,
          border: Border(
              bottom:
                  last ? BorderSide.none : const BorderSide(color: _lineSoft),
              right: selected
                  ? const BorderSide(color: _brand, width: 3)
                  : BorderSide.none),
        ),
        child: Row(children: [
          Container(
            width: 30,
            height: 30,
            alignment: Alignment.center,
            decoration: BoxDecoration(
                color: selected ? _brand : _sunken,
                borderRadius: BorderRadius.circular(10)),
            child: Text('${index + 1}',
                style: _number(13, color: selected ? Colors.white : _ink)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${subscriber['full_name']}',
                  style: _body(15, weight: FontWeight.w700),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
              Text('السابقة ${_formatNumber(subscriber['previous_reading'])}',
                  style: _body(12.5, color: _faint),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ]),
          ),
          const SizedBox(width: 8),
          Container(
            width: 124,
            height: 50,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: finished
                  ? const Color(0xFFE8F6F0)
                  : selected
                      ? _surface
                      : _raised,
              border: Border.all(
                  color: low
                      ? _bad
                      : selected
                          ? _brand
                          : finished
                              ? Colors.transparent
                              : _line,
                  width: 1.5),
              borderRadius: BorderRadius.circular(14),
              boxShadow: selected
                  ? const [BoxShadow(color: Color(0x1FA51D26), spreadRadius: 4)]
                  : null,
            ),
            child:
                Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              if (draft != null && draft.isNotEmpty) ...[
                Text(draft,
                    style: _number(20), textDirection: TextDirection.ltr),
                Text(
                    low
                        ? 'أقل من السابقة'
                        : '${_formatNumber(consumption)} ك.و.س',
                    style: _body(11.5,
                        weight: low ? FontWeight.w700 : FontWeight.normal,
                        color: low ? _bad : _faint)),
              ] else if (finished) ...[
                Text(_formatNumber(shownReading), style: _number(20)),
                Text(queued != null ? 'على الجهاز' : 'قيد المراجعة',
                    style: _body(11.5, weight: FontWeight.w700, color: _good)),
              ] else if (selected)
                Text('اكتب القراءة', style: _body(13, color: _faint))
              else
                Text('اضغط للإدخال', style: _body(13, color: _faint)),
            ]),
          ),
          if (finished) const SizedBox(width: 0),
        ]),
      ),
    );
  }

  Widget _saveBar() {
    final count = boxKey == null ? 0 : _inBox(boxKey!).where(_ready).length;
    final label = count == 0
        ? 'اكتب القراءات أولًا'
        : count == 1
            ? 'حفظ قراءة واحدة وإرسالها للمراجعة'
            : count == 2
                ? 'حفظ قراءتين وإرسالهما للمراجعة'
                : 'حفظ $count قراءات وإرسالها للمراجعة';
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      decoration: const BoxDecoration(
          color: _background,
          border: Border(top: BorderSide(color: _lineSoft))),
      child: _button(label,
          onPressed: count == 0 || saving ? null : _save,
          primary: true,
          icon: Icons.check),
    );
  }

  Widget _button(String text,
      {required VoidCallback? onPressed,
      bool primary = false,
      IconData? icon}) {
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: Opacity(
        opacity: onPressed == null && primary ? 0.5 : 1,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: primary ? null : _surface,
            gradient: primary
                ? const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xFFB8232C), Color(0xFF7D121B)])
                : null,
            border: primary ? null : Border.all(color: _line),
            borderRadius: BorderRadius.circular(17),
          ),
          child: TextButton.icon(
            onPressed: onPressed,
            icon: icon == null ? const SizedBox.shrink() : Icon(icon, size: 20),
            label: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis),
            style: TextButton.styleFrom(
                foregroundColor: primary ? Colors.white : _ink,
                disabledForegroundColor:
                    primary ? const Color(0xCCFFFFFF) : _faint,
                textStyle: _body(15, weight: FontWeight.w700),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(17))),
          ),
        ),
      ),
    );
  }

  Widget _keypad() => AppKeypad(onKey: _key, enabled: !saving);

  Widget _doneView() {
    final pending = widget.store.queuedReadings
        .where((reading) =>
            savedOperationIds.contains(reading['mobile_operation_id']))
        .toList();
    final rejected = pending.any((reading) => reading['sync_error'] != null);
    final description = rejected
        ? 'حُفظت القراءات على الجهاز. تحقّق من حالة الإرسال لمعالجة القراءة المرفوضة.'
        : pending.isNotEmpty
            ? 'حُفظت على الجهاز، وستُرسل إلى النظام الأساسي فور عودة الاتصال.'
            : 'وصلت إلى النظام الأساسي بحالة «قيد المراجعة» بانتظار المدقق.';
    final status = rejected
        ? 'تعذر الإرسال'
        : pending.isNotEmpty
            ? 'بانتظار الإرسال'
            : 'قيد المراجعة';
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 30, 20, 24),
      children: [
        const SizedBox(height: 30),
        Center(
          child: Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                  color: const Color(0xFFE8F6F0),
                  borderRadius: BorderRadius.circular(28)),
              child: const Icon(Icons.check, size: 42, color: _good)),
        ),
        const SizedBox(height: 16),
        Text('تم حفظ القراءات',
            style: _heading(24), textAlign: TextAlign.center),
        const SizedBox(height: 4),
        Text(description,
            style: _body(14.5, color: _muted), textAlign: TextAlign.center),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          decoration: _card(),
          child: Column(children: [
            _receiptRow('الطبلون', savedBox),
            _receiptRow('عدد القراءات', '$savedCount'),
            _receiptRow('الحالة', status, last: true),
          ]),
        ),
        const SizedBox(height: 20),
        _button('العودة إلى الطبلونات', onPressed: _back, primary: true),
      ],
    );
  }

  Widget _receiptRow(String label, String value, {bool last = false}) =>
      Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
            border:
                last ? null : const Border(bottom: BorderSide(color: _line))),
        child: Row(children: [
          Text(label, style: _body(14.5, color: _muted)),
          const Spacer(),
          Text(value, style: _body(14.5, weight: FontWeight.w700)),
        ]),
      );

  Widget _syncView() {
    final queue = widget.store.queuedReadings;
    final subscribers = widget.store.subscribers;
    return ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Row(children: [
            Expanded(child: _stat('بانتظار الإرسال', '${queue.length}')),
            const SizedBox(width: 8),
            Expanded(
                child: _stat(
                    'آخر تحديث للبيانات',
                    widget.store.state['roster_updated_at'] == null
                        ? '—'
                        : 'اليوم')),
          ]),
          Padding(
            padding: const EdgeInsets.fromLTRB(2, 18, 2, 10),
            child: Text('لم تُرسل بعد', style: _heading(16)),
          ),
          Container(
            decoration: _card(),
            child: queue.isEmpty
                ? _empty('لا يوجد شيء بانتظار الإرسال',
                    'كل القراءات وصلت إلى النظام الأساسي.')
                : Column(children: [
                    for (var index = 0; index < queue.length; index++)
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                            border: index == queue.length - 1
                                ? null
                                : const Border(
                                    bottom: BorderSide(color: _lineSoft))),
                        child: Row(children: [
                          const Icon(Icons.schedule, color: _warning),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                      'قراءة ${queue[index]['current_reading']}',
                                      style:
                                          _body(15, weight: FontWeight.w700)),
                                  Text(
                                      '${subscribers.where((subscriber) => subscriber['id'] == queue[index]['subscriber_id']).firstOrNull?['full_name'] ?? 'مشترك #${queue[index]['subscriber_id']}'}',
                                      style: _body(12.5, color: _faint)),
                                ]),
                          ),
                          _tag(
                              queue[index]['sync_error'] == null
                                  ? 'على الجهاز'
                                  : 'تعذر الإرسال',
                              _warning,
                              const Color(0xFFFFF4E8)),
                        ]),
                      ),
                  ]),
          ),
          const SizedBox(height: 14),
          _button(
              widget.online ? 'إرسال الآن' : 'سيتم الإرسال عند عودة الاتصال',
              onPressed: widget.online && !widget.syncing && queue.isNotEmpty
                  ? widget.onSync
                  : null,
              primary: true),
        ]);
  }
}
