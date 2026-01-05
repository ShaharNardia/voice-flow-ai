import '/flutter_flow/flutter_flow_util.dart';
import 'scenario_list_widget.dart' show ScenarioListWidget;
import 'package:flutter/material.dart';

class ScenarioListModel extends FlutterFlowModel<ScenarioListWidget> {
  /// State fields
  final unfocusNode = FocusNode();
  
  /// API call result
  dynamic scenariosResult;
  
  /// Search query
  String searchQuery = '';
  TextEditingController? searchController;
  FocusNode? searchFocusNode;

  @override
  void initState(BuildContext context) {
    searchController = TextEditingController();
    searchFocusNode = FocusNode();
  }

  @override
  void dispose() {
    unfocusNode.dispose();
    searchController?.dispose();
    searchFocusNode?.dispose();
  }
}


