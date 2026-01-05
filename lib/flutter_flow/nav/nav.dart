import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:page_transition/page_transition.dart';
import 'package:provider/provider.dart';
import '/backend/backend.dart';
import '/backend/schema/structs/index.dart';
import '/backend/schema/enums/enums.dart';

import '/auth/base_auth_user_provider.dart';

import '/main.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/lat_lng.dart';
import '/flutter_flow/place.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'serialization_util.dart';

import '/index.dart';

export 'package:go_router/go_router.dart';
export 'serialization_util.dart';

const kTransitionInfoKey = '__transition_info__';

GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();

class AppStateNotifier extends ChangeNotifier {
  AppStateNotifier._();

  static AppStateNotifier? _instance;
  static AppStateNotifier get instance => _instance ??= AppStateNotifier._();

  BaseAuthUser? initialUser;
  BaseAuthUser? user;
  bool showSplashImage = true;
  String? _redirectLocation;

  /// Determines whether the app will refresh and build again when a sign
  /// in or sign out happens. This is useful when the app is launched or
  /// on an unexpected logout. However, this must be turned off when we
  /// intend to sign in/out and then navigate or perform any actions after.
  /// Otherwise, this will trigger a refresh and interrupt the action(s).
  bool notifyOnAuthChange = true;

  bool get loading => user == null || showSplashImage;
  bool get loggedIn => user?.loggedIn ?? false;
  bool get initiallyLoggedIn => initialUser?.loggedIn ?? false;
  bool get shouldRedirect => loggedIn && _redirectLocation != null;

  String getRedirectLocation() => _redirectLocation!;
  bool hasRedirect() => _redirectLocation != null;
  void setRedirectLocationIfUnset(String loc) => _redirectLocation ??= loc;
  void clearRedirectLocation() => _redirectLocation = null;

  /// Mark as not needing to notify on a sign in / out when we intend
  /// to perform subsequent actions (such as navigation) afterwards.
  void updateNotifyOnAuthChange(bool notify) => notifyOnAuthChange = notify;

  void update(BaseAuthUser newUser) {
    final shouldUpdate =
        user?.uid == null || newUser.uid == null || user?.uid != newUser.uid;
    initialUser ??= newUser;
    user = newUser;
    // Refresh the app on auth change unless explicitly marked otherwise.
    // No need to update unless the user has changed.
    if (notifyOnAuthChange && shouldUpdate) {
      notifyListeners();
    }
    // Once again mark the notifier as needing to update on auth change
    // (in order to catch sign in / out events).
    updateNotifyOnAuthChange(true);
  }

  void stopShowingSplashImage() {
    showSplashImage = false;
    notifyListeners();
  }
}

