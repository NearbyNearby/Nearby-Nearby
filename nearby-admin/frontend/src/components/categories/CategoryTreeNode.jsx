import { ActionIcon, Badge, Box, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { nodeTypes, trueChildCount } from './categoryTree';
import { poiTypeMeta } from './poiTypes';

/**
 * One row of the category tree plus its expanded children. Every row carries
 * its POI type badges, so multi-type membership stays visible at a glance.
 */
function CategoryTreeNode({
  node,
  depth = 0,
  expandedIds,
  forceExpanded = false,
  onToggle,
  onEdit,
  onAddChild,
  onDelete,
}) {
  const children = node.children || [];
  // `children` is whatever survived the filter, `childCount` is the real number
  // of subcategories. The first drives what renders, the second drives what we
  // say about the category (count badge, delete guard).
  const childCount = trueChildCount(node);
  const hasChildren = childCount > 0;
  const canExpand = children.length > 0;
  const expanded = forceExpanded || expandedIds.has(node.id);
  const types = nodeTypes(node);

  return (
    <Box>
      <Group
        wrap="nowrap"
        gap="xs"
        py={6}
        pr="xs"
        style={{
          paddingLeft: depth * 24,
          borderBottom: '1px solid var(--mantine-color-gray-2)',
        }}
      >
        {canExpand ? (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => onToggle(node.id)}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
          >
            {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          </ActionIcon>
        ) : (
          <Box w={22} />
        )}

        <UnstyledButton onClick={() => onEdit(node)} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="wrap">
            <Text size="sm" fw={hasChildren ? 600 : 400}>
              {node.name}
            </Text>
            {types.length > 0 ? (
              types.map((type) => {
                const meta = poiTypeMeta(type);
                return (
                  <Tooltip key={type} label={meta.label} withArrow>
                    <Badge size="xs" variant="light" color={meta.color}>
                      {meta.short}
                    </Badge>
                  </Tooltip>
                );
              })
            ) : (
              <Badge size="xs" variant="outline" color="gray">
                No POI type
              </Badge>
            )}
            {node.is_active === false && (
              <Badge size="xs" variant="filled" color="gray">
                Inactive
              </Badge>
            )}
            {hasChildren && (
              <Text size="xs" c="dimmed">
                {childCount} sub
              </Text>
            )}
          </Group>
        </UnstyledButton>

        <Group gap={2} wrap="nowrap">
          <Tooltip label="Add subcategory" withArrow>
            <ActionIcon
              variant="subtle"
              color="deep-purple"
              onClick={() => onAddChild(node)}
              aria-label={`Add subcategory under ${node.name}`}
            >
              <IconPlus size={17} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Edit category" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => onEdit(node)}
              aria-label={`Edit ${node.name}`}
            >
              <IconPencil size={17} />
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={hasChildren ? 'Move or delete its subcategories first' : 'Delete category'}
            withArrow
          >
            <span>
              <ActionIcon
                variant="subtle"
                color="red"
                disabled={hasChildren}
                onClick={() => onDelete(node)}
                aria-label={`Delete ${node.name}`}
              >
                <IconTrash size={17} />
              </ActionIcon>
            </span>
          </Tooltip>
        </Group>
      </Group>

      {expanded &&
        children.map((child) => (
          <CategoryTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            expandedIds={expandedIds}
            forceExpanded={forceExpanded}
            onToggle={onToggle}
            onEdit={onEdit}
            onAddChild={onAddChild}
            onDelete={onDelete}
          />
        ))}
    </Box>
  );
}

export default CategoryTreeNode;
