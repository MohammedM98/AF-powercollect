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

class _PowerCollectAppState extends State<PowerCollectApp>
    with WidgetsBindingObserver {
  late final ApiClient api = widget.apiClient ?? ApiClient();
  late final FieldStore store = widget.fieldStore ?? FieldStore();
  bool loading = true;
  Map<String, dynamic>? user;
  String? startupError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    restore();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangePlatformBrightness() {
    AppIdentity.dark = _systemIsDark;
    rebuildEverything();
  }

  bool get _systemIsDark =>
      WidgetsBinding.instance.platformDispatcher.platformBrightness ==
      Brightness.dark;

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
  Widget build(BuildContext context) {
    AppIdentity.dark = _systemIsDark;
    return MaterialApp(
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
          ? Scaffold(
              body: Center(
                  child: CircularProgressIndicator(color: AppIdentity.brand)))
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

  InputDecoration _decoration(String hint, String icon, {Widget? suffix}) =>
      InputDecoration(
        hintText: hint,
        hintStyle: AppIdentity.body(16, color: AppIdentity.faint),
        prefixIcon: Padding(
            padding: const EdgeInsetsDirectional.only(start: 14, end: 10),
            child: AppIcon(icon, color: AppIdentity.faint)),
        prefixIconConstraints: const BoxConstraints(),
        suffixIcon: suffix,
        suffixIconConstraints: const BoxConstraints(),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 17),
        border: _border(AppIdentity.line),
        enabledBorder: _border(AppIdentity.line),
        focusedBorder: _border(AppIdentity.brand),
      );

  OutlineInputBorder _border(Color color) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(17),
      borderSide: BorderSide(color: color, width: 1.5));

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
            child: Center(
                child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: ListView(
              padding: const EdgeInsets.fromLTRB(22, 30, 22, 30),
              children: [
                Padding(
                    padding: const EdgeInsets.only(top: 20, bottom: 6),
                    child: Image.asset('assets/images/brand.webp', width: 170)),
                Text('تطبيق الميدان',
                    textAlign: TextAlign.center,
                    style: AppIdentity.heading(27)),
                Padding(
                    padding: const EdgeInsets.only(top: 2, bottom: 22),
                    child: Text('سجّل الدخول للبدء',
                        textAlign: TextAlign.center,
                        style: AppIdentity.body(14, color: AppIdentity.faint))),
                AutofillGroup(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                      TextField(
                          controller: username,
                          autofillHints: const [AutofillHints.username],
                          textInputAction: TextInputAction.next,
                          style: AppIdentity.body(16),
                          decoration: _decoration('اسم المستخدم', 'user')),
                      const SizedBox(height: 12),
                      TextField(
                          controller: password,
                          obscureText: !showPassword,
                          autofillHints: const [AutofillHints.password],
                          onSubmitted: (_) => submit(),
                          style: AppIdentity.body(16),
                          decoration: _decoration('كلمة المرور', 'lock',
                              suffix: Padding(
                                  padding: const EdgeInsetsDirectional.only(
                                      start: 10, end: 14),
                                  child: GestureDetector(
                                      behavior: HitTestBehavior.opaque,
                                      onTap: () => setState(
                                          () => showPassword = !showPassword),
                                      child: Tooltip(
                                          message: showPassword
                                              ? 'إخفاء كلمة المرور'
                                              : 'إظهار كلمة المرور',
                                          child: AppIcon(
                                              showPassword ? 'eyeoff' : 'eye',
                                              color: AppIdentity.faint)))))),
                      const SizedBox(height: 12),
                      if (error != null) ...[
                        AppNotice(error!, error: true),
                        const SizedBox(height: 12),
                      ],
                      AppAction(
                          label: busy ? 'جارٍ الدخول...' : 'تسجيل الدخول',
                          icon: 'login',
                          busy: busy,
                          onPressed: busy ? null : submit),
                    ])),
                Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: Text(
                        'بعد أول دخول وتحميل البيانات، يمكنك إدخال قراءات العدادات دون اتصال. التحصيل يحتاج إلى الإنترنت.',
                        textAlign: TextAlign.center,
                        style:
                            AppIdentity.body(12.5, color: AppIdentity.faint))),
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
      showAppToast(context, 'التحصيل يتطلب اتصالًا بالخادم.', icon: 'cloudoff');
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
      showAppToast(context, 'سُجلت الدفعة مباشرة في السجل المالي.');
    }
    try {
      await refreshCollections();
      if (mounted) await searchCollections();
    } on ApiException catch (_) {
      // The payment is already recorded; a failed refresh must not obscure it.
    }
  }

  Future<void> signOut() async {
    if (widget.store.queuedReadings.isNotEmpty) {
      showAppToast(context, 'زامن القراءات غير المرسلة قبل تسجيل الخروج.',
          icon: 'err');
      return;
    }
    final confirmed = await showAppSheet<bool>(context,
        title: 'تسجيل الخروج؟',
        message: 'ستحتاج إلى الإنترنت لتسجيل الدخول مرة أخرى.',
        children: [_confirmButtons('تسجيل الخروج')]);
    if (confirmed != true) return;
    try {
      await widget.onLogout();
    } on ApiException catch (error) {
      if (mounted) setState(() => message = error.message);
    }
  }

  Widget _confirmButtons(String confirm) => Builder(
      builder: (context) => Row(children: [
            Expanded(
                child: AppAction(
                    label: 'إلغاء',
                    primary: false,
                    onPressed: () => Navigator.pop(context, false))),
            const SizedBox(width: 8),
            Expanded(
                child: AppAction(
                    label: confirm,
                    onPressed: () => Navigator.pop(context, true))),
          ]));

  Future<void> discardRejectedReading(Map<String, dynamic> reading) async {
    final confirmed = await showAppSheet<bool>(context,
        title: 'حذف القراءة المحلية؟',
        message: 'رفض الخادم هذه القراءة: ${reading['sync_error']}\n'
            'سيُحذف الإدخال من هذا الجهاز ويمكنك إدخاله من جديد.',
        children: [_confirmButtons('حذف')]);
    if (confirmed != true) return;
    await widget.store.removeReading(reading['mobile_operation_id'] as String);
    if (mounted) {
      setState(() {});
      showAppToast(context, 'حُذفت القراءة من الجهاز', icon: 'trash');
    }
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
      showAppToast(context, 'جارٍ الإرسال الآن. أعد المحاولة بعد لحظات.',
          icon: 'clock');
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

  List<AppNavItem> get destinations => [
        const AppNavItem('home', 'الرئيسية', 'home'),
        if (canRead) const AppNavItem('readings', 'القراءات', 'bolt'),
        if (canCollect) const AppNavItem('collections', 'التحصيل', 'cash'),
        AppNavItem('sync', 'الإرسال', 'cloud',
            badge: widget.store.queuedReadings.length),
        const AppNavItem('account', 'حسابي', 'user'),
      ];

  @override
  Widget build(BuildContext context) {
    final inReadings = section == FieldSection.readings && canRead;
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
                    onSync: () => navigate(FieldSection.sync),
                    onRefresh: synchronize,
                    onSave: saveReadings,
                    onExit: () => navigate(FieldSection.home),
                    onReauthenticate: widget.onReauthenticate,
                    onFocusChanged: (focused) =>
                        setState(() => readingFocus = focused),
                  )
                : SafeArea(bottom: false, child: sectionBody()),
          ),
        ),
        bottomNavigationBar: inReadings && readingFocus
            ? null
            : AppNavBar(
                items: destinations,
                selected: section.name,
                onSelect: (id) => navigate(FieldSection.values.byName(id))),
      ),
    );
  }

  String get offlineText => switch (section) {
        FieldSection.collections =>
          'لا يوجد اتصال. اتصل بالإنترنت لتسجيل الدفعات.',
        FieldSection.sync =>
          'لا يوجد اتصال. ستُرسل القراءات تلقائيًا عند عودته.',
        _ => canRead
            ? 'لا يوجد اتصال. تُحفظ القراءات على الجهاز وتُرسل تلقائيًا. التحصيل يحتاج إلى الإنترنت.'
            : 'لا يوجد اتصال. اتصل بالإنترنت لتسجيل الدفعات.',
      };

  Widget sectionBody() {
    final firstName = '${widget.user['name'] ?? ''}'.trim().split(' ').first;
    final title = switch (section) {
      FieldSection.collections => 'التحصيل',
      FieldSection.sync => 'حالة الإرسال',
      FieldSection.account => 'حسابي',
      _ => 'مرحبًا، $firstName',
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
      if (!online && !syncing && section != FieldSection.account)
        Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: AppNotice(offlineText, warning: true, icon: 'cloudoff')),
      if (message != null && (online || requiresLogin))
        Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: AppNotice(message!, warning: true)),
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

  /// «3 payments», as Arabic counts them.
  String paymentsCount(int count) => switch (count) {
        0 => 'لا دفعات',
        1 => 'دفعة واحدة',
        2 => 'دفعتان',
        <= 10 => '$count دفعات',
        _ => '$count دفعة',
      };

  Widget home() {
    final total = today.fold<double>(0, (sum, payment) {
      return sum +
          (double.tryParse(
                  '${payment['amount_in_shekels'] ?? payment['amount']}') ??
              0);
    });
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
    final rejected = queued.any((reading) => reading['sync_error'] != null);
    final ratio = subscribers.isEmpty ? 0.0 : done / subscribers.length;
    return refreshable(ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
        children: [
          AppHero(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  height: 26,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(
                      color: const Color(0x18FFFFFF),
                      borderRadius: BorderRadius.circular(99)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                            color: syncing
                                ? const Color(0xFF93C5FD)
                                : online
                                    ? AppIdentity.heroGood
                                    : AppIdentity.heroWarn,
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
                  Flexible(
                      child: Text.rich(
                          TextSpan(children: [
                            const TextSpan(text: 'أسبوع '),
                            TextSpan(
                                text:
                                    '${AppIdentity.shortDate(weekStart)} – ${AppIdentity.shortDate(widget.store.state['week_end'])}',
                                style: AppIdentity.number(12.5,
                                    weight: FontWeight.w500,
                                    color: AppIdentity.heroFaint)),
                          ]),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppIdentity.body(12.5,
                              color: AppIdentity.heroFaint))),
              ]),
              const SizedBox(height: 16),
              Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                if (canRead)
                  Expanded(
                      child: Row(children: [
                    AppRing(ratio),
                    const SizedBox(width: 12),
                    Expanded(
                        child: heroStat(
                            'قراءات الأسبوع', '$done / ${subscribers.length}')),
                  ])),
                if (canRead && canCollect) const SizedBox(width: 12),
                if (canCollect)
                  Expanded(
                      child: heroStat(
                          'تحصيل اليوم', '${AppIdentity.grouped(total)} ₪',
                          note: paymentsCount(today.length))),
                if (!canRead && !canCollect)
                  Expanded(
                      child: heroStat('الفرع',
                          '${widget.user['branch_name'] ?? 'جميع الفروع'}',
                          size: 18)),
              ]),
            ]),
          ),
          if (queued.isNotEmpty)
            AppStrip(
                key: const ValueKey('home-pending'),
                icon: rejected ? 'err' : 'clock',
                tone: rejected ? AppTone.bad : AppTone.warning,
                text:
                    '${AppIdentity.readingsCount(queued.length)} بانتظار المزامنة',
                action: 'عرض',
                onTap: () => navigate(FieldSection.sync)),
          if (canRead && drafts > 0)
            AppStrip(
                icon: 'note',
                tone: AppTone.brand,
                text: '${AppIdentity.readingsCount(drafts)} مكتوبة ولم تُحفظ',
                action: 'متابعة',
                onTap: () => navigate(FieldSection.readings)),
          const AppSection('ماذا تريد أن تسجّل اليوم؟'),
          if (canRead)
            AppServiceCard(
                title: 'إدخال القراءات',
                subtitle: 'قراءات عدادات الطبلونات',
                summary: 'قُرئت $done من ${subscribers.length}',
                icon: 'bolt',
                color: AppIdentity.brand,
                tint: AppIdentity.brandSoft,
                onTap: () => navigate(FieldSection.readings)),
          if (canCollect)
            AppServiceCard(
                title: 'تسجيل الدفعات',
                subtitle: 'تحصيل دفعات المشتركين',
                summary: 'اليوم ${AppIdentity.grouped(total)} ₪',
                icon: 'cash',
                color: AppIdentity.good,
                tint: AppIdentity.goodTint,
                onTap: () => navigate(FieldSection.collections)),
          if (canViewReadings)
            AppServiceCard(
                title: 'القراءات الأسبوعية',
                subtitle: 'قراءات المشتركين والاستهلاك',
                summary: 'عرض فقط',
                icon: 'hist',
                color: AppIdentity.info,
                tint: AppIdentity.infoTint,
                onTap: openWeeklyReadings),
          if (!canRead && !canCollect && !canViewReadings)
            const AppNotice(
                'ليس لديك صلاحية لعرض القراءات أو إدخالها أو تسجيل الدفعات.'),
        ]));
  }

  Widget heroStat(String label, String value,
          {String? note, double size = 23}) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label,
            style: AppIdentity.body(12.5, color: AppIdentity.heroFaint)),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text(value,
                      textDirection: TextDirection.ltr,
                      style: AppIdentity.number(size,
                          weight: FontWeight.w800, color: Colors.white)))),
        ),
        if (note != null)
          Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(note,
                  style: AppIdentity.body(12.5, color: AppIdentity.heroFaint))),
      ]);

  Widget syncView() {
    final queue = widget.store.queuedReadings;
    final rejected = queue.where((reading) => reading['sync_error'] != null);
    return refreshable(ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
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
                    color: rejected.isEmpty ? null : AppIdentity.bad)),
          ]),
          AppSection('القراءات المحفوظة على الجهاز',
              note:
                  'آخر تحديث ${updatedText(widget.store.state['roster_updated_at'] as String?)}'),
          Padding(
              padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
              child: Text('يمكنك تعديل أي قراءة قبل إرسالها.',
                  style: AppIdentity.body(12.5, color: AppIdentity.faint))),
          QueuedReadingsList(
              queue: queue,
              subscribers: widget.store.subscribers,
              onReenter: canRead &&
                      widget.store.state['can_record_readings_now'] == true
                  ? reenterReading
                  : null,
              onDiscard: discardRejectedReading),
          const SizedBox(height: 14),
          AppAction(
              label: syncing
                  ? 'جارٍ المزامنة...'
                  : online
                      ? 'مزامنة الآن'
                      : 'سيتم الإرسال عند عودة الاتصال',
              busy: syncing,
              icon: 'sync',
              onPressed:
                  syncing || !online ? null : () => unawaited(synchronize())),
          const SizedBox(height: 12),
          const AppNotice(
              'المزامنة دون اتصال مخصصة لقراءات العدادات فقط. الدفعات تُسجّل أثناء الاتصال مباشرة.'),
        ]));
  }

  Widget account() {
    final name = '${widget.user['name'] ?? '?'}';
    return ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
        children: [
          AppPanel(
              child: Row(children: [
            SizedBox(
                width: 66,
                height: 66,
                child: AppHero(
                    radius: 22,
                    shadow: false,
                    padding: EdgeInsets.zero,
                    child: Center(
                        child: Text(name.characters.first,
                            style: AppIdentity.heading(28,
                                color: Colors.white))))),
            const SizedBox(width: 14),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(name, style: AppIdentity.heading(21)),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: Text('@${widget.user['username']}',
                        textDirection: TextDirection.ltr,
                        style: AppIdentity.body(13, color: AppIdentity.faint)),
                  ),
                  Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Row(children: [
                        AppIcon('pin', size: 15, color: AppIdentity.faint),
                        const SizedBox(width: 4),
                        Expanded(
                            child: Text(
                                '${widget.user['branch_name'] ?? 'جميع الفروع'}',
                                style: AppIdentity.body(13,
                                    color: AppIdentity.faint))),
                      ])),
                ])),
          ])),
          const AppSection('الصلاحيات المتاحة'),
          AppRows(children: [
            for (final (allowed, label, icon) in [
              (canRead, 'إدخال القراءات', 'bolt'),
              (canCollect, 'تسجيل الدفعات', 'cash'),
              (canViewReadings, 'عرض القراءات الأسبوعية', 'hist'),
            ])
              AppRow(
                  leading: AppIconTile(
                      icon,
                      allowed ? AppIdentity.ink : AppIdentity.faint,
                      AppIdentity.sunken,
                      size: 40,
                      iconSize: 20),
                  title: Text(label,
                      style: AppIdentity.body(15,
                          weight: FontWeight.w700,
                          color:
                              allowed ? AppIdentity.ink : AppIdentity.faint)),
                  trailing: AppTag(allowed ? 'مفعّلة' : 'غير مفعّلة',
                      allowed ? AppTone.good : AppTone.muted)),
          ]),
          if (widget.store.queuedReadings.isNotEmpty)
            Padding(
                padding: const EdgeInsets.only(top: 12),
                child: AppNotice(
                    '${AppIdentity.readingsCount(widget.store.queuedReadings.length)} لم تُرسل بعد. زامنها قبل تسجيل الخروج.',
                    warning: true)),
          const SizedBox(height: 16),
          AppAction(
              label: 'تسجيل الخروج',
              primary: false,
              icon: 'logout',
              onPressed: signOut),
        ]);
  }
}
