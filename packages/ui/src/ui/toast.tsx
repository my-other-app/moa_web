import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, toast, type ToasterProps } from "sonner";

function Toaster({ theme = "system", ...props }: ToasterProps) {
  return (
    <Sonner
      theme={theme}
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
          /*
           * The rich colours in Meridian's four tones, so a toast reads at
           * AA in both modes and follows the app's theme. Sonner's own read
           * at about 4.3:1 in light mode (green on mint, red on pink).
           */
          "--success-bg": "var(--admit-soft)",
          "--success-border": "var(--admit-line)",
          "--success-text": "var(--admit)",
          "--error-bg": "var(--refuse-soft)",
          "--error-border": "var(--refuse-line)",
          "--error-text": "var(--refuse)",
          "--warning-bg": "var(--caution-soft)",
          "--warning-border": "var(--caution-line)",
          "--warning-text": "var(--caution)",
          "--info-bg": "var(--info-soft)",
          "--info-border": "var(--info-line)",
          "--info-text": "var(--info)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster, toast };
