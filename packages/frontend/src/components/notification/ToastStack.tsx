import { createPortal } from "react-dom";
import { ToastContainer } from "@/components/ui";
import type { ToastItem } from "./types";

interface ToastStackProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

export function ToastStack({ toasts, onRemove }: ToastStackProps) {
  return createPortal(
    <ToastContainer toasts={toasts} onRemove={onRemove} />,
    document.body,
  );
}
