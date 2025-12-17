import 'package:flutter/material.dart';
import '/backend/backend.dart';
import '/backend/schema/structs/index.dart';
import '/backend/schema/enums/enums.dart';
import '/backend/api_requests/api_manager.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'flutter_flow/flutter_flow_util.dart';

class FFAppState extends ChangeNotifier {
  static FFAppState _instance = FFAppState._internal();

  factory FFAppState() {
    return _instance;
  }

  FFAppState._internal();

  static void reset() {
    _instance = FFAppState._internal();
  }

  Future initializePersistedState() async {
    prefs = await SharedPreferences.getInstance();
    _safeInit(() {
      _isDispatchShow = prefs.getBool('ff_isDispatchShow') ?? _isDispatchShow;
    });
    _safeInit(() {
      _isLeadShow = prefs.getBool('ff_isLeadShow') ?? _isLeadShow;
    });
    _safeInit(() {
      _navbarOpen = prefs.getBool('ff_navbarOpen') ?? _navbarOpen;
    });
    _safeInit(() {
      _showAppBar = prefs.getBool('ff_showAppBar') ?? _showAppBar;
    });
    _safeInit(() {
      _languageCode = prefs.getString('ff_languageCode') ?? _languageCode;
    });
    _safeInit(() {
      _hasCompletedDashboardWalkthrough =
          prefs.getBool('ff_hasCompletedDashboardWalkthrough') ??
              _hasCompletedDashboardWalkthrough;
    });
  }

  void update(VoidCallback callback) {
    callback();
    notifyListeners();
  }

  late SharedPreferences prefs;

  bool _isDispatchShow = false;
  bool get isDispatchShow => _isDispatchShow;
  set isDispatchShow(bool value) {
    _isDispatchShow = value;
    prefs.setBool('ff_isDispatchShow', value);
  }

  bool _isLeadShow = false;
  bool get isLeadShow => _isLeadShow;
  set isLeadShow(bool value) {
    _isLeadShow = value;
    prefs.setBool('ff_isLeadShow', value);
  }

  bool _navbarOpen = false;
  bool get navbarOpen => _navbarOpen;
  set navbarOpen(bool value) {
    _navbarOpen = value;
    prefs.setBool('ff_navbarOpen', value);
  }

  bool _showAppBar = false;
  bool get showAppBar => _showAppBar;
  set showAppBar(bool value) {
    _showAppBar = value;
    prefs.setBool('ff_showAppBar', value);
  }

  String _languageCode = 'en';
  String get languageCode => _languageCode;
  set languageCode(String value) {
    _languageCode = value;
    prefs.setString('ff_languageCode', value);
  }

  bool _hasCompletedDashboardWalkthrough = false;
  bool get hasCompletedDashboardWalkthrough =>
      _hasCompletedDashboardWalkthrough;
  set hasCompletedDashboardWalkthrough(bool value) {
    _hasCompletedDashboardWalkthrough = value;
    prefs.setBool('ff_hasCompletedDashboardWalkthrough', value);
  }

  bool _expand = true;
  bool get expand => _expand;
  set expand(bool value) {
    _expand = value;
  }

  DateTime? _endTimeValue;
  DateTime? get endTimeValue => _endTimeValue;
  set endTimeValue(DateTime? value) {
    _endTimeValue = value;
  }

  double _progress = 0.0;
  double get progress => _progress;
  set progress(double value) {
    _progress = value;
  }
}

void _safeInit(Function() initializeField) {
  try {
    initializeField();
  } catch (_) {}
}

Future _safeInitAsync(Function() initializeField) async {
  try {
    await initializeField();
  } catch (_) {}
}
