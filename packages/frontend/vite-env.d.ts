/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_APP_TITLE?: string;
  readonly VITE_DISABLE_MSW?: string;
  readonly VITE_APP_ENV?: string;
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly hot?: {
    readonly data: Record<string, unknown>;
    accept(): void;
    accept(cb: (mod: Record<string, unknown>) => void): void;
    accept(dep: string, cb: (mod: Record<string, unknown>) => void): void;
    accept(deps: readonly string[], cb: (mods: Record<string, unknown>[]) => void): void;
    dispose(cb: (data: Record<string, unknown>) => void): void;
    decline(): void;
    invalidate(): void;
    on(event: string, cb: (...args: unknown[]) => void): void;
    send(event: string, data?: unknown): void;
  };
}

interface Window {
  mxcadApp?: {
    i18nScope?: {
      change: (lang: string) => void;
      on?: (event: string, cb: (...args: unknown[]) => void) => void;
    };
    useTheme?: () => { global: { name: { value: string } } };
  };
}

declare namespace React {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
  }
}
