import { getConfig } from '../config/getConfig';

interface MobileRedirectConfig {
  isAutomaticJumpToMobilePage?: boolean;
  mobilePageUrl?: string;
}

const CONFIG_URL = `${window.location.origin}/ini/myServerConfig.json`;

let configPromise: Promise<MobileRedirectConfig | undefined> | null = null;

export function getMobileRedirectConfig(): Promise<
  MobileRedirectConfig | undefined
> {
  if (!configPromise) {
    configPromise = getConfig<MobileRedirectConfig>(CONFIG_URL);
  }
  return configPromise;
}

export function getMobileRedirectUrl(
  config: MobileRedirectConfig | undefined
): string | null {
  if (!config?.isAutomaticJumpToMobilePage) return null;

  const baseUrl = import.meta.env.DEV
    ? 'http://localhost:7001/'
    : config.mobilePageUrl || '/mxcad_mobile/';

  return baseUrl + window.location.search;
}
