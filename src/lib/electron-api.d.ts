export {};

declare global {
  interface Window {
    ward39Desktop?: {
      exportDiagnostics: () => Promise<boolean>;
      reportError: (message: string) => void;
      probeOk?: () => void;
      heartbeat: () => void;
      loadData?: () => Promise<string | null>;
      saveData?: (json: string) => Promise<boolean>;
    };

  }
}
