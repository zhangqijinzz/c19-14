import { clampElementToField, clampPositionToField, createElement, createStarterDocument, analyzeLayout, findBoundsIssues, findElement, getBoundingBox, normalizeRotation, recallOutOfBounds } from './domain';
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
      // 硬约束：拖动过程中元素始终留在场地内，避免被画布边缘裁切后无法抓回。
      const box = getBoundingBox(element);
      const position = clampPositionToField(x, y, box.width, box.height, field);
      return { ...element, x: position.x, y: position.y };
    });
    this.commitAndPersist({ document: { ...this.stateValue.document, elements } });
  }

  resizeSelected(width: number, height: number) {
    const id = this.stateValue.selectedId;
    if (!id || !(width > 0) || !(height > 0)) return;
    const field = this.stateValue.document.field;
    const elements = this.stateValue.document.elements.map((element) => {
      if (element.id !== id) return element;
      // 尺寸变化后把左上角拉回场内，防止新尺寸把元素顶出边界。
      const resized = { ...element, width: Number(width.toFixed(1)), height: Number(height.toFixed(1)) };
      return clampElementToField(resized, field);
    });
    this.commitAndPersist({ document: { ...this.stateValue.document, elements } });
  }

  rotateSelected() {
    const id = this.stateValue.selectedId;
    if (!id) return;
    const field = this.stateValue.document.field;
    const elements = this.stateValue.document.elements.map((element) => {
      if (element.id !== id) return element;
      // 绕中心旋转，旋转后若包围盒越界则整体收回。
      const before = getBoundingBox(element);
      const center = { x: before.left + before.width / 2, y: before.top + before.height / 2 };
      const rotated = { ...element, rotation: normalizeRotation(element.rotation + 90) };
      const after = getBoundingBox(rotated);
      return clampElementToField({ ...rotated, x: center.x - after.width / 2, y: center.y - after.height / 2 }, field);
    });
    this.commitAndPersist({ document: { ...this.stateValue.document, elements }, notice: { tone: 'info', message: '方向已旋转 90°' } });
  }

  // 单个越界元素就近收回（只钳越界方向，保留原位置意图）。
  reclaimElement(id: string) {
    const field = this.stateValue.document.field;
    const target = findElement(this.stateValue.document, id);
    if (!target || findBoundsIssues(field, [target]).length === 0) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? clampElementToField(element, field) : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements }, selectedId: id, notice: { tone: 'success', message: `${target.name} 已收回场地内` } });
  }

  // 一键收回全部越界元素，自动避开场内已有元素。
  reclaimAllOutOfBounds() {
    const field = this.stateValue.document.field;
    const count = findBoundsIssues(field, this.stateValue.document.elements).length;
    if (count === 0) return;
    const elements = recallOutOfBounds(field, this.stateValue.document.elements);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements }, notice: { tone: 'success', message: `已将 ${count} 个越界元素收回场地` } });
  }

  renameSelected(name: string) {
    const id = this.stateValue.selectedId;
    if (!id || !name.trim()) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, name: name.trim() } : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements } });
  }

  resizeField(width: number, height: number) {
    if (width < 12 || height < 10) return;
    this.commitAndPersist({ document: { ...this.stateValue.document, field: { width: Number(width.toFixed(1)), height: Number(height.toFixed(1)) } }, notice: { tone: 'success', message: '场地尺寸已更新' } });
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
