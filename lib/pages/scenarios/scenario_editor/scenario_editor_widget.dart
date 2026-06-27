import '/auth/firebase_auth/auth_util.dart';
import '/backend/api_requests/api_calls.dart';
import '/flutter_flow/flutter_flow_icon_button.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:collection/collection.dart';
import 'scenario_editor_model.dart';
export 'scenario_editor_model.dart';

class ScenarioEditorWidget extends StatefulWidget {
  const ScenarioEditorWidget({
    super.key,
    this.scenarioId,
  });

  static const String routeName = 'ScenarioEditor';
  static const String routePath = 'scenarioEditor';

  final String? scenarioId;

  @override
  State<ScenarioEditorWidget> createState() => _ScenarioEditorWidgetState();
}

class _ScenarioEditorWidgetState extends State<ScenarioEditorWidget> {
  late ScenarioEditorModel _model;
  final scaffoldKey = GlobalKey<ScaffoldState>();

  @override
  void initState() {
    super.initState();
    _model = createModel(context, () => ScenarioEditorModel());

    if (widget.scenarioId != null) {
      _loadScenario();
    } else {
      _model.createInitialNodes();
    }
  }

  Future<void> _loadScenario() async {
    setState(() => _model.isLoading = true);
    try {
      final result = await ScenarioServiceGroup.getScenariosCall.call(
        scenarioId: widget.scenarioId,
      );
      if (result.succeeded) {
        _model.fromJson(result.jsonBody as Map<String, dynamic>);
      }
    } catch (e) {
      debugPrint('Error loading scenario: $e');
    }
    setState(() => _model.isLoading = false);
  }

