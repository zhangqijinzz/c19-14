import { describe, expect, it } from 'vitest';
import { analyzeLayout, clampElementToField, findBoundsIssues, findNarrowChannels, findOverlaps, isFullyOutsideField, isWithinField, reclaimOutOfBounds } from '../src/domain';
import type { ExpoElement } from '../src/types';

const field = { width: 10, height: 10 };
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

  it('clamps dragged positions back inside the field, including rotated bounds', () => {
    expect(clampElementToField(item('a', 12, -4), field)).toMatchObject({ x: 6, y: 0 });
    const rotated = clampElementToField({ ...item('r', 8, 2, 2, 5), rotation: 90 }, field);
    expect(rotated).toMatchObject({ x: 5, y: 2 });
    expect(isWithinField(rotated, field)).toBe(true);
  });

  it('distinguishes fully lost elements from partially overflowing ones', () => {
    expect(isFullyOutsideField(item('gone', 11, 2), field)).toBe(true);
    expect(isFullyOutsideField(item('edge', 8, 2), field)).toBe(false);
  });

  it('reclaims overflowing elements to the nearest in-bounds position', () => {
    const reclaimed = reclaimOutOfBounds([item('gone', 12, 12)], field);
    expect(reclaimed[0]).toMatchObject({ x: 6, y: 7 });
    expect(findBoundsIssues(field, reclaimed)).toHaveLength(0);
  });

  it('parks a reclaimed element in a free slot when the nearest corner is occupied', () => {
    const anchor = item('anchor', 6, 7); // 占住右下角（x 6..10, y 7..10）
    const reclaimed = reclaimOutOfBounds([anchor, item('gone', 12, 12)], field);
    expect(findBoundsIssues(field, reclaimed)).toHaveLength(0);
    expect(findOverlaps(reclaimed)).toHaveLength(0);
  });
});

