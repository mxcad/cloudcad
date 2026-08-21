export interface IRuntimeConfigService {
  getValue<T>(key: string, defaultValue?: T): Promise<T>;
}
