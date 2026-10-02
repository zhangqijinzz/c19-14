import type { RenderElement } from '../../types';

interface InspectorPanelProps {
  selectedElement: RenderElement | null;
  isOutOfBounds: boolean;
  onRename: (name: string) => void;
  onResize: (width: number, height: number) => void;
  onRotate: () => void;
  onDelete: () => void;
  onReclaim: () => void;
}

export function InspectorPanel({ selectedElement, isOutOfBounds, onRename, onResize, onRotate, onDelete, onReclaim }: InspectorPanelProps) {
  return <section className="panel inspector-panel">
    <div className="panel-heading"><div><span className="section-kicker">SELECTION</span><h2>属性面板</h2></div><span className="selection-indicator" /></div>
    {selectedElement ? <SelectedFields element={selectedElement} isOutOfBounds={isOutOfBounds} onRename={onRename} onResize={onResize} onRotate={onRotate} onDelete={onDelete} onReclaim={onReclaim} /> : <div className="empty-inspector"><span>⌁</span><p>点击场地中的元素<br />开始调整布局</p></div>}
  </section>;
}

interface SelectedFieldsProps { element: RenderElement; isOutOfBounds: boolean; onRename: (name: string) => void; onResize: (width: number, height: number) => void; onRotate: () => void; onDelete: () => void; onReclaim: () => void; }

function SelectedFields({ element, isOutOfBounds, onRename, onResize, onRotate, onDelete, onReclaim }: SelectedFieldsProps) {
  return <div className="selected-fields">
    <div className="selected-kind"><span className="selected-symbol">{element.kind === 'stage' ? '✦' : element.kind === 'entrance' ? '↗' : element.kind === 'seating' ? '▤' : '▦'}</span><div><strong>{element.kind.toUpperCase()}</strong><small>ID · {element.id.slice(0, 12)}</small></div></div>
    {isOutOfBounds ? <div className="out-warning"><span>⚠</span><div><strong>该元素已越出场地</strong><p>画布上无法直接拖动它</p></div><button type="button" className="reclaim-one-button" onClick={onReclaim}>收回场地</button></div> : null}
    <label className="field-label-input">名称<input aria-label="元素名称" value={element.name} onChange={(event) => onRename(event.target.value)} /></label>
    <div className="dimension-grid"><label>宽度<input aria-label="元素宽度" type="number" min="1" step="0.5" value={element.width} onChange={(event) => onResize(Number(event.target.value), element.height)} /></label><label>深度<input aria-label="元素深度" type="number" min="1" step="0.5" value={element.height} onChange={(event) => onResize(element.width, Number(event.target.value))} /></label></div>
    <div className="transform-readout"><span>位置 <strong>{element.x.toFixed(1)}, {element.y.toFixed(1)}</strong></span><span>旋转 <strong>{element.rotation}°</strong></span><span>占地 <strong>{element.occupiedArea.toFixed(1)} m²</strong></span></div>
    <div className="inspector-actions"><button type="button" className="secondary-button" onClick={onRotate}>↻ 旋转 90°</button><button type="button" className="icon-button danger" aria-label="删除元素" onClick={onDelete}>⌫</button></div>
  </div>;
}
