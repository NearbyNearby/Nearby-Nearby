import { useState } from 'react';
import { AccordionGroupContext } from './accordionGroup';

// Wraps a set of <AccSection>s so only ONE is open at a time. Clicking the open
// section closes it; clicking a different one closes the previously open one.
// AccSections outside a provider keep their own independent open state.
export default function AccordionGroup({ children, initialOpenId = null }) {
  const [openId, setOpenId] = useState(initialOpenId);
  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id));
  return (
    <AccordionGroupContext.Provider value={{ openId, toggle }}>
      {children}
    </AccordionGroupContext.Provider>
  );
}
