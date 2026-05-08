/// <reference types="vite/client" />
import {} from "mxcad-app"

declare module 'vue' {
  export function watch(source: any, callback: any, options?: any): any;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_LOGO?: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
/** MxPluginContext 类型声明 */
declare global {
  interface Window {
    MxPluginContext?: any;
    /** mxcad-app 挂载在 window 上的全局对象 */
    mxcadApp?: {
      getVuetify?: () => Promise<{
        theme: {
          toggle: (themes: string[]) => void;
          change: (name: string) => void;
        };
      }>;
      useTheme?: () => {
        global: {
          name: {
            value: string;
          };
        };
      };
    };
  }

  var MxPluginContext: any;
}
