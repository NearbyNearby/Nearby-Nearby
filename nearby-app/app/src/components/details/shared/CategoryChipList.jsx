import { Link } from 'react-router-dom';
import ChipList from './ChipList';

export default function CategoryChipList({ categories }) {
  return (
    <ChipList
      items={categories}
      renderItem={(cat, i) => (
        <Link
          key={cat.id || i}
          to={`/explore?category=${encodeURIComponent(cat.slug)}&category_label=${encodeURIComponent(cat.name)}`}
          className="poi_category_chip_link"
        >
          {cat.name}
        </Link>
      )}
    />
  );
}
