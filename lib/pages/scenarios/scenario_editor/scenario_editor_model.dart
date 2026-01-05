import '/flutter_flow/flutter_flow_util.dart';
import 'scenario_editor_widget.dart' show ScenarioEditorWidget;
import 'package:flutter/material.dart';
import 'package:collection/collection.dart';

/// Node data model for the flow editor
class FlowNode {
  final String id;
  String type;
  Offset position;
  Map<String, dynamic> data;
  bool isSelected;

  FlowNode({
    required this.id,
    required this.type,
    required this.position,
    Map<String, dynamic>? data,
    this.isSelected = false,
  }) : data = data ?? {};

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type,
        'position': {'x': position.dx, 'y': position.dy},
        'data': data,
      };

  factory FlowNode.fromJson(Map<String, dynamic> json) {
    final pos = json['position'] as Map<String, dynamic>?;
    return FlowNode(
      id: json['id'] as String,
      type: json['type'] as String,
      position: Offset(
        (pos?['x'] as num?)?.toDouble() ?? 100,
        (pos?['y'] as num?)?.toDouble() ?? 100,
      ),
      data: (json['data'] as Map<String, dynamic>?) ?? {},
    );
  }

  FlowNode copyWith({
    String? id,
    String? type,
    Offset? position,
    Map<String, dynamic>? data,
    bool? isSelected,
  }) {
    return FlowNode(
      id: id ?? this.id,
      type: type ?? this.type,
      position: position ?? this.position,
      data: data ?? Map.from(this.data),
      isSelected: isSelected ?? this.isSelected,
    );
  }
}

/// Edge data model for connections between nodes
class FlowEdge {
  final String id;
  final String source;
  final String target;
  String? condition;
  String? label;

  FlowEdge({
    required this.id,
    required this.source,
    required this.target,
    this.condition,
    this.label,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'source': source,
        'target': target,
        if (condition != null) 'condition': condition,
        if (label != null) 'label': label,
      };

  factory FlowEdge.fromJson(Map<String, dynamic> json) {
    return FlowEdge(
      id: json['id'] as String? ?? '${json['source']}_${json['target']}',
      source: json['source'] as String,
      target: json['target'] as String,
      condition: json['condition'] as String?,
      label: json['label'] as String?,
    );
  }
}

/// Node type definition
class NodeTypeDefinition {
  final String type;
  final String label;
  final Color color;
  final IconData icon;
  final int maxOutputs;
  final Map<String, dynamic> defaultData;

  const NodeTypeDefinition({
    required this.type,
    required this.label,
    required this.color,
    required this.icon,
    required this.maxOutputs,
    required this.defaultData,
  });
}

class ScenarioEditorModel extends FlutterFlowModel<ScenarioEditorWidget> {
  /// State fields
  final unfocusNode = FocusNode();

  /// Scenario metadata
  String? scenarioId;
  String scenarioName = 'New Scenario';
  String scenarioDescription = '';
  bool isActive = false;
  int version = 1;

  /// Flow data
  List<FlowNode> nodes = [];
  List<FlowEdge> edges = [];

  /// Editor state
  FlowNode? selectedNode;
  String? connectingFromNodeId;
  Offset canvasOffset = Offset.zero;
  double canvasScale = 1.0;
  bool isDragging = false;
  bool isConnecting = false;
  bool hasUnsavedChanges = false;
  bool isLoading = false;
  bool isSaving = false;

