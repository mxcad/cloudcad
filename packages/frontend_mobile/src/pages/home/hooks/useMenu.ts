import { uiConfig } from "@/config/uiConfig"
import { i18nScope, t } from "@/languages"
import { addCommand, callCommand } from "@/plugins/mxcad/command"
import { exportDrawing, showDwgOptionsDialog, showPdfOptionsDialog } from "@/services/exportService"
import { canExportDownloadGate } from "@/services/permissionService"
import { useVoerkaI18n } from "@voerkai18n/vue"
import { MxCpp } from "mxcad"
import { PopoverAction, showToast } from "vant"
import { ref, computed, watch } from "vue"
import { saveToCloudTrigger, saveAsToCloudTrigger, saveLoginRequiredTrigger } from "../../../composables/useSaveAs"
import { useUser } from "../../../composables/useUser"
import { useRuntimeConfig } from "../../../composables/useRuntimeConfig"
import { useShellMode } from "@/composables/useShellMode"

/**
 * M7 编辑器菜单裁剪：壳模式下，「打开文件」入口（OpenDwg）从编辑器菜单剥离，
 * 迁移到壳的文件浏览器子页。此处通过 getDefaultMenuData 过滤 + 命令重定向实现。
 * 库入口（图纸库/图块库）保留在编辑器菜单——点击经 mxcad-shell-navigate 打开库抽屉
 * （对齐 PC CAD 编辑器侧边栏的库入口）。保留的编辑器命令：导出/保存/版本历史/布局/协同/语言/新建图纸。
 */
const SHELL_REMOVED_CMDS = new Set([
  'OpenDwg',
  'OpenDwg_DoNotUseCache',
])

function isShellMenuCmd(cmd: string): boolean {
  return SHELL_REMOVED_CMDS.has(cmd)
}

// 导出下载会员门控的实现在 services/permissionService.ts（库抽屉 LibraryPanel 直接引用），
// 此处转出以兼容本文件既有的导入方。
export { canExportDownloadGate }

