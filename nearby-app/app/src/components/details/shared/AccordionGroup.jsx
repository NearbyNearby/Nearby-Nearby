import { useState, useRef } from 'react';
import { AccordionGroupContext } from './accordionGroupContext';

// Wraps a set of <AccSection>s so only ONE is open at a time. Clicking the open
// section closes it; clicking a different one closes the previously open one.
// The first visible section claims the initial open slot (accordionjs behavior:
// first open, rest closed) unless initialOpenId is given. The claim happens
// once per group, so closing every section later stays closed.
// AccSections outside a provider keep their own independent open state.
export default function AccordionGroup({ children, initialOpenId = null }) {
  const [openId, setOpenId] = useState(initialOpenId);
  const claimed = useRef(initialOpenId != null);
  const claimInitial = (id) => {
    if (claimed.current) return;
    claimed.current = true;
    setOpenId(id);
  };
  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id));
  return (
    <AccordionGroupContext.Provider value={{ openId, toggle, claimInitial }}>
      {children}
    </AccordionGroupContext.Provider>
  );
}