  /// Node types
  static const List<NodeTypeDefinition> nodeTypes = [
    NodeTypeDefinition(
      type: 'start',
      label: 'Start',
      color: Color(0xFF4CAF50),
      icon: Icons.play_circle_filled,
      maxOutputs: 1,
      defaultData: {'trigger': 'outbound'},
    ),
    NodeTypeDefinition(
      type: 'say',
      label: 'Say',
      color: Color(0xFF2196F3),
      icon: Icons.record_voice_over,
      maxOutputs: 1,
      defaultData: {'text': '', 'voice': 'rachel', 'language': 'he-IL'},
    ),
    NodeTypeDefinition(
      type: 'gather',
      label: 'Gather Input',
      color: Color(0xFFFF9800),
      icon: Icons.hearing,
      maxOutputs: 3,
      defaultData: {
        'inputType': 'speech',
        'prompt': '',
        'timeout': 5,
        'voice': 'rachel',
        'language': 'he-IL',
        'keywords': {'positive': [], 'negative': []},
      },
    ),
    NodeTypeDefinition(
      type: 'condition',
      label: 'Condition',
      color: Color(0xFF9C27B0),
      icon: Icons.call_split,
      maxOutputs: 10,
      defaultData: {
        'conditionType': 'keywords',
        'variable': '',
        'operator': 'equals',
        'value': '',
        'branches': [],
      },
    ),
    NodeTypeDefinition(
      type: 'setVariable',
      label: 'Set Variable',
      color: Color(0xFF607D8B),
      icon: Icons.data_object,
      maxOutputs: 1,
      defaultData: {'variableName': '', 'value': '', 'valueType': 'string'},
    ),
    NodeTypeDefinition(
      type: 'apiCall',
      label: 'API Call',
      color: Color(0xFF00BCD4),
      icon: Icons.cloud,
      maxOutputs: 2,
      defaultData: {
        'url': '',
        'method': 'POST',
        'headers': {},
        'body': '',
        'saveResponseTo': '',
      },
    ),
    NodeTypeDefinition(
      type: 'transfer',
      label: 'Transfer Call',
      color: Color(0xFFE91E63),
      icon: Icons.phone_forwarded,
      maxOutputs: 2,
      defaultData: {
        'destinationType': 'number',
        'destination': '',
        'announcement': '',
        'timeout': 30,
      },
    ),
    NodeTypeDefinition(
      type: 'record',
      label: 'Record',
      color: Color(0xFF795548),
      icon: Icons.fiber_manual_record,
      maxOutputs: 1,
      defaultData: {
        'action': 'start',
        'maxLength': 300,
        'playBeep': true,
        'transcribe': false,
      },
    ),
    NodeTypeDefinition(
      type: 'wait',
      label: 'Wait',
      color: Color(0xFF9E9E9E),
      icon: Icons.hourglass_empty,
      maxOutputs: 1,
      defaultData: {'duration': 1},
    ),
    NodeTypeDefinition(
      type: 'scheduleCallback',
      label: 'Schedule Callback',
      color: Color(0xFF3F51B5),
      icon: Icons.schedule,
      maxOutputs: 1,
      defaultData: {'delay': 3600, 'priority': 'normal', 'message': ''},
    ),
    NodeTypeDefinition(
      type: 'updateLead',
      label: 'Update Lead',
      color: Color(0xFF8BC34A),
      icon: Icons.person,
      maxOutputs: 1,
      defaultData: {'status': '', 'notes': '', 'customFields': {}},
    ),
    NodeTypeDefinition(
      type: 'end',
      label: 'End Call',
      color: Color(0xFFF44336),
      icon: Icons.call_end,
      maxOutputs: 0,
      defaultData: {'message': 'Thank you. Goodbye!', 'status': 'completed'},
    ),
  ];

  /// Get node type definition
  NodeTypeDefinition getNodeType(String type) {
    return nodeTypes.firstWhere(
      (nt) => nt.type == type,
      orElse: () => nodeTypes.first,
    );
  }

  /// Add a new node
  String addNode(String type, Offset position) {
    final nodeType = getNodeType(type);
    final id = 'node_${DateTime.now().millisecondsSinceEpoch}';
    nodes.add(FlowNode(
      id: id,
      type: type,
      position: position,
      data: Map.from(nodeType.defaultData),
    ));
    hasUnsavedChanges = true;
    return id;
  }

  /// Remove a node and its edges
  void removeNode(String nodeId) {
    nodes.removeWhere((n) => n.id == nodeId);
    edges.removeWhere((e) => e.source == nodeId || e.target == nodeId);
    if (selectedNode?.id == nodeId) {
      selectedNode = null;
    }
    hasUnsavedChanges = true;
  }

  /// Add an edge between nodes
  void addEdge(String sourceId, String targetId, {String? condition}) {
    // Check if edge already exists
    final exists = edges.any(
      (e) => e.source == sourceId && e.target == targetId,
    );
    if (exists) return;

    final id = 'edge_${DateTime.now().millisecondsSinceEpoch}';
    edges.add(FlowEdge(
      id: id,
      source: sourceId,
      target: targetId,
      condition: condition,
    ));
    hasUnsavedChanges = true;
  }

  /// Remove an edge
  void removeEdge(String edgeId) {
    edges.removeWhere((e) => e.id == edgeId);
    hasUnsavedChanges = true;
  }

  /// Select a node
  void selectNode(String? nodeId) {
    for (var node in nodes) {
      node.isSelected = node.id == nodeId;
    }
    selectedNode = nodeId != null ? nodes.firstWhereOrNull((n) => n.id == nodeId) : null;
  }

  /// Update node position
  void updateNodePosition(String nodeId, Offset newPosition) {
    final node = nodes.firstWhereOrNull((n) => n.id == nodeId);
    if (node != null) {
      node.position = newPosition;
      hasUnsavedChanges = true;
    }
  }

  /// Update node data
  void updateNodeData(String nodeId, Map<String, dynamic> newData) {
    final node = nodes.firstWhereOrNull((n) => n.id == nodeId);
    if (node != null) {
      node.data = newData;
      hasUnsavedChanges = true;
    }
  }

