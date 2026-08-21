import { uiConfig } from "@/config/uiConfig"
import { i18nScope, t } from "@/languages"
import { addCommand, callCommand } from "@/plugins/mxcad/command"
import { exportDrawing, showDwgOptionsDialog, showPdfOptionsDialog } from "@/services/exportService"
import { useVoerkaI18n } from "@voerkai18n/vue"
import { MxCpp } from "mxcad"
import { PopoverAction, showToast } from "vant"
import { ref, computed, watch } from "vue"
import { saveToCloudTrigger, saveAsToCloudTrigger, saveLoginRequiredTrigger } from "../../../composables/useSaveAs"
import { useUser } from "../../../composables/useUser"
import { useRuntimeConfig } from "../../../composables/useRuntimeConfig"

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

    /**
     * 导出下载方向（mxweb → 其他格式）会员预检：
     * VIP（membershipTierLevel > 0）或运行时开关 freeExportDownloadEnabled 开放时可导出，
     * 否则 toast 提示并短路（后端仍有 403 门控兜底）。
     */
    const canExportDownload = (): boolean => {
        const tierLevel = (user.value as unknown as Record<string, unknown> | null)
            ?.membershipTierLevel as number | undefined
        const isVip = typeof tierLevel === 'number' && tierLevel > 0
        if (isVip || config.value.freeExportDownloadEnabled) return true
        showToast(t('导出下载为会员专属功能，开通 VIP 后即可使用'))
        return false
    }

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
        const items = [...uiConfig.headerMenuData?.map((item)=> {
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
        window.dispatchEvent(new CustomEvent('mxcad-show-library', { detail: 'drawing' }))
    })
    addCommand("Mx_ShowBlockLibrary", () => {
        window.dispatchEvent(new CustomEvent('mxcad-show-library', { detail: 'block' }))
    })
    addCommand("Mx_export", showExportSubMenu)
    addCommand("Mx_saveDwg", showExportSubMenu)
    addCommand("Mx_exportPDF", showExportSubMenu)
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
