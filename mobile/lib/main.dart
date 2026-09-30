import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api_client.dart';
import 'app_identity.dart';
import 'collection_view.dart';
import 'payment_page.dart';
import 'field_store.dart';
import 'reading_flow.dart';
import 'weekly_readings_page.dart';

void main() => runApp(const PowerCollectApp());

class PowerCollectApp extends StatefulWidget {
  const PowerCollectApp({super.key, this.apiClient, this.fieldStore});
  final ApiClient? apiClient;
  final FieldStore? fieldStore;

  @override
  State<PowerCollectApp> createState() => _PowerCollectAppState();
}

class _PowerCollectAppState extends State<PowerCollectApp> {
  late final ApiClient api = widget.apiClient ?? ApiClient();
  late final FieldStore store = widget.fieldStore ?? FieldStore();
  bool loading = true;
  Map<String, dynamic>? user;
  String? startupError;

  @override
  void initState() {
    super.initState();
    restore();
  }

  Future<void> restore() async {
    try {
      await store.load();
      api.token = store.token;
      if (mounted) setState(() => user = store.user);
    } catch (_) {
      startupError = 'تعذر فتح التخزين المحلي. أعد تشغيل التطبيق.';
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> login(String username, String password) async {
    if (store.queuedReadings.isNotEmpty &&
        store.user?['username'] != username) {
      throw const ApiException(
          'توجد قراءات غير مرسلة لحساب آخر. اتصل بالإنترنت وزامنها أولًا.', 0);
    }
    final previousToken = api.token;
    final result = await api.login(username, password);
    final nextUser = Map<String, dynamic>.from(result['user'] as Map);
    try {
      await store.saveSession(nextUser, result['token'] as String);
    } on PendingReadingsAccountSwitch {
      try {
        await api.logout();
      } on ApiException catch (_) {
        // Restore the original session even if the new token cannot be revoked.
      }
      api.token = previousToken;
      throw const ApiException(
          'توجد قراءات غير مرسلة لحساب آخر. زامنها أولًا.', 0);
    }
    if (mounted) setState(() => user = nextUser);
  }

  Future<void> logout() async {
    if (store.queuedReadings.isNotEmpty) {
      throw const ApiException(
          'زامن القراءات غير المرسلة قبل تسجيل الخروج.', 0);
    }
    await api.logout();
    store.state.clear();
    await store.save();
    if (mounted) setState(() => user = null);
  }

  void requireLogin() {
    api.token = null;
    if (mounted) setState(() => user = null);
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'PowerCollect',
        debugShowCheckedModeBanner: false,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: AppIdentity.theme,
        home: loading
            ? const Scaffold(body: Center(child: CircularProgressIndicator()))
            : startupError != null
                ? Scaffold(body: Center(child: Text(startupError!)))
                : user == null
                    ? LoginPage(onLogin: login)
                    : FieldShell(
                        api: api,
                        store: store,
                        user: user!,
                        onLogout: logout,
                        onReauthenticate: requireLogin),
      );
}

class LoginPage extends StatefulWidget {
  const LoginPage({required this.onLogin, super.key});
  final Future<void> Function(String, String) onLogin;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final username = TextEditingController();
  final password = TextEditingController();
  bool busy = false;
  String? error;

  @override
  void dispose() {
    username.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.onLogin(username.text.trim(), password.text);
    } on ApiException catch (exception) {
      if (mounted) setState(() => error = exception.message);
    } finally {
      password.clear();
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
            child: Center(
                child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 32, 20, 24),
              children: [
                Image.asset('assets/images/brand.webp', height: 140),
                const SizedBox(height: 16),
                Text('تطبيق الميدان',
                    textAlign: TextAlign.center,
                    style: AppIdentity.heading(26)),
                Text('سجّل الدخول للبدء',
                    textAlign: TextAlign.center,
                    style: AppIdentity.body(14, color: AppIdentity.faint)),
                const SizedBox(height: 28),
                AppPanel(
                    child: AutofillGroup(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                      TextField(
                          controller: username,
                          autofillHints: const [AutofillHints.username],
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(
                              labelText: 'اسم المستخدم',
                              prefixIcon: Icon(Icons.person_outline))),
                      const SizedBox(height: 16),
                      TextField(
                          controller: password,
                          obscureText: true,
                          autofillHints: const [AutofillHints.password],
                          onSubmitted: (_) => submit(),
                          decoration: const InputDecoration(
                              labelText: 'كلمة المرور',
                              prefixIcon: Icon(Icons.lock_outline))),
                      if (error != null) ...[
                        const SizedBox(height: 12),
                        AppNotice(error!, error: true)
                      ],
                      const SizedBox(height: 20),
                      AppAction(
                          label: busy ? 'جارٍ الدخول...' : 'تسجيل الدخول',
                          icon: Icons.login,
                          busy: busy,
                          onPressed: busy ? null : submit),
                    ]))),
                const SizedBox(height: 16),
                Text(
                    'بعد أول دخول وتحميل البيانات، يمكنك إدخال قراءات العدادات دون اتصال. التحصيل يحتاج إلى الإنترنت.',
                    textAlign: TextAlign.center,
                    style: AppIdentity.body(12.5, color: AppIdentity.faint)),
              ]),
        ))),
      );
}

