"use client";

import { useState } from "react";

interface ConfirmButtonProps {
  message: string;
  className?: string;
  children: React.ReactNode;
}

export function ConfirmButton({ message, className, children }: ConfirmButtonProps) {
  const [disabled, setDisabled] = useState(false);

  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      onClick={(event) => {
        if (disabled) {
          return;
        }
        const confirmed = window.confirm(message);
        if (!confirmed) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        setDisabled(true);
      }}
    >
      {children}
    </button>
  );
}
