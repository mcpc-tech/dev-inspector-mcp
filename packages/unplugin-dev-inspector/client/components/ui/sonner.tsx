import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useInspectorTheme } from "../../context/ThemeContext";
import { Toaster as Sonner } from "sonner";
import { useShadowRoot } from "../../inspector";

type ToasterProps = React.ComponentProps<typeof Sonner> & {
  container?: HTMLElement | null;
};

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useInspectorTheme();
  const shadowRoot = useShadowRoot();

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      container={shadowRoot}
      {...props}
    />
  );
};

export { Toaster };
