"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, busy }: { children: React.ReactNode; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? busy : children}
    </button>
  );
}
