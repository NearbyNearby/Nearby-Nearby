// Pure helpers for the category hierarchy returned by GET /categories/tree.
// Nodes look like { id, name, parent_id, poi_types, applicable_to, is_active, children }.

export function nodeTypes(node) {
  return node.poi_types || node.applicable_to || [];
}

/**
 * How many subcategories a category really has.
 * Filtering prunes `children`, so a parent matched by its own name can come out
 * of filterCategoryTree with an empty children array. Anything that describes
 * the category itself (the subcategory count, whether it can be deleted) has to
 * read the annotated true count, not the pruned array.
 */
export function trueChildCount(node) {
  return node.trueChildCount ?? (node.children || []).length;
}

export function countCategories(nodes = []) {
  return nodes.reduce((total, node) => total + 1 + countCategories(node.children || []), 0);
}

export function collectCategoryIds(nodes = []) {
  return nodes.reduce(
    (ids, node) => ids.concat(node.id, collectCategoryIds(node.children || [])),
    [],
  );
}

export function countByPoiType(nodes = [], counts = {}) {
  nodes.forEach((node) => {
    nodeTypes(node).forEach((type) => {
      counts[type] = (counts[type] || 0) + 1;
    });
    countByPoiType(node.children || [], counts);
  });
  return counts;
}

export function findNode(nodes = [], id) {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findNode(node.children || [], id);
    if (hit) return hit;
  }
  return null;
}

/**
 * Keeps a node when it matches the filters, or when any of its descendants do
 * (so a match is never orphaned from its parents). A kept node only carries the
 * children that survived the same filter.
 */
export function filterCategoryTree(nodes = [], { search = '', poiType = null } = {}) {
  const term = search.trim().toLowerCase();
  if (!term && !poiType) return nodes;

  const walk = (list) => list.reduce((kept, node) => {
    const children = walk(node.children || []);
    const matchesSearch = !term || node.name.toLowerCase().includes(term);
    const matchesType = !poiType || nodeTypes(node).includes(poiType);
    if ((matchesSearch && matchesType) || children.length > 0) {
      kept.push({ ...node, children, trueChildCount: (node.children || []).length });
    }
    return kept;
  }, []);

  return walk(nodes);
}

/**
 * A category may not become its own parent or a child of its own descendant:
 * the branch would detach from the root list and disappear from every tree
 * query. Returns the ids to exclude from the parent picker.
 */
export function subtreeIds(nodes = [], targetId) {
  if (!targetId) return new Set();
  const target = findNode(nodes, targetId);
  return new Set(target ? collectCategoryIds([target]) : []);
}

/** Flat, indented Select options for the parent picker. */
export function toParentOptions(nodes = [], excludedIds = new Set(), depth = 0, acc = []) {
  nodes.forEach((node) => {
    if (excludedIds.has(node.id)) return;
    acc.push({
      value: node.id,
      // Non-breaking spaces: HTML collapses regular leading whitespace.
      label: `${'\u00A0\u00A0\u00A0\u00A0'.repeat(depth)}${node.name}`,
    });
    toParentOptions(node.children || [], excludedIds, depth + 1, acc);
  });
  return acc;
}
