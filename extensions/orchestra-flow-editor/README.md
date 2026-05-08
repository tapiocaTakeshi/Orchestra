# Orchestra Flow Editor

A visual flow editor for Orchestra IDE enabling graph-based workflow design with drag-and-drop node creation, edge management, and real-time validation.

## Features

### Flow Editor
- **Canvas-based Visual Editor**: Intuitive interface for designing and editing flow definitions
- **Drag-and-Drop Node Creation**: Create nodes by dragging from the toolbox onto the canvas
- **Connection Management**: Draw edges between nodes to define workflow paths
- **Real-time Validation**: Get instant feedback on flow correctness

### Type System
- **Node Types**: Start, End, Task, Decision, Parallel, and Merge nodes
- **Edge Definitions**: Flexible edge system with optional conditions and labels
- **Flow Metadata**: Track flow creation, modification, authors, and custom tags
- **Execution Tracking**: Monitor flow execution with traces and status

### Validation
- **Cycle Detection**: Automatically detects and prevents circular flows
- **Connectivity Checks**: Ensures all nodes are properly connected
- **Node Type Validation**: Validates node configurations based on type
- **Decision Node Conditions**: Ensures decision nodes have proper branching conditions

### JSON Export/Import
- **Standard Format**: Flows stored in clean, readable JSON format
- **Version Control**: Track flow definitions in Git
- **Data Exchange**: Easy integration with other tools

## Usage

### Opening a Flow File
1. Create or open a `.flow` or `.orchestraflow` file
2. The flow editor opens automatically

### Creating Nodes
1. Drag node types from the **Nodes** panel on the left
2. Drop onto the canvas to create a node
3. Nodes appear at the drop position

### Connecting Nodes
1. Double-click a node to start drawing a connection
2. Click the target node to complete the connection
3. Edges support optional labels and conditions

### Editing Properties
1. Click a node to select it
2. Edit properties in the **Properties** panel on the right:
   - Label: Change the display name
   - Description: Add documentation
   - Task Script: For task nodes, add execution script
   - Condition: For decision nodes, add branching conditions

### Validation
- Click the **Validate** button to check flow correctness
- Errors appear in the validation panel
- Warnings indicate potential issues

### Exporting Flows
- Click the **Export** button to download the flow as JSON
- Use for backup, version control, or exchange

## Flow Definition Format

```json
{
  "id": "unique-flow-id",
  "name": "My Flow",
  "version": "1.0.0",
  "description": "Flow description",
  "nodes": [
    {
      "id": "node_1",
      "type": "start",
      "label": "Start",
      "position": { "x": 100, "y": 100 }
    },
    {
      "id": "node_2",
      "type": "task",
      "label": "Process Data",
      "position": { "x": 300, "y": 100 },
      "config": { "script": "process_data()" },
      "metadata": { "description": "Processes input data" }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "label": "proceed"
    }
  ],
  "metadata": {
    "created": "2025-05-08T00:00:00Z",
    "author": "user"
  }
}
```

## Node Types

### Start
- Entry point for the flow
- Can have only outgoing edges
- Exactly one per flow

### End
- Exit point for the flow
- Can have only incoming edges
- At least one per flow

### Task
- Represents work to be done
- Can have configuration (script, params)
- Standard processing node

### Decision
- Branches flow based on conditions
- Should have multiple outgoing edges
- Each edge can have a condition label

### Parallel
- Spawns multiple parallel execution paths
- Combines with Merge for synchronization
- All outgoing edges execute simultaneously

### Merge
- Synchronizes parallel execution paths
- Waits for all incoming edges
- Combines results before proceeding

## Validation Rules

- Every flow must have at least one Start node
- Every flow must have at least one End node
- All nodes must be reachable from the Start node
- No circular paths allowed
- Decision nodes should have multiple outgoing edges
- All nodes must have unique IDs
- Edges must reference valid node IDs

## Command Reference

| Command | Description |
|---------|-------------|
| Save | Save flow changes to file |
| Validate | Check flow for errors and warnings |
| Export | Download flow as JSON |

## Keyboard Shortcuts

- Double-click node: Start drawing edge
- Click node: Select node
- Drag node: Move on canvas

## Extension Settings

No additional settings required. The extension works with standard VS Code dark/light themes.

## Known Limitations

- Maximum recommended nodes per flow: 1000
- Edge drawing must be completed by clicking target node
- Undo/redo not yet implemented

## Support

For issues or feature requests, contact the Orchestra team or check the project repository.
