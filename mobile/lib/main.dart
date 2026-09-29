import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api_client.dart';
import 'field_store.dart';

const wine = Color(0xFFA51D26);
const ink = Color(0xFF252B33);
const paper = Color(0xFFF1F3F6);

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
    final result = await api.login(username, password);
    store.state['token'] = result['token'];
    store.state['user'] = result['user'];
    await store.save();
    if (mounted)
      setState(() => user = Map<String, dynamic>.from(result['user'] as Map));
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
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: wine),
          scaffoldBackgroundColor: paper,
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
          ),
        ),
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
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Image.asset('assets/images/brand.webp', height: 100),
                      const SizedBox(height: 24),
                      const Text('تطبيق الميدان',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.bold,
                              color: ink)),
                      const SizedBox(height: 8),
                      const Text('التحصيل وقراءات العدادات',
                          textAlign: TextAlign.center),
                      const SizedBox(height: 28),
                      field('اسم المستخدم', username),
                      const SizedBox(height: 14),
                      TextField(
                          controller: password,
                          obscureText: true,
                          onSubmitted: (_) => submit(),
                          decoration:
                              const InputDecoration(labelText: 'كلمة المرور')),
                      if (error != null) ...[
                        const SizedBox(height: 12),
                        Text(error!, style: const TextStyle(color: wine)),
                      ],
                      const SizedBox(height: 20),
                      FilledButton(
                          onPressed: busy ? null : submit,
                          child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Text(
                                  busy ? 'جارٍ الدخول...' : 'تسجيل الدخول'))),
                    ]),
              ),
            ),
          ),
        ),
      );
}

