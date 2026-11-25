"use client";

import { useState } from "react";

/**
 * A random id for one opened send form. The server sends each email once per
 * id and recipient, so a retried or re-submitted form never sends twice.
 */
export function SendId() {
  const [id] = useState(() => crypto.randomUUID());
  return <input type="hidden" name="send_id" value={id} />;
}
