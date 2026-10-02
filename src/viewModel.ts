import { createElement, createStarterDocument, analyzeLayout, clampElementToField, findBoundsIssues, findElement, getBoundingBox, normalizeRotation, reclaimOutOfBounds } from './domain';
import type { LayoutRepository } from './repository';
import type { Analysis, ElementKind, LayoutDocument, LayoutMode, Notice, RenderElement, ViewPhase } from './types';

export interface ExpoSketchState {
  phase: ViewPhase;
  document: LayoutDocument;
  renderElements: RenderElement[];
  selectedId: string | null;
  selectedElement: RenderElement | null;
  mode: LayoutMode;
  analysis: Analysis;
  notice: Notice;
  lastSavedAt: number | null;
}

const toRenderElements = (document: LayoutDocument): RenderElement[] => document.elements.map((element) => {
  const box = getBoundingBox(element);
  return { ...element, displayWidth: box.width, displayHeight: box.height, occupiedArea: Number((box.width * box.height).toFixed(1)) };
});

const starter = createStarterDocument();
const starterRenderElements = toRenderElements(starter);

type Listener = () => void;

export class ExpoSketchViewModel {
  private listeners = new Set<Listener>();
  private stateValue: ExpoSketchState = {
    phase: 'loading',
    document: starter,
    renderElements: starterRenderElements,
    selectedId: 'stage-1',
    selectedElement: starterRenderElements.find((element) => element.id === 'stage-1') ?? null,
    mode: 'edit',
    analysis: analyzeLayout(createStarterDocument()),
    notice: { tone: 'info', message: '正在恢复最近布局…' },
    lastSavedAt: null,
  };

  constructor(private readonly repository: LayoutRepository) {}

  get state() { return this.stateValue; }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async initialize() {
    try {
      const document = await this.repository.load();
      this.commit({ document, selectedId: document.elements[0]?.id ?? null, phase: 'ready', notice: { tone: 'success', message: '布局已就绪，可开始编辑' } });
    } catch {
      this.commit({ phase: 'error', notice: { tone: 'error', message: '布局读取失败，已载入安全示例' } });
    }
  }

  selectElement(id: string) { this.commit({ selectedId: id }); }

  setMode(mode: LayoutMode) { this.commit({ mode, notice: { tone: 'info', message: mode === 'inspect' ? '检查模式已开启：拖动元素查看即时提示' : mode === 'path' ? '路径模式已开启：入口到重点区域的访问路线已生成' : '编辑模式已开启' } }); }

  addElement(kind: ElementKind) {
    const element = createElement(kind, this.stateValue.document.elements.length, this.stateValue.document.field);
    const document = { ...this.stateValue.document, elements: [...this.stateValue.document.elements, element] };
    this.commitAndPersist({ document, selectedId: element.id, notice: { tone: 'success', message: `${element.name} 已加入场地` } });
  }

  removeSelected() {
    if (!this.stateValue.selectedId) return;
    const removed = findElement(this.stateValue.document, this.stateValue.selectedId);
    const elements = this.stateValue.document.elements.filter((element) => element.id !== this.stateValue.selectedId);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements }, selectedId: elements[0]?.id ?? null, notice: { tone: 'info', message: `${removed?.name ?? '元素'} 已移除` } });
  }

  moveElement(id: string, x: number, y: number) {
    const field = this.stateValue.document.field;
    const elements = this.stateValue.document.elements.map((element) => {
      if (element.id !== id) return element;
      const box = getBoundingBox(element);
      const maxX = box.width >= field.width ? 0 : Math.max(0, field.width - box.width);
      const maxY = box.height >= field.height ? 0 : Math.max(0, field.height - box.height);
      return { ...element, x: Number(Math.min(Math.max(x, 0), maxX).toFixed(1)), y: Number(Math.min(Math.max(y, 0), maxY).toFixed(1)) };
    });
    this.commitAndPersist({ document: { ...this.stateValue.document, elements } });
  }

  // 收回越界元素；ids 为空时收回全部。元素收回后仍保持选中，便于继续调整
  reclaimElements(ids?: string[]) {
    const { field, elements } = this.stateValue.document;
    const targetIds = ids ?? findBoundsIssues(field, elements).map((issue) => issue.elementId);
    if (targetIds.length === 0) return;
    const next = reclaimOutOfBounds(elements, field, targetIds);
    const selectedId = targetIds.includes(this.stateValue.selectedId ?? '') ? this.stateValue.selectedId : targetIds[0];
    const message = targetIds.length === 1 ? '元素已收回场地' : `已将 ${targetIds.length} 个越界元素收回场地`;
    this.commitAndPersist({ document: { ...this.stateValue.document, elements: next }, selectedId, notice: { tone: 'success', message } });
  }

  resizeSelected(width: number, height: number) {
    const id = this.stateValue.selectedId;
    if (!id || width <= 0 || height <= 0) return;
    const field = this.stateValue.document.field;
    const elements = this.stateValue.document.elements.map((element) => element.id === id
      ? clampElementToField({ ...element, width: Number(width.toFixed(1)), height: Number(height.toFixed(1)) }, field)
      : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements } });
  }

  rotateSelected() {
    const id = this.stateValue.selectedId;
    if (!id) return;
    const field = this.stateValue.document.field;
    const elements = this.stateValue.document.elements.map((element) => element.id === id
      ? clampElementToField({ ...element, rotation: normalizeRotation(element.rotation + 90) }, field)
      : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements }, notice: { tone: 'info', message: '方向已旋转 90°' } });
  }

  renameSelected(name: string) {
    const id = this.stateValue.selectedId;
    if (!id || !name.trim()) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, name: name.trim() } : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements } });
  }

  resizeField(width: number, height: number) {
    if (width < 12 || height < 10) return;
    const field = { width: Number(width.toFixed(1)), height: Number(height.toFixed(1)) };
    // 场地缩小时把元素一并夹回新边界，避免新产生的越界
    const elements = this.stateValue.document.elements.map((element) => clampElementToField(element, field));
    this.commitAndPersist({ document: { ...this.stateValue.document, field, elements }, notice: { tone: 'success', message: '场地尺寸已更新' } });
  }

  renameProject(title: string) {
    if (!title.trim()) return;
    this.commitAndPersist({ document: { ...this.stateValue.document, title: title.trim() } });
  }

  resetExample() {
    const document = createStarterDocument();
    this.commitAndPersist({ document, selectedId: 'stage-1', mode: 'edit', notice: { tone: 'success', message: '已恢复示例布局' } });
  }

  private commitAndPersist(patch: Partial<ExpoSketchState>) {
    this.commit(patch);
    void this.persist();
  }

  private async persist() {
    try {
      await this.repository.save(this.stateValue.document);
      this.commit({ lastSavedAt: Date.now() });
    } catch {
      this.commit({ notice: { tone: 'error', message: '本地保存失败，当前编辑仍保留在页面中' } });
    }
  }

  private commit(patch: Partial<ExpoSketchState>) {
    const next = { ...this.stateValue, ...patch };
    const renderElements = toRenderElements(next.document);
    this.stateValue = { ...next, renderElements, selectedElement: renderElements.find((element) => element.id === next.selectedId) ?? null, analysis: analyzeLayout(next.document) };
    this.listeners.forEach((listener) => listener());
  }
}