GoRouter createRouter(AppStateNotifier appStateNotifier) => GoRouter(
      initialLocation: '/',
      debugLogDiagnostics: true,
      refreshListenable: appStateNotifier,
      navigatorKey: appNavigatorKey,
      errorBuilder: (context, state) =>
          appStateNotifier.loggedIn ? DashboardWidget() : LoginScreenWidget(),
      routes: [
        FFRoute(
          name: '_initialize',
          path: '/',
          builder: (context, _) => appStateNotifier.loggedIn
              ? DashboardWidget()
              : LoginScreenWidget(),
          routes: [
            FFRoute(
              name: DashboardWidget.routeName,
              path: DashboardWidget.routePath,
              requireAuth: true,
              builder: (context, params) => DashboardWidget(),
            ),
            FFRoute(
              name: CallLogsWidget.routeName,
              path: CallLogsWidget.routePath,
              requireAuth: true,
              builder: (context, params) => CallLogsWidget(),
            ),
            FFRoute(
              name: ScheduleWidget.routeName,
              path: ScheduleWidget.routePath,
              builder: (context, params) => ScheduleWidget(),
            ),
            FFRoute(
              name: ProfessionalsWidget.routeName,
              path: ProfessionalsWidget.routePath,
              requireAuth: true,
              builder: (context, params) => ProfessionalsWidget(),
            ),
            FFRoute(
              name: BookingsWidget.routeName,
              path: BookingsWidget.routePath,
              requireAuth: true,
              builder: (context, params) => BookingsWidget(),
            ),
            FFRoute(
              name: InvoiceWidget.routeName,
              path: InvoiceWidget.routePath,
              requireAuth: true,
              builder: (context, params) => InvoiceWidget(),
            ),
            FFRoute(
              name: BillingWidget.routeName,
              path: BillingWidget.routePath,
              requireAuth: true,
              builder: (context, params) => BillingWidget(),
            ),
            FFRoute(
              name: ClientWidget.routeName,
              path: ClientWidget.routePath,
              requireAuth: true,
              builder: (context, params) => ClientWidget(),
            ),
            FFRoute(
              name: LeadCaptureWidget.routeName,
              path: LeadCaptureWidget.routePath,
              requireAuth: true,
              builder: (context, params) => LeadCaptureWidget(),
            ),
            FFRoute(
              name: LeadsWidget.routeName,
              path: LeadsWidget.routePath,
              requireAuth: true,
              builder: (context, params) => LeadsWidget(),
            ),
            FFRoute(
              name: CallBlasterWidget.routeName,
              path: CallBlasterWidget.routePath,
              requireAuth: true,
              builder: (context, params) => CallBlasterWidget(),
            ),
            FFRoute(
              name: AgentWidget.routeName,
              path: AgentWidget.routePath,
              builder: (context, params) => AgentWidget(),
            ),
            FFRoute(
              name: FeatureRequestWidget.routeName,
              path: FeatureRequestWidget.routePath,
              requireAuth: true,
              builder: (context, params) => FeatureRequestWidget(),
            ),
            FFRoute(
              name: HelpWidget.routeName,
              path: HelpWidget.routePath,
              requireAuth: true,
              builder: (context, params) => HelpWidget(),
            ),
            FFRoute(
              name: LoginScreenWidget.routeName,
              path: LoginScreenWidget.routePath,
              builder: (context, params) => LoginScreenWidget(),
            ),
            FFRoute(
              name: ProfileScreenWidget.routeName,
              path: ProfileScreenWidget.routePath,
              builder: (context, params) => ProfileScreenWidget(),
            ),
            FFRoute(
              name: SignupScreenWidget.routeName,
              path: SignupScreenWidget.routePath,
              builder: (context, params) => SignupScreenWidget(),
            ),
            FFRoute(
              name: ChangePasswordWidget.routeName,
              path: ChangePasswordWidget.routePath,
              requireAuth: true,
              builder: (context, params) => ChangePasswordWidget(),
            ),
            FFRoute(
              name: EditProfileScreenWidget.routeName,
              path: EditProfileScreenWidget.routePath,
              requireAuth: true,
              builder: (context, params) => EditProfileScreenWidget(),
            ),
            FFRoute(
              name: AssistantsWidget.routeName,
              path: AssistantsWidget.routePath,
              requireAuth: true,
              builder: (context, params) => AssistantsWidget(),
            ),
            FFRoute(
              name: PhoneNumberWidget.routeName,
              path: PhoneNumberWidget.routePath,
              requireAuth: true,
              builder: (context, params) => PhoneNumberWidget(),
            ),
            FFRoute(
              name: ForgetPasswordWidget.routeName,
              path: ForgetPasswordWidget.routePath,
              builder: (context, params) => ForgetPasswordWidget(),
            ),
            FFRoute(
              name: SmsWhatsapWidget.routeName,
              path: SmsWhatsapWidget.routePath,
              requireAuth: true,
              builder: (context, params) => SmsWhatsapWidget(),
            ),
            FFRoute(
              name: AiDispatchWidget.routeName,
              path: AiDispatchWidget.routePath,
              requireAuth: true,
              builder: (context, params) => AiDispatchWidget(),
            ),
            FFRoute(
              name: CallRouteWidget.routeName,
              path: CallRouteWidget.routePath,
              requireAuth: true,
              builder: (context, params) => CallRouteWidget(),
            ),
            FFRoute(
              name: CallMaskingWidget.routeName,
              path: CallMaskingWidget.routePath,
              requireAuth: true,
              builder: (context, params) => CallMaskingWidget(),
            ),
            FFRoute(
              name: TechCallMonitoringWidget.routeName,
              path: TechCallMonitoringWidget.routePath,
              requireAuth: true,
              builder: (context, params) => TechCallMonitoringWidget(),
            ),
            FFRoute(
              name: ApiconnectionWidget.routeName,
              path: ApiconnectionWidget.routePath,
              requireAuth: true,
              builder: (context, params) => ApiconnectionWidget(),
            ),
            FFRoute(
              name: StartupWidget.routeName,
              path: StartupWidget.routePath,
              requireAuth: true,
              builder: (context, params) => StartupWidget(
                update: params.getParam(
                  'update',
                  ParamType.bool,
                ),
              ),
            ),
            FFRoute(
              name: DatePickerComponentWidget.routeName,
              path: DatePickerComponentWidget.routePath,
              builder: (context, params) => DatePickerComponentWidget(),
            ),
            FFRoute(
              name: Startup2Widget.routeName,
              path: Startup2Widget.routePath,
              requireAuth: true,
              builder: (context, params) => Startup2Widget(
                update: params.getParam(
                  'update',
                  ParamType.bool,
                ),
              ),
            ),
            FFRoute(
              name: Startup3Widget.routeName,
              path: Startup3Widget.routePath,
              requireAuth: true,
              builder: (context, params) => Startup3Widget(
                update: params.getParam(
                  'update',
                  ParamType.bool,
                ),
              ),
            ),
            FFRoute(
              name: Startup4Widget.routeName,
              path: Startup4Widget.routePath,
              requireAuth: true,
              builder: (context, params) => Startup4Widget(
                update: params.getParam(
                  'update',
                  ParamType.bool,
                ),
                tabbarindex: params.getParam(
                  'tabbarindex',
                  ParamType.int,
                ),
                mainpage: params.getParam(
                  'mainpage',
                  ParamType.bool,
                ),
              ),
            ),
            FFRoute(
              name: LocalWidget.routeName,
              path: LocalWidget.routePath,
              builder: (context, params) => LocalWidget(),
            ),
            FFRoute(
              name: Startup6Widget.routeName,
              path: Startup6Widget.routePath,
              requireAuth: true,
              builder: (context, params) => Startup6Widget(),
            ),
            FFRoute(
              name: Startup7Widget.routeName,
              path: Startup7Widget.routePath,
              requireAuth: true,
              builder: (context, params) => Startup7Widget(),
            ),
            FFRoute(
              name: StartupGoogleWidget.routeName,
              path: StartupGoogleWidget.routePath,
              builder: (context, params) => StartupGoogleWidget(),
            ),
            FFRoute(
              name: AdminWidget.routeName,
              path: AdminWidget.routePath,
              builder: (context, params) => AdminWidget(),
            ),
            FFRoute(
              name: Startup5Widget.routeName,
              path: Startup5Widget.routePath,
              requireAuth: true,
              builder: (context, params) => Startup5Widget(
                update: params.getParam(
                  'update',
                  ParamType.bool,
                ),
              ),
            ),
            FFRoute(
              name: CallSuccessWidget.routeName,
              path: CallSuccessWidget.routePath,
              builder: (context, params) => CallSuccessWidget(),
            ),
            FFRoute(
              name: CallFailWidget.routeName,
              path: CallFailWidget.routePath,
              builder: (context, params) => CallFailWidget(),
            ),
            FFRoute(
              name: TempWidget.routeName,
              path: TempWidget.routePath,
              builder: (context, params) => TempWidget(),
            ),
            FFRoute(
              name: UpdateAgentWidget.routeName,
              path: UpdateAgentWidget.routePath,
              requireAuth: true,
              builder: (context, params) => UpdateAgentWidget(),
            ),
            FFRoute(
              name: ScenarioListWidget.routeName,
              path: ScenarioListWidget.routePath,
              requireAuth: true,
              builder: (context, params) => ScenarioListWidget(),
            ),
            FFRoute(
              name: ScenarioEditorWidget.routeName,
              path: ScenarioEditorWidget.routePath,
              requireAuth: true,
              builder: (context, params) => ScenarioEditorWidget(
                scenarioId: params.getParam(
                  'scenarioId',
                  ParamType.String,
                ),
              ),
            ),
          ].map((r) => r.toRoute(appStateNotifier)).toList(),
        ),
      ].map((r) => r.toRoute(appStateNotifier)).toList(),
      observers: [routeObserver],
    );

