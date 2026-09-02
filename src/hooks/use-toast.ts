import { toast as sonnerToast } from "sonner"

export function useToast() {
  return {
    toast: ({ title, description, variant, ...props }: { title?: React.ReactNode; description?: React.ReactNode; variant?: "default" | "destructive"; [key: string]: unknown }) => {
      const message = title || description || "Message";
      const options = {
        description: title ? (description || "") : undefined,
        ...(props as Record<string, unknown>)
      };

      if (variant === "destructive") {
        return sonnerToast.error(String(message), options);
      }
      return sonnerToast(String(message), options);
    },
    dismiss: (id?: string) => sonnerToast.dismiss(id),
    toasts: []
  }
}

export const toast = ({ title, description, variant, ...props }: { title?: React.ReactNode; description?: React.ReactNode; variant?: "default" | "destructive"; [key: string]: unknown }) => {
  const message = title || description || "Message";
  const options = {
    description: title ? (description || "") : undefined,
    ...(props as Record<string, unknown>)
  };

  if (variant === "destructive") {
    return sonnerToast.error(String(message), options);
  }
  return sonnerToast(String(message), options);
}