Widget field(String label, TextEditingController controller,
        {TextInputType? keyboard, bool enabled = true}) =>
    TextField(
        controller: controller,
        enabled: enabled,
        keyboardType: keyboard,
        decoration: InputDecoration(labelText: label));

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
  int tab = 0;
  bool online = false;
  bool syncing = false;
  String? message;
  Timer? timer;
  final readingSearch = TextEditingController();
  final collectionSearch = TextEditingController();
  List<Map<String, dynamic>> collectionResults = [];
  List<Map<String, dynamic>> today = [];
  bool collectionBusy = false;
  bool requiresLogin = false;

  bool get canRead => widget.user['can_record_readings'] == true;
  bool get canCollect => widget.user['can_record_collections'] == true;

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
    readingSearch.dispose();
    collectionSearch.dispose();
    super.dispose();
  }

  Future<void> synchronize() async {
    if (syncing) return;
    setState(() => syncing = true);
    try {
      await widget.api.me();
      if (!mounted) return;
      setState(() => online = true);
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

  Future<void> searchCollections() async {
    if (collectionBusy) return;
    setState(() {
      collectionBusy = true;
      message = null;
    });
    try {
      final result = await widget.api
          .findCollectionSubscribers(collectionSearch.text.trim());
      if (mounted)
        setState(() {
          online = true;
          collectionResults = (result['data'] as List)
              .map((item) => Map<String, dynamic>.from(item as Map))
              .toList();
        });
    } on ApiException catch (error) {
      if (mounted)
        setState(() {
          online = false;
          message = error.message;
          collectionResults = [];
        });
    } finally {
      if (mounted) setState(() => collectionBusy = false);
    }
  }

  Future<void> addReading(Map<String, dynamic> subscriber) async {
    final previous = double.tryParse('${subscriber['previous_reading']}') ?? 0;
    final current = TextEditingController();
    final notes = TextEditingController();
    final result = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
              title: Text('قراءة ${subscriber['full_name']}'),
              content: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                        'السابقة: $previous   •   ${subscriber['account_number']}'),
                    const SizedBox(height: 12),
                    field('القراءة الحالية', current,
                        keyboard: const TextInputType.numberWithOptions(
                            decimal: true)),
                    const SizedBox(height: 12),
                    field('ملاحظات (اختياري)', notes),
                  ]),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('إلغاء')),
                FilledButton(
                    onPressed: () {
                      final value = double.tryParse(current.text.trim());
                      if (value == null || value < previous) {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                            content: Text('أدخل قراءة لا تقل عن $previous')));
                        return;
                      }
                      Navigator.pop(context, true);
                    },
                    child: const Text('حفظ القراءة')),
              ],
            ));
    if (result != true) return;
    final reading = <String, dynamic>{
      'mobile_operation_id': newOperationId(),
      'subscriber_id': subscriber['id'],
      'week_start': widget.store.state['week_start'],
      'current_reading': current.text.trim(),
      'notes': notes.text.trim(),
    };
    await widget.store.queueReading(reading);
    if (!mounted) return;
    setState(
        () => message = 'حُفظت القراءة على الجهاز وستُرسل عند توفر الاتصال.');
    await synchronize();
  }

  Future<void> openPayment(Map<String, dynamic> subscriber) async {
    if (!online) {
      setState(() => message = 'التحصيل يتطلب اتصالًا بالخادم.');
      return;
    }
    final submitted = await showDialog<bool>(
        context: context,
        builder: (context) =>
            PaymentDialog(api: widget.api, subscriber: subscriber));
    if (submitted == true) {
      if (mounted)
        setState(() => message = 'سُجلت الدفعة مباشرة في السجل المالي.');
      try {
        await refreshCollections();
      } on ApiException catch (_) {
        // The payment is already recorded; a failed refresh must not obscure it.
      }
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

  @override
  Widget build(BuildContext context) {
    final tabs = <NavigationDestination>[
      const NavigationDestination(
          icon: Icon(Icons.home_outlined), label: 'الرئيسية'),
      if (canRead)
        const NavigationDestination(
            icon: Icon(Icons.electric_meter_outlined), label: 'القراءات'),
      if (canCollect)
        const NavigationDestination(
            icon: Icon(Icons.payments_outlined), label: 'التحصيل'),
      const NavigationDestination(
          icon: Icon(Icons.person_outline), label: 'حسابي'),
    ];
    final pages = <Widget>[
      home(),
      if (canRead) readings(),
      if (canCollect) collections(),
      account()
    ];
    if (tab >= pages.length) tab = 0;
    return Scaffold(
      appBar: AppBar(
          title: const Text('PowerCollect'),
          backgroundColor: Colors.white,
          actions: [
            IconButton(
                onPressed: syncing ? null : synchronize,
                tooltip: 'مزامنة',
                icon: syncing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.sync))
          ]),
      body: Column(children: [
        Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: online ? const Color(0xFFE8F4EB) : const Color(0xFFFFF1E2),
            child: Text(
                '${online ? 'متصل' : 'غير متصل'} • ${widget.store.queuedReadings.length} قراءات بانتظار المزامنة',
                style: TextStyle(
                    color: online
                        ? Colors.green.shade800
                        : Colors.orange.shade900))),
        if (message != null)
          Padding(
              padding: const EdgeInsets.all(10),
              child: Text(message!, style: const TextStyle(color: wine))),
        if (requiresLogin)
          TextButton(
              onPressed: widget.onReauthenticate,
              child: const Text('تسجيل الدخول مجددًا')),
        Expanded(child: pages[tab]),
      ]),
      bottomNavigationBar: NavigationBar(
          selectedIndex: tab,
          onDestinationSelected: (value) => setState(() => tab = value),
          destinations: tabs),
    );
  }

  Widget home() => ListView(padding: const EdgeInsets.all(20), children: [
        Text('مرحبًا، ${widget.user['name']}',
            style: const TextStyle(
                fontSize: 25, fontWeight: FontWeight.bold, color: ink)),
        Text('${widget.user['branch_name'] ?? 'جميع الفروع'}'),
        const SizedBox(height: 22),
        if (canRead)
          workflowCard(
              Icons.electric_meter,
              'إدخال قراءات العدادات',
              '${widget.store.subscribers.length} مشترك • ${widget.store.queuedReadings.length} غير مرسلة',
              () => setState(() => tab = 1)),
        if (canCollect)
          workflowCard(
              Icons.payments,
              'تحصيل الدفعات',
              'بحث مباشر وتسجيل الدفعة في السجل المالي',
              () => setState(() => tab = canRead ? 2 : 1)),
        if (!canRead && !canCollect)
          const Text('ليس لديك صلاحية لإدخال القراءات أو الدفعات.'),
        if (canRead && widget.store.queuedReadings.isNotEmpty) ...[
          const SizedBox(height: 20),
          const Text('القراءات المحفوظة على الجهاز',
              style: TextStyle(fontWeight: FontWeight.bold)),
          for (final reading in widget.store.queuedReadings)
            ListTile(
              title: Text(
                  'مشترك #${reading['subscriber_id']} • ${reading['current_reading']}'),
              subtitle: Text('${reading['sync_error'] ?? 'بانتظار الاتصال'}'),
              trailing: reading['sync_error'] == null
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.delete_outline),
                      tooltip: 'حذف القراءة المرفوضة',
                      onPressed: () => discardRejectedReading(reading),
                    ),
            ),
        ],
      ]);

  Widget workflowCard(
          IconData icon, String title, String subtitle, VoidCallback open) =>
      Card(
          color: Colors.white,
          child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: CircleAvatar(
                  backgroundColor: wine,
                  child: Icon(icon, color: Colors.white)),
              title: Text(title,
                  style: const TextStyle(fontWeight: FontWeight.bold)),
              subtitle: Text(subtitle),
              trailing: const Icon(Icons.arrow_back_ios_new),
              onTap: open));

  Widget readings() {
    final search = readingSearch.text.trim().toLowerCase();
    final subscribers = widget.store.subscribers.where((item) {
      if (search.isEmpty) return true;
      return [
        'full_name',
        'account_number',
        'meter_box_number',
        'meter_box_name'
      ].any((key) => '${item[key] ?? ''}'.toLowerCase().contains(search));
    }).toList();
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final subscriber in subscribers) {
      final box = '${subscriber['meter_box_number'] ?? 'بدون صندوق'}';
      groups.putIfAbsent(box, () => []).add(subscriber);
    }
    return ListView(padding: const EdgeInsets.all(16), children: [
      const Text('قراءات العدادات',
          style: TextStyle(fontSize: 23, fontWeight: FontWeight.bold)),
      Text(
          'الأسبوع ${widget.store.state['week_start'] ?? '—'} إلى ${widget.store.state['week_end'] ?? '—'}'),
      Text(
          'آخر تحديث: ${widget.store.state['roster_updated_at'] ?? 'لم تُحمّل البيانات بعد'}'),
      const SizedBox(height: 14),
      TextField(
          controller: readingSearch,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
              labelText: 'ابحث بالاسم أو الحساب أو الصندوق',
              prefixIcon: Icon(Icons.search))),
      const SizedBox(height: 12),
      if (widget.store.subscribers.isEmpty)
        const Text('اتصل بالخادم أولًا لتحميل المشتركين إلى الجهاز.'),
      for (final entry in groups.entries) ...[
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text('صندوق ${entry.key} (${entry.value.length})',
                style: const TextStyle(fontWeight: FontWeight.bold))),
        for (final subscriber in entry.value)
          Card(
              color: Colors.white,
              child: ListTile(
                title: Text('${subscriber['full_name']}'),
                subtitle: Text(
                    'حساب ${subscriber['account_number']} • السابقة ${subscriber['previous_reading']}'),
                trailing: Icon(
                    subscriber['reading_status'] != null ||
                            widget.store.queuedReadings.any((reading) =>
                                reading['subscriber_id'] == subscriber['id'] &&
                                reading['week_start'] ==
                                    widget.store.state['week_start'])
                        ? Icons.check_circle
                        : Icons.edit_outlined,
                    color: wine),
                onTap: subscriber['reading_status'] != null ||
                        widget.store.state['can_record_readings_now'] != true ||
                        widget.store.queuedReadings.any((reading) =>
                            reading['subscriber_id'] == subscriber['id'] &&
                            reading['week_start'] ==
                                widget.store.state['week_start'])
                    ? null
                    : () => addReading(subscriber),
              )),
      ],
      if (widget.store.state['can_record_readings_now'] == false)
        const Text('إدخال قراءات هذا الأسبوع غير متاح حاليًا.'),
    ]);
  }

  Widget collections() =>
      ListView(padding: const EdgeInsets.all(16), children: [
        const Text('تحصيل الدفعات',
            style: TextStyle(fontSize: 23, fontWeight: FontWeight.bold)),
        const Text(
            'يتطلب اتصالًا مباشرًا. تُسجّل الدفعة في السجل المالي فور تأكيدك.'),
        const SizedBox(height: 15),
        TextField(
            controller: collectionSearch,
            onSubmitted: (_) => searchCollections(),
            decoration: InputDecoration(
                labelText: 'ابحث باسم المشترك أو رقم الحساب',
                suffixIcon: IconButton(
                    onPressed: searchCollections,
                    icon: const Icon(Icons.search)))),
        const SizedBox(height: 12),
        FilledButton(
            onPressed: collectionBusy ? null : searchCollections,
            child: Text(collectionBusy ? 'جارٍ البحث...' : 'بحث مباشر')),
        for (final subscriber in collectionResults)
          Card(
              color: Colors.white,
              child: ListTile(
                  title: Text('${subscriber['full_name']}'),
                  subtitle: Text(
                      'حساب ${subscriber['account_number']} • الرصيد ${subscriber['balance']} ₪'),
                  trailing: const Icon(Icons.add_circle_outline),
                  onTap: () => openPayment(subscriber))),
        const SizedBox(height: 22),
        const Text('دفعاتي اليوم',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        for (final payment in today)
          ListTile(
            title: Text('${payment['subscriber']} • ${payment['amount']} ₪'),
            subtitle:
                Text('${payment['status']} • ${payment['payment_method']}'),
          ),
      ]);

  Widget account() => ListView(padding: const EdgeInsets.all(20), children: [
        const Icon(Icons.account_circle, size: 70, color: wine),
        Text('${widget.user['name']}',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        Text(
            '${widget.user['username']} • ${widget.user['branch_name'] ?? 'جميع الفروع'}',
            textAlign: TextAlign.center),
        const SizedBox(height: 20),
        if (widget.store.queuedReadings.isNotEmpty)
          Text(
              '${widget.store.queuedReadings.length} قراءات لم تُرسل بعد. زامنها قبل تسجيل الخروج.'),
        OutlinedButton.icon(
            onPressed: signOut,
            icon: const Icon(Icons.logout),
            label: const Text('تسجيل الخروج')),
      ]);
}

class PaymentDialog extends StatefulWidget {
  const PaymentDialog({required this.api, required this.subscriber, super.key});
  final ApiClient api;
  final Map<String, dynamic> subscriber;
  @override
  State<PaymentDialog> createState() => _PaymentDialogState();
}

class _PaymentDialogState extends State<PaymentDialog> {
  final amount = TextEditingController();
  final sender = TextEditingController();
  final reference = TextEditingController();
  final notes = TextEditingController();
  final voucher = TextEditingController();
  String method = 'cash';
  String bank = 'بنك فلسطين';
  bool busy = false;
  bool collectorConfirmed = false;
  String? error;

  Map<String, dynamic>? submission;

  @override
  void dispose() {
    for (final controller in [amount, sender, reference, notes, voucher]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> submit() async {
    final value = double.tryParse(amount.text.trim());
    if (value == null ||
        value <= 0 ||
        (method == 'bank_transfer' &&
            (sender.text.trim().isEmpty || reference.text.trim().isEmpty))) {
      setState(() => error = 'أدخل المبلغ وبيانات التحويل المطلوبة.');
      return;
    }
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
        'payment_method': method,
        if (method == 'bank_transfer') ...{
          'bank_name': bank,
          'sender_name': sender.text.trim(),
          'reference_number': reference.text.trim(),
        },
        if (method == 'cash' && voucher.text.trim().isNotEmpty)
          'manual_voucher_number': voucher.text.trim(),
        'notes': notes.text.trim(),
      };
      await widget.api.sendCollection(submission!);
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (exception) {
      if (exception.statusCode >= 400 && exception.statusCode < 500) {
        submission = null;
      }
      if (mounted)
        setState(() => error = exception.isNetwork
            ? 'تعذر تأكيد الدفعة. تحقق من دفعات اليوم قبل إعادة المحاولة.'
            : exception.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text('دفعة ${widget.subscriber['full_name']}'),
        content: SizedBox(
            width: 400,
            child: SingleChildScrollView(
                child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('الرصيد الحالي ${widget.subscriber['balance']} ₪'),
                const SizedBox(height: 12),
                field('المبلغ بالشيكل', amount,
                    enabled: submission == null,
                    keyboard:
                        const TextInputType.numberWithOptions(decimal: true)),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                    initialValue: method,
                    items: const [
                      DropdownMenuItem(value: 'cash', child: Text('نقدًا')),
                      DropdownMenuItem(
                          value: 'bank_transfer',
                          child: Text('تحويل بنكي / محفظة'))
                    ],
                    onChanged: submission == null
                        ? (value) => setState(() => method = value ?? 'cash')
                        : null),
                const SizedBox(height: 10),
                if (method == 'bank_transfer') ...[
                  DropdownButtonFormField<String>(
                      initialValue: bank,
                      items: const ['بنك فلسطين', 'جوال باي', 'بال باي']
                          .map((name) =>
                              DropdownMenuItem(value: name, child: Text(name)))
                          .toList(),
                      onChanged: submission == null
                          ? (value) => setState(() => bank = value ?? bank)
                          : null),
                  const SizedBox(height: 10),
                  field('اسم المرسل', sender, enabled: submission == null),
                  const SizedBox(height: 10),
                  field('رقم التحويل', reference, enabled: submission == null),
                ] else
                  field('رقم الوصل اليدوي (اختياري)', voucher,
                      enabled: submission == null),
                const SizedBox(height: 10),
                field('ملاحظات (اختياري)', notes, enabled: submission == null),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: collectorConfirmed,
                  onChanged: busy
                      ? null
                      : (value) =>
                          setState(() => collectorConfirmed = value ?? false),
                  title: Text(
                      'أؤكد استلام هذه الدفعة من ${widget.subscriber['full_name']} وتسجيلها مباشرة في السجل المالي.'),
                  controlAffinity: ListTileControlAffinity.leading,
                ),
                if (error != null)
                  Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Text(error!, style: const TextStyle(color: wine))),
              ],
            ))),
        actions: [
          TextButton(
              onPressed: busy ? null : () => Navigator.pop(context, false),
              child: const Text('إلغاء')),
          FilledButton(
              onPressed: busy || !collectorConfirmed ? null : submit,
              child: Text(busy ? 'جارٍ التسجيل...' : 'تسجيل الدفعة')),
        ],
      );
}
