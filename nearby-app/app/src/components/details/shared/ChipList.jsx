import { asArray } from './poiDetailUtils';

export default function ChipList({ items, renderItem }) {
  const list = asArray(items);
  if (list.length === 0) return null;
  return (
    <div className="acc_list_group_1">
      {list.map((item, i) =>
        renderItem ? renderItem(item, i) : (
          <span key={`${item}-${i}`}>
            {typeof item === 'object' ? (item.name || item.label || '') : String(item)}{i < list.length - 1 ? ',' : ''}
          </span>
        )
      )}
    </div>
  );
}
