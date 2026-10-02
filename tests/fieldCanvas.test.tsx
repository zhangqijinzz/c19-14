import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { FieldCanvas } from '../src/features/layout-editor/FieldCanvas';
import { getBoundingBox } from '../src/domain';
import type { LayoutMode, RenderElement } from '../src/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const field = { width: 28, height: 18 };

const renderElement = (id: string, x: number, y: number, kind: RenderElement['kind'] = 'booth'): RenderElement => {
  const base = { id, kind, name: id, x, y, width: 5, height: 3.5, rotation: 0 } as RenderElement;
  const box = getBoundingBox(base);
  return { ...base, displayWidth: box.width, displayHeight: box.height, occupiedArea: box.width * box.height };
};

const renderCanvas = async (props: Partial<Parameters<typeof FieldCanvas>[0]> = {}) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onReclaimAll = vi.fn();
  const onSelect = vi.fn();
  await act(async () => {
    root.render(<FieldCanvas field={field} elements={[renderElement('in-field', 4, 4), renderElement('stray', -8, 2)]} selectedId={null} mode={'edit' as LayoutMode} overlaps={[]} bounds={[{ elementId: 'stray', overflow: 8 }]} channels={[]} path={null} onSelect={onSelect} onMove={vi.fn()} onReclaimAll={onReclaimAll} {...props} />);
  });
  return { container, onReclaimAll, onSelect, root };
};

describe('FieldCanvas boundary UX', () => {
  it('shows a reentry marker, recovery chips and the one-click recall action for stray elements', async () => {
    const { container } = await renderCanvas();
    expect(container.querySelector('.bounds-recovery-bar')).not.toBeNull();
    expect(container.querySelectorAll('.reentry-marker').length).toBeGreaterThan(0);
    expect(container.querySelector('.recovery-chip')?.textContent).toContain('stray');
    expect(container.querySelector('.recovery-action')?.textContent).toContain('一键收回');
  });

  it('invokes bulk recall and per-element selection from the recovery bar', async () => {
    const { container, onReclaimAll, onSelect } = await renderCanvas();
    await act(async () => { (container.querySelector('.recovery-action') as HTMLButtonElement).click(); });
    expect(onReclaimAll).toHaveBeenCalledTimes(1);
    await act(async () => { (container.querySelector('.recovery-chip') as HTMLButtonElement).click(); });
    expect(onSelect).toHaveBeenCalledWith('stray');
  });

  it('hides the recovery UI when everything stays inside the field', async () => {
    const { container } = await renderCanvas({ bounds: [], elements: [renderElement('only', 4, 4)] });
    expect(container.querySelector('.bounds-recovery-bar')).toBeNull();
    expect(container.querySelector('.reentry-marker')).toBeNull();
  });
});
