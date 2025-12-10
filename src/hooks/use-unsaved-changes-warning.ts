import { useCallback, useEffect, useRef } from "react";

export function useUnsavedChangesWarning(hasUnsavedChanges: boolean, message: string) {
  const guardActiveRef = useRef(false);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = message;
      return message;
    };

    const handlePopState = () => {
      if (!hasUnsavedChanges) return;
      const shouldLeave = window.confirm(message);
      if (shouldLeave) {
        guardActiveRef.current = false;
        window.removeEventListener("beforeunload", handleBeforeUnload);
        window.removeEventListener("popstate", handlePopState, true);
        // Trigger a second back to actually navigate past the guard entry.
        window.history.back();
        return;
      }
      // Restore the guard state so the user stays on the page.
      window.history.pushState(null, "", window.location.href);
    };

    if (hasUnsavedChanges && !guardActiveRef.current) {
      guardActiveRef.current = true;
      window.history.pushState(null, "", window.location.href);
      window.addEventListener("beforeunload", handleBeforeUnload);
      window.addEventListener("popstate", handlePopState, true);
    }

    if (!hasUnsavedChanges && guardActiveRef.current) {
      guardActiveRef.current = false;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState, true);
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState, true);
    };
  }, [hasUnsavedChanges, message]);

  return useCallback(() => {
    if (!hasUnsavedChanges) return true;
    return window.confirm(message);
  }, [hasUnsavedChanges, message]);
}
