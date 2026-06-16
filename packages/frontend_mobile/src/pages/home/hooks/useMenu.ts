import { uiConfig } from "@/config/uiConfig"
import { i18nScope, t } from "@/languages"
import { addCommand, callCommand } from "@/plugins/mxcad/command"
import { exportDrawing, showDwgOptionsDialog, showPdfOptionsDialog } from "@/services/exportService"
import { injectVoerkaI18n } from "@voerkai18n/vue"
import { MxCpp } from "mxcad"
import { PopoverAction } from "vant"
import { ref } from "vue"
import { useSave } from "../../../composables/useSave"
import { saveAsToCloudTrigger } from "../../../composables/useSaveAs"

export const useMenu = () => {
    const i18n = injectVoerkaI18n()
    const isShowMenu = ref(false)

    const exportActions: PopoverAction[] = [
        {
            text: '导出 PDF',
            icon: 'pdf',
            call: async () => {
                isShowMenu.value = false
                const pdfOptions = await showPdfOptionsDialog()
                if (pdfOptions) {
                    exportDrawing('pdf', undefined, pdfOptions)
                }
            }
        },
        {
            text: '导出 DWG',
            icon: 'geshi',
            call: async () => {
                isShowMenu.value = false
                const dwgVersion = await showDwgOptionsDialog('dwg')
                if (dwgVersion) {
                    exportDrawing('dwg', undefined, undefined, { dwgVersion })
                }
            }
        },
        {
            text: '导出 DXF',
            icon: 'geshi',
            call: async () => {
                isShowMenu.value = false
                const dwgVersion = await showDwgOptionsDialog('dxf')
                if (dwgVersion) {
                    exportDrawing('dxf', undefined, undefined, { dwgVersion })
                }
            }
        },
    ]

    const showExportSubMenu = () => {
        setTimeout(() => {
            isShowMenu.value = true
            actions.value = exportActions
        }, 200)
    }

    const getDefaultMenuData = () => {
        return [...uiConfig.headerMenuData?.map((item)=> {
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
    }
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
                        i18n.activeLanguage = name
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
    addCommand("Mx_ShowShare", () => {
        window.dispatchEvent(new CustomEvent('mxcad-show-share'))
    })
    addCommand("Mx_export", showExportSubMenu)
    addCommand("Mx_saveDwg", showExportSubMenu)
    addCommand("Mx_exportPDF", showExportSubMenu)
    addCommand("Mx_SaveToCloud", async () => {
        const { save } = useSave()
        await save()
    })
    addCommand("Mx_SaveAsToCloud", () => {
        saveAsToCloudTrigger.value++
    })
    const onSelectMenu = (action: PopoverAction) => {
        action.cmd && callCommand(action.cmd)
        action.call && action.call()
    }
    const onCloseMenu = () => {
        actions.value = getDefaultMenuData()
    }
    return {
        isShowMenu,
        actions,
        onSelectMenu,
        onCloseMenu
    }
}