extension NavParamExtensions on Map<String, String?> {
  Map<String, String> get withoutNulls => Map.fromEntries(
        entries
            .where((e) => e.value != null)
            .map((e) => MapEntry(e.key, e.value!)),
      );
}

extension NavigationExtensions on BuildContext {
  void goNamedAuth(
    String name,
    bool mounted, {
    Map<String, String> pathParameters = const <String, String>{},
    Map<String, String> queryParameters = const <String, String>{},
    Object? extra,
    bool ignoreRedirect = false,
  }) =>
      !mounted || GoRouter.of(this).shouldRedirect(ignoreRedirect)
          ? null
          : goNamed(
              name,
              pathParameters: pathParameters,
              queryParameters: queryParameters,
              extra: extra,
            );

  void pushNamedAuth(
    String name,
    bool mounted, {
    Map<String, String> pathParameters = const <String, String>{},
    Map<String, String> queryParameters = const <String, String>{},
    Object? extra,
    bool ignoreRedirect = false,
  }) =>
      !mounted || GoRouter.of(this).shouldRedirect(ignoreRedirect)
          ? null
          : pushNamed(
              name,
              pathParameters: pathParameters,
              queryParameters: queryParameters,
              extra: extra,
            );

  void safePop() {
    // If there is only one route on the stack, navigate to the initial
    // page instead of popping.
    if (canPop()) {
      pop();
    } else {
      go('/');
    }
  }
}

