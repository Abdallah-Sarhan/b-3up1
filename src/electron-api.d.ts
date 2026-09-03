export {};

declare global {
  interface Window {
    ward39Desktop?: {
      exportDiagnostics: () => Promise<boolean>;
    };
  }
}