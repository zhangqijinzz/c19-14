import { useRef, useState } from 'react';
import { ELEMENT_SPECS, getBoundingBox } from '../../domain';
import type { BoundsIssue, LayoutMode, PathPreview, RenderElement } from '../../types';

type OverflowSide = 'left' | 'right' | 'top' | 'bottom';
type EdgeFeedback = Partial<Record<OverflowSide, 'near' | 'blocked'>>;

interface FieldCanvasProps {
  field: { width: number; height: number };
  elements: RenderElement[];
  selectedId: string | null;
  mode: LayoutMode;
  overlaps: Array<{ firstId: string; secondId: string }>;
  bounds: BoundsIssue[];
  channels: Array<{ firstId: string; secondId: string }>;
  path: PathPreview | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onReclaimAll: () => void;
}

interface DragState {
  id: string;
  dx: number;
  dy: number;
  // 从越界重入标记上起拖时，首次移动先把元素贴回场内对应边缘。
  reentry: boolean;
}

const NEAR_EDGE = 0.8; // 距边界 0.8 m 内给出“接近边界”反馈

const overflowSides = (element: RenderElement, field: { width: number; height: number }): OverflowSide[] => {
  const box = getBoundingBox(element);
  const sides: OverflowSide[] = [];
  if (box.left < 0) sides.push('left');
  if (box.right > field.width) sides.push('right');
  if (box.top < 0) sides.push('top');
  if (box.bottom > field.height) sides.push('bottom');
  return sides;
};

