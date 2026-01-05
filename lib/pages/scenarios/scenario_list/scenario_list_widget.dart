import '/auth/firebase_auth/auth_util.dart';
import '/backend/api_requests/api_calls.dart';
import '/flutter_flow/flutter_flow_icon_button.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'scenario_list_model.dart';
export 'scenario_list_model.dart';

class ScenarioListWidget extends StatefulWidget {
  const ScenarioListWidget({super.key});

  static const String routeName = 'ScenarioList';
  static const String routePath = 'scenarioList';

  @override
  State<ScenarioListWidget> createState() => _ScenarioListWidgetState();
}

class _ScenarioListWidgetState extends State<ScenarioListWidget> {
  late ScenarioListModel _model;

  final scaffoldKey = GlobalKey<ScaffoldState>();
  List<dynamic> scenarios = [];
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _model = createModel(context, () => ScenarioListModel());
    _loadScenarios();
  }

  Future<void> _loadScenarios() async {
    setState(() => isLoading = true);
    try {
      final result = await ScenarioServiceGroup.listScenariosCall.call();
      if (result.succeeded) {
        setState(() {
          scenarios = getJsonField(result.jsonBody, r'''$.scenarios''') ?? [];
        });
      }
    } catch (e) {
      debugPrint('Error loading scenarios: $e');
    }
    setState(() => isLoading = false);
  }

  @override
  void dispose() {
    _model.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => FocusScope.of(context).unfocus(),
      child: Scaffold(
        key: scaffoldKey,
        backgroundColor: FlutterFlowTheme.of(context).primaryBackground,
        appBar: AppBar(
          backgroundColor: FlutterFlowTheme.of(context).primaryBackground,
          automaticallyImplyLeading: false,
          leading: FlutterFlowIconButton(
            borderColor: Colors.transparent,
            borderRadius: 30,
            buttonSize: 46,
            icon: Icon(
              Icons.arrow_back_rounded,
              color: FlutterFlowTheme.of(context).primaryText,
              size: 24,
            ),
            onPressed: () => context.safePop(),
          ),
          title: Text(
            'Call Flow Scenarios',
            style: FlutterFlowTheme.of(context).headlineMedium.override(
                  font: GoogleFonts.interTight(
                    fontWeight: FontWeight.w600,
                  ),
                  color: FlutterFlowTheme.of(context).primaryText,
                  fontSize: 22.0,
                  letterSpacing: 0.0,
                ),
          ),
          actions: [
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(0.0, 0.0, 16.0, 0.0),
              child: FFButtonWidget(
                onPressed: () {
                  context.pushNamed('ScenarioEditor');
                },
                text: 'New Scenario',
                icon: const Icon(Icons.add, size: 18),
                options: FFButtonOptions(
                  height: 40.0,
                  padding: const EdgeInsetsDirectional.fromSTEB(16.0, 0.0, 16.0, 0.0),
                  color: FlutterFlowTheme.of(context).primary,
                  textStyle: FlutterFlowTheme.of(context).titleSmall.override(
                        font: GoogleFonts.interTight(
                          fontWeight: FontWeight.w500,
                        ),
                        color: FlutterFlowTheme.of(context).primaryText,
                        fontSize: 14.0,
                      ),
                  elevation: 0.0,
                  borderRadius: BorderRadius.circular(8.0),
                ),
              ),
            ),
          ],
          centerTitle: false,
          elevation: 0.0,
        ),
        body: SafeArea(
          top: true,
          child: Column(
            children: [
              // Search bar
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: TextFormField(
                  controller: _model.searchController,
                  focusNode: _model.searchFocusNode,
                  onChanged: (value) {
                    setState(() {
                      _model.searchQuery = value;
                    });
                  },
                  decoration: InputDecoration(
                    hintText: 'Search scenarios...',
                    prefixIcon: const Icon(Icons.search),
                    filled: true,
                    fillColor: FlutterFlowTheme.of(context).secondaryBackground,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12.0),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              // Scenarios list
              Expanded(
                child: isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : scenarios.isEmpty
                        ? _buildEmptyState()
                        : _buildScenariosList(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.account_tree_outlined,
            size: 80,
            color: FlutterFlowTheme.of(context).secondaryText,
          ),
          const SizedBox(height: 16),
          Text(
            'No Scenarios Yet',
            style: FlutterFlowTheme.of(context).headlineSmall.override(
                  font: GoogleFonts.interTight(fontWeight: FontWeight.w600),
                  color: FlutterFlowTheme.of(context).primaryText,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Create your first call flow scenario\nto automate conversations',
            textAlign: TextAlign.center,
            style: FlutterFlowTheme.of(context).bodyMedium.override(
                  font: GoogleFonts.inter(),
                  color: FlutterFlowTheme.of(context).secondaryText,
                ),
          ),
          const SizedBox(height: 24),
          FFButtonWidget(
            onPressed: () {
              context.pushNamed('ScenarioEditor');
            },
            text: 'Create Scenario',
            icon: const Icon(Icons.add, size: 18),
            options: FFButtonOptions(
              height: 48.0,
              padding: const EdgeInsetsDirectional.fromSTEB(24.0, 0.0, 24.0, 0.0),
              color: FlutterFlowTheme.of(context).primary,
              textStyle: FlutterFlowTheme.of(context).titleSmall.override(
                    font: GoogleFonts.interTight(fontWeight: FontWeight.w500),
                    color: FlutterFlowTheme.of(context).primaryText,
                  ),
              elevation: 0.0,
              borderRadius: BorderRadius.circular(8.0),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScenariosList() {
    final filteredScenarios = scenarios.where((scenario) {
      final name = getJsonField(scenario, r'''$.name''')?.toString() ?? '';
      return name.toLowerCase().contains(_model.searchQuery.toLowerCase());
    }).toList();

    return RefreshIndicator(
      onRefresh: _loadScenarios,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16.0),
        itemCount: filteredScenarios.length,
        itemBuilder: (context, index) {
          final scenario = filteredScenarios[index];
          return _buildScenarioCard(scenario);
        },
      ),
    );
  }

  Widget _buildScenarioCard(dynamic scenario) {
    final id = getJsonField(scenario, r'''$.id''')?.toString() ?? '';
    final name = getJsonField(scenario, r'''$.name''')?.toString() ?? 'Untitled';
    final description = getJsonField(scenario, r'''$.description''')?.toString() ?? '';
    final isActive = getJsonField(scenario, r'''$.isActive''') ?? false;
    final nodeCount = (getJsonField(scenario, r'''$.nodes''') as List?)?.length ?? 0;
    final version = getJsonField(scenario, r'''$.version''') ?? 1;

    return Card(
      margin: const EdgeInsets.only(bottom: 12.0),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12.0),
        side: BorderSide(
          color: FlutterFlowTheme.of(context).alternate,
          width: 1,
        ),
      ),
      color: FlutterFlowTheme.of(context).secondaryBackground,
      child: InkWell(
        onTap: () {
          context.pushNamed(
            'ScenarioEditor',
            queryParameters: {'scenarioId': id},
          );
        },
        borderRadius: BorderRadius.circular(12.0),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            children: [
              // Icon
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: isActive
                      ? const Color(0x1A4CAF50)
                      : FlutterFlowTheme.of(context).primaryBackground,
                  borderRadius: BorderRadius.circular(10.0),
                ),
                child: Icon(
                  Icons.account_tree,
                  color: isActive
                      ? const Color(0xFF4CAF50)
                      : FlutterFlowTheme.of(context).secondaryText,
                  size: 24,
                ),
              ),
              const SizedBox(width: 16),
              // Details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            name,
                            style: FlutterFlowTheme.of(context).titleMedium.override(
                                  font: GoogleFonts.interTight(fontWeight: FontWeight.w600),
                                  color: FlutterFlowTheme.of(context).primaryText,
                                  fontSize: 16,
                                ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: isActive
                                ? const Color(0x1A4CAF50)
                                : FlutterFlowTheme.of(context).primaryBackground,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            isActive ? 'Active' : 'Draft',
                            style: FlutterFlowTheme.of(context).bodySmall.override(
                                  font: GoogleFonts.inter(fontWeight: FontWeight.w500),
                                  color: isActive
                                      ? const Color(0xFF4CAF50)
                                      : FlutterFlowTheme.of(context).secondaryText,
                                  fontSize: 11,
                                ),
                          ),
                        ),
                      ],
                    ),
                    if (description.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        description,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: FlutterFlowTheme.of(context).bodySmall.override(
                              font: GoogleFonts.inter(),
                              color: FlutterFlowTheme.of(context).secondaryText,
                            ),
                      ),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(
                          Icons.circle,
                          size: 8,
                          color: FlutterFlowTheme.of(context).secondaryText,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          '$nodeCount nodes',
                          style: FlutterFlowTheme.of(context).bodySmall.override(
                                font: GoogleFonts.inter(),
                                color: FlutterFlowTheme.of(context).secondaryText,
                                fontSize: 12,
                              ),
                        ),
                        const SizedBox(width: 16),
                        Icon(
                          Icons.history,
                          size: 14,
                          color: FlutterFlowTheme.of(context).secondaryText,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'v$version',
                          style: FlutterFlowTheme.of(context).bodySmall.override(
                                font: GoogleFonts.inter(),
                                color: FlutterFlowTheme.of(context).secondaryText,
                                fontSize: 12,
                              ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              // Actions
              PopupMenuButton<String>(
                icon: Icon(
                  Icons.more_vert,
                  color: FlutterFlowTheme.of(context).secondaryText,
                ),
                onSelected: (value) async {
                  if (value == 'delete') {
                    final confirm = await showDialog<bool>(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text('Delete Scenario'),
                        content: Text('Are you sure you want to delete "$name"?'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(context, false),
                            child: const Text('Cancel'),
                          ),
                          TextButton(
                            onPressed: () => Navigator.pop(context, true),
                            child: const Text('Delete', style: TextStyle(color: Colors.red)),
                          ),
                        ],
                      ),
                    );
                    if (confirm == true) {
                      await ScenarioServiceGroup.deleteScenariosCall.call(scenarioId: id);
                      _loadScenarios();
                    }
                  } else if (value == 'duplicate') {
                    await ScenarioServiceGroup.duplicateScenariosCall.call(scenarioId: id);
                    _loadScenarios();
                  }
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(value: 'duplicate', child: Text('Duplicate')),
                  const PopupMenuItem(
                    value: 'delete',
                    child: Text('Delete', style: TextStyle(color: Colors.red)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

