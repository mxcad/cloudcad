/// <reference types="vite/client" />
import {} from "mxcad-app"

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
  }

  var MxPluginContext: any;
}
