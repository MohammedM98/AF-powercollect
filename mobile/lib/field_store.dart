import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/services.dart';

String newOperationId() {
  final bytes = List<int>.generate(16, (_) => Random.secure().nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex =
      bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

class PendingReadingsAccountSwitch implements Exception {}

class FieldStore {
  FieldStore({Directory? directory}) : _directory = directory;
  Directory? _directory;
  Map<String, dynamic> state = {};
  Future<void> _lastWrite = Future<void>.value();
  Future<void> _lastMutation = Future<void>.value();

  Future<File> _file() async {
    _directory ??= Directory(await const MethodChannel('powercollect.storage')
            .invokeMethod<String>('filesDirectory') ??
        '');
    if (_directory!.path.isEmpty)
      throw StateError('Local storage is unavailable');
    await _directory!.create(recursive: true);
    return File('${_directory!.path}${Platform.pathSeparator}field_state.json');
  }

  Future<void> load() async {
    final file = await _file();
    if (!await file.exists()) return;
    final decoded = jsonDecode(await file.readAsString());
    if (decoded is Map<String, dynamic>) state = decoded;
  }

  Future<void> save() {
    final snapshot = jsonEncode(state);
    final write = _lastWrite.then<void>((_) async {
      final file = await _file();
      final temporary = File('${file.path}.tmp');
      await temporary.writeAsString(snapshot, flush: true);
      await temporary.rename(file.path);
    });
    _lastWrite =
        write.then<void>((_) {}, onError: (Object _, StackTrace __) {});

    return write;
  }

  Future<void> saveSession(
      Map<String, dynamic> nextUser, String nextToken) async {
    if (user?['id'] != nextUser['id']) {
      if (queuedReadings.isNotEmpty) {
        throw PendingReadingsAccountSwitch();
      }
      for (final key in [
        'subscribers',
        'week_start',
        'week_end',
        'can_record_readings_now',
        'roster_updated_at',
        'queued_readings',
      ]) {
        state.remove(key);
      }
    }
    state['user'] = nextUser;
    state['token'] = nextToken;
    await save();
  }

  List<Map<String, dynamic>> get queuedReadings =>
      (state['queued_readings'] as List<dynamic>? ?? [])
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();

  List<Map<String, dynamic>> get subscribers =>
      (state['subscribers'] as List<dynamic>? ?? [])
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();

  Map<String, dynamic>? get user => state['user'] is Map
      ? Map<String, dynamic>.from(state['user'] as Map)
      : null;

  String? get token => state['token'] as String?;

  Future<void> queueReading(Map<String, dynamic> reading) =>
      queueReadings([reading]);

  Future<void> queueReadings(List<Map<String, dynamic>> readings) async {
    await _mutate(() {
      final queue = queuedReadings;
      queue.addAll(readings);
      state['queued_readings'] = queue;
    });
  }

  Future<void> removeReading(String operationId) async {
    await _mutate(() {
      state['queued_readings'] = queuedReadings
          .where((reading) => reading['mobile_operation_id'] != operationId)
          .toList();
    });
  }

  Future<void> markReadingError(String operationId, String error) async {
    await _mutate(() {
      state['queued_readings'] = queuedReadings.map((reading) {
        if (reading['mobile_operation_id'] == operationId)
          reading['sync_error'] = error;
        return reading;
      }).toList();
    });
  }

  Future<void> _mutate(void Function() change) {
    final mutation = _lastMutation.then<void>((_) async {
      final previous = jsonEncode(state);
      try {
        change();
        await save();
      } catch (_) {
        state = jsonDecode(previous) as Map<String, dynamic>;
        rethrow;
      }
    });
    _lastMutation =
        mutation.then<void>((_) {}, onError: (Object _, StackTrace __) {});

    return mutation;
  }
}
