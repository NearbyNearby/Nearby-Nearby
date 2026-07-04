import { useState, useRef, useEffect } from 'react';
import { Dog, Toilet, Accessibility, Wifi, Blocks, Baby, Wine, CreditCard, ChevronDown } from 'lucide-react';

// Boolean facet toggles (Task 2.2). Each key is the `facet=` query param the
// nearby endpoint understands; the icon differentiates these amenity filters
// from the type pills above them.
const BOOLEAN_FACETS = [
  { key: 'pet_friendly', label: 'Pet Friendly', Icon: Dog },
  { key: 'restrooms', label: 'Restrooms', Icon: Toilet },
  { key: 'wheelchair_accessible', label: 'Accessible', Icon: Accessibility },
  { key: 'free_wifi', label: 'Free Wifi', Icon: Wifi },
  { key: 'playground', label: 'Playground', Icon: Blocks },
  { key: 'kid_friendly', label: 'Kid Friendly', Icon: Baby },
  { key: 'alcohol', label: 'Alcohol', Icon: Wine },
];

// Single-select payment method (dropdown-chip so the row stays compact).
const PAYMENT_OPTIONS = ['Cash', 'Credit Cards', 'Apple Pay', 'Google Pay', 'PayPal'];

function NearbyFacets({ activeFacets, onToggleFacet, activePayment, onPaymentChange }) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const paymentRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (paymentRef.current && !paymentRef.current.contains(e.target)) setPaymentOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setPaymentOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="nearby-facets" role="group" aria-label="Filter by amenity">
      <div className="nearby-facets__scroll">
        {BOOLEAN_FACETS.map(({ key, label, Icon }) => {
          const active = activeFacets.includes(key);
          return (
            <button
              key={key}
              type="button"
              className={`nearby-facet ${active ? 'nearby-facet--active' : ''}`}
              aria-pressed={active}
              onClick={() => onToggleFacet(key)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}

        {/* Payment method — single-select dropdown-chip */}
        <div className="nearby-facet-payment" ref={paymentRef}>
          <button
            type="button"
            className={`nearby-facet ${activePayment ? 'nearby-facet--active' : ''}`}
            aria-haspopup="true"
            aria-expanded={paymentOpen}
            onClick={() => setPaymentOpen(p => !p)}
          >
            <CreditCard size={16} aria-hidden="true" />
            <span>{activePayment || 'Payment'}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {paymentOpen && (
            <div className="nearby-facet-payment__menu" role="menu">
              <button
                type="button"
                className={`nearby-facet-payment__option${!activePayment ? ' nearby-facet-payment__option--active' : ''}`}
                role="menuitem"
                onClick={() => { onPaymentChange(null); setPaymentOpen(false); }}
              >
                Any Payment
              </button>
              {PAYMENT_OPTIONS.map(method => (
                <button
                  key={method}
                  type="button"
                  className={`nearby-facet-payment__option${activePayment === method ? ' nearby-facet-payment__option--active' : ''}`}
                  role="menuitem"
                  onClick={() => { onPaymentChange(method); setPaymentOpen(false); }}
                >
                  {method}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default NearbyFacets;
