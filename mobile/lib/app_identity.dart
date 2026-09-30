import 'package:flutter/material.dart';

abstract final class AppIdentity {
  static const background = Color(0xFFF3F4F6);
  static const surface = Colors.white;
  static const raised = Color(0xFFF7F8FA);
  static const sunken = Color(0xFFEEF0F3);
  static const line = Color(0xFFE2E5E9);
  static const lineSoft = Color(0xFFECEEF1);
  static const ink = Color(0xFF111820);
  static const muted = Color(0xFF4C5460);
  static const faint = Color(0xFF5E6773);
  static const brand = Color(0xFFA51D26);
  static const good = Color(0xFF047857);
  static const warning = Color(0xFFB45309);
  static const bad = Color(0xFFC81E1E);
  static const hero = LinearGradient(colors: [
    Color(0xFF262C34),
    Color(0xFF1C2127),
    Color(0xFF111418),
  ]);
  static const action = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFFB8232C), Color(0xFF7D121B)],
  );

  static TextStyle body(double size,
          {FontWeight weight = FontWeight.normal, Color color = ink}) =>
      TextStyle(
          fontFamily: 'PlexArabic',
          fontSize: size,
          height: 1.35,
          fontWeight: weight,
          color: color);
  static TextStyle heading(double size, {Color color = ink}) => TextStyle(
      fontFamily: 'ElMessiri',
      fontSize: size,
      fontWeight: FontWeight.w700,
      color: color);
  static TextStyle number(double size, {Color color = ink}) => TextStyle(
      fontFamily: 'Alexandria',
      fontSize: size,
      height: 1.1,
      fontWeight: FontWeight.w700,
      color: color);

  static BoxDecoration card({double radius = 20}) => BoxDecoration(
          color: surface,
          border: Border.all(color: lineSoft),
          borderRadius: BorderRadius.circular(radius),
          boxShadow: const [
            BoxShadow(
                color: Color(0x0D101828), blurRadius: 20, offset: Offset(0, 5))
          ]);

  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        fontFamily: 'PlexArabic',
        colorScheme: ColorScheme.fromSeed(
            seedColor: brand, primary: brand, surface: surface),
        scaffoldBackgroundColor: background,
        textTheme: const TextTheme(
          titleLarge:
              TextStyle(fontFamily: 'ElMessiri', fontWeight: FontWeight.w700),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: surface,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: line, width: 1.5)),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: line, width: 1.5)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: brand, width: 1.5)),
        ),
        dialogTheme: DialogThemeData(
            backgroundColor: surface,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24))),
      );

  static String money(dynamic value) =>
      (double.tryParse('$value') ?? 0).toStringAsFixed(2);
}

class AppPanel extends StatelessWidget {
  const AppPanel(
      {required this.child,
      this.padding = const EdgeInsets.all(16),
      super.key});
  final Widget child;
  final EdgeInsetsGeometry padding;
  @override
  Widget build(BuildContext context) => Container(
        decoration: AppIdentity.card(),
        child: Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          child: Padding(padding: padding, child: child),
        ),
      );
}

class AppHeader extends StatelessWidget {
  const AppHeader(
      {required this.title,
      this.subtitle,
      this.onBack,
      this.onSync,
      this.online = true,
      this.syncing = false,
      this.pending = 0,
      super.key});
  final String title;
  final String? subtitle;
  final VoidCallback? onBack;
  final VoidCallback? onSync;
  final bool online;
  final bool syncing;
  final int pending;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 10),
        child: Row(children: [
          if (onBack != null)
            AppIconButton(
                icon: Icons.arrow_forward, label: 'رجوع', onPressed: onBack!)
          else
            Image.asset('assets/images/brand-mark.webp',
                width: 48, height: 42, fit: BoxFit.contain),
          const SizedBox(width: 10),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(title,
                    style: AppIdentity.heading(19),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                if (subtitle != null && subtitle!.isNotEmpty)
                  Text(subtitle!,
                      style: AppIdentity.body(12.5, color: AppIdentity.faint),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
              ])),
          if (onSync != null) ...[
            const SizedBox(width: 8),
            Badge(
              isLabelVisible: pending > 0,
              label: Text('$pending'),
              child: AppIconButton(
                  icon: syncing
                      ? Icons.sync
                      : online
                          ? Icons.cloud_done_outlined
                          : Icons.cloud_off_outlined,
                  label: 'حالة الإرسال',
                  onPressed: onSync!),
            ),
          ],
        ]),
      );
}

class AppIconButton extends StatelessWidget {
  const AppIconButton(
      {required this.icon,
      required this.label,
      required this.onPressed,
      super.key});
  final IconData icon;
  final String label;
  final VoidCallback onPressed;
  @override
  Widget build(BuildContext context) => Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
            color: AppIdentity.surface,
            border: Border.all(color: AppIdentity.lineSoft),
            borderRadius: BorderRadius.circular(14)),
        child: IconButton(
            onPressed: onPressed,
            tooltip: label,
            padding: EdgeInsets.zero,
            icon: Icon(icon, size: 20, color: AppIdentity.muted)),
      );
}

