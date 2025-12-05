import { useCallback, useEffect } from "react";

export function useUnsavedChangesWarning(hasUnsavedChanges: boolean, message: string) {
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges, message]);

  return useCallback(() => {
    if (!hasUnsavedChanges) return true;
    return window.confirm(message);
  }, [hasUnsavedChanges, message]);
}
