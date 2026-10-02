import type {
  Analysis,
  BoundsIssue,
  ChannelIssue,
  ElementKind,
  ElementSpec,
  ExpoElement,
  FieldSize,
  LayoutDocument,
  PathPreview,
  OverlapIssue,
} from './types';

export const MIN_CHANNEL = 1.2;

export const ELEMENT_SPECS: Record<ElementKind, ElementSpec> = {
  booth: { kind: 'booth', label: '标准展位', eyebrow: 'BOOTH', icon: '▦', color: '#e7f0ff', width: 5, height: 3.5 },
  stage: { kind: 'stage', label: '主舞台', eyebrow: 'STAGE', icon: '✦', color: '#f2e9ff', width: 8, height: 4 },
  seating: { kind: 'seating', label: '观众座席', eyebrow: 'SEATING', icon: '▤', color: '#e6f7f2', width: 6, height: 3 },
  entrance: { kind: 'entrance', label: '入口', eyebrow: 'ENTRY', icon: '↗', color: '#fff2d8', width: 2.5, height: 1.5 },
};

export const createStarterDocument = (): LayoutDocument => ({
  version: 1,
  title: '春日创意市集 · A 区',
  field: { width: 28, height: 18 },
  elements: [
    { id: 'entry-1', kind: 'entrance', name: '主入口', x: 1, y: 8.25, width: 2.5, height: 1.5, rotation: 0 },
    { id: 'stage-1', kind: 'stage', name: '分享舞台', x: 10, y: 1.5, width: 8, height: 4, rotation: 0 },
    { id: 'booth-1', kind: 'booth', name: '香氛展位', x: 4, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'booth-2', kind: 'booth', name: '手作展位', x: 19, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'seating-1', kind: 'seating', name: '休息座席', x: 10, y: 11, width: 6, height: 3, rotation: 0 },
  ],
});

export const createElement = (kind: ElementKind, index: number, field: FieldSize): ExpoElement => {
  const spec = ELEMENT_SPECS[kind];
  const offset = Math.min(index * 0.65, 4);
  return {
    id: `${kind}-${Date.now()}-${index}`,
    kind,
    name: `${spec.label} ${index + 1}`,
    x: Math.max(0.5, Math.min(field.width - spec.width - 0.5, (field.width - spec.width) / 2 + offset)),
    y: Math.max(0.5, Math.min(field.height - spec.height - 0.5, (field.height - spec.height) / 2 + offset)),
    width: spec.width,
    height: spec.height,
    rotation: 0,
  };
};

export const normalizeRotation = (rotation: number): number => ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;

export const getBoundingBox = (element: ExpoElement) => {
  const isQuarterTurn = normalizeRotation(element.rotation) % 180 !== 0;
  const width = isQuarterTurn ? element.height : element.width;
  const height = isQuarterTurn ? element.width : element.height;
  return { left: element.x, top: element.y, right: element.x + width, bottom: element.y + height, width, height };
};

const intersectionSize = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

export const findOverlaps = (elements: ExpoElement[]): OverlapIssue[] => {
  const issues: OverlapIssue[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const first = getBoundingBox(elements[i]);
    for (let j = i + 1; j < elements.length; j += 1) {
      const second = getBoundingBox(elements[j]);
      const overlapX = intersectionSize(first.left, first.right, second.left, second.right);
      const overlapY = intersectionSize(first.top, first.bottom, second.top, second.bottom);
      if (overlapX > 0 && overlapY > 0) {
        issues.push({ firstId: elements[i].id, secondId: elements[j].id, amount: Number((overlapX * overlapY).toFixed(1)) });
      }
    }
  }
  return issues;
};

export const findBoundsIssues = (field: FieldSize, elements: ExpoElement[]): BoundsIssue[] =>
  elements.flatMap((element) => {
    const box = getBoundingBox(element);
    const overflow = Math.max(0, -box.left, -box.top, box.right - field.width, box.bottom - field.height);
    return overflow > 0 ? [{ elementId: element.id, overflow: Number(overflow.toFixed(1)) }] : [];
  });

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const round1 = (value: number) => Number(value.toFixed(1));
// 向下取整到 0.1m，保证四舍五入后元素边缘不会越过场地
const floor1 = (value: number) => Math.floor(value * 10) / 10;

export const isWithinField = (element: ExpoElement, field: FieldSize): boolean =>
  findBoundsIssues(field, [element]).length === 0;

// 元素在画布上完全看不到（与场地没有任何交集），只能通过边缘标记操作
export const isFullyOutsideField = (element: ExpoElement, field: FieldSize): boolean => {
  const box = getBoundingBox(element);
  return box.right <= 0 || box.bottom <= 0 || box.left >= field.width || box.top >= field.height;
};

// 把给定宽高（旋转后的包围盒尺寸）的坐标夹取在场地内；元素比场地大时贴左上角
export const clampPositionToField = (field: FieldSize, width: number, height: number, x: number, y: number) => ({
  x: width >= field.width ? 0 : clamp(x, 0, field.width - width),
  y: height >= field.height ? 0 : clamp(y, 0, field.height - height),
});