class AppAction extends StatelessWidget {
  const AppAction(
      {required this.label,
      required this.onPressed,
      this.primary = true,
      this.icon,
      this.busy = false,
      super.key});
  final String label;
  final VoidCallback? onPressed;
  final bool primary;
  final IconData? icon;
  final bool busy;
  @override
  Widget build(BuildContext context) => Opacity(
        opacity: onPressed == null ? .55 : 1,
        child: Container(
          constraints: const BoxConstraints(minHeight: 54),
          width: double.infinity,
          decoration: BoxDecoration(
            color: primary ? null : AppIdentity.surface,
            gradient: primary ? AppIdentity.action : null,
            border: primary ? null : Border.all(color: AppIdentity.line),
            borderRadius: BorderRadius.circular(17),
          ),
          child: TextButton(
            onPressed: busy ? null : onPressed,
            style: TextButton.styleFrom(
                foregroundColor: primary ? Colors.white : AppIdentity.ink,
                disabledForegroundColor:
                    primary ? Colors.white : AppIdentity.muted,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(17))),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              if (busy)
                const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
              else if (icon != null)
                Icon(icon, size: 20),
              if (busy || icon != null) const SizedBox(width: 8),
              Flexible(
                  child: Text(label,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w700))),
            ]),
          ),
        ),
      );
}

class AppNotice extends StatelessWidget {
  const AppNotice(this.text,
      {this.error = false, this.success = false, super.key});
  final String text;
  final bool error;
  final bool success;
  @override
  Widget build(BuildContext context) {
    final color = error
        ? AppIdentity.bad
        : success
            ? AppIdentity.good
            : AppIdentity.warning;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: color.withValues(alpha: .08),
          borderRadius: BorderRadius.circular(14)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(
            error
                ? Icons.error_outline
                : success
                    ? Icons.check_circle_outline
                    : Icons.info_outline,
            color: color,
            size: 18),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: AppIdentity.body(13, color: color))),
      ]),
    );
  }
}

class AppStat extends StatelessWidget {
  const AppStat(this.label, this.value,
      {this.color = AppIdentity.ink, super.key});
  final String label;
  final String value;
  final Color color;
  @override
  Widget build(BuildContext context) => AppPanel(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: AppIdentity.body(12, color: AppIdentity.faint)),
          const SizedBox(height: 5),
          Text(value, style: AppIdentity.number(18, color: color)),
        ]),
      );
}

class AppServiceCard extends StatelessWidget {
  const AppServiceCard(
      {required this.title,
      required this.subtitle,
      required this.summary,
      required this.icon,
      required this.onTap,
      super.key});
  final String title;
  final String subtitle;
  final String summary;
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(24),
              child: Container(
                decoration: AppIdentity.card(radius: 24),
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
                child: Row(children: [
                  Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                          gradient: AppIdentity.hero,
                          borderRadius: BorderRadius.circular(20)),
                      child: Icon(icon, size: 30, color: Colors.white)),
                  const SizedBox(width: 14),
                  Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text(title, style: AppIdentity.heading(19)),
                        Text(subtitle,
                            style:
                                AppIdentity.body(13, color: AppIdentity.faint)),
                        const SizedBox(height: 8),
                        Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                                color: AppIdentity.sunken,
                                borderRadius: BorderRadius.circular(99)),
                            child: Text(summary,
                                style: AppIdentity.body(12.5,
                                    weight: FontWeight.w600))),
                      ])),
                  const Icon(Icons.chevron_left, color: AppIdentity.brand),
                ]),
              ),
            )),
      );
}

class AppKeypad extends StatelessWidget {
  const AppKeypad(
      {required this.onKey,
      this.decimal = false,
      this.enabled = true,
      super.key});
  final ValueChanged<String> onKey;
  final bool decimal;
  final bool enabled;
  @override
  Widget build(BuildContext context) {
    final keys = [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      if (decimal) '.' else 'delete',
      '0',
      if (decimal) 'delete' else 'next'
    ];
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
        decoration: const BoxDecoration(
            color: AppIdentity.sunken,
            border: Border(top: BorderSide(color: AppIdentity.lineSoft))),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (var row = 0; row < 4; row++)
            Padding(
              padding: EdgeInsets.only(bottom: row == 3 ? 0 : 7),
              child: Row(children: [
                for (var column = 0; column < 3; column++) ...[
                  if (column > 0) const SizedBox(width: 7),
                  Expanded(
                      child: SizedBox(
                          height: 50,
                          child: Material(
                            color: keys[row * 3 + column] == 'next'
                                ? AppIdentity.brand
                                : AppIdentity.surface,
                            borderRadius: BorderRadius.circular(14),
                            child: InkWell(
                              key: ValueKey(
                                  '${decimal ? 'payment' : 'reading'}-key-${keys[row * 3 + column]}'),
                              borderRadius: BorderRadius.circular(14),
                              onTap: enabled
                                  ? () => onKey(keys[row * 3 + column])
                                  : null,
                              onLongPress: enabled &&
                                      !decimal &&
                                      keys[row * 3 + column] == '0'
                                  ? () => onKey('.')
                                  : null,
                              child: Center(
                                  child: keys[row * 3 + column] == 'delete'
                                      ? const Icon(Icons.backspace_outlined,
                                          color: AppIdentity.muted, size: 22)
                                      : Text(
                                          keys[row * 3 + column] == 'next'
                                              ? 'التالي'
                                              : keys[row * 3 + column],
                                          style:
                                              keys[row * 3 + column] == 'next'
                                                  ? AppIdentity.body(16,
                                                      weight: FontWeight.w700,
                                                      color: Colors.white)
                                                  : AppIdentity.number(23))),
                            ),
                          ))),
                ],
              ]),
            ),
        ]),
      ),
    );
  }
}
