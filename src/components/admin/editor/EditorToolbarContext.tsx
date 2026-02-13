"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type EditorToolbarContextValue = {
  activeId: string | null;
  setActiveId: (id: string) => void;
};

const EditorToolbarContext = createContext<EditorToolbarContextValue | null>(null);

export function EditorToolbarProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <EditorToolbarContext.Provider value={{ activeId, setActiveId }}>
      {children}
    </EditorToolbarContext.Provider>
  );
}

export function useEditorToolbar() {
  return useContext(EditorToolbarContext);
}
