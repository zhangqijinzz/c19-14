import { describe, expect, it } from 'vitest';
import { analyzeLayout, clampElementToField, clampPositionToField, findBoundsIssues, findNarrowChannels, findOverlaps, recallOutOfBounds } from '../src/domain';
import type { ExpoElement, FieldSize } from '../src/types';

const field: FieldSize = { width: 10, height: 10 };

const item = (id: string, x: number, y: number, width = 4, height = 3): ExpoElement => ({ id, kind: 'booth', name: id, x, y, width, height, rotation: 0 });

describe('layout domain rules', () => {
  it('detects overlap area between two elements', () => {
    expect(findOverlaps([item('a', 1, 1), item('b', 3, 2)])).toEqual([{ firstId: 'a', secondId: 'b', amount: 4 }]);
  });

  it('detects field overflow and rotated bounds', () => {
    const rotated = { ...item('rotated', 8, 2, 2, 5), rotation: 90 };
    expect(findBoundsIssues({ width: 10, height: 10 }, [rotated])).toEqual([{ elementId: 'rotated', overflow: 3 }]);
  });

  it('flags a pass narrower than the minimum channel', () => {
    expect(findNarrowChannels([item('a', 1, 1), item('b', 5.5, 1)])).toEqual([{ firstId: 'a', secondId: 'b', gap: 0.5 }]);
  });

  it('returns a path when entrance and focus area exist', () => {
    const analysis = analyzeLayout({ version: 1, title: 'x', field: { width: 20, height: 12 }, elements: [{ ...item('entry', 1, 5, 2, 1), kind: 'entrance' }, { ...item('stage', 10, 2, 5, 3), kind: 'stage' }] });
    expect(analysis.path?.points).toHaveLength(3);
    expect(analysis.path?.distance).toBeGreaterThan(0);
  });

  describe('boundary clamping and recall', () => {
    it('clamps a dragged position back inside the field', () => {
      expect(clampPositionToField(-3, 2, 4, 3, field)).toEqual({ x: 0, y: 2 });
      expect(clampPositionToField(9, 12, 4, 3, field)).toEqual({ x: 6, y: 7 });
    });

    it('keeps an oversized element at least partly grabbable against the edge', () => {
      expect(clampPositionToField(-40, 5, 60, 3, field)).toEqual({ x: 0, y: 5 });
    });

    it('pulls a stray element to the nearest in-bounds position without moving in-bounds axes', () => {
      const stray = item('stray', -6, 2, 4, 3);
      expect(clampElementToField(stray, field)).toMatchObject({ x: 0, y: 2 });
      const rotated = { ...item('rotated', 8, 2, 2, 5), rotation: 90 };
      expect(clampElementToField(rotated, field)).toMatchObject({ x: 5, y: 2 });
    });

    it('recalls all out-of-bounds elements into non-overlapping positions', () => {
      const kept = item('kept', 1, 1, 4, 3);
      const strayLeft = item('stray-left', -12, 2, 4, 3);
      const strayBottom = item('stray-bottom', 6, 20, 4, 3);
      const result = recallOutOfBounds(field, [kept, strayLeft, strayBottom]);
      expect(findBoundsIssues(field, result)).toHaveLength(0);
      expect(findOverlaps(result)).toHaveLength(0);
      expect(result[0]).toEqual(kept);
    });

    it('leaves a clean layout untouched when recalling', () => {
      const clean = [item('a', 1, 1), item('b', 5, 5)];
      expect(recallOutOfBounds(field, clean)).toBe(clean);
    });
  });
});
