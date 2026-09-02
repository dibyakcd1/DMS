import * as React from "react";
import { createPortal } from "react-dom";

interface TeleportActionProps {
  children: React.ReactNode;
  to?: string;
}

/**
 * Specifically used to move elements (actions/titles) from pages 
 * up to the main application header anchors.
 */
export const TeleportAction = ({ children, to = "header-action-portal" }: TeleportActionProps) => {
  const [mounted, setMounted] = React.useState(false);
  
  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  const mountNode = document.getElementById(to);
  if (!mountNode) return <>{children}</>;

  return createPortal(children, mountNode);
};