  /// Get scenario as JSON
  Map<String, dynamic> toJson() => {
        if (scenarioId != null) 'id': scenarioId,
        'name': scenarioName,
        'description': scenarioDescription,
        'isActive': isActive,
        'nodes': nodes.map((n) => n.toJson()).toList(),
        'edges': edges.map((e) => e.toJson()).toList(),
      };

  /// Load scenario from JSON
  void fromJson(Map<String, dynamic> json) {
    scenarioId = json['id'] as String?;
    scenarioName = json['name'] as String? ?? 'New Scenario';
    scenarioDescription = json['description'] as String? ?? '';
    isActive = json['isActive'] as bool? ?? false;
    version = json['version'] as int? ?? 1;

    nodes = (json['nodes'] as List<dynamic>?)
            ?.map((n) => FlowNode.fromJson(n as Map<String, dynamic>))
            .toList() ??
        [];

    edges = (json['edges'] as List<dynamic>?)
            ?.map((e) => FlowEdge.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];

    hasUnsavedChanges = false;
  }

  /// Create initial start node for new scenario
  void createInitialNodes() {
    if (nodes.isEmpty) {
      addNode('start', const Offset(300, 100));
      hasUnsavedChanges = false;
    }
  }

  /// Validate the scenario before saving
  /// Returns a list of error messages, empty if valid
  List<String> validateScenario() {
    final List<String> errors = [];

    // Check: Has Start node
    final hasStart = nodes.any((n) => n.type == 'start');
    if (!hasStart) {
      errors.add('Missing Start node - every flow must begin with a Start node');
    }

    // Check: Has End node
    final hasEnd = nodes.any((n) => n.type == 'end');
    if (!hasEnd) {
      errors.add('Missing End node - flow must have at least one endpoint');
    }

    // Check: All nodes (except Start) have input connections
    for (var node in nodes.where((n) => n.type != 'start')) {
      final hasInput = edges.any((e) => e.target == node.id);
      if (!hasInput) {
        final nodeType = getNodeType(node.type);
        errors.add('"${nodeType.label}" node is not connected - add an input connection');
      }
    }

    // Check: All nodes (except End) have output connections
    for (var node in nodes.where((n) => n.type != 'end')) {
      final hasOutput = edges.any((e) => e.source == node.id);
      if (!hasOutput) {
        final nodeType = getNodeType(node.type);
        errors.add('"${nodeType.label}" node has no output - connect it to the next step');
      }
    }

    // Check: Path from Start to End exists
    if (hasStart && hasEnd && errors.isEmpty) {
      if (!_hasPathToEnd()) {
        errors.add('No complete path from Start to End - ensure all nodes are connected');
      }
    }

    // Check: Required fields are filled
    for (var node in nodes) {
      final fieldErrors = _validateNodeFields(node);
      errors.addAll(fieldErrors);
    }

    return errors;
  }

  /// Check if there's a path from Start to any End node using BFS
  bool _hasPathToEnd() {
    final startNode = nodes.firstWhereOrNull((n) => n.type == 'start');
    if (startNode == null) return false;

    final endNodeIds = nodes.where((n) => n.type == 'end').map((n) => n.id).toSet();
    if (endNodeIds.isEmpty) return false;

    final visited = <String>{};
    final queue = <String>[startNode.id];

    while (queue.isNotEmpty) {
      final currentId = queue.removeAt(0);
      if (endNodeIds.contains(currentId)) {
        return true;
      }

      if (visited.contains(currentId)) continue;
      visited.add(currentId);

      // Find all outgoing edges from current node
      final outgoing = edges.where((e) => e.source == currentId);
      for (var edge in outgoing) {
        if (!visited.contains(edge.target)) {
          queue.add(edge.target);
        }
      }
    }

    return false;
  }

  /// Validate required fields for a specific node
  List<String> _validateNodeFields(FlowNode node) {
    final List<String> errors = [];
    final nodeType = getNodeType(node.type);

    switch (node.type) {
      case 'say':
        if ((node.data['text'] as String? ?? '').trim().isEmpty) {
          errors.add('Say node: Text message is required');
        }
        break;
      case 'gather':
        if ((node.data['prompt'] as String? ?? '').trim().isEmpty) {
          errors.add('Gather node: Prompt text is required');
        }
        break;
      case 'apiCall':
        if ((node.data['url'] as String? ?? '').trim().isEmpty) {
          errors.add('API Call node: URL is required');
        }
        break;
      case 'transfer':
        if ((node.data['destination'] as String? ?? '').trim().isEmpty) {
          errors.add('Transfer node: Destination number is required');
        }
        break;
      case 'setVariable':
        if ((node.data['variableName'] as String? ?? '').trim().isEmpty) {
          errors.add('Set Variable node: Variable name is required');
        }
        break;
    }

    return errors;
  }

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {
    unfocusNode.dispose();
  }
}


