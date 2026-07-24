const vscode = acquireVsCodeApi();

let flow = {
  id: '',
  name: '',
  version: '1.0.0',
  nodes: [],
  edges: [],
  metadata: {},
};

let selectedNode = null;
let selectedEdge = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragNode = null;
let drawingEdge = null;

const canvas = document.getElementById('canvas');
const canvasContainer = document.getElementById('canvas-container');
const toolboxItems = document.querySelectorAll('.toolbox-item');
const propertiesContent = document.getElementById('properties-content');
const validationContent = document.getElementById('validation-content');
const saveBtn = document.getElementById('save-btn');
const exportBtn = document.getElementById('export-btn');
const validateBtn = document.getElementById('validate-btn');

// Initialize
vscode.postMessage({ type: 'ready' });

// Message handling from extension
window.addEventListener('message', event => {
  const message = event.data;
  switch (message.type) {
    case 'flowData':
      flow = message.data;
      redrawCanvas();
      break;

    case 'validationResult':
      displayValidation(message.data);
      break;

    case 'exportData':
      downloadJSON(message.data);
      break;
  }
});

// Toolbox drag and drop
toolboxItems.forEach(item => {
  item.addEventListener('dragstart', e => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('nodeType', item.getAttribute('data-node-type'));
  });
});

// Canvas drag and drop for creating nodes
canvasContainer.addEventListener('dragover', e => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

canvasContainer.addEventListener('drop', e => {
  e.preventDefault();
  const nodeType = e.dataTransfer.getData('nodeType');
  const rect = canvasContainer.getBoundingClientRect();
  const x = e.clientX - rect.left + canvasContainer.scrollLeft;
  const y = e.clientY - rect.top + canvasContainer.scrollTop;

  const id = `node_${Date.now()}`;
  const node = {
    id,
    type: nodeType,
    label: `${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)}`,
    position: { x, y },
  };

  flow.nodes.push(node);
  redrawCanvas();
  vscode.postMessage({ type: 'flowChanged', data: flow });
});

// Canvas mouse events
canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left + canvasContainer.scrollLeft;
  const y = e.clientY - rect.top + canvasContainer.scrollTop;

  const clickedNode = getNodeAtPosition(x, y);

  if (drawingEdge) {
    if (clickedNode && clickedNode.id !== drawingEdge.from.id) {
      const edge = {
        id: `edge_${Date.now()}`,
        source: drawingEdge.from.id,
        target: clickedNode.id,
      };
      flow.edges.push(edge);
      vscode.postMessage({ type: 'flowChanged', data: flow });
    }
    drawingEdge = null;
    canvasContainer.style.cursor = '';
    redrawCanvas();
    return;
  }

  if (clickedNode && e.button === 0) {
    isDragging = true;
    dragStartX = x;
    dragStartY = y;
    dragNode = clickedNode;
    selectNode(clickedNode);
  }
});

canvas.addEventListener('mousemove', e => {
  if (isDragging && dragNode) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left + canvasContainer.scrollLeft;
    const y = e.clientY - rect.top + canvasContainer.scrollTop;

    dragNode.position.x += x - dragStartX;
    dragNode.position.y += y - dragStartY;
    dragStartX = x;
    dragStartY = y;

    redrawCanvas();
  }
});

canvas.addEventListener('mouseup', e => {
  if (isDragging) {
    isDragging = false;
    dragNode = null;
    vscode.postMessage({ type: 'flowChanged', data: flow });
  }
});

canvas.addEventListener('dblclick', e => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left + canvasContainer.scrollLeft;
  const y = e.clientY - rect.top + canvasContainer.scrollTop;

  const clickedNode = getNodeAtPosition(x, y);
  if (clickedNode) {
    startEdgeDrawing(clickedNode);
  }
});

// Button handlers
saveBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'flowChanged', data: flow });
  vscode.postMessage({ type: 'save' });
});

validateBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'validationRequested' });
});

exportBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'exportRequested' });
});

// Functions
function getNodeAtPosition(x, y) {
  const nodeRadius = 40;
  for (const node of flow.nodes) {
    const dx = node.position.x - x;
    const dy = node.position.y - y;
    if (Math.sqrt(dx * dx + dy * dy) < nodeRadius) {
      return node;
    }
  }
  return null;
}

function selectNode(node) {
  selectedNode = node;
  selectedEdge = null;
  displayProperties(node);
  redrawCanvas();
}