// 移动/缩放/旋转后保证元素仍完整落在场地内
export const clampElementToField = (element: ExpoElement, field: FieldSize): ExpoElement => {
  const box = getBoundingBox(element);
  const maxX = box.width >= field.width ? 0 : floor1(field.width - box.width);
  const maxY = box.height >= field.height ? 0 : floor1(field.height - box.height);
  return { ...element, x: Math.min(Math.max(round1(element.x), 0), maxX), y: Math.min(Math.max(round1(element.y), 0), maxY) };
};

const boxesOverlap = (element: ExpoElement, others: ExpoElement[]): boolean => {
  const box = getBoundingBox(element);
  return others.some((other) => {
    const target = getBoundingBox(other);
    return intersectionSize(box.left, box.right, target.left, target.right) > 0 && intersectionSize(box.top, box.bottom, target.top, target.bottom) > 0;
  });
};

// 在场地内按 0.5m 网格寻找第一个不与 occupied 重叠的空位
const findFreeSlot = (field: FieldSize, width: number, height: number, occupied: ExpoElement[]): { x: number; y: number } | null => {
  if (width > field.width || height > field.height) return null;
  for (let y = 0; y + height <= field.height + 1e-9; y += 0.5) {
    for (let x = 0; x + width <= field.width + 1e-9; x += 0.5) {
      const candidate = { x: round1(x), y: round1(y) };
      const probe = { id: '__slot__', kind: 'booth' as const, name: '', width, height, rotation: 0, ...candidate };
      if (!boxesOverlap(probe, occupied)) return candidate;
    }
  }
  return null;
};

// 把越界元素收回场地：先贴回最近的边界位置；若与场内元素重叠则停入最近的可用空位。
// ids 为空时收回全部越界元素。
export const reclaimOutOfBounds = (elements: ExpoElement[], field: FieldSize, ids?: string[]): ExpoElement[] => {
  const targets = new Set(ids ?? findBoundsIssues(field, elements).map((issue) => issue.elementId));
  if (targets.size === 0) return elements;
  const parked: ExpoElement[] = [];
  return elements.map((element) => {
    if (!targets.has(element.id)) return element;
    let candidate = clampElementToField(element, field);
    const occupied = [...elements.filter((other) => !targets.has(other.id)), ...parked];
    if (boxesOverlap(candidate, occupied)) {
      const box = getBoundingBox(element);
      const slot = findFreeSlot(field, box.width, box.height, occupied);
      if (slot) candidate = { ...element, x: slot.x, y: slot.y };
    }
    parked.push(candidate);
    return candidate;
  });
};

export const findNarrowChannels = (elements: ExpoElement[]): ChannelIssue[] => {
  const issues: ChannelIssue[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const first = getBoundingBox(elements[i]);
    for (let j = i + 1; j < elements.length; j += 1) {
      const second = getBoundingBox(elements[j]);
      const verticalOverlap = intersectionSize(first.top, first.bottom, second.top, second.bottom);
      const horizontalOverlap = intersectionSize(first.left, first.right, second.left, second.right);
      const horizontalGap = first.right <= second.left ? second.left - first.right : second.right <= first.left ? first.left - second.right : 0;
      const verticalGap = first.bottom <= second.top ? second.top - first.bottom : second.bottom <= first.top ? first.top - second.bottom : 0;
      const gap = verticalOverlap > 0 ? horizontalGap : horizontalOverlap > 0 ? verticalGap : 0;
      if (gap > 0 && gap < MIN_CHANNEL) issues.push({ firstId: elements[i].id, secondId: elements[j].id, gap: Number(gap.toFixed(1)) });
    }
  }
  return issues;
};

const distance = (first: { x: number; y: number }, second: { x: number; y: number }) => Math.hypot(second.x - first.x, second.y - first.y);

export const createPathPreview = (elements: ExpoElement[]): PathPreview | null => {
  const entrance = elements.find((element) => element.kind === 'entrance');
  const target = elements.find((element) => element.kind === 'stage') ?? elements.find((element) => element.kind !== 'entrance');
  if (!entrance || !target) return null;
  const startBox = getBoundingBox(entrance);
  const targetBox = getBoundingBox(target);
  const start = { x: startBox.left + startBox.width / 2, y: startBox.top + startBox.height / 2 };
  const end = { x: targetBox.left + targetBox.width / 2, y: targetBox.top + targetBox.height / 2 };
  const elbow = { x: end.x, y: start.y };
  return { points: [start, elbow, end], distance: Number((distance(start, elbow) + distance(elbow, end)).toFixed(1)), fromName: entrance.name, toName: target.name };
};

export const analyzeLayout = (document: LayoutDocument): Analysis => ({
  overlaps: findOverlaps(document.elements),
  bounds: findBoundsIssues(document.field, document.elements),
  channels: findNarrowChannels(document.elements),
  path: createPathPreview(document.elements),
});

export const findElement = (document: LayoutDocument, id: string | null) => document.elements.find((element) => element.id === id) ?? null;

export const formatArea = (field: FieldSize) => `${field.width} × ${field.height} m`;
