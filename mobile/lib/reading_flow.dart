import 'dart:async';

import 'package:flutter/material.dart';

import 'app_identity.dart';
import 'field_store.dart';
import 'queued_readings.dart';

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

/// How a typed reading compares with the meter's history.
typedef _Verdict = ({String text, Color color, IconData icon});

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
    required this.onDiscard,
    this.onRefresh,
    this.onFocusChanged,
    this.focusSubscriberId,
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
  final Future<void> Function(Map<String, dynamic>) onDiscard;
  final Future<void> Function()? onRefresh;

  /// Told whether a box (or another inner page) is open, so the app can
  /// give the keypad the whole screen.
  final ValueChanged<bool>? onFocusChanged;

  /// A subscriber whose box opens straight away, with the keypad on them.
  final int? focusSubscriberId;

  @override
  State<ReadingFlow> createState() => _ReadingFlowState();
}

class _ReadingFlowState extends State<ReadingFlow> with WidgetsBindingObserver {
  final search = TextEditingController();
  late final Map<int, String> drafts = widget.store.readingDrafts;
  final rowKeys = <int, GlobalKey>{};
  Timer? draftSave;
  Timer? reveal;
  String? boxKey;
  int? selectedId;
  bool keypadOpen = false;
  String view = 'boxes';
  String filter = 'all';
  bool saving = false;
  String? saveError;
  int savedCount = 0;
  String savedBox = '';
  List<String> savedOperationIds = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final focus = widget.store.subscribers
        .where((subscriber) => subscriber['id'] == widget.focusSubscriberId)
        .firstOrNull;
    if (focus != null) {
      boxKey = _boxKey(focus);
      selectedId = focus['id'] as int;
      keypadOpen = _editable(focus);
      view = 'box';
      WidgetsBinding.instance.addPostFrameCallback((_) {
        widget.onFocusChanged?.call(true);
        _revealSelected();
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) _persistDrafts();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    if (draftSave?.isActive ?? false) _persistDrafts();
    draftSave?.cancel();
    reveal?.cancel();
    search.dispose();
    super.dispose();
  }

  void _draftsChanged() {
    draftSave?.cancel();
    draftSave = Timer(const Duration(milliseconds: 400), _persistDrafts);
  }

  void _persistDrafts() {
    draftSave?.cancel();
    unawaited(widget.store
        .saveReadingDrafts(Map.of(drafts))
        .catchError((Object _) {}));
  }

  void _setView(String next) {
    setState(() => view = next);
    widget.onFocusChanged?.call(next != 'boxes');
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

  bool get _entryOpen => widget.store.state['can_record_readings_now'] == true;

  bool _editable(Map<String, dynamic> subscriber) =>
      _entryOpen && !_done(subscriber);

  bool _hasDraft(Map<String, dynamic> subscriber) =>
      (drafts[subscriber['id']] ?? '').isNotEmpty;

  double _previous(Map<String, dynamic> subscriber) =>
      double.tryParse('${subscriber['previous_reading'] ?? 0}') ?? 0;

  /// The subscriber's last weeks, newest first, as the server sent them.
  List<Map<String, dynamic>> _history(Map<String, dynamic> subscriber) =>
      (subscriber['recent_readings'] as List? ?? [])
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();

  /// Their usual weekly consumption, from the weeks the server sent.
  double? _usual(Map<String, dynamic> subscriber) {
    final weeks = _history(subscriber)
        .map((week) => double.tryParse('${week['consumption']}'))
        .whereType<double>()
        .toList();
    if (weeks.isEmpty) return null;
    return weeks.reduce((sum, week) => sum + week) / weeks.length;
  }

  _Verdict? _verdict(Map<String, dynamic> subscriber, double? value) {
    if (value == null) return null;
    final previous = _previous(subscriber);
    if (value < previous) {
      return (
        text: 'أقل من السابقة (${AppIdentity.reading(previous)})',
        color: _bad,
        icon: Icons.error_outline,
      );
    }
    final usual = _usual(subscriber);
    if (usual == null || usual <= 0) return null;
    final consumption = value - previous;
    if (consumption > usual * 2 && consumption - usual >= 10) {
      return (
        text:
            'أعلى من المعتاد بكثير (${(consumption / usual).toStringAsFixed(1)}×)',
        color: _warning,
        icon: Icons.trending_up_rounded,
      );
    }
    if (consumption == 0) {
      return (
        text: 'لا استهلاك هذا الأسبوع، تأكّد من العداد',
        color: _warning,
        icon: Icons.info_outline,
      );
    }
    return (
      text: 'ضمن المعتاد',
      color: _good,
      icon: Icons.check_circle_outline,
    );
  }

  bool _ready(Map<String, dynamic> subscriber) {
    if (!_editable(subscriber)) return false;
    final value = double.tryParse(drafts[subscriber['id']] ?? '');
    return value != null && value >= _previous(subscriber);
  }

  void _openBox(String key, {int? focusId}) {
    final subscribers = _inBox(key);
    final first = focusId ??
        subscribers
            .where((subscriber) => _editable(subscriber) && !_ready(subscriber))
            .map((subscriber) => subscriber['id'] as int)
            .firstOrNull ??
        subscribers
            .where(_editable)
            .map((subscriber) => subscriber['id'] as int)
            .firstOrNull;
    final focus = subscribers
        .where((subscriber) => subscriber['id'] == first)
        .firstOrNull;
    setState(() {
      boxKey = key;
      selectedId = first;
      keypadOpen = focus != null && _editable(focus);
      saveError = null;
    });
    _setView('box');
    _revealSelected();
  }

  void _back() {
    if (view == 'boxes') {
      widget.onExit();
    } else if (view == 'sync') {
      _setView(boxKey == null ? 'boxes' : 'box');
    } else if (view == 'box' && keypadOpen) {
      setState(() => keypadOpen = false);
    } else {
      setState(() {
        boxKey = null;
        selectedId = null;
        keypadOpen = false;
      });
      _setView('boxes');
    }
  }

  void _select(Map<String, dynamic> subscriber) {
    if (_editable(subscriber)) {
      setState(() {
        selectedId = subscriber['id'] as int;
        keypadOpen = true;
      });
      _revealSelected();
      return;
    }
    final queued = _queued(subscriber);
    if (queued != null) {
      unawaited(_askToReenter(queued, subscriber));
      return;
    }
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
          content: Text(_entryOpen
              ? 'وصلت قراءة ${subscriber['full_name']} إلى النظام. لتعديلها تواصل مع المدقق.'
              : 'إدخال قراءات هذا الأسبوع غير متاح حاليًا.')));
  }

