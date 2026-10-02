import { describe, expect, it, vi } from 'vitest';
import { createStarterDocument } from '../src/domain';
import type { LayoutRepository } from '../src/repository';
import type { LayoutDocument } from '../src/types';
import { ExpoSketchViewModel } from '../src/viewModel';

const fakeRepository = (initial: LayoutDocument | null = null): LayoutRepository => ({
  load: vi.fn(async () => initial ?? createStarterDocument()),
  save: vi.fn(async (_document) => {}),
});

describe('ExpoSketchViewModel', () => {
  it('initializes and updates the selected layout', async () => {
    const repository = fakeRepository();
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    expect(vm.state.phase).toBe('ready');
    const count = vm.state.document.elements.length;
    vm.addElement('booth');
    expect(vm.state.document.elements).toHaveLength(count + 1);
    expect(vm.state.selectedId).toContain('booth-');
  });

  it('updates analysis immediately after moving an element into an overlap', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    vm.moveElement('stage-1', 4.5, 2.5);
    expect(vm.state.analysis.overlaps.length).toBeGreaterThan(0);
  });

  it('recovers the example if repository loading fails', async () => {
    const repository: LayoutRepository = { load: vi.fn(async () => { throw new Error('bad storage'); }), save: vi.fn(async () => {}) };
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    expect(vm.state.phase).toBe('error');
    expect(vm.state.document.title).toContain('春日创意市集');
  });

  it('shows a save error without dropping the working document', async () => {
    const repository: LayoutRepository = { load: vi.fn(async () => createStarterDocument()), save: vi.fn(async () => { throw new Error('quota'); }) };
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.addElement('stage');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vm.state.document.elements.some((element) => element.kind === 'stage' && element.id.startsWith('stage-'))).toBe(true);
    expect(vm.state.notice.tone).toBe('error');
  });

  it('ignores invalid dimensions instead of corrupting the working selection', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    const before = vm.state.document.elements[0].width;
    vm.resizeSelected(0, 0);
    expect(vm.state.document.elements[0].width).toBe(before);
  });

  it('never lets a drag push an element outside the field', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    vm.moveElement('stage-1', -50, 99);
    const element = vm.state.document.elements.find((item) => item.id === 'stage-1');
    expect(element?.x).toBe(0);
    expect(element?.y).toBeLessThanOrEqual(vm.state.document.field.height - element!.height);
    expect(vm.state.analysis.bounds).toHaveLength(0);
  });

  it('recalls a single stray element to the nearest edge', async () => {
    const starter = createStarterDocument();
    const strayed: LayoutDocument = { ...starter, elements: starter.elements.map((item) => item.id === 'booth-2' ? { ...item, x: -6 } : item) };
    const vm = new ExpoSketchViewModel(fakeRepository(strayed));
    await vm.initialize();
    vm.reclaimElement('booth-2');
    const element = vm.state.document.elements.find((item) => item.id === 'booth-2');
    expect(element?.x).toBe(0);
    expect(vm.state.analysis.bounds).toHaveLength(0);
    expect(vm.state.selectedId).toBe('booth-2');
  });

  it('recalls every stray element in one action', async () => {
    const starter = createStarterDocument();
    const strayed: LayoutDocument = { ...starter, field: { width: 28, height: 18 }, elements: starter.elements.map((item, index) =>
      item.kind === 'booth' ? { ...item, x: starter.field.width + 5 + index, y: -4 - index } : item) };
    const vm = new ExpoSketchViewModel(fakeRepository(strayed));
    await vm.initialize();
    expect(vm.state.analysis.bounds.length).toBeGreaterThan(0);
    vm.reclaimAllOutOfBounds();
    expect(vm.state.analysis.bounds).toHaveLength(0);
    expect(vm.state.analysis.overlaps).toHaveLength(0);
  });

  it('pulls an enlarged element back inside the field when resizing', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    vm.selectElement('entry-1');
    vm.moveElement('entry-1', 20, 15); // 入口 2.5×1.5，合法位置
    vm.resizeSelected(20, 12); // 放大后右/下侧越界，应被拉回
    const resized = vm.state.document.elements.find((item) => item.id === 'entry-1')!;
    expect(resized.x).toBe(8);
    expect(resized.y).toBe(6);
    expect(vm.state.analysis.bounds).toHaveLength(0);
  });

  it('keeps a rotated element inside the field', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    // 主舞台（8×4）贴到右下角后旋转，旋转后的包围盒（4×8）必须收回场内。
    vm.moveElement('stage-1', 100, 100);
    const before = vm.state.document.elements.find((item) => item.id === 'stage-1')!;
    vm.selectElement('stage-1');
    vm.rotateSelected();
    const after = vm.state.document.elements.find((item) => item.id === 'stage-1')!;
    expect(vm.state.analysis.bounds).toHaveLength(0);
    expect(after.rotation).toBe(90);
    expect(after.x).toBeLessThanOrEqual(vm.state.document.field.width - before.height);
  });
});
