export const CONFIG_KEY_TYPES = ['number', 'bool'] as const;
export type ConfigKeyType = (typeof CONFIG_KEY_TYPES)[number];
