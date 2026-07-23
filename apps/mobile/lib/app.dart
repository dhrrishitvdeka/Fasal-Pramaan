import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fasalpramaan/core/router.dart';
import 'package:fasalpramaan/core/theme.dart';
import 'package:fasalpramaan/core/l10n.dart';

class FasalPramaanApp extends ConsumerWidget {
  const FasalPramaanApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final locale = ref.watch(localeProvider);
    return MaterialApp.router(
      title: 'FasalPramaan',
      theme: buildTheme(),
      locale: locale,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
      builder: (context, child) {
        final mediaQueryData = MediaQuery.of(context);
        final viewInsets = mediaQueryData.viewInsets;
        final safeInsets = EdgeInsets.fromLTRB(
          viewInsets.left.isNegative ? 0.0 : viewInsets.left,
          viewInsets.top.isNegative ? 0.0 : viewInsets.top,
          viewInsets.right.isNegative ? 0.0 : viewInsets.right,
          viewInsets.bottom.isNegative ? 0.0 : viewInsets.bottom,
        );
        return MediaQuery(
          data: mediaQueryData.copyWith(viewInsets: safeInsets),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
