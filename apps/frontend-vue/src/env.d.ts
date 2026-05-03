/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<
    Record<string, unknown>,
    Record<string, unknown>,
    unknown
  >;
  export default component;
}

declare module 'mxcad-app/vite' {
  import type { Plugin } from 'vite';
  interface MxcadAssetsPluginOptions {
    libraryNames: string[];
  }
  export function mxcadAssetsPlugin(
    options: MxcadAssetsPluginOptions
  ): Plugin;
}

declare module 'mxcad-app' {
  export class MxCADView {
    constructor(options?: Record<string, unknown>);
    create(): void;
    mxcad: {
      on(event: string, callback: () => void): void;
      off(event: string, callback: () => void): void;
      openWebFile(
        url: string,
        ...args: unknown[]
      ): void;
      getCurrentFileName(): string;
    };
  }
}

declare module 'mxdraw' {
  export const MxFun: {
    addCommand(name: string, handler: () => void): void;
    removeCommand(name: string): void;
    sendStringToExecute(command: string): Promise<void>;
    on(event: string, callback: () => void): void;
  };
}