function displayProperties(node) {
  propertiesContent.innerHTML = `
    <label>Label:</label>
    <input type="text" id="prop-label" value="${node.label}">

    <label>Type:</label>
    <select id="prop-type" disabled>
      <option value="${node.type}" selected>${node.type}</option>
    </select>

    ${node.type === 'task' ? `
      <label>Script:</label>
      <textarea id="prop-script" placeholder="Task script">${node.config?.script || ''}</textarea>
    ` : ''}

    ${node.type === 'decision' ? `
      <label>Condition:</label>
      <textarea id="prop-condition" placeholder="Condition expression">${node.config?.condition || ''}</textarea>
    ` : ''}

    <label>Description:</label>
    <textarea id="prop-description" placeholder="Node description">${node.metadata?.description || ''}</textarea>
  `;

  const labelInput = document.getElementById('prop-label');
  labelInput.addEventListener('change', e => {
    node.label = e.target.value;
    redrawCanvas();
    vscode.postMessage({ type: 'flowChanged', data: flow });
  });

  if (document.getElementById('prop-script')) {
    document.getElementById('prop-script').addEventListener('change', e => {
      if (!node.config) node.config = {};
      node.config.script = e.target.value;
      vscode.postMessage({ type: 'flowChanged', data: flow });
    });
  }

  if (document.getElementById('prop-condition')) {
    document.getElementById('prop-condition').addEventListener('change', e => {
      if (!node.config) node.config = {};
      node.config.condition = e.target.value;
      vscode.postMessage({ type: 'flowChanged', data: flow });
    });
  }

  if (document.getElementById('prop-description')) {
    document.getElementById('prop-description').addEventListener('change', e => {
      if (!node.metadata) node.metadata = {};
      node.metadata.description = e.target.value;
      vscode.postMessage({ type: 'flowChanged', data: flow });
    });
  }
}

function startEdgeDrawing(fromNode) {
  drawingEdge = { from: fromNode, to: null };
  canvasContainer.style.cursor = 'crosshair';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && drawingEdge) {
    drawingEdge = null;
    canvasContainer.style.cursor = '';
    redrawCanvas();
  }
});

function displayValidation(validation) {
  if (validation.valid) {
    validationContent.innerHTML = '<div class="success-message">✓ Flow is valid</div>';
  } else {
    validationContent.innerHTML = validation.errors
      .map(err => `<div class="${err.type}-message">
        <strong>${err.type.toUpperCase()}:</strong> ${err.message}
      </div>`)
      .join('');
  }
}

function downloadJSON(json) {
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(json));
  element.setAttribute('download', `${flow.name || 'flow'}.json`);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

function redrawCanvas() {
  // Clear canvas
  while (canvas.firstChild) {
    canvas.removeChild(canvas.firstChild);
  }

  // Add arrowhead marker
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');

  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', '0 0, 10 3, 0 6');
  polygon.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--vscode-sideBar-border') || '#888');

  marker.appendChild(polygon);
  defs.appendChild(marker);
  canvas.appendChild(defs);

  // Draw edges
  flow.edges.forEach(edge => {
    const source = flow.nodes.find(n => n.id === edge.source);
    const target = flow.nodes.find(n => n.id === edge.target);

    if (source && target) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', source.position.x);
      line.setAttribute('y1', source.position.y);
      line.setAttribute('x2', target.position.x);
      line.setAttribute('y2', target.position.y);
      line.setAttribute('class', `edge ${selectedEdge?.id === edge.id ? 'selected' : ''}`);
      line.setAttribute('marker-end', 'url(#arrowhead)');

      canvas.appendChild(line);

      if (edge.label) {
        const midX = (source.position.x + target.position.x) / 2;
        const midY = (source.position.y + target.position.y) / 2;
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', midX);
        text.setAttribute('y', midY - 5);
        text.setAttribute('class', 'edge-label');
        text.textContent = edge.label;
        canvas.appendChild(text);
      }
    }
  });

  // Draw nodes
  flow.nodes.forEach(node => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', `node ${node.type} ${selectedNode?.id === node.id ? 'selected' : ''}`);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rect.setAttribute('cx', node.position.x);
    rect.setAttribute('cy', node.position.y);
    rect.setAttribute('r', '40');
    rect.setAttribute('class', 'node-rect');

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', node.position.x);
    text.setAttribute('y', node.position.y);
    text.setAttribute('class', 'node-text');
    text.textContent = node.label;

    group.appendChild(rect);
    group.appendChild(text);

    group.addEventListener('click', e => {
      e.stopPropagation();
      selectNode(node);
    });

    canvas.appendChild(group);
  });

  // Update canvas size
  if (flow.nodes.length > 0) {
    const maxX = Math.max(...flow.nodes.map(n => n.position.x)) + 100;
    const maxY = Math.max(...flow.nodes.map(n => n.position.y)) + 100;
    canvas.setAttribute('width', Math.max(800, maxX));
    canvas.setAttribute('height', Math.max(600, maxY));
  } else {
    canvas.setAttribute('width', '800');
    canvas.setAttribute('height', '600');
  }
}

// Initial render
redrawCanvas();
