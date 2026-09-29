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

class FieldStore {
  FieldStore({Directory? directory}) : _directory = directory;
  Directory? _directory;
  Map<String, dynamic> state = {};

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

  Future<void> save() async {
    final file = await _file();
    final temporary = File('${file.path}.tmp');
    await temporary.writeAsString(jsonEncode(state), flush: true);
    await temporary.rename(file.path);
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

  Future<void> queueReading(Map<String, dynamic> reading) async {
    final queue = queuedReadings;
    queue.add(reading);
    state['queued_readings'] = queue;
    await save();
  }

  Future<void> removeReading(String operationId) async {
    state['queued_readings'] = queuedReadings
        .where((reading) => reading['mobile_operation_id'] != operationId)
        .toList();
    await save();
  }

  Future<void> markReadingError(String operationId, String error) async {
    state['queued_readings'] = queuedReadings.map((reading) {
      if (reading['mobile_operation_id'] == operationId)
        reading['sync_error'] = error;
      return reading;
    }).toList();
    await save();
  }
}
