import { describe, it, expect } from 'vitest';
import {
  countByPoiType,
  countCategories,
  filterCategoryTree,
  findNode,
  subtreeIds,
  toParentOptions,
  trueChildCount,
} from '../categoryTree';

const TREE = [
  {
    id: 'a',
    name: 'Outdoors',
    poi_types: ['PARK', 'TRAIL'],
    children: [
      { id: 'a1', name: 'Hiking', poi_types: ['TRAIL'], children: [
        { id: 'a1a', name: 'Summit Hikes', poi_types: ['TRAIL'], children: [] },
      ] },
    ],
  },
  { id: 'b', name: 'Food & Drinks', poi_types: ['BUSINESS'], children: [] },
];

describe('categoryTree helpers', () => {
  it('counts every node in the hierarchy', () => {
    expect(countCategories(TREE)).toBe(4);
  });

  it('counts categories per POI type, including multi-type membership', () => {
    expect(countByPoiType(TREE)).toEqual({ PARK: 1, TRAIL: 3, BUSINESS: 1 });
  });

  it('finds a nested node by id', () => {
    expect(findNode(TREE, 'a1a').name).toBe('Summit Hikes');
    expect(findNode(TREE, 'missing')).toBeNull();
  });

  it('keeps ancestors of a search match', () => {
    const result = filterCategoryTree(TREE, { search: 'summit' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Outdoors');
    expect(result[0].children[0].children[0].name).toBe('Summit Hikes');
  });

  it('annotates the true child count when filtering prunes the children', () => {
    const [outdoors] = filterCategoryTree(TREE, { search: 'Outdoors' });
    expect(outdoors.children).toHaveLength(0);
    expect(trueChildCount(outdoors)).toBe(1);
    // Unfiltered nodes fall back to their own children array.
    expect(trueChildCount(TREE[0])).toBe(1);
    expect(trueChildCount(TREE[1])).toBe(0);
  });

  it('filters by POI type', () => {
    const result = filterCategoryTree(TREE, { poiType: 'BUSINESS' });
    expect(result.map((node) => node.name)).toEqual(['Food & Drinks']);
  });

  it('returns the original tree when no filter is set', () => {
    expect(filterCategoryTree(TREE, {})).toBe(TREE);
  });

  it('collects a node and its descendants for the parent exclusion set', () => {
    expect(subtreeIds(TREE, 'a')).toEqual(new Set(['a', 'a1', 'a1a']));
    expect(subtreeIds(TREE, null).size).toBe(0);
  });

  it('omits the edited category and its descendants from the parent options', () => {
    const options = toParentOptions(TREE, subtreeIds(TREE, 'a1'));
    expect(options.map((option) => option.value)).toEqual(['a', 'b']);
  });

  it('indents parent options by depth', () => {
    const options = toParentOptions(TREE);
    expect(options[1].label).toBe('\u00A0\u00A0\u00A0\u00A0Hiking');
  });
});
