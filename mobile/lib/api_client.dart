import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// The server the app talks to. A release build must be built with
/// `--dart-define=API_BASE_URL=https://<domain>`; only a debug build falls back
/// to the Android emulator's address of the development server, so a release
/// can never ship pointing at a developer machine.
const apiBaseUrl = String.fromEnvironment('API_BASE_URL',
    defaultValue:
        bool.fromEnvironment('dart.vm.product') ? '' : 'http://10.0.2.2:8000');

class ApiException implements Exception {
  const ApiException(this.message, this.statusCode);
  final String message;
  final int statusCode;
  bool get isNetwork => statusCode == 0;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({HttpClient? httpClient}) : _client = httpClient ?? HttpClient();
  final HttpClient _client;
  String? token;

  Future<Map<String, dynamic>> login(String username, String password) async {
    final result = await _request('POST', '/api/mobile/login',
        body: {'username': username, 'password': password});
    token = result['token'] as String;
    return result;
  }

  Future<Map<String, dynamic>> me() => _request('GET', '/api/mobile/me');
  Future<Map<String, dynamic>> rosterPage(int page) =>
      _request('GET', '/api/mobile/subscriptions', query: {'page': '$page'});
  Future<Map<String, dynamic>> sendReading(Map<String, dynamic> reading) =>
      _request('POST', '/api/mobile/readings', body: reading);
  Future<Map<String, dynamic>> weeklyReadings(
          {String search = '', String? week, int page = 1}) =>
      _request('GET', '/api/mobile/readings', query: {
        'search': search,
        'page': '$page',
        if (week != null) 'week': week,
      });
  Future<Map<String, dynamic>> findCollectionSubscribers(String search,
          {int page = 1}) =>
      _request('GET', '/api/mobile/collections/subscriptions',
          query: {'search': search, 'page': '$page'});
  Future<Map<String, dynamic>> collectionSubscriber(int id) =>
      _request('GET', '/api/mobile/collections/subscriptions/$id');
  Future<Map<String, dynamic>> collectionsToday() =>
      _request('GET', '/api/mobile/collections');
  Future<Map<String, dynamic>> sendCollection(
          Map<String, dynamic> collection) =>
      _request('POST', '/api/mobile/collections', body: collection);

  Future<Map<String, dynamic>> _decodeResponse(
      HttpClientResponse response) async {
    final decoded = jsonDecode(await utf8.decoder.bind(response).join())
        as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      final errors = decoded['errors'];
      String? firstError;
      if (errors is Map && errors.isNotEmpty) {
        final value = errors.values.first;
        if (value is List && value.isNotEmpty) firstError = '${value.first}';
      }
      throw ApiException(
          firstError ?? '${decoded['message'] ?? 'تعذر إكمال الطلب.'}',
          response.statusCode);
    }
    return decoded;
  }

  Future<void> logout() async {
    await _request('POST', '/api/mobile/logout');
    token = null;
  }

  Future<Map<String, dynamic>> _request(String method, String path,
      {Map<String, String>? query, Map<String, dynamic>? body}) async {
    if (apiBaseUrl.isEmpty) {
      throw const ApiException(
          'لم يُضبط عنوان الخادم في هذا الإصدار من التطبيق (API_BASE_URL).', 0);
    }
    final uri =
        Uri.parse(apiBaseUrl).resolve(path).replace(queryParameters: query);
    try {
      final request = await _client
          .openUrl(method, uri)
          .timeout(const Duration(seconds: 12));
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      if (token != null)
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      if (body != null) {
        request.headers.contentType = ContentType.json;
        request.write(jsonEncode(body));
      }
      final response =
          await request.close().timeout(const Duration(seconds: 18));
      return await _decodeResponse(response)
          .timeout(const Duration(seconds: 18));
    } on SocketException {
      throw const ApiException('لا يمكن الوصول إلى خادم Laravel.', 0);
    } on TimeoutException {
      throw const ApiException('انتهت مهلة الاتصال بالخادم.', 0);
    } on HandshakeException {
      throw const ApiException('تعذر إنشاء اتصال آمن بالخادم.', 0);
    } on HttpException {
      throw const ApiException('استجابة غير صالحة من الخادم.', 0);
    } on FormatException {
      throw const ApiException('استجابة غير مفهومة من الخادم.', 0);
    }
  }
}