export function FieldCanvas({ field, elements, selectedId, mode, overlaps, bounds, channels, path, onSelect, onMove, onReclaimAll }: FieldCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [edgeFeedback, setEdgeFeedback] = useState<EdgeFeedback>({});
  const issueIds = new Set(overlaps.flatMap((item) => [item.firstId, item.secondId]));
  const channelIds = new Set(channels.flatMap((item) => [item.firstId, item.secondId]));
  const boundsIds = new Set(bounds.map((item) => item.elementId));
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  const canvasWidth = 100 / Math.max(1, field.width / (field.height * 1.35));

  const pointFromEvent = (event: React.PointerEvent) => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: (event.clientX - box.left) * field.width / box.width, y: (event.clientY - box.top) * field.height / box.height };
  };

  // 拖动监听挂在场地上（指针捕获到场地区域），保证从越界重入标记起拖时也能持续接收事件。
  const updateDrag = (event: React.PointerEvent) => {
    if (!drag) return;
    const element = elementsById.get(drag.id);
    if (!element) return;
    const point = pointFromEvent(event);
    const box = getBoundingBox(element);
    let nextX = point.x - drag.dx;
    let nextY = point.y - drag.dy;
    if (drag.reentry) {
      // 越界元素首次移动：贴回距指针最近的场内边缘，再跟随光标。
      nextX = Math.min(Math.max(0, nextX), Math.max(0, field.width - box.width));
      nextY = Math.min(Math.max(0, nextY), Math.max(0, field.height - box.height));
      setDrag({ ...drag, reentry: false });
    }
    const clampedX = Math.min(Math.max(0, nextX), Math.max(0, field.width - box.width));
    const clampedY = Math.min(Math.max(0, nextY), Math.max(0, field.height - box.height));
    const feedback: EdgeFeedback = {};
    // 接近边界：琥珀色提示；继续往外推被挡住：珊瑚色脉冲。
    if (clampedX <= NEAR_EDGE) feedback.left = nextX < clampedX ? 'blocked' : 'near';
    if (clampedX >= field.width - box.width - NEAR_EDGE) feedback.right = nextX > clampedX ? 'blocked' : 'near';
    if (clampedY <= NEAR_EDGE) feedback.top = nextY < clampedY ? 'blocked' : 'near';
    if (clampedY >= field.height - box.height - NEAR_EDGE) feedback.bottom = nextY > clampedY ? 'blocked' : 'near';
    setEdgeFeedback(feedback);
    onMove(element.id, clampedX, clampedY);
  };

  const startElementDrag = (event: React.PointerEvent, element: RenderElement) => {
    event.preventDefault();
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    const point = pointFromEvent(event);
    setDrag({ id: element.id, dx: point.x - element.x, dy: point.y - element.y, reentry: false });
    onSelect(element.id);
  };

  // 从越侧重入标记起拖：先以“贴边后的合法位置”为锚点，避免起拖瞬间元素跳动。
  const startReentryDrag = (event: React.PointerEvent, element: RenderElement) => {
    event.preventDefault();
    event.stopPropagation();
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    const box = getBoundingBox(element);
    const anchorX = Math.min(Math.max(0, box.left), Math.max(0, field.width - box.width));
    const anchorY = Math.min(Math.max(0, box.top), Math.max(0, field.height - box.height));
    onMove(element.id, anchorX, anchorY);
    const point = pointFromEvent(event);
    setDrag({ id: element.id, dx: point.x - anchorX, dy: point.y - anchorY, reentry: true });
    onSelect(element.id);
  };

  // 越界元素按越界侧分组，在场地内一侧渲染可抓的重入标记。
  const markerBuckets: Record<OverflowSide, RenderElement[]> = { left: [], right: [], top: [], bottom: [] };
  bounds.forEach((issue) => {
    const element = elementsById.get(issue.elementId);
    if (!element) return;
    overflowSides(element, field).forEach((side) => markerBuckets[side].push(element));
  });

  const markerStyle = (side: OverflowSide, index: number): React.CSSProperties => {
    const step = 26;
    if (side === 'left') return { left: 3, top: 8 + index * step };
    if (side === 'right') return { right: 3, bottom: 8 + index * step };
    if (side === 'top') return { top: 3, left: 12 + index * 100 };
    return { bottom: 3, right: 12 + index * 100 };
  };

  const edgeZoneClass = (side: OverflowSide) => {
    const state = edgeFeedback[side];
    return ['edge-zone', `edge-${side}`, state === 'blocked' ? 'is-blocked' : '', state === 'near' ? 'is-near' : ''].filter(Boolean).join(' ');
  };

  return <div className="canvas-wrap">
    <div className="canvas-ruler top-ruler"><span>0 m</span><span>{Math.round(field.width / 2)} m</span><span>{field.width} m</span></div>
    <div className="canvas-ruler side-ruler"><span>0</span><span>{Math.round(field.height / 2)} m</span><span>{field.height} m</span></div>
    <div className={`field-canvas mode-${mode}`} ref={canvasRef} style={{ width: `${Math.min(100, canvasWidth)}%`, aspectRatio: `${field.width} / ${field.height}` }} onPointerMove={updateDrag} onPointerUp={() => { setDrag(null); setEdgeFeedback({}); }} onPointerCancel={() => { setDrag(null); setEdgeFeedback({}); }}>
      <div className="grid-overlay" />
      <span className={edgeZoneClass('left')} />
      <span className={edgeZoneClass('right')} />
      <span className={edgeZoneClass('top')} />
      <span className={edgeZoneClass('bottom')} />
      <div className="field-label"><span>EXPO HALL A</span><strong>{field.width} × {field.height} m</strong></div>
      {path && mode === 'path' ? <svg className="path-layer" viewBox={`0 0 ${field.width} ${field.height}`} preserveAspectRatio="none"><polyline points={path.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#ef795f" strokeWidth="0.3" strokeDasharray="0.75 0.55" /><circle cx={path.points[0].x} cy={path.points[0].y} r="0.45" fill="#ef795f" /><circle cx={path.points[path.points.length - 1].x} cy={path.points[path.points.length - 1].y} r="0.45" fill="#ef795f" /></svg> : null}
      {elements.map((element) => {
        const spec = ELEMENT_SPECS[element.kind];
        const classes = ['canvas-element', selectedId === element.id ? 'is-selected' : '', issueIds.has(element.id) && mode !== 'edit' ? 'is-overlap' : '', channelIds.has(element.id) && mode !== 'edit' ? 'is-channel' : '', boundsIds.has(element.id) ? 'is-out' : ''].filter(Boolean).join(' ');
        return <button key={element.id} type="button" tabIndex={boundsIds.has(element.id) ? -1 : 0} className={classes} style={{ left: `${element.x / field.width * 100}%`, top: `${element.y / field.height * 100}%`, width: `${element.displayWidth / field.width * 100}%`, height: `${element.displayHeight / field.height * 100}%`, background: spec.color, transform: `rotate(${element.rotation}deg)` }} onPointerDown={(event) => startElementDrag(event, element)}>
          <span className="element-icon">{spec.icon}</span><span className="element-name">{element.name}</span><small>{element.displayWidth.toFixed(1)} × {element.displayHeight.toFixed(1)} m</small>
          {issueIds.has(element.id) && mode !== 'edit' ? <span className="issue-dot">!</span> : null}
        </button>;
      })}
      {(Object.keys(markerBuckets) as OverflowSide[]).map((side) => markerBuckets[side].map((element, index) => (
        <button key={`${side}-${element.id}`} type="button" className={['reentry-marker', selectedId === element.id ? 'is-selected' : ''].join(' ')} style={markerStyle(side, index)} title={`${element.name} 已越界，点击选中或直接拖回场地`} onPointerDown={(event) => startReentryDrag(event, element)}>
          <span className="reentry-arrow">⤺</span><span className="reentry-name">{ELEMENT_SPECS[element.kind].icon} {element.name}</span>
        </button>
      )))}
      <div className="axis-hint">拖动元素 · 自动保持在场地内</div>
      {bounds.length ? <div className="bounds-recovery-bar">
        <span className="recovery-warning">⚠ {bounds.length} 个元素越界</span>
        <span className="recovery-names">{bounds.map((issue) => {
          const element = elementsById.get(issue.elementId);
          return element ? <button key={issue.elementId} type="button" className="recovery-chip" onClick={() => onSelect(issue.elementId)} title="选中该越界元素">{element.name}</button> : null;
        })}</span>
        <button type="button" className="recovery-action" onClick={onReclaimAll}>一键收回场地</button>
      </div> : null}
    </div>
    <div className="canvas-legend"><span><i className="legend-dot green" />可通行</span><span><i className="legend-dot coral" />需关注</span><span><i className="legend-line" />访问路径</span></div>
  </div>;
}