function isTokenExpired(): boolean {
  try {
    const token = localStorage.getItem('accessToken')
    if (!token) return true
    const payload = JSON.parse(atob(token.split('.')[1] || ''))
    if (!payload.exp) return true
    return payload.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

export const useMenu = () => {
    const i18n = useVoerkaI18n()
    const isShowMenu = ref(false)
    const { user, isAuthenticated } = useUser()
    const { config } = useRuntimeConfig()
    const { isShellMode } = useShellMode()

    const canExportDownload = (): boolean =>
        canExportDownloadGate(user.value, config.value.freeExportDownloadEnabled)

    // 导出下载为 VIP 专属功能：菜单项用主题强调色标识（vant PopoverAction.color 作用于
    // 图标与文字），无需独立 VIP 图标；移动端 UI 完全可控，不依赖 mxcad-app 图标替换。
    // 标识色跟随运行时开关 freeExportDownloadEnabled：开关开放后导出人人可用，恢复正常样式。
    const EXPORT_VIP_COLOR = 'var(--accent)'

    const buildExportActions = (): PopoverAction[] => {
        const vipColor = config.value.freeExportDownloadEnabled
            ? undefined
            : EXPORT_VIP_COLOR
        return [
            {
                // MXWEB 是源格式：纯前端导出、不做转换，因此不走 VIP 门控（与 PC 一致）
                text: '导出 MXWEB',
                icon: 'geshi',
                call: async () => {
                    isShowMenu.value = false
                    await exportDrawing('mxweb')
                }
            },
            {
                text: '导出 PDF',
                icon: 'pdf',
                color: vipColor,
                call: async () => {
                    if (!canExportDownload()) return
                    isShowMenu.value = false
   
                    const pdfOptions = await showPdfOptionsDialog()
                    if (pdfOptions) {
                        exportDrawing('pdf', undefined, pdfOptions)
                    }
                }
            },
            {
                text: '导出 DWG',
                icon: 'Dwg',
                color: vipColor,
                call: async () => {
                    if (!canExportDownload()) return
                    isShowMenu.value = false
     
                    const dwgVersion = await showDwgOptionsDialog('dwg')
                    if (dwgVersion) {
                        exportDrawing('dwg', undefined, undefined, { dwgVersion })
                    }
                }
            },
            {
                text: '导出 DXF',
                icon: 'DXF',
                color: vipColor,
                call: async () => {
                    if (!canExportDownload()) return
                    isShowMenu.value = false

                    const dwgVersion = await showDwgOptionsDialog('dxf')
                    if (dwgVersion) {
                        exportDrawing('dxf', undefined, undefined, { dwgVersion })
                    }
                }
            },
        ]
    }

    const showExportSubMenu = () => {
        setTimeout(() => {
            isShowMenu.value = true
            // 每次打开时重建，读取最新运行时开关状态（freeExportDownloadEnabled）
            actions.value = buildExportActions()
        }, 200)
    }

    const getDefaultMenuData = () => {
        let items = [...uiConfig.headerMenuData?.map((item)=> {
            const copy = Object.assign({} as Record<string, unknown>, item)
            if (copy.cmd === 'Mx_export' || copy.cmd === 'Mx_saveDwg' || copy.cmd === 'Mx_exportPDF') {
                copy.call = showExportSubMenu
            }
            if (copy.cmd === 'Mx_versionHistory') {
                copy.call = () => {
                    window.dispatchEvent(new CustomEvent('open-version-history'))
                }
            }
            return copy
        })||[]]

        // M7 壳模式：编辑器菜单剥离文件管理入口（库/打开图纸），迁移到壳子页导航
        if (isShellMode.value) {
            items = items.filter(item => !isShellMenuCmd((item as Record<string, unknown>).cmd as string))
        }

        // 退出登录仅登录用户可见：未登录时隐藏该菜单项
        if (isAuthenticated.value) {
            items.push(Object.assign({} as Record<string, unknown>, {
                text: '退出登录',
                icon: 'tuichudenglu',
                cmd: '',
                call: () => {
                    isShowMenu.value = false
                    logout()
                }
            }))
        }
        return items
    }
    // 登录态变化（跨窗口登录/登出）时，若菜单未打开则重建默认菜单，
    // 避免打开时仍是旧登录态下的菜单项
    watch(isAuthenticated, () => {
        if (!isShowMenu.value) {
            actions.value = getDefaultMenuData()
        }
    })
    const { logout } = useUser()
    const actions = ref<PopoverAction[]>(getDefaultMenuData())
    addCommand("Mx_NewFile", () => {
        window.dispatchEvent(new CustomEvent('mxcad-new-file'))
    })
    addCommand("Mx_versionHistory", () => {
        window.dispatchEvent(new CustomEvent('open-version-history'))
    })
    addCommand("Mx_languages", () => {
        setTimeout(() => {
            isShowMenu.value = true
            actions.value = i18nScope.languages.map(({ name, title }) => {
                return {
                    text: t(title || ""),
                    call: () => {
                        i18nScope.change(name)
                    }
                }
            }) as PopoverAction[]
        }, 200)
    })
    addCommand("Mx_layouts", () => {
        setTimeout(() => {
            isShowMenu.value = true
            const layouts = MxCpp.App.getCurrentMxCAD().getAllLayoutName()
            const _layouts: PopoverAction[] = []
            layouts.forEach((name) => {
                const call = () => {
                    isShowMenu.value = false
                    MxCpp.App.getCurrentMxCAD().setCurrentLayout(name)
                }
                if (name === "Model") {
                    _layouts.unshift({
                        text: name,
                        call
                    })
                } else {
                    _layouts.push({
                        text: name,
                        call
                    })
                }
            })
            actions.value = _layouts
        }, 200)
    })
    addCommand("Mx_ShowCollaborate", () => {
        window.dispatchEvent(new CustomEvent('mxcad-show-collaborate'))
    })
    addCommand("Mx_ShowDrawingLibrary", () => {
        if (isShellMode.value) {
            window.dispatchEvent(new CustomEvent('mxcad-shell-navigate', { detail: '/shell/library/drawing' }))
            return
        }
        window.dispatchEvent(new CustomEvent('mxcad-show-library', { detail: 'drawing' }))
    })
    addCommand("Mx_ShowBlockLibrary", () => {
        if (isShellMode.value) {
            window.dispatchEvent(new CustomEvent('mxcad-shell-navigate', { detail: '/shell/library/block' }))
            return
        }
        window.dispatchEvent(new CustomEvent('mxcad-show-library', { detail: 'block' }))
    })
    addCommand("Mx_export", showExportSubMenu)
    addCommand("Mx_saveDwg", showExportSubMenu)
    addCommand("Mx_exportPDF", showExportSubMenu)
    // 分享当前图纸：home/index.vue 监听 mxcad-share-current 打开分享底部弹窗
    addCommand("Mx_Share", () => {
        window.dispatchEvent(new CustomEvent('mxcad-share-current'))
    })
    addCommand("Mx_SaveToCloud", () => {
        saveToCloudTrigger.value++
    })
    addCommand("Mx_SaveAsToCloud", () => {
        const { isAuthenticated } = useUser()
        if (!isAuthenticated.value || isTokenExpired()) {
            saveLoginRequiredTrigger.value++
            return
        }
        saveAsToCloudTrigger.value++
    })
    const onSelectMenu = (action: PopoverAction) => {
        action.cmd && callCommand(action.cmd)
        action.call && action.call()
    }
    const onCloseMenu = () => {
        actions.value = getDefaultMenuData()
    }
    const translatedActions = computed(() => {
        // access activeLanguage to re-evaluate on language change
        void i18n.activeLanguage
        return actions.value.map((item) => ({
            ...item,
            text: item.text ? t(item.text) : item.text
        }))
    })
    return {
        isShowMenu,
        actions: translatedActions,
        onSelectMenu,
        onCloseMenu
    }
}
