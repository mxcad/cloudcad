/**
 * 检测当前是否在壳模式下运行。
 *
 * 壳模式始终启用（移动端 App 即壳），本函数恒返回 true。
 * 编辑器菜单裁剪等逻辑据此判断是否在壳内。
 */
import { ref } from 'vue'

const shellMode = ref(true)

export function useShellMode() {
  return {
    isShellMode: shellMode,
  }
}
