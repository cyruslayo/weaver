import './style.css';
import { StreamEngine } from './StreamingEngine';
import { StateActionBus } from './StateActionBus';
import { ComponentRegistry } from './ComponentRegistry';

// 1. Initialize the State Bus (pointing to your Node.js MCP server)
let streamEngine: StreamEngine;
const bus = new StateActionBus(
    'http://localhost:3000/api/ai-action',
    (chunk) => streamEngine.receiveChunk(chunk),
);

// 2. Initialize the Component Registry
const registry = new ComponentRegistry();

// ============================================================
// TOKEN DICTIONARIES (The Design System Firewall)
// AI tokens -> safe CSS values. Everything the AI can express
// flows through here, so it can never inject raw CSS.
// ============================================================
const gapMap: Record<string, string> = { none: '0', sm: '8px', md: '16px', lg: '24px', xl: '32px' };
const padMap: Record<string, string> = { none: '0', sm: '12px', md: '20px', lg: '32px', xl: '48px' };
const radiusMap: Record<string, string> = { none: '0', sm: '4px', md: '8px', lg: '16px', full: '9999px' };
const sizeMap: Record<string, string> = { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem' };

// ============================================================
// LAYER 1: STRUCTURE & ASSETS — Box, Text, Visual
// ============================================================

// 1. THE BOX (Layout Engine)
registry.register('Box', (data, children) => {
    const div = document.createElement('div');
    div.style.display = data.layout === 'grid' ? 'grid' : 'flex';
    div.style.boxSizing = 'border-box';

    if (data.layout === 'grid') {
        if (data.columns) div.style.gridTemplateColumns = `repeat(${data.columns}, 1fr)`;
    } else {
        div.style.flexDirection = data.direction === 'row' ? 'row' : 'column';
        if (data.align) div.style.alignItems = data.align === 'start' ? 'flex-start' : data.align === 'end' ? 'flex-end' : data.align;
        if (data.justify) div.style.justifyContent = data.justify === 'between' ? 'space-between' : data.justify;
        if (data.wrap) div.style.flexWrap = 'wrap';
    }

    if (data.colSpan) div.style.gridColumn = `span ${data.colSpan}`;
    if (data.flexGrow !== undefined) div.style.flexGrow = data.flexGrow.toString();

    div.style.gap = gapMap[data.gap || 'md'];
    div.style.padding = padMap[data.padding || 'none'];
    div.style.backgroundColor = data.backgroundColor ? `var(--color-${data.backgroundColor})` : 'transparent';
    div.style.borderRadius = radiusMap[data.borderRadius || 'none'];

    children.forEach(child => div.appendChild(child));
    return div;
});

// 2. THE TEXT (Typography)
registry.register('Text', (data) => {
    const el = document.createElement(data.as || 'p');
    const renderText = (value?: unknown) => {
        el.innerText = data.binding
            ? `${data.prefix || ''}${value || data.fallback || ''}`
            : (data.literalString || '');
    };
    renderText();
    if (data.binding) bus.subscribe(data.binding, renderText);
    el.style.fontSize = sizeMap[data.size || 'base'];
    el.style.fontWeight = data.weight === 'bold' ? '700' : data.weight === 'semibold' ? '600' : '400';
    el.style.color = data.color ? `var(--text-${data.color})` : 'inherit';
    el.style.textAlign = data.align || 'left';
    el.style.margin = '0';

    if (data.truncate) {
        el.style.overflow = 'hidden';
        el.style.textOverflow = 'ellipsis';
        el.style.whiteSpace = 'nowrap';
    }
    return el;
});

// 3. THE VISUAL (Media)
registry.register('Visual', (data) => {
    const isIcon = data.type === 'icon';
    const el = document.createElement(isIcon ? 'span' : 'img');

    if (!isIcon) {
        (el as HTMLImageElement).src = data.src;
        (el as HTMLImageElement).alt = data.alt || '';
        el.style.objectFit = data.objectFit || 'cover';
    } else {
        // Assume using an icon font or SVG loader based on 'src' name
        el.className = `icon icon-${data.src}`;
    }

    // Apply aspect ratio (standard CSS property)
    if (data.aspectRatio && data.aspectRatio !== 'auto') {
        el.style.aspectRatio = data.aspectRatio.replace(':', '/');
    }

    el.style.width = '100%';
    el.style.maxWidth = '100%';
    el.style.borderRadius = data.type === 'avatar' ? '50%' : radiusMap[data.borderRadius || 'none'];
    return el;
});

// ============================================================
// LAYER 2: INTERACTION — Field, Button
// ============================================================

// 4. THE FIELD (Input)
registry.register('Field', (data) => {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '4px';

    if (data.label) {
        const label = document.createElement('label');
        label.innerText = data.label;
        label.style.fontSize = sizeMap.sm;
        wrapper.appendChild(label);
    }

    const input = document.createElement('input');
    input.type = data.type || 'text';
    input.placeholder = data.placeholder || '';
    input.value = data.binding ? (bus.getState(data.binding) || '') : '';
    input.disabled = !!data.disabled;
    input.style.padding = padMap.sm;
    input.style.border = data.state === 'error' ? '1px solid red' : '1px solid #ccc';
    input.style.borderRadius = radiusMap.sm;

    if (data.binding) {
        input.oninput = (e) => bus.updateState(data.binding, (e.target as HTMLInputElement).value);
    }
    wrapper.appendChild(input);

    if (data.description || data.errorMessage) {
        const helper = document.createElement('span');
        helper.innerText = (data.state === 'error' ? data.errorMessage : data.description) || '';
        helper.style.fontSize = sizeMap.xs;
        helper.style.color = data.state === 'error' ? 'red' : 'gray';
        wrapper.appendChild(helper);
    }
    return wrapper;
});

// 5. THE BUTTON (Action)
registry.register('Button', (data) => {
    const btn = document.createElement('button');
    btn.innerText = data.loading ? '...' : (data.label || 'Submit');
    btn.disabled = !!data.disabled || !!data.loading;

    btn.style.padding = `${padMap.sm} ${padMap.md}`;
    btn.style.borderRadius = radiusMap.sm;
    btn.style.border = data.variant === 'outline' ? '1px solid currentColor' : 'none';
    btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer';

    // Basic variant styling
    if (data.variant === 'primary' || !data.variant) {
        btn.style.backgroundColor = 'var(--brand-color, #007bff)';
        btn.style.color = 'white';
    } else if (data.variant === 'destructive') {
        btn.style.backgroundColor = 'var(--critical-color, #dc3545)';
        btn.style.color = 'white';
    }

    if (data.fullWidth) btn.style.width = '100%';

    if (data.actionId) {
        btn.onclick = () => bus.dispatch(data.actionId, data.context || {});
    }
    return btn;
});

// ============================================================
// LAYER 3: THE Z-AXIS & INFINITY — DataGrid, Chart, Overlay
// ============================================================

// 6. THE DATAGRID (Infinity)
registry.register('DataGrid', (data) => {
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';

    // Table Header
    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    (data.columns || []).forEach((col: any) => {
        const th = document.createElement('th');
        th.innerText = col.label;
        th.style.textAlign = col.type === 'number' ? 'right' : 'left';
        th.style.padding = padMap.sm;
        th.style.borderBottom = '2px solid #eee';
        trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    // Table Body
    const tbody = document.createElement('tbody');
    (data.rows || []).forEach((row: any) => {
        const tr = document.createElement('tr');
        (data.columns || []).forEach((col: any) => {
            const td = document.createElement('td');
            td.innerText = row[col.key] || '';
            td.style.textAlign = col.type === 'number' ? 'right' : 'left';
            td.style.padding = padMap.sm;
            td.style.borderBottom = '1px solid #eee';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
});

// 7. THE CHART (Data Visualization)
registry.register('Chart', (data) => {
    // A placeholder wrapper: In a real app, you would pass this 'container'
    // to a library like Chart.js or ECharts using 'data.type' and 'data.data'
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '200px';
    container.style.display = 'flex';
    container.style.alignItems = 'flex-end';
    container.style.gap = '4px';

    const max = Math.max(...(data.data || []).map((d: any) => d.value), 1);
    (data.data || []).forEach((point: any) => {
        const bar = document.createElement('div');
        bar.style.height = `${(point.value / max) * 100}%`;
        bar.style.flex = '1';
        bar.style.backgroundColor = 'var(--brand-color, #007bff)';
        container.appendChild(bar);
    });
    return container;
});

// 8. THE OVERLAY (The Z-Axis)
registry.register('Overlay', (data, children) => {
    // We use the incredibly powerful native HTML5 <dialog> element.
    // No z-index wars, no manual focus trapping, no Escape handling — the browser does it all.
    const dialog = document.createElement('dialog');
    dialog.style.border = 'none';
    dialog.style.padding = padMap[data.padding || 'lg'];
    dialog.style.borderRadius = radiusMap[data.borderRadius || 'md'];

    children.forEach(child => dialog.appendChild(child));

    // Open on demand. The tree is detached during build, so defer until
    // the engine has appended us to the live document.
    if (data.open) {
        setTimeout(() => dialog.showModal(), 0);
    }

    // Close via the AI contract: dispatch the action, let the model decide the next screen.
    if (data.closeActionId) {
        dialog.addEventListener('cancel', (e) => {
            e.preventDefault(); // Don't auto-dismiss; the AI owns the next state.
            bus.dispatch(data.closeActionId, data.context || {});
        });
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                bus.dispatch(data.closeActionId, data.context || {});
            }
        });
    }
    return dialog;
});

// ============================================================
// THE SURFACE — where the AI's streamed UI gets mounted
// ============================================================

const surfaceContainer = document.getElementById('ai-surface-container')!;

// The flat dictionary of every component currently on screen,
// keyed by the ids the server assigns (e.g. "comp-1", "comp-2").
let componentStore: Record<string, any> = {};
let rootComponentId: string | null = null;

function drawUI() {
    if (!rootComponentId) return;
    surfaceContainer.innerHTML = '';
    const rootElement = registry.buildNode(rootComponentId, componentStore);
    if (rootElement) surfaceContainer.appendChild(rootElement);
}

// The StreamEngine turns the server's raw character chunks into
// complete JSON objects (repairing hallucinated JSON along the way).
streamEngine = new StreamEngine((data) => {
    if (data.beginRendering) {
        rootComponentId = data.beginRendering.root;
        componentStore = {};
        surfaceContainer.innerHTML = '';
        return;
    }
    if (data.surfaceUpdate) {
        Object.assign(componentStore, data.surfaceUpdate.components);
        drawUI();
        return;
    }
    if (data.streamComplete) {
        eventSource?.close();
        return;
    }
    // Fallback: the server may emit the bare component tree
    // (e.g. { "rootId": "comp-1", "components": {...} })
    if (data.rootId && data.components) {
        rootComponentId = data.rootId;
        componentStore = data.components;
        drawUI();
    }
});

let eventSource: EventSource | null = null;
const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const frontendOnly = import.meta.env.VITE_FRONTEND_ONLY === 'true';

if (!frontendOnly) {
    eventSource = new EventSource(`${backendUrl}/api/ai-stream`);
    eventSource.onmessage = (event) => streamEngine.receiveChunk(event.data);
} else {
    // Frontend-only mode: render a representative A2UI payload without a server.
    streamEngine.receiveChunk(JSON.stringify({
        rootId: 'comp-1',
        components: {
            'comp-1': { Box: { children: ['comp-2', 'comp-3', 'comp-4', 'comp-5'], gap: 'lg', padding: 'lg', backgroundColor: 'surface-default', borderRadius: 'lg' } },
            'comp-2': { Text: { literalString: 'A2Kit frontend is working', as: 'h1', size: '3xl', weight: 'bold', color: 'brand' } },
            'comp-3': { Field: { label: 'Your name', binding: '/user/name', placeholder: 'Type a name' } },
            'comp-4': { Text: { binding: '/user/name', prefix: 'Hello, ', fallback: 'stranger!', color: 'muted' } },
            'comp-5': { Button: { label: 'Test Action Bus', variant: 'primary', actionId: 'test-action' } },
        },
    }));
}
