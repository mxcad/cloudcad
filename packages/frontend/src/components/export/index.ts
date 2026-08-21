/**
 * components/export 模块入口（ADR-0029 / ADR-0040）
 *
 * 导出/另存为子系统自包含组件。外部消费者禁止深路径导入本目录子模块
 * （depcruise no-deep-import-entry:export 门禁）。
 */
export { ExportModals } from './ExportModals';
export type { ExportModalsProps, ExportModalsHandle } from './ExportModals';