  /// Scroll the chosen subscriber into view once the keypad has opened.
  void _revealSelected() {
    reveal?.cancel();
    reveal = Timer(const Duration(milliseconds: 240), () {
      final context = rowKeys[selectedId]?.currentContext;
      if (mounted && context != null && context.mounted) {
        Scrollable.ensureVisible(context,
            alignment: .3,
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOutCubic);
      }
    });
  }

  Future<void> _askToReenter(
      Map<String, dynamic> reading, Map<String, dynamic> subscriber) async {
    final reenter = await showModalBottomSheet<bool>(
        context: context,
        builder: (context) => SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('${subscriber['full_name']}', style: _heading(19)),
                      const SizedBox(height: 4),
                      Text(
                          reading['sync_error'] == null
                              ? 'القراءة محفوظة على الجهاز ولم تُرسل بعد، ويمكنك تعديلها.'
                              : 'رفض الخادم هذه القراءة: ${reading['sync_error']}',
                          style: _body(13.5, color: _muted)),
                      const SizedBox(height: 14),
                      AppReadingCompare(
                          previous: AppIdentity.reading(
                              subscriber['previous_reading']),
                          current:
                              AppIdentity.reading(reading['current_reading']),
                          consumption: _consumptionText(
                              subscriber,
                              double.tryParse(
                                  '${reading['current_reading']}'))),
                      const SizedBox(height: 16),
                      AppAction(
                          label: 'إعادة إدخال القراءة',
                          icon: Icons.edit_outlined,
                          onPressed: () => Navigator.pop(context, true)),
                      const SizedBox(height: 8),
                      AppAction(
                          label: 'إبقاؤها كما هي',
                          primary: false,
                          onPressed: () => Navigator.pop(context, false)),
                    ]),
              ),
            ));
    if (reenter == true) await _reenter(reading);
  }

  Future<void> _reenter(Map<String, dynamic> reading) async {
    if (widget.syncing) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(
            content: Text('جارٍ الإرسال الآن. أعد المحاولة بعد لحظات.')));
      return;
    }
    await widget.store.reopenReading(reading['mobile_operation_id'] as String);
    if (!mounted) return;
    final subscriber = widget.store.subscribers
        .where((item) => item['id'] == reading['subscriber_id'])
        .firstOrNull;
    setState(() {
      drafts[reading['subscriber_id'] as int] = '${reading['current_reading']}';
      if (subscriber != null) {
        boxKey = _boxKey(subscriber);
        selectedId = subscriber['id'] as int;
        keypadOpen = _editable(subscriber);
      }
    });
    _setView(subscriber == null ? 'boxes' : 'box');
    _revealSelected();
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
      final following = [
        ...subscribers.skip(index + 1),
        ...subscribers.take(index),
      ]
          .where((subscriber) => _editable(subscriber) && !_ready(subscriber))
          .map((subscriber) => subscriber['id'] as int)
          .firstOrNull;
      setState(() {
        if (following == null) {
          keypadOpen = false;
        } else {
          selectedId = following;
        }
      });
      if (following != null) _revealSelected();
      return;
    }
    final value = drafts[selectedId] ?? '';
    if (key == 'clear') {
      setState(() => drafts.remove(selectedId));
    } else if (key == 'delete') {
      setState(() => drafts[selectedId!] =
          value.isEmpty ? '' : value.substring(0, value.length - 1));
    } else if (key == '.') {
      if (!value.contains('.')) {
        setState(() => drafts[selectedId!] = value.isEmpty ? '0.' : '$value.');
      }
    } else if (value.length < 9) {
      setState(() => drafts[selectedId!] = value == '0' ? key : '$value$key');
    }
    _draftsChanged();
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
    draftSave?.cancel();
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
        saving = false;
        for (final subscriber in ready) {
          drafts.remove(subscriber['id']);
        }
        selectedId = null;
        keypadOpen = false;
      });
      _setView('done');
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
    final selected = view != 'box' || boxKey == null
        ? null
        : _inBox(boxKey!)
            .where((subscriber) => subscriber['id'] == selectedId)
            .firstOrNull;
    final showKeypad = keypadOpen && selected != null && _editable(selected);
    // While typing, the keypad and comparison need the room; the header's
    // cloud icon still shows when the phone is offline.
    final showBanners = view != 'done' && !(view == 'box' && showKeypad);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: ColoredBox(
        color: _background,
        child: SafeArea(
          bottom: view != 'boxes',
          child: Column(children: [
            if (view != 'done') _header(),
            if (!widget.online && showBanners) _offlineBanner(),
            if (widget.message != null &&
                (widget.online || widget.requiresLogin) &&
                showBanners)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                child: _notice(widget.message!, Icons.info_outline, _warning,
                    const Color(0xFFFFF4E8)),
              ),
            if (widget.requiresLogin && view != 'done')
              TextButton(
                  onPressed: widget.onReauthenticate,
                  child: const Text('تسجيل الدخول مجددًا')),
            Expanded(
                child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              switchInCurve: Curves.easeOutCubic,
              transitionBuilder: (child, animation) => FadeTransition(
                  opacity: animation,
                  child: SlideTransition(
                      position:
                          Tween(begin: const Offset(0, .02), end: Offset.zero)
                              .animate(animation),
                      child: child)),
              child: KeyedSubtree(key: ValueKey(view), child: content),
            )),
            if (view == 'box') ...[
              AppReveal(
                  visible: showKeypad,
                  child: selected == null
                      ? const SizedBox(width: double.infinity)
                      : _comparePanel(selected)),
              _saveBar(),
              AppReveal(
                  visible: showKeypad,
                  child: AppKeypad(
                      onKey: _key,
                      enabled: !saving,
                      nextLabel: _hasFollowing(selected) ? 'التالي' : 'تم',
                      onClose: () => setState(() => keypadOpen = false))),
            ],
          ]),
        ),
      ),
    );
  }

  bool _hasFollowing(Map<String, dynamic>? selected) {
    if (selected == null || boxKey == null) return false;
    return _inBox(boxKey!).any((subscriber) =>
        subscriber['id'] != selected['id'] &&
        _editable(subscriber) &&
        !_ready(subscriber));
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
    final weekStart = widget.store.state['week_start'];
    final weekEnd = widget.store.state['week_end'];
    final subtitle = switch (view) {
      'box' => [
          '${first?['meter_box_name'] ?? 'الطبلون'}',
          if ('${first?['meter_box_location'] ?? ''}'.isNotEmpty)
            '${first?['meter_box_location']}',
        ].join(' · '),
      'sync' => 'القراءات المحفوظة على الجهاز',
      _ => weekStart == null
          ? 'اختر طبلونًا أو ابحث'
          : 'أسبوع ${AppIdentity.shortDate(weekStart)} – ${AppIdentity.shortDate(weekEnd)}',
    };
    return AppHeader(
        title: title,
        subtitle: subtitle,
        onBack: view == 'boxes' ? null : _back,
        onSync: view == 'sync' ? null : () => _setView('sync'),
        online: widget.online,
        syncing: widget.syncing,
        pending: widget.store.queuedReadings.length);
  }

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

  Widget _refreshable(Widget list) => widget.onRefresh == null
      ? list
      : RefreshIndicator(
          color: _brand, onRefresh: widget.onRefresh!, child: list);

  Widget _boxesView() {
    final groups = _groups();
    final query = search.text.trim().toLowerCase();
    final matchingBoxes = groups.entries.where((entry) {
      final done = entry.value.where(_done).length;
      if (query.isEmpty &&
          filter == 'remaining' &&
          done == entry.value.length) {
        return false;
      }
      if (query.isEmpty && filter == 'done' && done < entry.value.length) {
        return false;
      }
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
    final draftBox = groups.entries
        .where((entry) => entry.value.any(
            (subscriber) => _editable(subscriber) && _hasDraft(subscriber)))
        .firstOrNull;
    return _refreshable(ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          if (query.isEmpty) ...[
            _progressCard(done, total),
            const SizedBox(height: 12),
          ],
          if (query.isEmpty && draftBox != null) ...[
            _resumeCard(draftBox.key, draftBox.value),
            const SizedBox(height: 12),
          ],
          Container(
            height: 52,
            decoration: _card(radius: 16),
            child: TextField(
              controller: search,
              onChanged: (_) => setState(() {}),
              style: _body(16),
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'رقم الطبلون أو اسم المشترك',
                hintStyle: _body(15, color: _faint),
                prefixIcon: const Icon(Icons.search, color: _faint),
                suffixIcon: search.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'مسح البحث',
                        icon: const Icon(Icons.close, color: _faint),
                        onPressed: () => setState(search.clear)),
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(2, 16, 2, 10),
            child: Row(children: [
              Text(query.isEmpty ? 'طبلونات منطقتك' : 'نتائج البحث',
                  style: _heading(16)),
              const Spacer(),
              if (query.isNotEmpty)
                Text(
                    '${matchingBoxes.length + matchingSubscribers.length} نتيجة',
                    style: _body(12.5, color: _faint)),
            ]),
          ),
          if (query.isEmpty && total > 0) ...[
            Row(children: [
              _filterChip('all', 'الكل'),
              const SizedBox(width: 6),
              _filterChip('remaining', 'المتبقية'),
              const SizedBox(width: 6),
              _filterChip('done', 'المكتملة'),
            ]),
            const SizedBox(height: 10),
          ],
          if (total == 0)
            _empty(Icons.download_outlined, 'لم تُحمّل الطبلونات بعد',
                'اتصل بالخادم لتحميل مشتركي منطقتك.'),
          if (total > 0 && matchingBoxes.isEmpty && matchingSubscribers.isEmpty)
            query.isEmpty
                ? _empty(
                    filter == 'remaining'
                        ? Icons.task_alt
                        : Icons.inventory_2_outlined,
                    filter == 'remaining'
                        ? 'قُرئت كل الطبلونات'
                        : 'لا توجد طبلونات مكتملة بعد',
                    filter == 'remaining'
                        ? 'أحسنت! لا يوجد ما تبقّى لهذا الأسبوع.'
                        : 'تظهر هنا الطبلونات بعد قراءة كل مشتركيها.')
                : _empty(Icons.search_off, 'لا توجد نتائج لـ "$query"',
                    'جرّب رقم الطبلون أو جزءًا من الاسم.'),
          if (matchingBoxes.isNotEmpty || matchingSubscribers.isNotEmpty)
            Container(
              decoration: _card(),
              clipBehavior: Clip.antiAlias,
              child: Material(
                color: _surface,
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
            ),
          if (widget.store.state['can_record_readings_now'] == false)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: _notice('إدخال قراءات هذا الأسبوع غير متاح حاليًا.',
                  Icons.info_outline, _warning, const Color(0xFFFFF4E8)),
            ),
        ]));
  }

  Widget _progressCard(int done, int total) {
    final pending = widget.store.queuedReadings.length;
    final ratio = total == 0 ? 0.0 : done / total;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          gradient: AppIdentity.hero, borderRadius: BorderRadius.circular(22)),
      child: Row(children: [
        SizedBox(
          width: 64,
          height: 64,
          child: Stack(alignment: Alignment.center, children: [
            SizedBox.expand(
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: ratio),
                duration: const Duration(milliseconds: 600),
                curve: Curves.easeOutCubic,
                builder: (context, value, _) => CircularProgressIndicator(
                    value: value,
                    strokeWidth: 6,
                    strokeCap: StrokeCap.round,
                    backgroundColor: Colors.white.withValues(alpha: .12),
                    color: const Color(0xFF6EE7B7)),
              ),
            ),
            Text('${(ratio * 100).round()}%',
                style: _number(14, color: Colors.white)),
          ]),
        ),
        const SizedBox(width: 16),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('قُرئت هذا الأسبوع',
                style: _body(12.5, color: const Color(0xFFAEB6C1))),
            const SizedBox(height: 4),
            Text('$done من $total', style: _number(22, color: Colors.white)),
            const SizedBox(height: 6),
            Text(
                pending == 0
                    ? 'كل القراءات أُرسلت'
                    : '${AppIdentity.readingsCount(pending)} بانتظار الإرسال',
                style: _body(12.5,
                    weight: FontWeight.w600,
                    color: pending == 0
                        ? const Color(0xFF6EE7B7)
                        : const Color(0xFFFCD34D))),
          ]),
        ),
      ]),
    );
  }

  Widget _resumeCard(String key, List<Map<String, dynamic>> subscribers) {
    final count = subscribers
        .where((subscriber) => _editable(subscriber) && _hasDraft(subscriber))
        .length;
    return Material(
      color: const Color(0xFFF9EEF0),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        key: const ValueKey('resume-drafts'),
        borderRadius: BorderRadius.circular(18),
        onTap: () => _openBox(key),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            const Icon(Icons.edit_note_rounded, color: _brand, size: 28),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('أكمل من حيث توقفت',
                        style: _body(15, weight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(
                        '${AppIdentity.readingsCount(count)} لم تُحفظ بعد في طبلون ${_boxNumber(subscribers.first)}',
                        style: _body(12.5, color: _muted)),
                  ]),
            ),
            const Icon(Icons.chevron_left, color: _brand),
          ]),
        ),
      ),
    );
  }

  Widget _filterChip(String value, String label) => ChoiceChip(
        label: Text(label),
        selected: filter == value,
        showCheckmark: false,
        labelStyle: _body(13,
            weight: FontWeight.w700,
            color: filter == value ? Colors.white : _muted),
        selectedColor: _ink,
        backgroundColor: _surface,
        side: BorderSide(color: filter == value ? _ink : _line),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
        onSelected: (_) => setState(() => filter = value),
      );

  Widget _boxRow(String key, List<Map<String, dynamic>> subscribers,
      {bool last = false}) {
    final first = subscribers.first;
    final done = subscribers.where(_done).length;
    final drafted = subscribers
        .where((subscriber) => _editable(subscriber) && _hasDraft(subscriber))
        .length;
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
          _boxBadge(number, complete: done == subscribers.length),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('${first['meter_box_name'] ?? 'طبلون $number'}',
                    style: _body(15.5, weight: FontWeight.w700),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Row(children: [
                  Flexible(
                    child: Text(
                        '${first['meter_box_location'] ?? ''}'.isEmpty
                            ? '${subscribers.length} مشترك'
                            : '${first['meter_box_location']} · ${subscribers.length} مشترك',
                        style: _body(12.5, color: _faint),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                  ),
                  if (drafted > 0) ...[
                    const SizedBox(width: 6),
                    _tag('مسودة $drafted', _brand, const Color(0xFFF9EEF0)),
                  ],
                ]),
              ])),
          const SizedBox(width: 8),
          SizedBox(
            width: 72,
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              if (done == subscribers.length)
                _tag('مكتمل', _good, const Color(0xFFE8F6F0))
              else ...[
                Text('$done من ${subscribers.length}', style: _number(14)),
                const SizedBox(height: 5),
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
          const SizedBox(width: 4),
          const Icon(Icons.chevron_left, color: _faint, size: 20),
        ]),
      ),
    );
  }

  Widget _boxBadge(String number,
          {bool muted = false, bool complete = false}) =>
      Container(
        width: 50,
        height: 50,
        alignment: Alignment.center,
        decoration: BoxDecoration(
            color: muted
                ? const Color(0x26FFFFFF)
                : complete
                    ? _good
                    : const Color(0xFF262C34),
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
                      'طبلون ${_boxNumber(subscriber)} · السابقة ${AppIdentity.reading(subscriber['previous_reading'])}',
                      style: _body(12.5, color: _faint),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ])),
            _statusTag(subscriber),
          ]),
        ),
      );

  Widget _statusTag(Map<String, dynamic> subscriber) {
    final queued = _queued(subscriber);
    if (queued != null) {
      return queued['sync_error'] == null
          ? _tag('على الجهاز', _warning, const Color(0xFFFFF4E8))
          : _tag('تعذر الإرسال', _bad, const Color(0xFFFFEEEE));
    }
    return switch (subscriber['reading_status']) {
      'approved' => _tag('معتمدة', _good, const Color(0xFFE8F6F0)),
      'pending' => _tag('قيد المراجعة', _warning, const Color(0xFFFFF4E8)),
      _ => _hasDraft(subscriber)
          ? _tag('مسودة', _brand, const Color(0xFFF9EEF0))
          : _tag('لم تُقرأ', _muted, _sunken),
    };
  }

  Widget _tag(String label, Color color, Color background) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
            color: background, borderRadius: BorderRadius.circular(20)),
        child: Text(label,
            style: _body(11.5, weight: FontWeight.w700, color: color)),
      );

  Widget _empty(IconData icon, String title, String subtitle) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 30),
        decoration: _card(),
        child: Column(children: [
          Icon(icon, size: 34, color: _faint),
          const SizedBox(height: 10),
          Text(title,
              style: _body(16, weight: FontWeight.w700),
              textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(subtitle,
              style: _body(13, color: _faint), textAlign: TextAlign.center),
        ]),
      );

  Widget _boxView() {
    final subscribers =
        boxKey == null ? <Map<String, dynamic>>[] : _inBox(boxKey!);
    if (subscribers.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: _empty(Icons.inventory_2_outlined, 'الطبلون غير متاح',
            'ارجع إلى قائمة الطبلونات.'),
      );
    }
    final done = subscribers.where(_done).length;
    final ready = subscribers.where(_ready).length;
    return ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: _card(radius: 18),
            child: Column(children: [
              Row(children: [
                Text('قُرئت $done من ${subscribers.length}',
                    style: _body(14, weight: FontWeight.w700)),
                const Spacer(),
                if (ready > 0)
                  _tag('${AppIdentity.readingsCount(ready)} جاهزة للحفظ',
                      _brand, const Color(0xFFF9EEF0)),
              ]),
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: Row(children: [
                  if (done > 0)
                    Expanded(
                        flex: done, child: Container(height: 7, color: _good)),
                  if (ready > 0)
                    Expanded(
                        flex: ready,
                        child: Container(height: 7, color: _brand)),
                  if (subscribers.length - done - ready > 0)
                    Expanded(
                        flex: subscribers.length - done - ready,
                        child: Container(height: 7, color: _sunken)),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 12),
          Container(
            decoration: _card(),
            clipBehavior: Clip.antiAlias,
            child: Material(
              color: _surface,
              child: Column(children: [
                for (var index = 0; index < subscribers.length; index++)
                  _readingRow(subscribers[index], index,
                      last: index == subscribers.length - 1),
              ]),
            ),
          ),
          const SizedBox(height: 10),
          if (saveError != null)
            _notice(
                saveError!, Icons.error_outline, _bad, const Color(0xFFFFEEEE))
          else
            _notice(
                'اضغط على أي مشترك لإدخال قراءته أو تعديلها. بعد الحفظ تصل القراءات إلى النظام بحالة «قيد المراجعة».',
                Icons.info_outline,
                _muted,
                _raised),
        ]);
  }

  String? _consumptionText(Map<String, dynamic> subscriber, double? value) {
    if (value == null || value < _previous(subscriber)) return null;
    return AppIdentity.reading(value - _previous(subscriber));
  }

  Widget _readingRow(Map<String, dynamic> subscriber, int index,
      {bool last = false}) {
    final id = subscriber['id'] as int;
    final selected = selectedId == id && keypadOpen;
    final queued = _queued(subscriber);
    final finished = _done(subscriber);
    final draft = drafts[id];
    final value = double.tryParse(draft ?? '');
    final previous = _previous(subscriber);
    final low = value != null && value < previous;
    final consumption = value == null ? null : value - previous;
    final lastWeek = _history(subscriber).firstOrNull;
    final shownReading =
        queued?['current_reading'] ?? subscriber['current_reading'];
    final rejected = queued?['sync_error'] != null;
    return InkWell(
      key: rowKeys.putIfAbsent(id, GlobalKey.new),
      onTap: () => _select(subscriber),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFF9EEF0) : Colors.transparent,
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
                color: selected
                    ? _brand
                    : finished
                        ? const Color(0xFFE8F6F0)
                        : _sunken,
                borderRadius: BorderRadius.circular(10)),
            child: finished && !selected
                ? const Icon(Icons.check, size: 16, color: _good)
                : Text('${index + 1}',
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
              const SizedBox(height: 2),
              Text(
                  [
                    'السابقة ${AppIdentity.reading(subscriber['previous_reading'])}',
                    if (lastWeek?['consumption'] != null)
                      'الأسبوع الماضي ${AppIdentity.reading(lastWeek!['consumption'])}',
                  ].join(' · '),
                  style: _body(12.5, color: _faint),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ]),
          ),
          const SizedBox(width: 8),
          Container(
            width: 112,
            height: 50,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: finished
                  ? rejected
                      ? const Color(0xFFFFEEEE)
                      : const Color(0xFFE8F6F0)
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
                  ? const [BoxShadow(color: Color(0x1FA51D26), spreadRadius: 3)]
                  : null,
            ),
            child:
                Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              if (!finished && draft != null && draft.isNotEmpty) ...[
                Text(draft,
                    style: _number(19), textDirection: TextDirection.ltr),
                const SizedBox(height: 2),
                Text(
                    low
                        ? 'أقل من السابقة'
                        : '${AppIdentity.reading(consumption)} ك.و.س',
                    style: _body(11.5,
                        weight: FontWeight.w700,
                        color: _verdict(subscriber, value)?.color ?? _good)),
              ] else if (finished) ...[
                Text(AppIdentity.reading(shownReading), style: _number(19)),
                const SizedBox(height: 2),
                Text(
                    queued == null
                        ? subscriber['reading_status'] == 'approved'
                            ? 'معتمدة'
                            : 'قيد المراجعة'
                        : rejected
                            ? 'تعذر الإرسال'
                            : 'على الجهاز',
                    style: _body(11.5,
                        weight: FontWeight.w700,
                        color: rejected ? _bad : _good)),
              ] else if (selected)
                Text('اكتب القراءة', style: _body(13, color: _brand))
              else
                Text('اضغط للإدخال', style: _body(13, color: _faint)),
            ]),
          ),
        ]),
      ),
    );
  }

  /// The chosen subscriber's previous and new reading side by side, with
  /// their recent weeks, shown above the keypad while typing.
  Widget _comparePanel(Map<String, dynamic> subscriber) {
    final draft = drafts[subscriber['id']];
    final value = double.tryParse(draft ?? '');
    final verdict = _verdict(subscriber, value);
    final history = _history(subscriber).reversed.toList();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      decoration: const BoxDecoration(
          color: _surface,
          border: Border(top: BorderSide(color: _lineSoft)),
          boxShadow: [
            BoxShadow(
                color: Color(0x0F101828), blurRadius: 12, offset: Offset(0, -4))
          ]),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(
            child: Text('${subscriber['full_name']}',
                style: _body(15, weight: FontWeight.w700),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
          ),
          if (verdict != null) ...[
            Icon(verdict.icon, size: 16, color: verdict.color),
            const SizedBox(width: 4),
            Flexible(
              child: Text(verdict.text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: _body(12.5,
                      weight: FontWeight.w700, color: verdict.color)),
            ),
          ],
        ]),
        const SizedBox(height: 8),
        AppReadingCompare(
          previous: AppIdentity.reading(subscriber['previous_reading']),
          current: draft == null || draft.isEmpty ? null : draft,
          currentHint: 'اكتب',
          consumption: _consumptionText(subscriber, value),
          alert: verdict?.color == _good ? null : verdict?.color,
          highlightCurrent: true,
        ),
        if (history.isNotEmpty && MediaQuery.sizeOf(context).height >= 700) ...[
          const SizedBox(height: 8),
          _historyStrip(
              history,
              value == null || value < _previous(subscriber)
                  ? null
                  : value - _previous(subscriber)),
        ],
      ]),
    );
  }

  /// Small bars of the last weeks' consumption beside this week's.
  Widget _historyStrip(List<Map<String, dynamic>> history, double? now) {
    final weeks = [
      for (final week in history)
        (
          label: AppIdentity.shortDate(week['week_start']),
          value: double.tryParse('${week['consumption']}') ?? 0,
          current: false,
        ),
      (label: 'الآن', value: now ?? 0, current: true),
    ];
    final highest = weeks
        .map((week) => week.value)
        .fold<double>(1, (top, value) => value > top ? value : top);
    return Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
      Text('الاستهلاك', style: _body(11.5, color: _faint)),
      const SizedBox(width: 10),
      for (final week in weeks)
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(
                  week.current && now == null
                      ? '—'
                      : AppIdentity.reading(week.value),
                  style: _number(11.5, color: week.current ? _brand : _muted)),
              const SizedBox(height: 3),
              AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                height: 4 + 18 * (week.value / highest),
                decoration: BoxDecoration(
                    color: week.current ? _brand : _line,
                    borderRadius: BorderRadius.circular(4)),
              ),
              const SizedBox(height: 3),
              Text(week.label,
                  style: _body(10.5,
                      weight:
                          week.current ? FontWeight.w700 : FontWeight.normal,
                      color: week.current ? _brand : _faint)),
            ]),
          ),
        ),
    ]);
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
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      decoration: const BoxDecoration(
          color: _background,
          border: Border(top: BorderSide(color: _lineSoft))),
      child: _button(label,
          onPressed: count == 0 || saving ? null : _save,
          primary: true,
          busy: saving,
          icon: Icons.check),
    );
  }

  Widget _button(String text,
      {required VoidCallback? onPressed,
      bool primary = false,
      bool busy = false,
      IconData? icon}) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 160),
        opacity: onPressed == null && primary && !busy ? 0.5 : 1,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: primary ? null : _surface,
            gradient: primary ? AppIdentity.action : null,
            border: primary ? null : Border.all(color: _line),
            borderRadius: BorderRadius.circular(17),
          ),
          child: TextButton.icon(
            onPressed: onPressed,
            icon: busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : icon == null
                    ? const SizedBox.shrink()
                    : Icon(icon, size: 20),
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

  MapEntry<String, List<Map<String, dynamic>>>? _nextUnfinishedBox() =>
      _groups()
          .entries
          .where((entry) => entry.value.any(_editable))
          .firstOrNull;

  Widget _doneView() {
    final pending = widget.store.queuedReadings
        .where((reading) =>
            savedOperationIds.contains(reading['mobile_operation_id']))
        .toList();
    final rejected = pending.any((reading) => reading['sync_error'] != null);
    final description = rejected
        ? 'حُفظت القراءات على الجهاز. تحقّق من حالة الإرسال لمعالجة القراءة المرفوضة.'
        : pending.isNotEmpty
            ? 'حُفظت على الجهاز، وستُرسل إلى النظام الأساسي فور عودة الاتصال. يمكنك تعديلها قبل إرسالها.'
            : 'وصلت إلى النظام الأساسي بحالة «قيد المراجعة» بانتظار المدقق.';
    final status = rejected
        ? 'تعذر الإرسال'
        : pending.isNotEmpty
            ? 'بانتظار الإرسال'
            : 'قيد المراجعة';
    final next = _nextUnfinishedBox();
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 30, 20, 24),
      children: [
        const SizedBox(height: 30),
        Center(
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: .6, end: 1),
            duration: const Duration(milliseconds: 420),
            curve: Curves.elasticOut,
            builder: (context, scale, child) =>
                Transform.scale(scale: scale, child: child),
            child: Container(
                width: 84,
                height: 84,
                decoration: BoxDecoration(
                    color: const Color(0xFFE8F6F0),
                    borderRadius: BorderRadius.circular(28)),
                child: const Icon(Icons.check, size: 42, color: _good)),
          ),
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
        if (next != null) ...[
          _button('الطبلون التالي: ${_boxNumber(next.value.first)}',
              onPressed: () => _openBox(next.key),
              primary: true,
              icon: Icons.arrow_forward),
          const SizedBox(height: 10),
        ],
        _button('العودة إلى الطبلونات',
            onPressed: _back, primary: next == null),
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
    return ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Row(children: [
            Expanded(
                child: AppStat('بانتظار الإرسال', '${queue.length}',
                    color: queue.isEmpty ? _good : _warning)),
            const SizedBox(width: 8),
            Expanded(
                child: AppStat(
                    'آخر تحديث للبيانات',
                    _updatedText(
                        widget.store.state['roster_updated_at'] as String?))),
          ]),
          Padding(
            padding: const EdgeInsets.fromLTRB(2, 18, 2, 10),
            child: Text('لم تُرسل بعد', style: _heading(16)),
          ),
          QueuedReadingsList(
              queue: queue,
              subscribers: widget.store.subscribers,
              onReenter: _entryOpen ? _reenter : null,
              onDiscard: (reading) async {
                await widget.onDiscard(reading);
                if (mounted) setState(() {});
              }),
          const SizedBox(height: 14),
          _button(
              widget.syncing
                  ? 'جارٍ الإرسال...'
                  : widget.online
                      ? 'إرسال الآن'
                      : 'سيتم الإرسال عند عودة الاتصال',
              onPressed: widget.online && !widget.syncing && queue.isNotEmpty
                  ? widget.onSync
                  : null,
              busy: widget.syncing,
              icon: Icons.sync,
              primary: true),
        ]);
  }
}

/// When the roster was last downloaded, in words.
String _updatedText(String? updatedAt) {
  final updated = DateTime.tryParse(updatedAt ?? '');
  if (updated == null) return '—';
  final minutes = DateTime.now().difference(updated).inMinutes;
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return 'قبل $minutes د';
  if (minutes < 24 * 60) return 'قبل ${minutes ~/ 60} س';
  return AppIdentity.shortDate(updatedAt);
}
