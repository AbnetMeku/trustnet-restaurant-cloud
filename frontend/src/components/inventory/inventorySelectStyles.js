/** Shared ReactSelect styles for inventory modals (portal-friendly z-index). */

const SELECT_MENU_Z_INDEX = 10050;

/**
 * Radix modal dialogs set `body { pointer-events: none }`. react-select menus are
 * portaled to body, so they must opt back into pointer events or mouse clicks fail
 * (keyboard selection still works).
 */
export function isReactSelectMenuTarget(target) {
  if (!target || typeof target.closest !== "function") return false;

  const el = target.nodeType === 1 ? target : null;
  if (!el) return false;

  if (
    el.closest(".react-select__menu") ||
    el.closest(".react-select__menu-portal") ||
    el.closest('[class*="react-select"]')
  ) {
    return true;
  }

  const listbox = el.closest('[role="listbox"]');
  if (listbox?.id?.startsWith("react-select-")) {
    return true;
  }

  if (el.getAttribute("role") === "option" || el.closest('[role="option"]')) {
    const option = el.getAttribute("role") === "option" ? el : el.closest('[role="option"]');
    if (option?.id?.startsWith("react-select-")) {
      return true;
    }
  }

  if (el.id?.startsWith("react-select-") || el.closest('[id^="react-select-"]')) {
    return true;
  }

  return false;
}

function preventDialogDismissOnSelectMenu(event) {
  if (isReactSelectMenuTarget(event.target)) {
    event.preventDefault();
  }
}

export const inventoryDialogContentProps = {
  onPointerDownOutside: preventDialogDismissOnSelectMenu,
  onInteractOutside: preventDialogDismissOnSelectMenu,
  onFocusOutside: preventDialogDismissOnSelectMenu,
};

export const inventorySelectStyles = {
  control: (base, state) => ({
    ...base,
    backgroundColor: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
    borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--border))",
    boxShadow: state.isFocused ? "0 0 0 1px hsl(var(--ring))" : "none",
    minHeight: 36,
    pointerEvents: "auto",
    "&:hover": { borderColor: "hsl(var(--ring))" },
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: SELECT_MENU_Z_INDEX,
    pointerEvents: "auto",
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "hsl(var(--popover))",
    color: "hsl(var(--foreground))",
    zIndex: SELECT_MENU_Z_INDEX,
    pointerEvents: "auto",
  }),
  menuList: (base) => ({
    ...base,
    pointerEvents: "auto",
  }),
  singleValue: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
  option: (base, { isFocused }) => ({
    ...base,
    pointerEvents: "auto",
    backgroundColor: isFocused ? "hsl(var(--accent))" : "hsl(var(--popover))",
    color: "hsl(var(--foreground))",
  }),
};

export const inventorySelectProps = {
  classNamePrefix: "react-select",
  menuPortalTarget: typeof document !== "undefined" ? document.body : null,
  menuPosition: "fixed",
  styles: inventorySelectStyles,
  closeMenuOnSelect: true,
  blurInputOnSelect: true,
  menuShouldBlockScroll: false,
};

export const normalizeSelectId = (id) => (id == null || id === "" ? null : Number(id));