enum FieldSection { home, readings, collections, sync, account }

class FieldShell extends StatefulWidget {
  const FieldShell(
      {required this.api,
      required this.store,
      required this.user,
      required this.onLogout,
      required this.onReauthenticate,
      super.key});
  final ApiClient api;
  final FieldStore store;
  final Map<String, dynamic> user;
  final Future<void> Function() onLogout;
  final VoidCallback onReauthenticate;
  @override
  State<FieldShell> createState() => _FieldShellState();
}

class _FieldShellState extends State<FieldShell> with WidgetsBindingObserver {
  late Map<String, dynamic> currentUser = widget.user;
  FieldSection section = FieldSection.home;
  bool online = false;
  bool syncing = false;
  String? message;
  Timer? timer;
  final collectionSearch = TextEditingController();
  List<Map<String, dynamic>> collectionResults = [];
  List<Map<String, dynamic>> today = [];
  bool collectionBusy = false;
  Timer? collectionDebounce;
  int collectionRequest = 0;
  int collectionPage = 0;
  int collectionLastPage = 1;
  String? collectionError;
  bool requiresLogin = false;

  bool get canRead => currentUser['can_record_readings'] == true;
  bool get canCollect => currentUser['can_record_collections'] == true;
  bool get canViewReadings => currentUser['can_view_readings'] == true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    timer = Timer.periodic(const Duration(seconds: 30), (_) => synchronize());
    WidgetsBinding.instance.addPostFrameCallback((_) => synchronize());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) synchronize();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    timer?.cancel();
    collectionDebounce?.cancel();
    collectionSearch.dispose();
    super.dispose();
  }

  Future<void> synchronize() async {
    if (syncing) return;
    setState(() => syncing = true);
    try {
      final session = await widget.api.me();
      if (!mounted) return;
      setState(() {
        if (session['user'] is Map &&
            session['user']['id'] == widget.user['id']) {
          currentUser = Map<String, dynamic>.from(session['user'] as Map);
          widget.store.state['user'] = currentUser;
        }
        online = true;
        requiresLogin = false;
      });
      var sentAnyReading = false;
      for (final reading in widget.store.queuedReadings) {
        if (reading['sync_error'] != null) continue;
        try {
          await widget.api.sendReading({...reading}..remove('sync_error'));
          final subscribers = widget.store.subscribers;
          for (final subscriber in subscribers) {
            if (subscriber['id'] == reading['subscriber_id']) {
              subscriber['current_reading'] = reading['current_reading'];
              subscriber['reading_status'] = 'pending';
            }
          }
          widget.store.state['subscribers'] = subscribers;
          await widget.store
              .removeReading(reading['mobile_operation_id'] as String);
          sentAnyReading = true;
        } on ApiException catch (error) {
          if (error.isNetwork ||
              error.statusCode == 401 ||
              error.statusCode >= 500) rethrow;
          await widget.store.markReadingError(
              reading['mobile_operation_id'] as String, error.message);
        }
      }
      final lastRosterUpdate =
          DateTime.tryParse('${widget.store.state['roster_updated_at'] ?? ''}');
      if (canRead &&
          (sentAnyReading ||
              lastRosterUpdate == null ||
              DateTime.now().difference(lastRosterUpdate) >
                  const Duration(minutes: 5))) {
        await refreshRoster();
      }
      if (canCollect) await refreshCollections();
      if (mounted) setState(() => message = null);
    } on ApiException catch (error) {
      if (mounted)
        setState(() {
          online = false;
          requiresLogin = error.statusCode == 401;
          message = error.statusCode == 401
              ? 'انتهت جلسة الدخول. سجّل الدخول مجددًا لمزامنة القراءات.'
              : error.message;
        });
    } finally {
      if (mounted) setState(() => syncing = false);
    }
  }

  Future<void> refreshRoster() async {
    final all = <Map<String, dynamic>>[];
    Map<String, dynamic>? first;
    var page = 1;
    do {
      final result = await widget.api.rosterPage(page);
      first ??= result;
      all.addAll((result['data'] as List)
          .map((item) => Map<String, dynamic>.from(item as Map)));
      if (page >= (result['last_page'] as int)) break;
      page++;
    } while (true);
    widget.store.state['subscribers'] = all;
    widget.store.state['week_start'] = first['week_start'];
    widget.store.state['week_end'] = first['week_end'];
    widget.store.state['can_record_readings_now'] =
        first['can_record_readings_now'];
    widget.store.state['roster_updated_at'] = DateTime.now().toIso8601String();
    await widget.store.save();
    if (mounted) setState(() {});
  }

  Future<void> refreshCollections() async {
    final result = await widget.api.collectionsToday();
    if (mounted)
      setState(() => today = (result['data'] as List)
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList());
  }

  void collectionSearchChanged() {
    collectionDebounce?.cancel();
    collectionRequest++;
    setState(() {
      collectionBusy = true;
      collectionResults = [];
      collectionPage = 0;
      collectionError = null;
    });
    collectionDebounce = Timer(const Duration(milliseconds: 300),
        () => unawaited(searchCollections()));
  }

  Future<void> searchCollections({bool loadMore = false}) async {
    if (!canCollect || !mounted) return;
    if (loadMore && (collectionBusy || collectionPage >= collectionLastPage)) {
      return;
    }
    collectionDebounce?.cancel();
    final request = ++collectionRequest;
    final query = collectionSearch.text.trim();
    final page = loadMore ? collectionPage + 1 : 1;
    setState(() {
      collectionBusy = true;
      collectionError = null;
      if (!loadMore) {
        collectionResults = [];
        collectionPage = 0;
      }
    });
    try {
      final result =
          await widget.api.findCollectionSubscribers(query, page: page);
      if (mounted && request == collectionRequest)
        setState(() {
          online = true;
          requiresLogin = false;
          final results = (result['data'] as List)
              .map((item) => Map<String, dynamic>.from(item as Map))
              .toList();
          collectionResults =
              loadMore ? [...collectionResults, ...results] : results;
          collectionPage = result['current_page'] as int? ?? page;
          collectionLastPage = result['last_page'] as int? ?? page;
        });
    } on ApiException catch (error) {
      if (mounted && request == collectionRequest)
        setState(() {
          if (error.isNetwork || error.statusCode == 401) online = false;
          if (error.statusCode == 401) requiresLogin = true;
          collectionError = error.message;
        });
    } finally {
      if (mounted && request == collectionRequest) {
        setState(() => collectionBusy = false);
      }
    }
  }

  Future<void> saveReadings(List<Map<String, dynamic>> readings) async {
    await widget.store.queueReadings(readings);
    if (!mounted) return;
    setState(() => message = null);
    unawaited(synchronize());
  }

  Future<void> openPayment(Map<String, dynamic> subscriber) async {
    if (!online) {
      setState(() => message = 'التحصيل يتطلب اتصالًا بالخادم.');
      return;
    }
    final submitted = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => PaymentPage(api: widget.api, subscriber: subscriber),
    ));
    if (!mounted) return;
    if (submitted == true) {
      setState(() => message = 'سُجلت الدفعة مباشرة في السجل المالي.');
    }
    try {
      await refreshCollections();
      if (mounted) await searchCollections();
    } on ApiException catch (_) {
      // The payment is already recorded; a failed refresh must not obscure it.
    }
  }

  Future<void> signOut() async {
    try {
      await widget.onLogout();
    } on ApiException catch (error) {
      if (mounted) setState(() => message = error.message);
    }
  }

  Future<void> discardRejectedReading(Map<String, dynamic> reading) async {
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
              title: const Text('حذف القراءة المحلية؟'),
              content: Text('رفض الخادم هذه القراءة: ${reading['sync_error']}\n'
                  'سيُحذف الإدخال من هذا الجهاز ويمكنك إدخاله من جديد.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('إلغاء')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('حذف')),
              ],
            ));
    if (confirmed != true) return;
    await widget.store.removeReading(reading['mobile_operation_id'] as String);
    if (mounted) setState(() {});
  }

  void navigate(FieldSection destination) {
    setState(() {
      section = destination;
      message = null;
    });
    if (destination == FieldSection.collections && canCollect) {
      unawaited(searchCollections());
    }
  }

  void openWeeklyReadings() {
    if (!canViewReadings) return;
    Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => WeeklyReadingsPage(api: widget.api)));
  }

  @override
  Widget build(BuildContext context) {
    if (section == FieldSection.readings && canRead) {
      return Scaffold(
          body: ReadingFlow(
        store: widget.store,
        online: online,
        syncing: syncing,
        message: message,
        requiresLogin: requiresLogin,
        onSync: () => unawaited(synchronize()),
        onSave: saveReadings,
        onExit: () => navigate(FieldSection.home),
        onReauthenticate: widget.onReauthenticate,
      ));
    }
    final title = switch (section) {
      FieldSection.collections => 'التحصيل',
      FieldSection.sync => 'حالة الإرسال',
      FieldSection.account => 'حسابي',
      _ => 'مرحبًا، ${widget.user['name']}',
    };
    return PopScope(
      canPop: section == FieldSection.home,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) navigate(FieldSection.home);
      },
      child: Scaffold(
          body: SafeArea(
              child: Column(children: [
        AppHeader(
            title: title,
            subtitle: section == FieldSection.home
                ? '${widget.user['branch_name'] ?? 'جميع الفروع'}'
                : null,
            onBack: section == FieldSection.home
                ? null
                : () => navigate(FieldSection.home),
            onSync: () => navigate(FieldSection.sync),
            online: online,
            syncing: syncing,
            pending: widget.store.queuedReadings.length),
        if (!online && !syncing)
          Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: AppNotice(canRead
                  ? 'لا يوجد اتصال. تُحفظ القراءات على الجهاز وتُرسل تلقائيًا. التحصيل يحتاج إلى الإنترنت.'
                  : 'لا يوجد اتصال. اتصل بالإنترنت لتسجيل الدفعات.')),
        if (message != null && (online || requiresLogin))
          Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: AppNotice(message!)),
        if (requiresLogin)
          TextButton(
              onPressed: widget.onReauthenticate,
              child: const Text('تسجيل الدخول مجددًا')),
        Expanded(
            child: switch (section) {
          FieldSection.collections when canCollect => CollectionView(
              search: collectionSearch,
              results: collectionResults,
              today: today,
              busy: collectionBusy,
              online: online,
              error: collectionError,
              hasMore:
                  collectionPage > 0 && collectionPage < collectionLastPage,
              onSearchChanged: collectionSearchChanged,
              onLoadMore: () => unawaited(searchCollections(loadMore: true)),
              onSearch: () => unawaited(searchCollections()),
              onWeeklyReadings: canViewReadings ? openWeeklyReadings : null,
              onOpen: openPayment),
          FieldSection.sync => syncView(),
          FieldSection.account => account(),
          _ => home(),
        }),
      ]))),
    );
  }

  Widget home() {
    final total = today.fold<double>(0,
        (sum, payment) => sum + (double.tryParse('${payment['amount']}') ?? 0));
    final done = widget.store.subscribers
        .where((subscriber) =>
            subscriber['reading_status'] != null ||
            widget.store.queuedReadings.any((reading) =>
                reading['subscriber_id'] == subscriber['id'] &&
                reading['week_start'] == widget.store.state['week_start']))
        .length;
    return ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text('ماذا تريد أن تسجّل اليوم؟',
                  style: AppIdentity.body(15, weight: FontWeight.w600))),
          if (canRead)
            AppServiceCard(
                title: 'إدخال القراءات',
                subtitle: 'قراءات عدادات الطبلونات',
                summary: 'قُرئت $done من ${widget.store.subscribers.length}',
                icon: Icons.bolt_outlined,
                onTap: () => navigate(FieldSection.readings)),
          if (canCollect)
            AppServiceCard(
                title: 'تسجيل الدفعات',
                subtitle: 'تحصيل دفعات المشتركين',
                summary: 'اليوم ${AppIdentity.money(total)} ₪',
                icon: Icons.payments_outlined,
                onTap: () => navigate(FieldSection.collections)),
          if (canViewReadings)
            AppServiceCard(
                title: 'القراءات الأسبوعية',
                subtitle: 'قراءات المشتركين والاستهلاك',
                summary: 'عرض فقط',
                icon: Icons.history_outlined,
                onTap: openWeeklyReadings),
          if (!canRead && !canCollect && !canViewReadings)
            const AppNotice(
                'ليس لديك صلاحية لعرض القراءات أو إدخالها أو تسجيل الدفعات.'),
          Row(children: [
            Expanded(
                child: utilityCard(
                    'حالة الإرسال',
                    '${widget.store.queuedReadings.length} قراءات بانتظار المزامنة',
                    Icons.cloud_outlined,
                    () => navigate(FieldSection.sync))),
            const SizedBox(width: 10),
            Expanded(
                child: utilityCard(
                    'حسابي',
                    '${widget.user['username']}',
                    Icons.person_outline,
                    () => navigate(FieldSection.account))),
          ]),
        ]);
  }

  Widget utilityCard(
          String title, String subtitle, IconData icon, VoidCallback open) =>
      InkWell(
          onTap: open,
          borderRadius: BorderRadius.circular(20),
          child: AppPanel(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icon, color: AppIdentity.muted),
              const SizedBox(height: 8),
              Text(title, style: AppIdentity.body(15, weight: FontWeight.w700)),
              const SizedBox(height: 3),
              Text(subtitle,
                  style: AppIdentity.body(12, color: AppIdentity.faint)),
            ]),
          ));

  Widget syncView() =>
      ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        AppStat(
            'قراءات بانتظار الإرسال', '${widget.store.queuedReadings.length}',
            color: widget.store.queuedReadings.isEmpty
                ? AppIdentity.good
                : AppIdentity.warning),
        const SizedBox(height: 16),
        Text('القراءات المحفوظة على الجهاز', style: AppIdentity.heading(17)),
        const SizedBox(height: 10),
        if (widget.store.queuedReadings.isEmpty)
          const AppPanel(
              child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 20),
                  child: Column(children: [
                    Icon(Icons.cloud_done_outlined,
                        color: AppIdentity.good, size: 36),
                    SizedBox(height: 10),
                    Text('لا توجد قراءات بانتظار الإرسال')
                  ]))),
        for (final reading in widget.store.queuedReadings)
          Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: AppPanel(
                  padding: const EdgeInsets.all(4),
                  child: ListTile(
                    leading: Icon(
                        reading['sync_error'] == null
                            ? Icons.schedule
                            : Icons.error_outline,
                        color: reading['sync_error'] == null
                            ? AppIdentity.warning
                            : AppIdentity.bad),
                    title: Text(
                        'مشترك #${reading['subscriber_id']} · ${reading['current_reading']}'),
                    subtitle:
                        Text('${reading['sync_error'] ?? 'بانتظار الاتصال'}'),
                    trailing: reading['sync_error'] == null
                        ? null
                        : IconButton(
                            tooltip: 'حذف القراءة المرفوضة',
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () => discardRejectedReading(reading)),
                  ))),
        const SizedBox(height: 16),
        AppAction(
            label: syncing ? 'جارٍ المزامنة...' : 'مزامنة الآن',
            busy: syncing,
            icon: Icons.sync,
            onPressed: syncing ? null : () => unawaited(synchronize())),
        const SizedBox(height: 12),
        const AppNotice(
            'المزامنة دون اتصال مخصصة لقراءات العدادات فقط. الدفعات تُسجّل أثناء الاتصال مباشرة.'),
      ]);

  Widget account() =>
      ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        AppPanel(
            child: Column(children: [
          Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                  gradient: AppIdentity.hero,
                  borderRadius: BorderRadius.circular(24)),
              child: const Icon(Icons.person_outline,
                  color: Colors.white, size: 36)),
          const SizedBox(height: 14),
          Text('${widget.user['name']}', style: AppIdentity.heading(22)),
          Text('${widget.user['username']}',
              style: AppIdentity.body(14, color: AppIdentity.faint)),
          const SizedBox(height: 10),
          Text('${widget.user['branch_name'] ?? 'جميع الفروع'}',
              style: AppIdentity.body(14)),
        ])),
        const SizedBox(height: 16),
        Text('الصلاحيات المتاحة', style: AppIdentity.heading(17)),
        const SizedBox(height: 10),
        AppPanel(
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
              if (canRead)
                const ListTile(
                    leading: Icon(Icons.bolt_outlined),
                    title: Text('إدخال القراءات')),
              if (canCollect)
                const ListTile(
                    leading: Icon(Icons.payments_outlined),
                    title: Text('تسجيل الدفعات')),
              if (canViewReadings)
                const ListTile(
                    leading: Icon(Icons.history_outlined),
                    title: Text('عرض القراءات الأسبوعية')),
              if (!canRead && !canCollect && !canViewReadings)
                const Text('لا توجد صلاحيات ميدانية متاحة.'),
            ])),
        if (widget.store.queuedReadings.isNotEmpty) ...[
          const SizedBox(height: 16),
          AppNotice(
              '${widget.store.queuedReadings.length} قراءات لم تُرسل بعد. زامنها قبل تسجيل الخروج.'),
        ],
        const SizedBox(height: 20),
        AppAction(
            label: 'تسجيل الخروج',
            primary: false,
            icon: Icons.logout,
            onPressed: signOut),
      ]);
}
