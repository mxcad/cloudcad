import { useEffect, useState } from 'react';

/**
 * useDebouncedValue — 值防抖的唯一出口。
 *
 * 返回 value 稳定 delay 毫秒后的值。既有「搜索防抖」值副本
 * （useSearch / useLibrary 各自 setTimeout+clearTimeout）收敛于此；
 * 动作防抖（如 SelectFileModal 的 doSearch 延迟执行）语义不同，不在此列。
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