  void _showAiBuilderDialog() {
    final textController = TextEditingController();
    bool isGenerating = false;

    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF9C27B0).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.auto_awesome, color: Color(0xFF9C27B0), size: 24),
              ),
              const SizedBox(width: 12),
              const Text('AI Scenario Builder'),
            ],
          ),
          content: SizedBox(
            width: 500,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Describe the call flow you want to create:',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: FlutterFlowTheme.of(context).primaryText,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: textController,
                  maxLines: 5,
                  decoration: InputDecoration(
                    hintText: 'Example: Create a lead qualification call that greets the customer, asks if they are interested in our product, and schedules a callback if they say yes, or ends politely if they say no.',
                    filled: true,
                    fillColor: FlutterFlowTheme.of(context).primaryBackground,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: FlutterFlowTheme.of(context).alternate),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'Tips:',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: FlutterFlowTheme.of(context).secondaryText,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '• Be specific about what you want the call to accomplish\n'
                  '• Mention any branching logic (if yes/no responses)\n'
                  '• Include any API calls or integrations needed',
                  style: TextStyle(
                    color: FlutterFlowTheme.of(context).secondaryText,
                    fontSize: 12,
                  ),
                ),
                if (isGenerating)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: const Color(0xFF9C27B0),
                          ),
                        ),
                        const SizedBox(width: 12),
                        const Text('Generating scenario with AI...'),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: isGenerating ? null : () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: isGenerating
                  ? null
                  : () async {
                      if (textController.text.trim().isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Please enter a description')),
                        );
                        return;
                      }

                      setDialogState(() => isGenerating = true);

                      try {
                        final result = await ScenarioServiceGroup.generateScenarioAiCall.call(
                          description: textController.text.trim(),
                        );

                        if (result.succeeded) {
                          final nodes = (result.jsonBody['nodes'] as List<dynamic>?)
                              ?.map((n) => FlowNode.fromJson(n as Map<String, dynamic>))
                              .toList() ?? [];
                          final edges = (result.jsonBody['edges'] as List<dynamic>?)
                              ?.map((e) => FlowEdge.fromJson(e as Map<String, dynamic>))
                              .toList() ?? [];

                          Navigator.of(context).pop();
                          
                          setState(() {
                            _model.nodes = nodes;
                            _model.edges = edges;
                            _model.hasUnsavedChanges = true;
                            _model.selectNode(null);
                          });

                          if (mounted) {
                            ScaffoldMessenger.of(this.context).showSnackBar(
                              SnackBar(
                                content: Text('Generated ${nodes.length} nodes with AI'),
                                backgroundColor: const Color(0xFF4CAF50),
                              ),
                            );
                          }
                        } else {
                          throw Exception(result.jsonBody['error'] ?? 'Failed to generate');
                        }
                      } catch (e) {
                        setDialogState(() => isGenerating = false);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('Error: ${e.toString()}'),
                            backgroundColor: Colors.red,
                          ),
                        );
                      }
                    },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF9C27B0),
                foregroundColor: Colors.white,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.auto_awesome, size: 16),
                  const SizedBox(width: 8),
                  Text(isGenerating ? 'Generating...' : 'Generate'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showValidationErrorsDialog(List<String> errors) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(Icons.error_outline, color: Colors.red.shade600, size: 28),
            const SizedBox(width: 12),
            const Text('Cannot Save Scenario'),
          ],
        ),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Please fix the following issues:',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: FlutterFlowTheme.of(context).primaryText,
                ),
              ),
              const SizedBox(height: 16),
              Container(
                constraints: const BoxConstraints(maxHeight: 300),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: errors.asMap().entries.map((entry) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                color: Colors.red.shade100,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Center(
                                child: Text(
                                  '${entry.key + 1}',
                                  style: TextStyle(
                                    color: Colors.red.shade700,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                entry.value,
                                style: TextStyle(
                                  color: FlutterFlowTheme.of(context).secondaryText,
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK, I\'ll Fix It'),
          ),
        ],
      ),
    );
  }

  Future<void> _saveScenario() async {
    // Validate before saving
    final errors = _model.validateScenario();
    if (errors.isNotEmpty) {
      _showValidationErrorsDialog(errors);
      return;
    }

    setState(() => _model.isSaving = true);
    try {
      final data = _model.toJson();

      if (_model.scenarioId != null) {
        await ScenarioServiceGroup.updateScenariosCall.call(
          scenarioId: _model.scenarioId,
          name: _model.scenarioName,
          description: _model.scenarioDescription,
          isActive: _model.isActive,
          nodes: _model.nodes.map((n) => n.toJson()).toList(),
          edges: _model.edges.map((e) => e.toJson()).toList(),
        );
      } else {
        final result = await ScenarioServiceGroup.createScenariosCall.call(
          name: _model.scenarioName,
          description: _model.scenarioDescription,
          isActive: _model.isActive,
          nodes: _model.nodes.map((n) => n.toJson()).toList(),
          edges: _model.edges.map((e) => e.toJson()).toList(),
        );
        if (result.succeeded) {
          _model.scenarioId = getJsonField(result.jsonBody, r'''$.id''')?.toString();
        }
      }

      _model.hasUnsavedChanges = false;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Scenario saved successfully'),
            backgroundColor: const Color(0xFF4CAF50),
          ),
        );
      }
    } catch (e) {
      debugPrint('Error saving scenario: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to save scenario'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
    setState(() => _model.isSaving = false);
  }

  @override
  void dispose() {
    _model.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        FocusScope.of(context).unfocus();
        setState(() => _model.selectNode(null));
      },
      child: Scaffold(
        key: scaffoldKey,
        backgroundColor: FlutterFlowTheme.of(context).primaryBackground,
        body: SafeArea(
          child: Column(
            children: [
              _buildTopBar(),
              Expanded(
                child: Row(
                  children: [
                    _buildNodePalette(),
                    Expanded(child: _buildCanvas()),
                    if (_model.selectedNode != null) _buildPropertiesPanel(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Container(
      height: 60,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: FlutterFlowTheme.of(context).secondaryBackground,
        border: Border(
          bottom: BorderSide(
            color: FlutterFlowTheme.of(context).alternate,
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          FlutterFlowIconButton(
            borderColor: Colors.transparent,
            borderRadius: 8,
            buttonSize: 40,
            icon: Icon(
              Icons.arrow_back,
              color: FlutterFlowTheme.of(context).primaryText,
              size: 24,
            ),
            onPressed: () async {
              if (_model.hasUnsavedChanges) {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Unsaved Changes'),
                    content: const Text('You have unsaved changes. Are you sure you want to leave?'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('Cancel'),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('Leave'),
                      ),
                    ],
                  ),
                );
                if (confirm != true) return;
              }
              context.safePop();
            },
          ),
          const SizedBox(width: 16),
          Expanded(
            child: InkWell(
              onTap: () => _showScenarioSettingsDialog(),
              child: Row(
                children: [
                  Text(
                    _model.scenarioName,
                    style: FlutterFlowTheme.of(context).titleMedium.override(
                          font: GoogleFonts.interTight(fontWeight: FontWeight.w600),
                          color: FlutterFlowTheme.of(context).primaryText,
                        ),
                  ),
                  const SizedBox(width: 8),
                  Icon(
                    Icons.edit,
                    size: 16,
                    color: FlutterFlowTheme.of(context).secondaryText,
                  ),
                  if (_model.hasUnsavedChanges) ...[
                    const SizedBox(width: 8),
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: Colors.orange,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(width: 16),
          // AI Builder Button
          FFButtonWidget(
            onPressed: _showAiBuilderDialog,
            text: 'AI Builder',
            icon: const Icon(Icons.auto_awesome, size: 18),
            options: FFButtonOptions(
              height: 40,
              padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 0),
              color: const Color(0xFF9C27B0),
              textStyle: FlutterFlowTheme.of(context).titleSmall.override(
                    font: GoogleFonts.interTight(fontWeight: FontWeight.w500),
                    color: Colors.white,
                    fontSize: 14,
                  ),
              elevation: 0,
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          const SizedBox(width: 12),
          FFButtonWidget(
            onPressed: _model.isSaving ? null : _saveScenario,
            text: _model.isSaving ? 'Saving...' : 'Save',
            icon: Icon(
              _model.isSaving ? Icons.hourglass_empty : Icons.save,
              size: 18,
            ),
            options: FFButtonOptions(
              height: 40,
              padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 0),
              color: FlutterFlowTheme.of(context).primary,
              textStyle: FlutterFlowTheme.of(context).titleSmall.override(
                    font: GoogleFonts.interTight(fontWeight: FontWeight.w500),
                    color: FlutterFlowTheme.of(context).primaryText,
                    fontSize: 14,
                  ),
              elevation: 0,
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNodePalette() {
    return Container(
      width: 200,
      decoration: BoxDecoration(
        color: FlutterFlowTheme.of(context).secondaryBackground,
        border: Border(
          right: BorderSide(
            color: FlutterFlowTheme.of(context).alternate,
            width: 1,
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              'Node Types',
              style: FlutterFlowTheme.of(context).titleSmall.override(
                    font: GoogleFonts.interTight(fontWeight: FontWeight.w600),
                    color: FlutterFlowTheme.of(context).primaryText,
                    fontSize: 14,
                  ),
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              itemCount: ScenarioEditorModel.nodeTypes.length,
              itemBuilder: (context, index) {
                final nodeType = ScenarioEditorModel.nodeTypes[index];
                return Draggable<NodeTypeDefinition>(
                  data: nodeType,
                  feedback: Material(
                    elevation: 4,
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      width: 150,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: nodeType.color.withOpacity(0.9),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(nodeType.icon, color: Colors.white, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            nodeType.label,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: FlutterFlowTheme.of(context).primaryBackground,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: FlutterFlowTheme.of(context).alternate,
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: nodeType.color.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Icon(
                            nodeType.icon,
                            color: nodeType.color,
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            nodeType.label,
                            style: FlutterFlowTheme.of(context).bodyMedium.override(
                                  font: GoogleFonts.inter(fontWeight: FontWeight.w500),
                                  color: FlutterFlowTheme.of(context).primaryText,
                                  fontSize: 13,
                                ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCanvas() {
    return Container(
      color: FlutterFlowTheme.of(context).primaryBackground,
      child: DragTarget<NodeTypeDefinition>(
        onAcceptWithDetails: (details) {
          final RenderBox? box = context.findRenderObject() as RenderBox?;
          if (box == null) return;
          final localPos = box.globalToLocal(details.offset);
          setState(() {
            _model.addNode(details.data.type, localPos);
          });
        },
        builder: (context, candidateData, rejectedData) {
          return GestureDetector(
            onTap: () {
              // Cancel connection mode when tapping on empty canvas
              if (_model.isConnecting) {
                setState(() {
                  _model.isConnecting = false;
                  _model.connectingFromNodeId = null;
                });
              }
            },
            child: CustomPaint(
              painter: GridPainter(
                color: FlutterFlowTheme.of(context).alternate,
              ),
              child: Stack(
                fit: StackFit.expand,
                clipBehavior: Clip.hardEdge,
                children: [
                  // Draw edges (connections between nodes)
                  ..._buildEdges(),
                  // Draw nodes
                  for (final node in _model.nodes)
                    Positioned(
                      left: node.position.dx,
                      top: node.position.dy,
                      child: GestureDetector(
                        onTap: () {
                          if (_model.isConnecting && _model.connectingFromNodeId != node.id) {
                            // Complete the connection
                            setState(() {
                              _model.addEdge(_model.connectingFromNodeId!, node.id);
                              _model.isConnecting = false;
                              _model.connectingFromNodeId = null;
                            });
                          } else {
                            setState(() => _model.selectNode(node.id));
                          }
                        },
                        onPanUpdate: (details) {
                          setState(() {
                            _model.updateNodePosition(node.id, node.position + details.delta);
                          });
                        },
                        child: _buildNodeWidget(node, _model.getNodeType(node.type)),
                      ),
                    ),
                  // Connection mode indicator
                  if (_model.isConnecting)
                    Positioned(
                      top: 10,
                      left: 0,
                      right: 0,
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          decoration: BoxDecoration(
                            color: FlutterFlowTheme.of(context).primary,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.link, color: Colors.white, size: 18),
                              const SizedBox(width: 8),
                              const Text(
                                'Click on a node to connect',
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500),
                              ),
                              const SizedBox(width: 12),
                              GestureDetector(
                                onTap: () {
                                  setState(() {
                                    _model.isConnecting = false;
                                    _model.connectingFromNodeId = null;
                                  });
                                },
                                child: const Icon(Icons.close, color: Colors.white70, size: 18),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  // Loading overlay
                  if (_model.isLoading)
                    Container(
                      color: Colors.black26,
                      child: const Center(child: CircularProgressIndicator()),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  List<Widget> _buildEdges() {
    final widgets = <Widget>[];

    for (final edge in _model.edges) {
      final sourceNode = _model.nodes.firstWhereOrNull((n) => n.id == edge.source);
      final targetNode = _model.nodes.firstWhereOrNull((n) => n.id == edge.target);

      if (sourceNode == null || targetNode == null) continue;

      // Calculate connection points (bottom of source, top of target)
      final sourceCenter = Offset(sourceNode.position.dx + 75, sourceNode.position.dy + 80);
      final targetCenter = Offset(targetNode.position.dx + 75, targetNode.position.dy);

      // Draw the edge line
      widgets.add(
        CustomPaint(
          size: Size.infinite,
          painter: EdgePainter(
            start: sourceCenter,
            end: targetCenter,
            color: FlutterFlowTheme.of(context).primary,
            label: edge.condition,
          ),
        ),
      );

      // Add a delete button at the midpoint of the edge
      final midX = (sourceCenter.dx + targetCenter.dx) / 2;
      final midY = (sourceCenter.dy + targetCenter.dy) / 2;
      final edgeId = edge.id;
      widgets.add(
        Positioned(
          left: midX - 12,
          top: midY - 12,
          child: GestureDetector(
            onTap: () {
              setState(() {
                _model.removeEdge(edgeId);
              });
            },
            child: Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                color: Colors.red.shade400,
                shape: BoxShape.circle,
                boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 4)],
              ),
              child: const Icon(Icons.close, color: Colors.white, size: 14),
            ),
          ),
        ),
      );
    }

    return widgets;
  }

  List<Widget> _buildNodes() {
    return _model.nodes.map((node) {
      final nodeType = _model.getNodeType(node.type);

      return Positioned(
        left: node.position.dx,
        top: node.position.dy,
        child: GestureDetector(
          onTap: () {
            setState(() => _model.selectNode(node.id));
          },
          onPanUpdate: (details) {
            setState(() {
              _model.updateNodePosition(
                node.id,
                node.position + details.delta,
              );
            });
          },
          child: _buildNodeWidget(node, nodeType),
        ),
      );
    }).toList();
  }

  Widget _buildNodeWidget(FlowNode node, NodeTypeDefinition nodeType) {
    final isSelected = node.id == _model.selectedNode?.id;
    final isConnecting = _model.isConnecting;
    final isConnectingFromThis = _model.connectingFromNodeId == node.id;

    return SizedBox(
      width: 150,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Input connector (top) - not for start node
          if (node.type != 'start')
            GestureDetector(
              onTap: () {
                if (isConnecting && !isConnectingFromThis) {
                  setState(() {
                    _model.addEdge(_model.connectingFromNodeId!, node.id);
                    _model.isConnecting = false;
                    _model.connectingFromNodeId = null;
                  });
                }
              },
              child: Container(
                width: 20,
                height: 20,
                margin: const EdgeInsets.only(bottom: 6),
                decoration: BoxDecoration(
                  color: isConnecting && !isConnectingFromThis
                      ? FlutterFlowTheme.of(context).primary
                      : Colors.white,
                  border: Border.all(
                    color: isConnecting && !isConnectingFromThis
                        ? FlutterFlowTheme.of(context).primary
                        : Colors.grey.shade400,
                    width: 2,
                  ),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.1),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: isConnecting && !isConnectingFromThis
                    ? const Icon(Icons.arrow_downward, color: Colors.white, size: 12)
                    : null,
              ),
            ),
          // Main node container
          Container(
            decoration: BoxDecoration(
              color: FlutterFlowTheme.of(context).secondaryBackground,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: isSelected ? nodeType.color : FlutterFlowTheme.of(context).alternate,
                width: isSelected ? 2 : 1,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.1),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Header
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: nodeType.color,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(9)),
                  ),
                  child: Row(
                    children: [
                      Icon(nodeType.icon, color: Colors.white, size: 16),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          nodeType.label,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 12,
                          ),
                        ),
                      ),
                      if (node.type != 'start')
                        GestureDetector(
                          onTap: () {
                            setState(() => _model.removeNode(node.id));
                          },
                          child: const Icon(Icons.close, color: Colors.white70, size: 16),
                        ),
                    ],
                  ),
                ),
                // Body
                Padding(
                  padding: const EdgeInsets.all(10),
                  child: _buildNodeBody(node, nodeType),
                ),
              ],
            ),
          ),
          // Output connector (bottom) - not for end node
          if (node.type != 'end' && nodeType.maxOutputs > 0)
            GestureDetector(
              onTap: () {
                setState(() {
                  if (isConnectingFromThis) {
                    // Cancel connection
                    _model.isConnecting = false;
                    _model.connectingFromNodeId = null;
                  } else {
                    // Start connection
                    _model.connectingFromNodeId = node.id;
                    _model.isConnecting = true;
                  }
                });
              },
              child: Container(
                width: 20,
                height: 20,
                margin: const EdgeInsets.only(top: 6),
                decoration: BoxDecoration(
                  color: isConnectingFromThis
                      ? nodeType.color
                      : Colors.white,
                  border: Border.all(
                    color: nodeType.color,
                    width: 2,
                  ),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.1),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: isConnectingFromThis
                    ? const Icon(Icons.arrow_downward, color: Colors.white, size: 12)
                    : null,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildNodeBody(FlowNode node, NodeTypeDefinition nodeType) {
    switch (node.type) {
      case 'say':
        final text = node.data['text'] as String? ?? '';
        return Text(
          text.isEmpty ? 'Enter text...' : text,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: FlutterFlowTheme.of(context).bodySmall.override(
                font: GoogleFonts.inter(),
                color: text.isEmpty
                    ? FlutterFlowTheme.of(context).secondaryText
                    : FlutterFlowTheme.of(context).primaryText,
                fontSize: 11,
              ),
        );
      case 'gather':
        final prompt = node.data['prompt'] as String? ?? '';
        return Text(
          prompt.isEmpty ? 'Enter prompt...' : prompt,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: FlutterFlowTheme.of(context).bodySmall.override(
                font: GoogleFonts.inter(),
                color: prompt.isEmpty
                    ? FlutterFlowTheme.of(context).secondaryText
                    : FlutterFlowTheme.of(context).primaryText,
                fontSize: 11,
              ),
        );
      case 'transfer':
        final dest = node.data['destination'] as String? ?? '';
        return Text(
          dest.isEmpty ? 'Set destination...' : dest,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: FlutterFlowTheme.of(context).bodySmall.override(
                font: GoogleFonts.inter(),
                color: dest.isEmpty
                    ? FlutterFlowTheme.of(context).secondaryText
                    : FlutterFlowTheme.of(context).primaryText,
                fontSize: 11,
              ),
        );
      case 'end':
        final msg = node.data['message'] as String? ?? '';
        return Text(
          msg.isEmpty ? 'Goodbye message...' : msg,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: FlutterFlowTheme.of(context).bodySmall.override(
                font: GoogleFonts.inter(),
                color: FlutterFlowTheme.of(context).primaryText,
                fontSize: 11,
              ),
        );
      case 'wait':
        final duration = node.data['duration'] as int? ?? 1;
        return Text(
          '${duration}s',
          style: FlutterFlowTheme.of(context).bodySmall.override(
                font: GoogleFonts.inter(fontWeight: FontWeight.w500),
                color: FlutterFlowTheme.of(context).primaryText,
                fontSize: 11,
              ),
        );
      default:
        return const SizedBox(height: 8);
    }
  }

  Widget _buildPropertiesPanel() {
    final node = _model.selectedNode!;
    final nodeType = _model.getNodeType(node.type);

    return Container(
      width: 300,
      decoration: BoxDecoration(
        color: FlutterFlowTheme.of(context).secondaryBackground,
        border: Border(
          left: BorderSide(
            color: FlutterFlowTheme.of(context).alternate,
            width: 1,
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: FlutterFlowTheme.of(context).alternate,
                ),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: nodeType.color.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Icon(nodeType.icon, color: nodeType.color, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    nodeType.label,
                    style: FlutterFlowTheme.of(context).titleSmall.override(
                          font: GoogleFonts.interTight(fontWeight: FontWeight.w600),
                          color: FlutterFlowTheme.of(context).primaryText,
                        ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => setState(() => _model.selectNode(null)),
                ),
              ],
            ),
          ),
          // Properties form
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: _buildPropertiesForm(node, nodeType),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPropertiesForm(FlowNode node, NodeTypeDefinition nodeType) {
    switch (node.type) {
      case 'start':
        return _buildStartProperties(node);
      case 'say':
        return _buildSayProperties(node);
      case 'gather':
        return _buildGatherProperties(node);
      case 'condition':
        return _buildConditionProperties(node);
      case 'setVariable':
        return _buildSetVariableProperties(node);
      case 'apiCall':
        return _buildApiCallProperties(node);
      case 'transfer':
        return _buildTransferProperties(node);
      case 'record':
        return _buildRecordProperties(node);
      case 'wait':
        return _buildWaitProperties(node);
      case 'scheduleCallback':
        return _buildScheduleCallbackProperties(node);
      case 'updateLead':
        return _buildUpdateLeadProperties(node);
      case 'end':
        return _buildEndProperties(node);
      default:
        return Text('Configure ${nodeType.label} node');
    }
  }

  Widget _buildStartProperties(FlowNode node) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildPropertyLabel('Trigger Type'),
        DropdownButtonFormField<String>(
          value: node.data['trigger'] as String? ?? 'outbound',
          decoration: _inputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'outbound', child: Text('Outbound Call')),
            DropdownMenuItem(value: 'inbound', child: Text('Inbound Call')),
            DropdownMenuItem(value: 'both', child: Text('Both')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['trigger'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Initial Delay (seconds)'),
        TextFormField(
          initialValue: (node.data['initialDelay'] as int? ?? 0).toString(),
          keyboardType: TextInputType.number,
          decoration: _inputDecoration('0'),
          onChanged: (value) {
            setState(() {
              node.data['initialDelay'] = int.tryParse(value) ?? 0;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Checkbox(
              value: node.data['recordCall'] as bool? ?? false,
              onChanged: (value) {
                setState(() {
                  node.data['recordCall'] = value;
                  _model.hasUnsavedChanges = true;
                });
              },
            ),
            const Text('Record entire call'),
          ],
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: FlutterFlowTheme.of(context).primaryBackground,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            'This is the entry point of your call flow. Connect this node to the first action.',
            style: FlutterFlowTheme.of(context).bodySmall.override(
                  font: GoogleFonts.inter(),
                  color: FlutterFlowTheme.of(context).secondaryText,
                ),
          ),
        ),
      ],
    );
  }

  Widget _buildSayProperties(FlowNode node) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildPropertyLabel('Text to Speak'),
        TextFormField(
          initialValue: node.data['text'] as String? ?? '',
          maxLines: 4,
          decoration: _inputDecoration('Enter what the AI should say...'),
          onChanged: (value) {
            setState(() {
              node.data['text'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Voice'),
        DropdownButtonFormField<String>(
          value: node.data['voice'] as String? ?? 'Google.he-IL-Wavenet-A',
          decoration: _inputDecoration(''),
          items: const [
            // ─── Hebrew Voices (Best Quality) ───
            // Google Cloud TTS WaveNet Hebrew (via Twilio <Say>)
            DropdownMenuItem(value: 'Google.he-IL-Wavenet-A', child: Text('Google Wavenet Female A (Hebrew)')),
            DropdownMenuItem(value: 'Google.he-IL-Wavenet-B', child: Text('Google Wavenet Male B (Hebrew)')),
            DropdownMenuItem(value: 'Google.he-IL-Wavenet-C', child: Text('Google Wavenet Female C (Hebrew)')),
            DropdownMenuItem(value: 'Google.he-IL-Wavenet-D', child: Text('Google Wavenet Male D (Hebrew)')),
            // ElevenLabs Hebrew-supporting voices (multilingual)
            DropdownMenuItem(value: 'rachel', child: Text('Rachel - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'adam', child: Text('Adam - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'antoni', child: Text('Antoni - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'bella', child: Text('Bella - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'josh', child: Text('Josh - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'arnold', child: Text('Arnold - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'sam', child: Text('Sam - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'elli', child: Text('Elli - ElevenLabs (Hebrew)')),
            // ─── English Voices ───
            DropdownMenuItem(value: 'Polly.Joanna', child: Text('Joanna - Polly (English)')),
            DropdownMenuItem(value: 'Polly.Matthew', child: Text('Matthew - Polly (English)')),
            DropdownMenuItem(value: 'Polly.Amy', child: Text('Amy - Polly (British)')),
            DropdownMenuItem(value: 'Polly.Brian', child: Text('Brian - Polly (British)')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['voice'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Language'),
        DropdownButtonFormField<String>(
          value: node.data['language'] as String? ?? 'he-IL',
          decoration: _inputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'he-IL', child: Text('Hebrew (עברית)')),
            DropdownMenuItem(value: 'en-US', child: Text('English (US)')),
            DropdownMenuItem(value: 'en-GB', child: Text('English (UK)')),
            DropdownMenuItem(value: 'ar-SA', child: Text('Arabic (العربية)')),
            DropdownMenuItem(value: 'es-ES', child: Text('Spanish')),
            DropdownMenuItem(value: 'fr-FR', child: Text('French')),
            DropdownMenuItem(value: 'de-DE', child: Text('German')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['language'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Loop Count'),
        TextFormField(
          initialValue: (node.data['loop'] as int? ?? 1).toString(),
          keyboardType: TextInputType.number,
          decoration: _inputDecoration('1 (no loop)'),
          onChanged: (value) {
            setState(() {
              node.data['loop'] = int.tryParse(value) ?? 1;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Checkbox(
              value: node.data['bargeIn'] as bool? ?? false,
              onChanged: (value) {
                setState(() {
                  node.data['bargeIn'] = value;
                  _model.hasUnsavedChanges = true;
                });
              },
            ),
            const Expanded(child: Text('Allow Barge-In (can be interrupted)')),
          ],
        ),
        const SizedBox(height: 16),
        _buildPlaceholderHints(),
      ],
    );
  }

  Widget _buildGatherProperties(FlowNode node) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildPropertyLabel('Prompt'),
        TextFormField(
          initialValue: node.data['prompt'] as String? ?? '',
          maxLines: 3,
          decoration: _inputDecoration('What to ask the caller...'),
          onChanged: (value) {
            setState(() {
              node.data['prompt'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Input Type'),
        DropdownButtonFormField<String>(
          value: node.data['inputType'] as String? ?? 'speech',
          decoration: _inputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'speech', child: Text('Speech')),
            DropdownMenuItem(value: 'dtmf', child: Text('Keypad (DTMF)')),
            DropdownMenuItem(value: 'both', child: Text('Both')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['inputType'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Voice'),
        DropdownButtonFormField<String>(
          value: node.data['voice'] as String? ?? 'Google.he-IL-Wavenet-A',
          decoration: _inputDecoration(''),
          items: const [
            // ─── Hebrew Voices (Best Quality) ───
            // Google Cloud TTS WaveNet Hebrew (via Twilio <Say>)
            DropdownMenuItem(value: 'Google.he-IL-Wavenet-A', child: Text('Google Wavenet Female A (Hebrew)')),
            DropdownMenuItem(value: 'Google.he-IL-Wavenet-B', child: Text('Google Wavenet Male B (Hebrew)')),
            DropdownMenuItem(value: 'Google.he-IL-Wavenet-C', child: Text('Google Wavenet Female C (Hebrew)')),
            DropdownMenuItem(value: 'Google.he-IL-Wavenet-D', child: Text('Google Wavenet Male D (Hebrew)')),
            // ElevenLabs Hebrew-supporting voices (multilingual)
            DropdownMenuItem(value: 'rachel', child: Text('Rachel - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'adam', child: Text('Adam - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'bella', child: Text('Bella - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'josh', child: Text('Josh - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'antoni', child: Text('Antoni - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'arnold', child: Text('Arnold - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'sam', child: Text('Sam - ElevenLabs (Hebrew)')),
            DropdownMenuItem(value: 'elli', child: Text('Elli - ElevenLabs (Hebrew)')),
            // ─── English Voices ───
            DropdownMenuItem(value: 'Polly.Joanna', child: Text('Joanna - Polly (English)')),
            DropdownMenuItem(value: 'Polly.Matthew', child: Text('Matthew - Polly (English)')),
            DropdownMenuItem(value: 'Polly.Amy', child: Text('Amy - Polly (British)')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['voice'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Language'),
        DropdownButtonFormField<String>(
          value: node.data['language'] as String? ?? 'he-IL',
          decoration: _inputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'he-IL', child: Text('Hebrew (עברית)')),
            DropdownMenuItem(value: 'en-US', child: Text('English (US)')),
            DropdownMenuItem(value: 'en-GB', child: Text('English (UK)')),
            DropdownMenuItem(value: 'ar-SA', child: Text('Arabic (العربية)')),
            DropdownMenuItem(value: 'es-ES', child: Text('Spanish')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['language'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Timeout (seconds)'),
        TextFormField(
          initialValue: (node.data['timeout'] as int? ?? 5).toString(),
          keyboardType: TextInputType.number,
          decoration: _inputDecoration('5'),
          onChanged: (value) {
            setState(() {
              node.data['timeout'] = int.tryParse(value) ?? 5;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        if (node.data['inputType'] == 'dtmf' || node.data['inputType'] == 'both') ...[
          const SizedBox(height: 16),
          _buildPropertyLabel('Number of Digits'),
          TextFormField(
            initialValue: (node.data['numDigits'] as int? ?? 1).toString(),
            keyboardType: TextInputType.number,
            decoration: _inputDecoration('1'),
            onChanged: (value) {
              setState(() {
                node.data['numDigits'] = int.tryParse(value) ?? 1;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
          const SizedBox(height: 16),
          _buildPropertyLabel('Finish On Key'),
          DropdownButtonFormField<String>(
            value: node.data['finishOnKey'] as String? ?? '#',
            decoration: _inputDecoration(''),
            items: const [
              DropdownMenuItem(value: '#', child: Text('# (Hash)')),
              DropdownMenuItem(value: '*', child: Text('* (Star)')),
              DropdownMenuItem(value: '', child: Text('Any key')),
            ],
            onChanged: (value) {
              setState(() {
                node.data['finishOnKey'] = value;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
        ],
        if (node.data['inputType'] == 'speech' || node.data['inputType'] == 'both' || node.data['inputType'] == null) ...[
          const SizedBox(height: 16),
          _buildPropertyLabel('Speech Hints (comma separated)'),
          TextFormField(
            initialValue: node.data['hints'] as String? ?? '',
            decoration: _inputDecoration('yes, no, maybe, interested'),
            onChanged: (value) {
              setState(() {
                node.data['hints'] = value;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
        ],
        const SizedBox(height: 16),
        _buildPropertyLabel('Save Input To Variable'),
        TextFormField(
          initialValue: node.data['saveInputTo'] as String? ?? 'userInput',
          decoration: _inputDecoration('Variable name'),
          onChanged: (value) {
            setState(() {
              node.data['saveInputTo'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Checkbox(
              value: node.data['bargeIn'] as bool? ?? true,
              onChanged: (value) {
                setState(() {
                  node.data['bargeIn'] = value;
                  _model.hasUnsavedChanges = true;
                });
              },
            ),
            const Expanded(child: Text('Allow Barge-In')),
          ],
        ),
      ],
    );
  }

  Widget _buildConditionProperties(FlowNode node) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildPropertyLabel('Condition Type'),
        DropdownButtonFormField<String>(
          value: node.data['conditionType'] as String? ?? 'keywords',
          decoration: _inputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'keywords', child: Text('Keywords Match')),
            DropdownMenuItem(value: 'variable', child: Text('Variable Comparison')),
            DropdownMenuItem(value: 'sentiment', child: Text('Sentiment Analysis')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['conditionType'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        if (node.data['conditionType'] == 'keywords' || node.data['conditionType'] == null) ...[
          const SizedBox(height: 16),
          _buildPropertyLabel('Positive Keywords (comma separated)'),
          TextFormField(
            initialValue: node.data['positiveKeywords'] as String? ?? 'yes, sure, ok, interested',
            maxLines: 2,
            decoration: _inputDecoration('yes, sure, ok, interested'),
            onChanged: (value) {
              setState(() {
                node.data['positiveKeywords'] = value;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
          const SizedBox(height: 16),
          _buildPropertyLabel('Negative Keywords (comma separated)'),
          TextFormField(
            initialValue: node.data['negativeKeywords'] as String? ?? 'no, not interested, stop',
            maxLines: 2,
            decoration: _inputDecoration('no, not interested, stop'),
            onChanged: (value) {
              setState(() {
                node.data['negativeKeywords'] = value;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
        ],
        if (node.data['conditionType'] == 'variable') ...[
          const SizedBox(height: 16),
          _buildPropertyLabel('Variable Name'),
          TextFormField(
            initialValue: node.data['variableName'] as String? ?? '',
            decoration: _inputDecoration('e.g., userInput'),
            onChanged: (value) {
              setState(() {
                node.data['variableName'] = value;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
          const SizedBox(height: 16),
          _buildPropertyLabel('Comparison Operator'),
          DropdownButtonFormField<String>(
            value: node.data['operator'] as String? ?? 'equals',
            decoration: _inputDecoration(''),
            items: const [
              DropdownMenuItem(value: 'equals', child: Text('Equals (==)')),
              DropdownMenuItem(value: 'notEquals', child: Text('Not Equals (!=)')),
              DropdownMenuItem(value: 'contains', child: Text('Contains')),
              DropdownMenuItem(value: 'greaterThan', child: Text('Greater Than (>)')),
              DropdownMenuItem(value: 'lessThan', child: Text('Less Than (<)')),
              DropdownMenuItem(value: 'isEmpty', child: Text('Is Empty')),
            ],
            onChanged: (value) {
              setState(() {
                node.data['operator'] = value;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
          if (node.data['operator'] != 'isEmpty') ...[
            const SizedBox(height: 16),
            _buildPropertyLabel('Compare Value'),
            TextFormField(
              initialValue: node.data['compareValue'] as String? ?? '',
              decoration: _inputDecoration('Value to compare'),
              onChanged: (value) {
                setState(() {
                  node.data['compareValue'] = value;
                  _model.hasUnsavedChanges = true;
                });
              },
            ),
          ],
        ],
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: FlutterFlowTheme.of(context).primaryBackground,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            'Output Connections:\n• True/Positive → success path\n• False/Negative → failure path\n• Default → fallback path',
            style: FlutterFlowTheme.of(context).bodySmall.override(
                  font: GoogleFonts.inter(),
                  color: FlutterFlowTheme.of(context).secondaryText,
                ),
          ),
        ),
      ],
    );
  }

  Widget _buildSetVariableProperties(FlowNode node) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildPropertyLabel('Variable Name'),
        TextFormField(
          initialValue: node.data['variableName'] as String? ?? '',
          decoration: _inputDecoration('e.g., customerIntent'),
          onChanged: (value) {
            setState(() {
              node.data['variableName'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Value'),
        TextFormField(
          initialValue: node.data['value'] as String? ?? '',
          decoration: _inputDecoration('Value or expression'),
          onChanged: (value) {
            setState(() {
              node.data['value'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
      ],
    );
  }

  Widget _buildApiCallProperties(FlowNode node) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildPropertyLabel('URL'),
        TextFormField(
          initialValue: node.data['url'] as String? ?? '',
          decoration: _inputDecoration('https://api.example.com/webhook'),
          onChanged: (value) {
            setState(() {
              node.data['url'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Method'),
        DropdownButtonFormField<String>(
          value: node.data['method'] as String? ?? 'POST',
          decoration: _inputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'GET', child: Text('GET')),
            DropdownMenuItem(value: 'POST', child: Text('POST')),
            DropdownMenuItem(value: 'PUT', child: Text('PUT')),
            DropdownMenuItem(value: 'DELETE', child: Text('DELETE')),
            DropdownMenuItem(value: 'PATCH', child: Text('PATCH')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['method'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Headers (JSON)'),
        TextFormField(
          initialValue: _getStringValue(node.data['headers'], '{"Content-Type": "application/json"}'),
          maxLines: 3,
          decoration: _inputDecoration('{"Authorization": "Bearer token"}'),
          onChanged: (value) {
            setState(() {
              node.data['headers'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Request Body (JSON)'),
        TextFormField(
          initialValue: _getStringValue(node.data['body'], ''),
          maxLines: 4,
          decoration: _inputDecoration('{"key": "value", "callSid": "{{callSid}}"}'),
          onChanged: (value) {
            setState(() {
              node.data['body'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Authentication Type'),
        DropdownButtonFormField<String>(
          value: node.data['authType'] as String? ?? 'none',
          decoration: _inputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'none', child: Text('None')),
            DropdownMenuItem(value: 'bearer', child: Text('Bearer Token')),
            DropdownMenuItem(value: 'basic', child: Text('Basic Auth')),
            DropdownMenuItem(value: 'apiKey', child: Text('API Key')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['authType'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        if (node.data['authType'] == 'bearer' || node.data['authType'] == 'apiKey') ...[
          const SizedBox(height: 16),
          _buildPropertyLabel('Token / API Key'),
          TextFormField(
            initialValue: node.data['authToken'] as String? ?? '',
            decoration: _inputDecoration('Enter token or API key'),
            obscureText: true,
            onChanged: (value) {
              setState(() {
                node.data['authToken'] = value;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
        ],
        if (node.data['authType'] == 'basic') ...[
          const SizedBox(height: 16),
          _buildPropertyLabel('Username'),
          TextFormField(
            initialValue: node.data['authUsername'] as String? ?? '',
            decoration: _inputDecoration('Username'),
            onChanged: (value) {
              setState(() {
                node.data['authUsername'] = value;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
          const SizedBox(height: 8),
          _buildPropertyLabel('Password'),
          TextFormField(
            initialValue: node.data['authPassword'] as String? ?? '',
            decoration: _inputDecoration('Password'),
            obscureText: true,
            onChanged: (value) {
              setState(() {
                node.data['authPassword'] = value;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
        ],
        const SizedBox(height: 16),
        _buildPropertyLabel('Timeout (seconds)'),
        TextFormField(
          initialValue: (node.data['timeout'] as int? ?? 30).toString(),
          keyboardType: TextInputType.number,
          decoration: _inputDecoration('30'),
          onChanged: (value) {
            setState(() {
              node.data['timeout'] = int.tryParse(value) ?? 30;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Save Response To Variable'),
        TextFormField(
          initialValue: node.data['saveResponseTo'] as String? ?? '',
          decoration: _inputDecoration('Variable name'),
          onChanged: (value) {
            setState(() {
              node.data['saveResponseTo'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPlaceholderHints(),
      ],
    );
  }

  Widget _buildTransferProperties(FlowNode node) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildPropertyLabel('Destination Number'),
        TextFormField(
          initialValue: node.data['destination'] as String? ?? '',
          decoration: _inputDecoration('+1234567890'),
          onChanged: (value) {
            setState(() {
              node.data['destination'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Announcement'),
        TextFormField(
          initialValue: node.data['announcement'] as String? ?? '',
          maxLines: 2,
          decoration: _inputDecoration('Message before transfer...'),
          onChanged: (value) {
            setState(() {
              node.data['announcement'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Timeout (seconds)'),
        TextFormField(
          initialValue: (node.data['timeout'] as int? ?? 30).toString(),
          keyboardType: TextInputType.number,
          decoration: _inputDecoration('30'),
          onChanged: (value) {
            setState(() {
              node.data['timeout'] = int.tryParse(value) ?? 30;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
      ],
    );
  }

  Widget _buildWaitProperties(FlowNode node) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildPropertyLabel('Duration (seconds)'),
        TextFormField(
          initialValue: (node.data['duration'] as int? ?? 1).toString(),
          keyboardType: TextInputType.number,
          decoration: _inputDecoration('1'),
          onChanged: (value) {
            setState(() {
              node.data['duration'] = int.tryParse(value) ?? 1;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('While Waiting'),
        DropdownButtonFormField<String>(
          value: node.data['waitType'] as String? ?? 'silence',
          decoration: _inputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'silence', child: Text('Silence')),
            DropdownMenuItem(value: 'holdMusic', child: Text('Hold Music')),
            DropdownMenuItem(value: 'beep', child: Text('Beep Sound')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['waitType'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        if (node.data['waitType'] == 'holdMusic') ...[
          const SizedBox(height: 16),
          _buildPropertyLabel('Music URL (optional)'),
          TextFormField(
            initialValue: node.data['musicUrl'] as String? ?? '',
            decoration: _inputDecoration('https://example.com/music.mp3'),
            onChanged: (value) {
              setState(() {
                node.data['musicUrl'] = value;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
        ],
      ],
    );
  }

  Widget _buildEndProperties(FlowNode node) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildPropertyLabel('Goodbye Message'),
        TextFormField(
          initialValue: node.data['message'] as String? ?? 'Thank you. Goodbye!',
          maxLines: 3,
          decoration: _inputDecoration('Final message to caller'),
          onChanged: (value) {
            setState(() {
              node.data['message'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Call Status'),
        DropdownButtonFormField<String>(
          value: node.data['status'] as String? ?? 'completed',
          decoration: _inputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'completed', child: Text('Completed')),
            DropdownMenuItem(value: 'interested', child: Text('Interested')),
            DropdownMenuItem(value: 'not_interested', child: Text('Not Interested')),
            DropdownMenuItem(value: 'callback_requested', child: Text('Callback Requested')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['status'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
      ],
    );
  }

  Widget _buildRecordProperties(FlowNode node) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildPropertyLabel('Recording Action'),
        DropdownButtonFormField<String>(
          value: node.data['action'] as String? ?? 'start',
          decoration: _inputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'start', child: Text('Start Recording')),
            DropdownMenuItem(value: 'stop', child: Text('Stop Recording')),
            DropdownMenuItem(value: 'pause', child: Text('Pause Recording')),
            DropdownMenuItem(value: 'resume', child: Text('Resume Recording')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['action'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        if (node.data['action'] == 'start' || node.data['action'] == null) ...[
          const SizedBox(height: 16),
          _buildPropertyLabel('Max Recording Duration (seconds)'),
          TextFormField(
            initialValue: (node.data['maxDuration'] as int? ?? 3600).toString(),
            keyboardType: TextInputType.number,
            decoration: _inputDecoration('3600 (1 hour)'),
            onChanged: (value) {
              setState(() {
                node.data['maxDuration'] = int.tryParse(value) ?? 3600;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
          const SizedBox(height: 16),
          _buildPropertyLabel('Recording Format'),
          DropdownButtonFormField<String>(
            value: node.data['format'] as String? ?? 'mp3',
            decoration: _inputDecoration(''),
            items: const [
              DropdownMenuItem(value: 'mp3', child: Text('MP3')),
              DropdownMenuItem(value: 'wav', child: Text('WAV')),
            ],
            onChanged: (value) {
              setState(() {
                node.data['format'] = value;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Checkbox(
                value: node.data['playBeep'] as bool? ?? true,
                onChanged: (value) {
                  setState(() {
                    node.data['playBeep'] = value;
                    _model.hasUnsavedChanges = true;
                  });
                },
              ),
              const Text('Play beep before recording'),
            ],
          ),
          Row(
            children: [
              Checkbox(
                value: node.data['transcribe'] as bool? ?? false,
                onChanged: (value) {
                  setState(() {
                    node.data['transcribe'] = value;
                    _model.hasUnsavedChanges = true;
                  });
                },
              ),
              const Text('Transcribe recording'),
            ],
          ),
        ],
        const SizedBox(height: 16),
        _buildPropertyLabel('Save Recording URL To'),
        TextFormField(
          initialValue: node.data['saveRecordingTo'] as String? ?? 'recordingUrl',
          decoration: _inputDecoration('Variable name'),
          onChanged: (value) {
            setState(() {
              node.data['saveRecordingTo'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
      ],
    );
  }

  Widget _buildScheduleCallbackProperties(FlowNode node) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildPropertyLabel('Callback Delay'),
        DropdownButtonFormField<String>(
          value: node.data['delayType'] as String? ?? 'minutes',
          decoration: _inputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'minutes', child: Text('Minutes')),
            DropdownMenuItem(value: 'hours', child: Text('Hours')),
            DropdownMenuItem(value: 'days', child: Text('Days')),
            DropdownMenuItem(value: 'specific', child: Text('Specific Time')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['delayType'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        if (node.data['delayType'] != 'specific') ...[
          const SizedBox(height: 16),
          _buildPropertyLabel('Delay Value'),
          TextFormField(
            initialValue: (node.data['delayValue'] as int? ?? 30).toString(),
            keyboardType: TextInputType.number,
            decoration: _inputDecoration('30'),
            onChanged: (value) {
              setState(() {
                node.data['delayValue'] = int.tryParse(value) ?? 30;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
        ],
        if (node.data['delayType'] == 'specific') ...[
          const SizedBox(height: 16),
          _buildPropertyLabel('Callback Time (HH:MM)'),
          TextFormField(
            initialValue: node.data['callbackTime'] as String? ?? '14:00',
            decoration: _inputDecoration('14:00'),
            onChanged: (value) {
              setState(() {
                node.data['callbackTime'] = value;
                _model.hasUnsavedChanges = true;
              });
            },
          ),
        ],
        const SizedBox(height: 16),
        _buildPropertyLabel('Priority'),
        DropdownButtonFormField<String>(
          value: node.data['priority'] as String? ?? 'normal',
          decoration: _inputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'high', child: Text('High')),
            DropdownMenuItem(value: 'normal', child: Text('Normal')),
            DropdownMenuItem(value: 'low', child: Text('Low')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['priority'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Max Attempts'),
        TextFormField(
          initialValue: (node.data['maxAttempts'] as int? ?? 3).toString(),
          keyboardType: TextInputType.number,
          decoration: _inputDecoration('3'),
          onChanged: (value) {
            setState(() {
              node.data['maxAttempts'] = int.tryParse(value) ?? 3;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Callback Note'),
        TextFormField(
          initialValue: node.data['note'] as String? ?? '',
          maxLines: 2,
          decoration: _inputDecoration('Reason for callback...'),
          onChanged: (value) {
            setState(() {
              node.data['note'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
      ],
    );
  }

  Widget _buildUpdateLeadProperties(FlowNode node) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildPropertyLabel('Lead Status'),
        DropdownButtonFormField<String>(
          value: node.data['status'] as String? ?? 'contacted',
          decoration: _inputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'contacted', child: Text('Contacted')),
            DropdownMenuItem(value: 'interested', child: Text('Interested')),
            DropdownMenuItem(value: 'not_interested', child: Text('Not Interested')),
            DropdownMenuItem(value: 'callback', child: Text('Callback Requested')),
            DropdownMenuItem(value: 'qualified', child: Text('Qualified')),
            DropdownMenuItem(value: 'converted', child: Text('Converted')),
            DropdownMenuItem(value: 'no_answer', child: Text('No Answer')),
            DropdownMenuItem(value: 'voicemail', child: Text('Voicemail')),
          ],
          onChanged: (value) {
            setState(() {
              node.data['status'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Add Note'),
        TextFormField(
          initialValue: node.data['note'] as String? ?? '',
          maxLines: 3,
          decoration: _inputDecoration('Notes about this call...'),
          onChanged: (value) {
            setState(() {
              node.data['note'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Add Tag'),
        TextFormField(
          initialValue: node.data['tag'] as String? ?? '',
          decoration: _inputDecoration('e.g., hot-lead, follow-up'),
          onChanged: (value) {
            setState(() {
              node.data['tag'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        _buildPropertyLabel('Update Custom Field'),
        TextFormField(
          initialValue: node.data['customFieldName'] as String? ?? '',
          decoration: _inputDecoration('Field name'),
          onChanged: (value) {
            setState(() {
              node.data['customFieldName'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 8),
        TextFormField(
          initialValue: node.data['customFieldValue'] as String? ?? '',
          decoration: _inputDecoration('Field value (can use {{variables}})'),
          onChanged: (value) {
            setState(() {
              node.data['customFieldValue'] = value;
              _model.hasUnsavedChanges = true;
            });
          },
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Checkbox(
              value: node.data['saveCallSummary'] as bool? ?? true,
              onChanged: (value) {
                setState(() {
                  node.data['saveCallSummary'] = value;
                  _model.hasUnsavedChanges = true;
                });
              },
            ),
            const Expanded(child: Text('Save call summary to lead')),
          ],
        ),
        const SizedBox(height: 16),
        _buildPlaceholderHints(),
      ],
    );
  }

  Widget _buildPropertyLabel(String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        label,
        style: FlutterFlowTheme.of(context).bodySmall.override(
              font: GoogleFonts.inter(fontWeight: FontWeight.w600),
              color: FlutterFlowTheme.of(context).primaryText,
            ),
      ),
    );
  }

  Widget _buildPlaceholderHints() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: FlutterFlowTheme.of(context).primaryBackground,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Available Placeholders:',
            style: FlutterFlowTheme.of(context).bodySmall.override(
                  font: GoogleFonts.inter(fontWeight: FontWeight.w600),
                  color: FlutterFlowTheme.of(context).primaryText,
                  fontSize: 11,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            '{{leadName}} - Lead\'s name\n{{companyName}} - Your company\n{{assistantName}} - AI assistant name',
            style: FlutterFlowTheme.of(context).bodySmall.override(
                  font: GoogleFonts.inter(),
                  color: FlutterFlowTheme.of(context).secondaryText,
                  fontSize: 11,
                ),
          ),
        ],
      ),
    );
  }

  // Helper to safely get a String from node data that might be a Map
  String _getStringValue(dynamic value, String defaultValue) {
    if (value == null) return defaultValue;
    if (value is String) return value;
    if (value is Map) {
      try {
        return const JsonEncoder.withIndent('  ').convert(value);
      } catch (_) {
        return defaultValue;
      }
    }
    return value.toString();
  }

  InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: FlutterFlowTheme.of(context).primaryBackground,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    );
  }

  void _showScenarioSettingsDialog() {
    final nameController = TextEditingController(text: _model.scenarioName);
    final descController = TextEditingController(text: _model.scenarioDescription);

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Scenario Settings'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(labelText: 'Name'),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: descController,
              decoration: const InputDecoration(labelText: 'Description'),
              maxLines: 3,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                const Text('Active'),
                const Spacer(),
                Switch(
                  value: _model.isActive,
                  onChanged: (value) {
                    setState(() {
                      _model.isActive = value;
                      _model.hasUnsavedChanges = true;
                    });
                    Navigator.pop(context);
                    _showScenarioSettingsDialog();
                  },
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              setState(() {
                _model.scenarioName = nameController.text;
                _model.scenarioDescription = descController.text;
                _model.hasUnsavedChanges = true;
              });
              Navigator.pop(context);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}

/// Custom painter for grid background
class GridPainter extends CustomPainter {
  final Color color;
  final double spacing;

  GridPainter({required this.color, this.spacing = 20});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withOpacity(0.3)
      ..strokeWidth = 0.5;

    for (double x = 0; x < size.width; x += spacing) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += spacing) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Empty painter to ensure transparent canvas
class _CanvasContentPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    // Do nothing - just ensures transparent background
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Custom painter for edges between nodes
class EdgePainter extends CustomPainter {
  final Offset start;
  final Offset end;
  final Color color;
  final String? label;

  EdgePainter({
    required this.start,
    required this.end,
    required this.color,
    this.label,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    // Draw bezier curve
    final path = Path();
    path.moveTo(start.dx, start.dy);

    final midY = (start.dy + end.dy) / 2;
    path.cubicTo(
      start.dx,
      midY,
      end.dx,
      midY,
      end.dx,
      end.dy,
    );

    canvas.drawPath(path, paint);

    // Draw arrow
    final arrowPaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final arrowPath = Path();
    arrowPath.moveTo(end.dx, end.dy);
    arrowPath.lineTo(end.dx - 6, end.dy - 10);
    arrowPath.lineTo(end.dx + 6, end.dy - 10);
    arrowPath.close();

    canvas.drawPath(arrowPath, arrowPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}

