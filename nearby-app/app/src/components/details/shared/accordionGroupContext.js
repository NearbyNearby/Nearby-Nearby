import { createContext, useContext } from 'react';

// Context for single-open accordion coordination. The provider component lives
// in AccordionGroup.jsx; AccSection reads this to know which section is open.
export const AccordionGroupContext = createContext(null);

export function useAccordionGroup() {
  return useContext(AccordionGroupContext);
}
