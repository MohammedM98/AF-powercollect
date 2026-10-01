import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

const apiBaseUrl = String.fromEnvironment('API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000');

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
      _request('GET', '/api/mobile/subscribers', query: {'page': '$page'});
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
      _request('GET', '/api/mobile/collections/subscribers',
          query: {'search': search, 'page': '$page'});
  Future<Map<String, dynamic>> collectionsToday() =>
      _request('GET', '/api/mobile/collections');
  Future<Map<String, dynamic>> sendCollection(
          Map<String, dynamic> collection) =>
      _request('POST', '/api/mobile/collections', body: collection);
  Future<Map<String, dynamic>> receiptProviders() =>
      _request('GET', '/api/mobile/payment-providers');
  Future<Map<String, dynamic>> confirmReceipt(
          int receiptId, Map<String, dynamic> fields) =>
      _request('POST', '/api/mobile/payment-receipts/$receiptId/confirm',
          body: fields);

  Future<Map<String, dynamic>> analyzeReceipt(
      String originalPath, String processedPath,
      {int? providerId, bool manual = false}) async {
    try {
      final uri =
          Uri.parse(apiBaseUrl).resolve('/api/mobile/payment-receipts/analyze');
      final request =
          await _client.postUrl(uri).timeout(const Duration(seconds: 12));
      final boundary = 'powercollect-${DateTime.now().microsecondsSinceEpoch}';
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      if (token != null)
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      request.headers.set(HttpHeaders.contentTypeHeader,
          'multipart/form-data; boundary=$boundary');
      final body = BytesBuilder();
      void part(String value) => body.add(utf8.encode(value));
      for (final entry in {
        'manual': manual ? '1' : '0',
        if (providerId != null) 'provider_id': '$providerId'
      }.entries) {
        part(
            '--$boundary\r\nContent-Disposition: form-data; name="${entry.key}"\r\n\r\n${entry.value}\r\n');
      }
      for (final entry in {
        'image': originalPath,
        'processed_image': processedPath
      }.entries) {
        final file = File(entry.value);
        if (await file.length() > 8 * 1024 * 1024)
          throw const ApiException(
              'حجم الصورة يجب ألا يتجاوز 8 ميجابايت.', 422);
        final bytes = await file.readAsBytes();
        final extension = bytes.length >= 2 && bytes[0] == 137 && bytes[1] == 80
            ? 'png'
            : bytes.length >= 12 &&
                    ascii.decode(bytes.sublist(8, 12), allowInvalid: true) ==
                        'WEBP'
                ? 'webp'
                : 'jpg';
        final mime = extension == 'jpg' ? 'jpeg' : extension;
        part(
            '--$boundary\r\nContent-Disposition: form-data; name="${entry.key}"; filename="receipt.$extension"\r\nContent-Type: image/$mime\r\n\r\n');
        body.add(bytes);
        part('\r\n');
      }
      part('--$boundary--\r\n');
      final bytes = body.takeBytes();
      request.contentLength = bytes.length;
      request.add(bytes);
      final response =
          await request.close().timeout(const Duration(seconds: 45));
      return await _decodeResponse(response)
          .timeout(const Duration(seconds: 45));
    } on SocketException {
      throw const ApiException(
          'تعذر رفع الصورة. احتفظ بالإيصال وأعد المحاولة عند عودة الاتصال.', 0);
    } on TimeoutException {
      throw const ApiException(
          'انتهت مهلة رفع الإيصال. يمكنك إعادة المحاولة بالصورة نفسها.', 0);
    } on FileSystemException {
      throw const ApiException(
          'الصورة غير متاحة. اختر صورة الإيصال مجددًا.', 422);
    } on HttpException {
      throw const ApiException('تعذر رفع صورة الإيصال إلى الخادم.', 0);
    } on HandshakeException {
      throw const ApiException('تعذر إنشاء اتصال آمن بالخادم.', 0);
    } on FormatException {
      throw const ApiException('استجابة غير مفهومة من الخادم.', 0);
    }
  }

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
