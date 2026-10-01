import 'dart:async';

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_identity.dart';

class WeeklyReadingsPage extends StatefulWidget {
  const WeeklyReadingsPage({required this.api, super.key});
  final ApiClient api;

  @override
  State<WeeklyReadingsPage> createState() => _WeeklyReadingsPageState();
}

class _WeeklyReadingsPageState extends State<WeeklyReadingsPage> {
  final search = TextEditingController();
  Timer? debounce;
  int requestId = 0;
  int page = 0;
  int lastPage = 1;
  int total = 0;
  bool busy = true;
  String? error;
  String? week;
  List<Map<String, dynamic>> weeks = [];
  List<Map<String, dynamic>> subscribers = [];

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  @override
  void dispose() {
    debounce?.cancel();
    search.dispose();
    super.dispose();
  }

  void searchChanged(String _) {
    debounce?.cancel();
    requestId++;
    setState(() {
      subscribers = [];
      busy = true;
      error = null;
      page = 0;
      total = 0;
    });
    debounce =
        Timer(const Duration(milliseconds: 300), () => unawaited(load()));
  }

  Future<void> load({bool more = false}) async {
    if (more && (busy || page >= lastPage)) return;
    debounce?.cancel();
    final request = ++requestId;
    final nextPage = more ? page + 1 : 1;
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        subscribers = [];
        page = 0;
        total = 0;
      }
    });
    try {
      final result = await widget.api.weeklyReadings(
          search: search.text.trim(), week: week, page: nextPage);
      if (!mounted || request != requestId) return;
      setState(() {
        week = result['week_start'] as String;
        weeks = (result['week_options'] as List)
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
        final rows = (result['data'] as List)
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
        subscribers = more ? [...subscribers, ...rows] : rows;
        page = result['current_page'] as int;
        lastPage = result['last_page'] as int;
        total = result['total'] as int;
      });
    } on ApiException catch (exception) {
      if (!mounted || request != requestId) return;
      setState(() {
        error = exception.statusCode == 403
            ? 'ليس لديك صلاحية عرض القراءات. اطلب تفعيل صلاحية عرض قراءات العدادات.'
            : exception.statusCode == 401
                ? 'انتهت جلسة الدخول. ارجع وسجّل الدخول مجددًا.'
                : exception.message;
        if (exception.statusCode == 401 || exception.statusCode == 403) {
          subscribers = [];
          page = 0;
          total = 0;
        }
      });
    } finally {
      if (mounted && request == requestId) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
          body: SafeArea(
              child: Column(children: [
        AppHeader(
            title: 'القراءات الأسبوعية',
            subtitle: 'قراءات المشتركين · عرض فقط',
            onBack: () => Navigator.pop(context)),
        Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(children: [
              if (weeks.isNotEmpty)
                DropdownButtonFormField<String>(
                    key: ValueKey(week),
                    initialValue: weeks.any((option) => option['value'] == week)
                        ? week
                        : null,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'الأسبوع'),
                    items: [
                      for (final option in weeks)
                        DropdownMenuItem(
                            value: option['value'] as String,
                            child: Text('${option['label']}',
                                overflow: TextOverflow.ellipsis,
                                style: AppIdentity.body(13))),
                    ],
                    onChanged: (value) {
                      if (value == null) return;
                      setState(() => week = value);
                      unawaited(load());
                    }),
              const SizedBox(height: 12),
              TextField(
                  controller: search,
                  maxLength: 100,
                  onChanged: searchChanged,
                  onSubmitted: (_) => unawaited(load()),
                  decoration: InputDecoration(
                      counterText: '',
                      hintText: 'اسم المشترك أو رقم الحساب أو الطبلون',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: search.text.isEmpty
                          ? null
                          : IconButton(
                              tooltip: 'مسح البحث',
                              icon: const Icon(Icons.close),
                              onPressed: () {
                                search.clear();
                                unawaited(load());
                              }))),
              Row(children: [
                Text('$total مشترك',
                    style: AppIdentity.body(13, color: AppIdentity.faint)),
                const Spacer(),
                IconButton(
                    tooltip: 'تحديث القراءات',
                    onPressed: busy ? null : () => unawaited(load()),
                    icon: const Icon(Icons.refresh)),
              ]),
              if (busy) const LinearProgressIndicator(),
            ])),
        Expanded(
            child: RefreshIndicator(
                color: AppIdentity.brand,
                onRefresh: load,
                child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    children: [
                      if (error != null) ...[
                        AppNotice(error!, error: true),
                        TextButton(
                            onPressed: busy ? null : () => unawaited(load()),
                            child: const Text('إعادة المحاولة')),
                      ],
                      if (!busy && error == null && subscribers.isEmpty)
                        const AppPanel(
                            child: Center(child: Text('لا توجد نتائج'))),
                      for (final subscriber in subscribers)
                        Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: readingCard(subscriber)),
                      if (page > 0 && page < lastPage)
                        AppAction(
                            label: 'عرض المزيد',
                            primary: false,
                            busy: busy,
                            onPressed: busy
                                ? null
                                : () => unawaited(load(more: true))),
                    ]))),
      ])));

  Widget readingCard(Map<String, dynamic> subscriber) {
    final status = subscriber['status'];
    final (statusLabel, color, icon) = switch (status) {
      'approved' => ('معتمدة', AppIdentity.good, Icons.verified_outlined),
      'pending' => ('بانتظار الاعتماد', AppIdentity.warning, Icons.schedule),
      _ => ('لم تُدخل قراءة', AppIdentity.muted, Icons.remove_circle_outline),
    };
    return AppPanel(
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${subscriber['full_name']}', style: AppIdentity.heading(17)),
          Text(
              'حساب ${subscriber['account_number']} · طبلون ${subscriber['meter_box_number'] ?? '—'}',
              style: AppIdentity.body(12, color: AppIdentity.faint)),
        ])),
        const SizedBox(width: 8),
        Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
                color: color.withValues(alpha: .1),
                borderRadius: BorderRadius.circular(99)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 4),
              Text(statusLabel,
                  style: AppIdentity.body(12,
                      color: color, weight: FontWeight.w700)),
            ])),
      ]),
      const SizedBox(height: 12),
      AppReadingCompare(
          previous: AppIdentity.reading(subscriber['previous_reading']),
          current: subscriber['current_reading'] == null
              ? null
              : AppIdentity.reading(subscriber['current_reading']),
          consumption: subscriber['consumption'] == null
              ? null
              : AppIdentity.reading(subscriber['consumption'])),
      if (subscriber['amount_due'] != null) ...[
        const SizedBox(height: 10),
        readingValue('قيمة الأسبوع (₪)', subscriber['amount_due']),
      ],
    ]));
  }

  Widget readingValue(String label, dynamic value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Expanded(child: Text(label, style: AppIdentity.body(13))),
        Text(value == null ? '—' : AppIdentity.money(value),
            style: AppIdentity.number(15)),
      ]));
}
