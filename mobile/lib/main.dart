import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api_client.dart';
import 'app_identity.dart';
import 'collection_view.dart';
import 'payment_page.dart';
import 'field_store.dart';
import 'queued_readings.dart';
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
  bool showPassword = false;
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
                          obscureText: !showPassword,
                          autofillHints: const [AutofillHints.password],
                          onSubmitted: (_) => submit(),
                          decoration: InputDecoration(
                              labelText: 'كلمة المرور',
                              prefixIcon: const Icon(Icons.lock_outline),
                              suffixIcon: IconButton(
                                  tooltip: showPassword
                                      ? 'إخفاء كلمة المرور'
                                      : 'إظهار كلمة المرور',
                                  icon: Icon(showPassword
                                      ? Icons.visibility_off_outlined
                                      : Icons.visibility_outlined),
                                  onPressed: () => setState(
                                      () => showPassword = !showPassword)))),
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
  bool readingFocus = false;
  int? focusSubscriberId;

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
      builder: (_) => PaymentPage(
          api: widget.api,
          subscriber: subscriber,
          transferBanks: currentUser['transfer_banks'] is List
              ? List<String>.from(currentUser['transfer_banks'] as List)
              : defaultTransferBanks),
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
      if (destination != FieldSection.readings) {
        readingFocus = false;
        focusSubscriberId = null;
      }
    });
    if (destination == FieldSection.collections && canCollect) {
      unawaited(searchCollections());
    }
  }

  /// Take a saved reading back off the queue and open it on the keypad.
  Future<void> reenterReading(Map<String, dynamic> reading) async {
    if (syncing) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(
            content: Text('جارٍ الإرسال الآن. أعد المحاولة بعد لحظات.')));
      return;
    }
    await widget.store.reopenReading(reading['mobile_operation_id'] as String);
    if (!mounted) return;
    setState(() {
      section = FieldSection.readings;
      message = null;
      focusSubscriberId = reading['subscriber_id'] as int;
    });
  }

  void openWeeklyReadings() {
    if (!canViewReadings) return;
    Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => WeeklyReadingsPage(api: widget.api)));
  }

  List<(FieldSection, String, IconData, IconData)> get destinations => [
        (
          FieldSection.home,
          'الرئيسية',
          Icons.home_outlined,
          Icons.home_rounded
        ),
        if (canRead)
          (
            FieldSection.readings,
            'القراءات',
            Icons.bolt_outlined,
            Icons.bolt_rounded
          ),
        if (canCollect)
          (
            FieldSection.collections,
            'التحصيل',
            Icons.payments_outlined,
            Icons.payments_rounded
          ),
        (
          FieldSection.sync,
          'الإرسال',
          Icons.cloud_outlined,
          Icons.cloud_rounded
        ),
        (
          FieldSection.account,
          'حسابي',
          Icons.person_outline,
          Icons.person_rounded
        ),
      ];

  @override
  Widget build(BuildContext context) {
    final inReadings = section == FieldSection.readings && canRead;
    final pending = widget.store.queuedReadings.length;
    final tabs = destinations;
    final selectedTab =
        tabs.indexWhere((destination) => destination.$1 == section);
    return PopScope(
      canPop: section == FieldSection.home,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !inReadings) navigate(FieldSection.home);
      },
      child: Scaffold(
        body: AnimatedSwitcher(
          duration: const Duration(milliseconds: 200),
          switchInCurve: Curves.easeOutCubic,
          transitionBuilder: (child, animation) =>
              FadeTransition(opacity: animation, child: child),
          child: KeyedSubtree(
            key: ValueKey(inReadings ? FieldSection.readings : section),
            child: inReadings
                ? ReadingFlow(
                    key: ValueKey('readings-$focusSubscriberId'),
                    store: widget.store,
                    online: online,
                    syncing: syncing,
                    message: message,
                    requiresLogin: requiresLogin,
                    focusSubscriberId: focusSubscriberId,
                    onSync: () => unawaited(synchronize()),
                    onRefresh: synchronize,
                    onSave: saveReadings,
                    onDiscard: discardRejectedReading,
                    onFocusChanged: (focused) =>
                        setState(() => readingFocus = focused),
                    onExit: () => navigate(FieldSection.home),
                    onReauthenticate: widget.onReauthenticate,
                  )
                : SafeArea(bottom: false, child: sectionBody()),
          ),
        ),
        bottomNavigationBar: inReadings && readingFocus
            ? null
            : NavigationBar(
                selectedIndex: selectedTab < 0 ? 0 : selectedTab,
                onDestinationSelected: (index) => navigate(tabs[index].$1),
                destinations: [
                  for (final (destination, label, icon, selectedIcon) in tabs)
                    NavigationDestination(
                      icon: destination == FieldSection.sync && pending > 0
                          ? Badge(label: Text('$pending'), child: Icon(icon))
                          : Icon(icon),
                      selectedIcon:
                          destination == FieldSection.sync && pending > 0
                              ? Badge(
                                  label: Text('$pending'),
                                  child: Icon(selectedIcon))
                              : Icon(selectedIcon),
                      label: label,
                    ),
                ],
              ),
      ),
    );
  }

  Widget sectionBody() {
    final title = switch (section) {
      FieldSection.collections => 'التحصيل',
      FieldSection.sync => 'حالة الإرسال',
      FieldSection.account => 'حسابي',
      _ => 'مرحبًا، ${widget.user['name']}',
    };
    return Column(children: [
      AppHeader(
          title: title,
          subtitle: switch (section) {
            FieldSection.home =>
              '${widget.user['branch_name'] ?? 'جميع الفروع'}',
            FieldSection.collections => 'ابحث عن مشترك لتسجيل دفعة',
            FieldSection.sync => 'القراءات المحفوظة على الجهاز',
            _ => null,
          },
          onSync: section == FieldSection.sync
              ? null
              : () => navigate(FieldSection.sync),
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
            hasMore: collectionPage > 0 && collectionPage < collectionLastPage,
            onSearchChanged: collectionSearchChanged,
            onLoadMore: () => unawaited(searchCollections(loadMore: true)),
            onSearch: () => unawaited(searchCollections()),
            onRefresh: () async {
              await synchronize();
              await searchCollections();
            },
            onWeeklyReadings: canViewReadings ? openWeeklyReadings : null,
            onOpen: openPayment),
        FieldSection.sync => syncView(),
        FieldSection.account => account(),
        _ => home(),
      }),
    ]);
  }

  Widget refreshable(Widget list) => RefreshIndicator(
      color: AppIdentity.brand, onRefresh: synchronize, child: list);

  Widget home() {
    final total = today.fold<double>(0,
        (sum, payment) => sum + (double.tryParse('${payment['amount']}') ?? 0));
    final subscribers = widget.store.subscribers;
    final queued = widget.store.queuedReadings;
    final done = subscribers
        .where((subscriber) =>
            subscriber['reading_status'] != null ||
            queued.any((reading) =>
                reading['subscriber_id'] == subscriber['id'] &&
                reading['week_start'] == widget.store.state['week_start']))
        .length;
    final drafts = widget.store.readingDrafts.length;
    final weekStart = widget.store.state['week_start'];
    return refreshable(ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
                gradient: AppIdentity.hero,
                borderRadius: BorderRadius.circular(24)),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: .1),
                      borderRadius: BorderRadius.circular(99)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                            color: online
                                ? const Color(0xFF6EE7B7)
                                : const Color(0xFFFCD34D),
                            shape: BoxShape.circle)),
                    const SizedBox(width: 6),
                    Text(
                        syncing
                            ? 'جارٍ المزامنة'
                            : online
                                ? 'متصل'
                                : 'دون اتصال',
                        style: AppIdentity.body(12,
                            weight: FontWeight.w600, color: Colors.white)),
                  ]),
                ),
                const Spacer(),
                if (weekStart != null)
                  Text(
                      'أسبوع ${AppIdentity.shortDate(weekStart)} – ${AppIdentity.shortDate(widget.store.state['week_end'])}',
                      style: AppIdentity.body(12.5,
                          color: const Color(0xFFAEB6C1))),
              ]),
              const SizedBox(height: 16),
              Row(children: [
                if (canRead)
                  Expanded(
                      child: heroStat(
                          'قراءات الأسبوع', '$done / ${subscribers.length}',
                          progress: subscribers.isEmpty
                              ? null
                              : done / subscribers.length)),
                if (canRead && canCollect) const SizedBox(width: 12),
                if (canCollect)
                  Expanded(
                      child: heroStat(
                          'تحصيل اليوم', '${AppIdentity.money(total)} ₪')),
                if (!canRead && !canCollect)
                  Expanded(
                      child: heroStat('الفرع',
                          '${widget.user['branch_name'] ?? 'جميع الفروع'}')),
              ]),
            ]),
          ),
          if (queued.isNotEmpty) ...[
            const SizedBox(height: 12),
            statusStrip(
                key: const ValueKey('home-pending'),
                icon: queued.any((reading) => reading['sync_error'] != null)
                    ? Icons.error_outline
                    : Icons.schedule,
                color: queued.any((reading) => reading['sync_error'] != null)
                    ? AppIdentity.bad
                    : AppIdentity.warning,
                text:
                    '${AppIdentity.readingsCount(queued.length)} بانتظار المزامنة',
                action: 'عرض',
                onTap: () => navigate(FieldSection.sync)),
          ],
          if (canRead && drafts > 0) ...[
            const SizedBox(height: 8),
            statusStrip(
                icon: Icons.edit_note_rounded,
                color: AppIdentity.brand,
                text: '${AppIdentity.readingsCount(drafts)} مكتوبة ولم تُحفظ',
                action: 'متابعة',
                onTap: () => navigate(FieldSection.readings)),
          ],
          Padding(
              padding: const EdgeInsets.fromLTRB(2, 18, 2, 10),
              child: Text('ماذا تريد أن تسجّل اليوم؟',
                  style: AppIdentity.heading(16))),
          if (canRead)
            AppServiceCard(
                title: 'إدخال القراءات',
                subtitle: 'قراءات عدادات الطبلونات',
                summary: 'قُرئت $done من ${subscribers.length}',
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
        ]));
  }

  Widget heroStat(String label, String value, {double? progress}) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label,
            style: AppIdentity.body(12.5, color: const Color(0xFFAEB6C1))),
        const SizedBox(height: 4),
        FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(value,
                textDirection: TextDirection.ltr,
                style: AppIdentity.number(22, color: Colors.white))),
        if (progress != null) ...[
          const SizedBox(height: 8),
          ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 5,
                  backgroundColor: Colors.white.withValues(alpha: .12),
                  color: const Color(0xFF6EE7B7))),
        ],
      ]);

  Widget statusStrip(
          {required IconData icon,
          required Color color,
          required String text,
          required String action,
          required VoidCallback onTap,
          Key? key}) =>
      Material(
        key: key,
        color: color.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 10),
              Expanded(
                  child: Text(text,
                      style: AppIdentity.body(14,
                          weight: FontWeight.w600, color: color))),
              Text(action,
                  style: AppIdentity.body(13.5,
                      weight: FontWeight.w700, color: color)),
              Icon(Icons.chevron_left, color: color, size: 20),
            ]),
          ),
        ),
      );

  Widget syncView() {
    final queue = widget.store.queuedReadings;
    final rejected = queue.where((reading) => reading['sync_error'] != null);
    return refreshable(ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Row(children: [
            Expanded(
                child: AppStat('بانتظار الإرسال', '${queue.length}',
                    color: queue.isEmpty
                        ? AppIdentity.good
                        : AppIdentity.warning)),
            const SizedBox(width: 8),
            Expanded(
                child: AppStat('رفضها الخادم', '${rejected.length}',
                    color:
                        rejected.isEmpty ? AppIdentity.ink : AppIdentity.bad)),
          ]),
          const SizedBox(height: 16),
          Text('القراءات المحفوظة على الجهاز', style: AppIdentity.heading(17)),
          const SizedBox(height: 4),
          Text('يمكنك تعديل أي قراءة قبل إرسالها.',
              style: AppIdentity.body(12.5, color: AppIdentity.faint)),
          const SizedBox(height: 10),
          QueuedReadingsList(
              queue: queue,
              subscribers: widget.store.subscribers,
              onReenter: canRead &&
                      widget.store.state['can_record_readings_now'] == true
                  ? reenterReading
                  : null,
              onDiscard: discardRejectedReading),
          const SizedBox(height: 16),
          AppAction(
              label: syncing ? 'جارٍ المزامنة...' : 'مزامنة الآن',
              busy: syncing,
              icon: Icons.sync,
              onPressed: syncing ? null : () => unawaited(synchronize())),
          const SizedBox(height: 12),
          const AppNotice(
              'المزامنة دون اتصال مخصصة لقراءات العدادات فقط. الدفعات تُسجّل أثناء الاتصال مباشرة.'),
        ]));
  }

  Widget account() =>
      ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        AppPanel(
            child: Row(children: [
          Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                  gradient: AppIdentity.hero,
                  borderRadius: BorderRadius.circular(22)),
              alignment: Alignment.center,
              child: Text('${widget.user['name'] ?? '?'}'.characters.first,
                  style: AppIdentity.heading(26, color: Colors.white))),
          const SizedBox(width: 14),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('${widget.user['name']}', style: AppIdentity.heading(20)),
                Text('@${widget.user['username']}',
                    textDirection: TextDirection.ltr,
                    style: AppIdentity.body(13.5, color: AppIdentity.faint)),
                const SizedBox(height: 4),
                Row(children: [
                  const Icon(Icons.location_on_outlined,
                      size: 15, color: AppIdentity.muted),
                  const SizedBox(width: 4),
                  Expanded(
                      child: Text(
                          '${widget.user['branch_name'] ?? 'جميع الفروع'}',
                          style: AppIdentity.body(13.5,
                              color: AppIdentity.muted))),
                ]),
              ])),
        ])),
        const SizedBox(height: 16),
        Text('الصلاحيات المتاحة', style: AppIdentity.heading(17)),
        const SizedBox(height: 10),
        AppPanel(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final (allowed, label, icon) in [
                    (canRead, 'إدخال القراءات', Icons.bolt_outlined),
                    (canCollect, 'تسجيل الدفعات', Icons.payments_outlined),
                    (
                      canViewReadings,
                      'عرض القراءات الأسبوعية',
                      Icons.history_outlined
                    ),
                  ])
                    ListTile(
                        leading: Icon(icon,
                            color:
                                allowed ? AppIdentity.ink : AppIdentity.faint),
                        title: Text(label,
                            style: AppIdentity.body(14.5,
                                weight: FontWeight.w600,
                                color: allowed
                                    ? AppIdentity.ink
                                    : AppIdentity.faint)),
                        trailing: Icon(
                            allowed
                                ? Icons.check_circle
                                : Icons.remove_circle_outline,
                            size: 20,
                            color: allowed
                                ? AppIdentity.good
                                : AppIdentity.faint)),
                ])),
        if (widget.store.queuedReadings.isNotEmpty) ...[
          const SizedBox(height: 16),
          AppNotice(
              '${AppIdentity.readingsCount(widget.store.queuedReadings.length)} لم تُرسل بعد. زامنها قبل تسجيل الخروج.'),
        ],
        const SizedBox(height: 20),
        AppAction(
            label: 'تسجيل الخروج',
            primary: false,
            icon: Icons.logout,
            onPressed: signOut),
      ]);
}
