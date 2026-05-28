import { uiConfig } from "@/config/uiConfig"
import { i18nScope, t } from "@/languages"
import { addCommand, callCommand } from "@/plugins/mxcad/command"
import { showExportDialog } from "@/services/exportService"
import { useEditorState } from "@/composables/useEditorState"
import { injectVoerkaI18n } from "@voerkai18n/vue"
import { MxCpp } from "mxcad"
import { showToast } from "vant"
import { PopoverAction } from "vant"
import { ref } from "vue"

export const useMenu = () => {
    const i18n = injectVoerkaI18n()
    const isShowMenu = ref(false)
    const getDefaultMenuData = () => {
        return [...uiConfig.headerMenuData?.map((item)=> Object.assign({}, item))||[]]
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
            // const layouts = MxCpp.App.getCurrentMxCAD().getAllLayoutName()
            // const _layouts: PopoverAction[] = []
            // layouts.forEach((name) => {
            //     const call = () => {
            //         isShowMenu.value = false
            //         MxCpp.App.getCurrentMxCAD().setCurrentLayout(name)
            //     }
            //     if (name === "Model") {
            //         _layouts.unshift({
            //             text: name,
            //             call
            //         })
            //     } else {
            //         _layouts.push({
            //             text: name,
            //             call
            //         })
            //     }
            // })
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
    addCommand("Mx_saveDwg", () => {
        const { state } = useEditorState()
        if (!state.permissions.canExport) {
            showToast('没有导出权限')
            return
        }
        showExportDialog()
    })
    addCommand("Mx_exportPDF", () => {
        const { state } = useEditorState()
        if (!state.permissions.canExport) {
            showToast('没有导出权限')
            return
        }
        showExportDialog()
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