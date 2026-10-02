import { useRef, useState } from 'react';
import { ELEMENT_SPECS, clamp, clampPositionToField } from '../../domain';
import type { LayoutMode, PathPreview, RenderElement } from '../../types';

interface FieldCanvasProps {
  field: { width: number; height: number };
  elements: RenderElement[];
  selectedId: string | null;
  mode: LayoutMode;
  overlaps: Array<{ firstId: string; secondId: string }>;
  bounds: Array<{ elementId: string }>;
  channels: Array<{ firstId: string; secondId: string }>;
  path: PathPreview | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onReclaim: (ids: string[]) => void;
}

const NEAR_EDGE = 0.8; // 距边界 0.8m 以内给出临边提示

export function FieldCanvas({ field, elements, selectedId, mode, overlaps, bounds, channels, path, onSelect, onMove, onReclaim }: FieldCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [edge, setEdge] = useState<{ left: boolean; right: boolean; top: boolean; bottom: boolean; blocked: boolean }>({ left: false, right: false, top: false, bottom: false, blocked: false });
  const issueIds = new Set(overlaps.flatMap((item) => [item.firstId, item.secondId]));
  const channelIds = new Set(channels.flatMap((item) => [item.firstId, item.secondId]));
  const boundsIds = new Set(bounds.map((item) => item.elementId));
  const canvasWidth = 100 / Math.max(1, field.width / (field.height * 1.35));

  const pointFromEvent = (event: React.PointerEvent) => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: (event.clientX - box.left) * field.width / box.width, y: (event.clientY - box.top) * field.height / box.height };
  };

  const clearEdge = () => setEdge({ left: false, right: false, top: false, bottom: false, blocked: false });

  // 完全拖出场地、画布上一点都抓不到的元素，在最近的边缘显示标记
  const stranded = elements.filter((element) => {
    const box = { right: element.x + element.displayWidth, bottom: element.y + element.displayHeight };
    return box.right <= 0 || box.bottom <= 0 || element.x >= field.width || element.y >= field.height;
  });

  const markerPosition = (element: RenderElement) => {
    const center = { x: element.x + element.displayWidth / 2, y: element.y + element.displayHeight / 2 };
    const point = clampPositionToField(field, 0, 0, clamp(center.x, 1.2, field.width - 1.2), clamp(center.y, 1, field.height - 1));
    return { left: `${point.x / field.width * 100}%`, top: `${point.y / field.height * 100}%` };
  };

  const edgeClass = (name: string, active: boolean, blocked: boolean) => `edge-guard ${name} ${active ? 'is-active' : ''} ${active && blocked ? 'is-blocked' : ''}`;

  return <div className="canvas-wrap">
    <div className="canvas-ruler top-ruler"><span>0 m</span><span>{Math.round(field.width / 2)} m</span><span>{field.width} m</span></div>
    <div className="canvas-ruler side-ruler"><span>0</span><span>{Math.round(field.height / 2)} m</span><span>{field.height} m</span></div>
    <div className={`field-canvas mode-${mode} ${edge.blocked ? 'drag-blocked' : edge.left || edge.right || edge.top || edge.bottom ? 'drag-near-edge' : ''}`} ref={canvasRef} style={{ width: `${Math.min(100, canvasWidth)}%`, aspectRatio: `${field.width} / ${field.height}` }}>
      <div className="grid-overlay" />
      <div className="field-label"><span>EXPO HALL A</span><strong>{field.width} × {field.height} m</strong></div>
      <span className={edgeClass('edge-left', edge.left, edge.blocked)} />
      <span className={edgeClass('edge-right', edge.right, edge.blocked)} />
      <span className={edgeClass('edge-top', edge.top, edge.blocked)} />
      <span className={edgeClass('edge-bottom', edge.bottom, edge.blocked)} />
      {drag && (edge.blocked || edge.left || edge.right || edge.top || edge.bottom) ? <div className={`drag-edge-hint ${edge.blocked ? 'is-blocked' : ''}`}>{edge.blocked ? '已到场地边界，元素不能再向外移动' : '靠近边界，继续拖动将被边界阻挡'}</div> : null}
      {path && mode === 'path' ? <svg className="path-layer" viewBox={`0 0 ${field.width} ${field.height}`} preserveAspectRatio="none"><polyline points={path.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#ef795f" strokeWidth="0.3" strokeDasharray="0.75 0.55" /><circle cx={path.points[0].x} cy={path.points[0].y} r="0.45" fill="#ef795f" /><circle cx={path.points[path.points.length - 1].x} cy={path.points[path.points.length - 1].y} r="0.45" fill="#ef795f" /></svg> : null}
      {elements.map((element) => {
        const spec = ELEMENT_SPECS[element.kind];
        const classes = ['canvas-element', selectedId === element.id ? 'is-selected' : '', issueIds.has(element.id) && mode !== 'edit' ? 'is-overlap' : '', channelIds.has(element.id) && mode !== 'edit' ? 'is-channel' : '', boundsIds.has(element.id) ? 'is-out' : '', drag?.id === element.id && (edge.blocked || edge.left || edge.right || edge.top || edge.bottom) ? 'drag-edge-pressed' : ''].filter(Boolean).join(' ');
        return <button key={element.id} type="button" className={classes} style={{ left: `${element.x / field.width * 100}%`, top: `${element.y / field.height * 100}%`, width: `${element.displayWidth / field.width * 100}%`, height: `${element.displayHeight / field.height * 100}%`, background: spec.color, transform: `rotate(${element.rotation}deg)` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const point = pointFromEvent(event); setDrag({ id: element.id, dx: point.x - element.x, dy: point.y - element.y }); onSelect(element.id); }} onPointerMove={(event) => { if (!drag || drag.id !== element.id) return; const point = pointFromEvent(event); const desired = { x: point.x - drag.dx, y: point.y - drag.dy }; const next = clampPositionToField(field, element.displayWidth, element.displayHeight, desired.x, desired.y); onMove(element.id, next.x, next.y);
          const blocked = Math.abs(next.x - desired.x) > 0.05 || Math.abs(next.y - desired.y) > 0.05;
          const left = next.x <= NEAR_EDGE;
          const right = field.width - (next.x + element.displayWidth) <= NEAR_EDGE;
          const top = next.y <= NEAR_EDGE;
          const bottom = field.height - (next.y + element.displayHeight) <= NEAR_EDGE;
          setEdge(blocked ? { left: left || desired.x < 0, right: right || desired.x + element.displayWidth > field.width, top: top || desired.y < 0, bottom: bottom || desired.y + element.displayHeight > field.height, blocked: true } : { left, right, top, bottom, blocked: false });
        }} onPointerUp={() => { setDrag(null); clearEdge(); }} onPointerCancel={() => { setDrag(null); clearEdge(); }}>
          <span className="element-icon">{spec.icon}</span><span className="element-name">{element.name}</span><small>{element.displayWidth.toFixed(1)} × {element.displayHeight.toFixed(1)} m</small>
          {issueIds.has(element.id) && mode !== 'edit' ? <span className="issue-dot">!</span> : null}
        </button>;
      })}
      {stranded.map((element) => {
        const spec = ELEMENT_SPECS[element.kind];
        return <div key={`marker-${element.id}`} className={`stranded-marker ${selectedId === element.id ? 'is-selected' : ''}`} style={markerPosition(element)} role="group" aria-label={`越界元素 ${element.name}`}>
          <button type="button" className="stranded-body" onClick={() => onSelect(element.id)} title={`${element.name} 已越界，点击选中`}><span className="stranded-icon">{spec.icon}</span><span className="stranded-name">{element.name}</span><span className="stranded-tag">越界</span></button>
          <button type="button" className="stranded-recall" aria-label={`收回 ${element.name}`} title="收回场地" onClick={() => onReclaim([element.id])}>⤓</button>
        </div>;
      })}
      <div className="axis-hint">拖动元素 · 元素始终保持在场地内</div>
    </div>
    <div className="canvas-legend"><span><i className="legend-dot green" />可通行</span><span><i className="legend-dot coral" />需关注</span><span><i className="legend-line" />访问路径</span></div>
  </div>;
}
