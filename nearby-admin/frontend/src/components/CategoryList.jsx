import { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import {
  Button,
  Group,
  Title,
  Paper,
  Text,
  Stack,
  TextInput,
  Modal,
  Chip,
  Drawer,
  Box,
  ScrollArea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconSearch,
  IconAlertTriangle,
  IconTrash,
  IconX,
  IconFoldDown,
  IconFoldUp,
} from '@tabler/icons-react';
import CategoryForm from './CategoryForm';
import CategoryTreeNode from './categories/CategoryTreeNode';
import {
  collectCategoryIds,
  countByPoiType,
  countCategories,
  filterCategoryTree,
} from './categories/categoryTree';
import { POI_TYPE_OPTIONS } from './categories/poiTypes';

/**
 * Category management screen.
 *
 * The hierarchy is shown as a real tree instead of a flattened sortable table:
 * a category's place in the hierarchy is the thing being managed, so any sort
 * that reorders parents away from their children makes the screen harder to
 * read, not easier. Creating and editing happen in a side drawer so the tree
 * (and your place in it) stays on screen.
 */
function CategoryList() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  // { mode: 'edit' | 'create', categoryId, parentId, parentName, key }
  const [editor, setEditor] = useState(null);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await api.get('/categories/tree');
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      notifications.show({
        title: 'Error fetching data',
        message: 'Could not load categories.',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const filterActive = Boolean(searchTerm.trim() || typeFilter);

  const visibleCategories = useMemo(
    () => filterCategoryTree(categories, { search: searchTerm, poiType: typeFilter || null }),
    [categories, searchTerm, typeFilter],
  );

  const totalCount = useMemo(() => countCategories(categories), [categories]);
  const visibleCount = useMemo(() => countCategories(visibleCategories), [visibleCategories]);
  const typeCounts = useMemo(() => countByPoiType(categories), [categories]);

  const toggleNode = (id) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => setExpandedIds(new Set(collectCategoryIds(categories)));
  const collapseAll = () => setExpandedIds(new Set());

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('');
  };

  const openEditor = (config) => setEditor({ ...config, key: `${config.mode}-${Date.now()}` });

  const handleEdit = (category) =>
    openEditor({ mode: 'edit', categoryId: category.id, parentId: null, parentName: null });

  const handleAddChild = (parent) =>
    openEditor({ mode: 'create', categoryId: null, parentId: parent.id, parentName: parent.name });

  const handleAddRoot = () =>
    openEditor({ mode: 'create', categoryId: null, parentId: null, parentName: null });

  const handleSaved = () => {
    const parentId = editor?.parentId;
    setEditor(null);
    if (parentId) {
      // Reveal the subcategory that was just added.
      setExpandedIds((previous) => new Set(previous).add(parentId));
    }
    fetchCategories();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const response = await api.delete(`/categories/${deleteTarget.id}`);
      if (response.ok) {
        notifications.show({
          title: 'Success!',
          message: `Category "${deleteTarget.name}" was deleted.`,
          color: 'green',
        });
        fetchCategories();
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to delete category');
      }
    } catch (error) {
      notifications.show({
        title: 'Deletion Error',
        message: error.message || 'Failed to delete category.',
        color: 'red',
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const editorTitle = () => {
    if (!editor) return '';
    if (editor.mode === 'edit') return 'Edit category';
    if (editor.parentName) return `New subcategory under "${editor.parentName}"`;
    return 'New top-level category';
  };

  const availableTypes = POI_TYPE_OPTIONS.filter((option) => typeCounts[option.value]);

  return (
    <Paper>
      <Group justify="space-between" align="flex-start" mb="md">
        <Box>
          <Title order={2} c="deep-purple.7">Manage Categories</Title>
          <Text size="sm" c="dimmed">
            {filterActive
              ? `Showing ${visibleCount} of ${totalCount} categories`
              : `${totalCount} categories, ${categories.length} at the top level`}
          </Text>
        </Box>
        <Button onClick={handleAddRoot} leftSection={<IconPlus size={18} />}>
          Add Top-Level Category
        </Button>
      </Group>

      <Stack gap="sm" mb="md">
        <Group align="center" gap="sm">
          <TextInput
            placeholder="Search categories..."
            aria-label="Search categories"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            style={{ flex: 1, minWidth: 240 }}
          />
          <Button
            variant="light"
            color="gray"
            onClick={expandAll}
            leftSection={<IconFoldDown size={16} />}
          >
            Expand all
          </Button>
          <Button
            variant="light"
            color="gray"
            onClick={collapseAll}
            leftSection={<IconFoldUp size={16} />}
          >
            Collapse all
          </Button>
        </Group>

        {availableTypes.length > 0 && (
          <Group gap="xs" align="center">
            <Text size="sm" c="dimmed">POI type:</Text>
            <Chip.Group multiple={false} value={typeFilter} onChange={(value) => setTypeFilter(value || '')}>
              <Group gap="xs">
                {availableTypes.map((option) => (
                  <Chip key={option.value} value={option.value} size="xs" color={option.color}>
                    {`${option.label} (${typeCounts[option.value]})`}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
            {filterActive && (
              <Button
                variant="subtle"
                size="compact-sm"
                color="gray"
                onClick={clearFilters}
                leftSection={<IconX size={14} />}
              >
                Clear filters
              </Button>
            )}
          </Group>
        )}
      </Stack>

      {loading ? (
        <Text c="dimmed" ta="center" py="xl">Loading categories...</Text>
      ) : visibleCategories.length > 0 ? (
        <ScrollArea type="auto">
          <Box miw={520} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            {visibleCategories.map((category) => (
              <CategoryTreeNode
                key={category.id}
                node={category}
                expandedIds={expandedIds}
                forceExpanded={filterActive}
                onToggle={toggleNode}
                onEdit={handleEdit}
                onAddChild={handleAddChild}
                onDelete={setDeleteTarget}
              />
            ))}
          </Box>
        </ScrollArea>
      ) : (
        <Text c="dimmed" ta="center" py="xl">
          {categories.length === 0
            ? 'No categories yet. Add your first top-level category to get started.'
            : 'No categories match your search. Try a different term or clear the filters.'}
        </Text>
      )}

      <Drawer
        opened={Boolean(editor)}
        onClose={() => setEditor(null)}
        position="right"
        size="md"
        padding="lg"
        title={<Text fw={600}>{editorTitle()}</Text>}
      >
        {editor && (
          <CategoryForm
            key={editor.key}
            embedded
            categoryId={editor.categoryId}
            initialParentId={editor.parentId}
            tree={categories}
            onSaved={handleSaved}
            onCancel={() => setEditor(null)}
          />
        )}
      </Drawer>

      <Modal
        opened={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={
          <Group gap="xs">
            <IconAlertTriangle size={20} color="var(--mantine-color-red-6)" />
            <Text fw={600}>Confirm Category Deletion</Text>
          </Group>
        }
        centered
        size="md"
        styles={{ title: { color: 'var(--mantine-color-red-7)' } }}
      >
        <Stack gap="lg">
          <Text>
            Are you sure you want to delete the category{' '}
            <Text component="span" fw={600} c="red.7">
              "{deleteTarget?.name}"
            </Text>
            ?
          </Text>

          <Box pl="md">
            <Text size="sm" c="dimmed" mb="xs">
              • It is removed from every POI that uses it
            </Text>
            <Text size="sm" c="dimmed" mb="xs">
              • Categories with subcategories cannot be deleted, move or delete those first
            </Text>
            <Text size="sm" c="dimmed">
              • This action cannot be undone
            </Text>
          </Box>

          <Group justify="flex-end" gap="md" mt="lg">
            <Button variant="subtle" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="red" onClick={confirmDelete} leftSection={<IconTrash size={16} />}>
              Delete Category
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}

export default CategoryList;
