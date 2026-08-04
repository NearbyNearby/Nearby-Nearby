import { useState, useEffect, useRef, useCallback } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * React hook porting nn-templates/inc/overlay.js
 * Returns controls for one named overlay.
 */
export default function useOverlay(id, { focusTargetId = null, skipDesktop = false } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const hasOpenedRef = useRef(false); // stays false until first opened — prevents focusing the trigger on initial mount

  const open = useCallback(() => {
    if (skipDesktop && window.innerWidth >= 1200) return;
    setIsOpen(true);
  }, [skipDesktop]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen(prev => {
      if (!prev && skipDesktop && window.innerWidth >= 1200) return false;
      return !prev;
    });
  }, [skipDesktop]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('overlay_lock');
    } else {
      // Only remove if no other overlays are open
      if (!document.querySelector('.overlay_panel.is_open')) {
        document.body.classList.remove('overlay_lock');
      }
    }
    return () => {
      document.body.classList.remove('overlay_lock');
    };
  }, [isOpen]);

  // Focus management
  useEffect(() => {
    if (!isOpen) {
      // Restore focus to the trigger on close — but ONLY after the overlay has
      // been opened at least once. Otherwise this fires on the initial mount
      // (isOpen starts false) and leaves a focus ring on the trigger by default.
      if (hasOpenedRef.current && triggerRef.current) triggerRef.current.focus();
      return;
    }
    hasOpenedRef.current = true;

    const timer = setTimeout(() => {
      if (focusTargetId) {
        const el = document.getElementById(focusTargetId);
        if (el) { el.focus(); return; }
      }
      const closeBtn = panelRef.current?.querySelector('.overlay_close');
      if (closeBtn) closeBtn.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, [isOpen, focusTargetId]);

  // Escape key + focus trap
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      const panel = panelRef.current;
      if (!panel) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = Array.from(panel.querySelectorAll(FOCUSABLE));
        if (focusable.length === 0) { e.preventDefault(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  return { isOpen, open, close, toggle, panelRef, triggerRef };
}
