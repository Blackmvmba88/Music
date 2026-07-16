/// <reference types="vite/client" />

interface Window {
  blackMambaDesktop?: {
    platform: string;
    setCompactMode: (compact: boolean) => Promise<void>;
    extractVideoMp3: () => Promise<{
      ok: boolean;
      canceled?: boolean;
      confidence?: string;
      evidence?: string[];
      warnings?: string[];
      fallbackReason?: string | null;
      file?: string;
    }>;
    onTransport: (callback: (action: 'toggle' | 'previous' | 'next' | 'stop') => void) => () => void;
    onUpdateStatus: (callback: (status: { status: string; detail: string | number | null }) => void) => () => void;
  };
}
