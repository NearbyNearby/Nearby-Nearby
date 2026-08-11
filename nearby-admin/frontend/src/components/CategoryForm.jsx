import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from '@mantine/form';
import { TextInput, Button, Group, Title, Select, Paper, MultiSelect, Switch, Stack } from '@mantine/core';
import api from '../utils/api';
import { notifications } from '@mantine/notifications';
import { subtreeIds, toParentOptions } from './categories/categoryTree';
import { POI_TYPE_SELECT_DATA } from './categories/poiTypes';

/**
 * Create/edit form for a single category.
 *
 * Used two ways:
 *  - as a route page (/category/new, /category/:id/edit), reading the id from
 *    the URL and navigating back to the list on save;
 *  - embedded in the category tree's side drawer, driven by props so the tree
 *    stays on screen. Pass `tree` to reuse the already fetched hierarchy.
 */
function CategoryForm({
  embedded = false,
  categoryId = null,
  initialParentId = null,
  tree = null,
  onSaved,
  onCancel,
}) {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const id = embedded ? categoryId : routeId;
  const isEditing = Boolean(id);
  const [categoryTree, setCategoryTree] = useState(tree || []);

  const form = useForm({
    initialValues: {
      name: '',
      parent_id: initialParentId,
      poi_types: [],
      is_active: true,
    },
    validate: {
      name: (value) => (value.trim().length < 2 ? 'Name must have at least 2 characters' : null),
      poi_types: (value) => (value.length === 0 ? 'At least one POI type must be selected' : null),
    },
  });

  useEffect(() => {
    // The parent dropdown needs the whole hierarchy. The drawer already has it.
    if (tree) return;
    const fetchCategories = async () => {
      try {
        const response = await api.get('/categories/tree');
        setCategoryTree(await response.json());
      } catch (error) {
        notifications.show({ title: 'Error', message: 'Could not fetch categories for parent selection.', color: 'red' });
      }
    };
    fetchCategories();
  }, [tree]);

  useEffect(() => {
    if (!isEditing) return;
    const fetchCategory = async () => {
      try {
        const response = await api.get(`/categories/${id}`);
        if (response.ok) {
          const data = await response.json();
          form.setValues({
            name: data.name || '',
            parent_id: data.parent_id || null,
            poi_types: data.applicable_to || [],
            is_active: data.is_active !== false,
          });
        } else {
          throw new Error('Failed to fetch category');
        }
      } catch (error) {
        notifications.show({
          title: 'Error',
          message: 'Could not load category data.',
          color: 'red'
        });
        handleCancel();
      }
    };
    fetchCategory();
  }, [id, isEditing]);

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate('/categories');
    }
  };

  const handleSubmit = async (values) => {
    const payload = {
      name: values.name,
      parent_id: values.parent_id || null, // Ensure null is sent if empty
      applicable_to: values.poi_types,  // Map poi_types to applicable_to
    };
    // The create endpoint ignores is_active (new categories are always active),
    // so only send it on update where the API honours it.
    if (isEditing) {
      payload.is_active = values.is_active;
    }

    try {
      let response;
      if (isEditing) {
        response = await api.put(`/categories/${id}`, payload);
      } else {
        response = await api.post('/categories/', payload);
      }

      if (response.ok) {
        notifications.show({
          title: 'Success!',
          message: `Category "${values.name}" ${isEditing ? 'updated' : 'created'}!`,
          color: 'green'
        });
        if (onSaved) {
          onSaved();
        } else {
          navigate('/categories'); // Go back to the category list
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to ${isEditing ? 'update' : 'create'} category`);
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error.message || `Failed to ${isEditing ? 'update' : 'create'} category.`,
        color: 'red'
      });
    }
  };

  // A category cannot be parented to itself or to one of its own descendants:
  // the branch would drop out of the tree entirely.
  const parentOptions = toParentOptions(categoryTree, subtreeIds(categoryTree, id));

  const fields = (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="md">
        <TextInput
          withAsterisk
          label="Category Name"
          placeholder="e.g., Food & Drinks"
          {...form.getInputProps('name')}
        />

        <MultiSelect
          withAsterisk
          label="POI Types"
          placeholder="Select applicable POI types"
          description="A category can belong to several types at once, for example Park, Trail and Business."
          data={POI_TYPE_SELECT_DATA}
          searchable
          {...form.getInputProps('poi_types')}
        />

        <Select
          label="Parent Category"
          placeholder="None, this is a top-level category"
          data={parentOptions}
          {...form.getInputProps('parent_id')}
          clearable
          searchable
          description={
            form.values.parent_id
              ? 'This category is nested under the selected parent.'
              : 'Leave blank to keep this category at the top level.'
          }
        />

        {isEditing && (
          <Switch
            label="Active"
            description="Inactive categories stay in the database but are hidden from the POI form pickers."
            checked={form.values.is_active}
            onChange={(event) => form.setFieldValue('is_active', event.currentTarget.checked)}
          />
        )}

        {embedded ? (
          <Stack gap="xs" mt="md">
            <Button type="submit" fullWidth>
              {isEditing ? 'Save Changes' : 'Create Category'}
            </Button>
            <Button variant="default" fullWidth onClick={handleCancel}>
              Cancel
            </Button>
          </Stack>
        ) : (
          <Group justify="flex-end" mt="xl">
            <Button variant="default" onClick={handleCancel}>Cancel</Button>
            <Button type="submit">
              {isEditing ? 'Save Changes' : 'Create Category'}
            </Button>
          </Group>
        )}
      </Stack>
    </form>
  );

  if (embedded) {
    return fields;
  }

  return (
    <Paper maw={600} mx="auto">
      <Title order={2} c="deep-purple.7" mb="xl">
        {isEditing ? 'Edit Category' : 'Create New Category'}
      </Title>
      {fields}
    </Paper>
  );
}

export default CategoryForm;
