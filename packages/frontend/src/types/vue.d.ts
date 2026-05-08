declare module 'vue' {
  export function watch<T>(
    source: T,
    callback: (value: T, oldValue: T) => void,
    options?: { immediate?: boolean; deep?: boolean },
  ): () => void;
}
