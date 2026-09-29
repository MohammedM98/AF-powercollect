package com.example.power_collect

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "powercollect.storage")
            .setMethodCallHandler { call, result ->
                if (call.method == "filesDirectory") {
                    result.success(filesDir.absolutePath)
                } else {
                    result.notImplemented()
                }
            }
    }
}