extension GoRouterExtensions on GoRouter {
  AppStateNotifier get appState => AppStateNotifier.instance;
  void prepareAuthEvent([bool ignoreRedirect = false]) =>
      appState.hasRedirect() && !ignoreRedirect
          ? null
          : appState.updateNotifyOnAuthChange(false);
  bool shouldRedirect(bool ignoreRedirect) =>
      !ignoreRedirect && appState.hasRedirect();
  void clearRedirectLocation() => appState.clearRedirectLocation();
  void setRedirectLocationIfUnset(String location) =>
      appState.updateNotifyOnAuthChange(false);
}

extension _GoRouterStateExtensions on GoRouterState {
  Map<String, dynamic> get extraMap =>
      extra != null ? extra as Map<String, dynamic> : {};
  Map<String, dynamic> get allParams => <String, dynamic>{}
    ..addAll(pathParameters)
    ..addAll(uri.queryParameters)
    ..addAll(extraMap);
  TransitionInfo get transitionInfo => extraMap.containsKey(kTransitionInfoKey)
      ? extraMap[kTransitionInfoKey] as TransitionInfo
      : TransitionInfo.appDefault();
}

class FFParameters {
  FFParameters(this.state, [this.asyncParams = const {}]);

  final GoRouterState state;
  final Map<String, Future<dynamic> Function(String)> asyncParams;

  Map<String, dynamic> futureParamValues = {};

  // Parameters are empty if the params map is empty or if the only parameter
  // present is the special extra parameter reserved for the transition info.
  bool get isEmpty =>
      state.allParams.isEmpty ||
      (state.allParams.length == 1 &&
          state.extraMap.containsKey(kTransitionInfoKey));
  bool isAsyncParam(MapEntry<String, dynamic> param) =>
      asyncParams.containsKey(param.key) && param.value is String;
  bool get hasFutures => state.allParams.entries.any(isAsyncParam);
  Future<bool> completeFutures() => Future.wait(
        state.allParams.entries.where(isAsyncParam).map(
          (param) async {
            final doc = await asyncParams[param.key]!(param.value)
                .onError((_, __) => null);
            if (doc != null) {
              futureParamValues[param.key] = doc;
              return true;
            }
            return false;
          },
        ),
      ).onError((_, __) => [false]).then((v) => v.every((e) => e));

  dynamic getParam<T>(
    String paramName,
    ParamType type, {
    bool isList = false,
    List<String>? collectionNamePath,
    StructBuilder<T>? structBuilder,
  }) {
    if (futureParamValues.containsKey(paramName)) {
      return futureParamValues[paramName];
    }
    if (!state.allParams.containsKey(paramName)) {
      return null;
    }
    final param = state.allParams[paramName];
    // Got parameter from `extras`, so just directly return it.
    if (param is! String) {
      return param;
    }
    // Return serialized value.
    return deserializeParam<T>(
      param,
      type,
      isList,
      collectionNamePath: collectionNamePath,
      structBuilder: structBuilder,
    );
  }
}

class FFRoute {
  const FFRoute({
    required this.name,
    required this.path,
    required this.builder,
    this.requireAuth = false,
    this.asyncParams = const {},
    this.routes = const [],
  });

  final String name;
  final String path;
  final bool requireAuth;
  final Map<String, Future<dynamic> Function(String)> asyncParams;
  final Widget Function(BuildContext, FFParameters) builder;
  final List<GoRoute> routes;

  GoRoute toRoute(AppStateNotifier appStateNotifier) => GoRoute(
        name: name,
        path: path,
        redirect: (context, state) {
          if (appStateNotifier.shouldRedirect) {
            final redirectLocation = appStateNotifier.getRedirectLocation();
            appStateNotifier.clearRedirectLocation();
            return redirectLocation;
          }

          if (requireAuth && !appStateNotifier.loggedIn) {
            appStateNotifier.setRedirectLocationIfUnset(state.uri.toString());
            return '/loginScreen';
          }
          return null;
        },
        pageBuilder: (context, state) {
          fixStatusBarOniOS16AndBelow(context);
          final ffParams = FFParameters(state, asyncParams);
          final page = ffParams.hasFutures
              ? FutureBuilder(
                  future: ffParams.completeFutures(),
                  builder: (context, _) => builder(context, ffParams),
                )
              : builder(context, ffParams);
          final child = appStateNotifier.loading
              ? Center(
                  child: SizedBox(
                    width: 50.0,
                    height: 50.0,
                    child: CircularProgressIndicator(
                      valueColor: AlwaysStoppedAnimation<Color>(
                        FlutterFlowTheme.of(context).primary,
                      ),
                    ),
                  ),
                )
              : page;

          final transitionInfo = state.transitionInfo;
          return transitionInfo.hasTransition
              ? CustomTransitionPage(
                  key: state.pageKey,
                  child: child,
                  transitionDuration: transitionInfo.duration,
                  transitionsBuilder:
                      (context, animation, secondaryAnimation, child) =>
                          PageTransition(
                    type: transitionInfo.transitionType,
                    duration: transitionInfo.duration,
                    reverseDuration: transitionInfo.duration,
                    alignment: transitionInfo.alignment,
                    child: child,
                  ).buildTransitions(
                    context,
                    animation,
                    secondaryAnimation,
                    child,
                  ),
                )
              : MaterialPage(key: state.pageKey, child: child);
        },
        routes: routes,
      );
}

class TransitionInfo {
  const TransitionInfo({
    required this.hasTransition,
    this.transitionType = PageTransitionType.fade,
    this.duration = const Duration(milliseconds: 300),
    this.alignment,
  });

  final bool hasTransition;
  final PageTransitionType transitionType;
  final Duration duration;
  final Alignment? alignment;

  static TransitionInfo appDefault() => TransitionInfo(hasTransition: false);
}

class RootPageContext {
  const RootPageContext(this.isRootPage, [this.errorRoute]);
  final bool isRootPage;
  final String? errorRoute;

  static bool isInactiveRootPage(BuildContext context) {
    final rootPageContext = context.read<RootPageContext?>();
    final isRootPage = rootPageContext?.isRootPage ?? false;
    final location = GoRouterState.of(context).uri.toString();
    return isRootPage &&
        location != '/' &&
        location != rootPageContext?.errorRoute;
  }

  static Widget wrap(Widget child, {String? errorRoute}) => Provider.value(
        value: RootPageContext(true, errorRoute),
        child: child,
      );
}

extension GoRouterLocationExtension on GoRouter {
  String getCurrentLocation() {
    final RouteMatch lastMatch = routerDelegate.currentConfiguration.last;
    final RouteMatchList matchList = lastMatch is ImperativeRouteMatch
        ? lastMatch.matches
        : routerDelegate.currentConfiguration;
    return matchList.uri.toString();
  }
}
