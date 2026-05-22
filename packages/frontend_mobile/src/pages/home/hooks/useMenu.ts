import { getHostUrl, getUploadFileConfig, getUrlConfig } from "@/config/serverConfig"
import { uiConfig } from "@/config/uiConfig"
import { i18nScope, t } from "@/languages"
import { addCommand, callCommand } from "@/plugins/mxcad/command"
import { injectVoerkaI18n } from "@voerkai18n/vue"
import { MxCpp, MxTools } from "mxcad"
import { PopoverAction, showToast } from "vant"
import { ref } from "vue"

export const useMenu = () => {
    const i18n = injectVoerkaI18n()
    const isShowMenu = ref(false)
    const getDefaultMenuData = () => {
        return [...uiConfig.headerMenuData?.map((item)=> Object.assign({}, item))||[]]
    }
    const actions = ref<PopoverAction[]>(getDefaultMenuData())
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
    addCommand("Mx_saveDwg", () => {
        let {
            baseUrl = "",
            saveDwgUrl = "",
            mxfilepath = ""
        } = getUploadFileConfig() || {};

        if (baseUrl.substring(0, 16) == "http://localhost") {
            baseUrl = getHostUrl() + baseUrl.substring(16);
        }

        if (saveDwgUrl.substring(0, 16) == "http://localhost") {
            saveDwgUrl = getHostUrl() + saveDwgUrl.substring(16);
        }

        // ‍  把mxweb文件 ，保存到服务器上，然后转换成 dwg文件 ，再下载。
        // ‍ Save the MXWeb file to the server, convert it to a DWG file, and then download it.

        MxCpp.getCurrentMxCAD().saveFileToUrl(saveDwgUrl, (iResult: number, sserverResult: string) => {
            try {
                let ret = JSON.parse(sserverResult);
                if (ret.ret == "ok") {
                    let filePath = baseUrl + mxfilepath + ret.file;
                    fetch(filePath).then(async (res) => {
                        const blob = await res.blob()
                        await MxTools.saveAsFileDialog({
                            blob,
                            filename: ret.file,
                            types: [{
                                description: "dwg" + t("图纸"),
                                accept: {
                                    "application/octet-stream": [".dwg"],
                                },
                            }]
                        })
                    })
                }
                else {
                    console.log(sserverResult);
                }
            } catch {
                console.log("Mx: sserverResult error");
            }
        });

    })
    addCommand("Mx_exportPDF", () => {
        const { minPt, maxPt } = MxCpp.getCurrentDatabase().currentSpace.getBoundingBox()
        let {
            baseUrl = "",
            mxfilepath = "",
            printPdfUrl = ""
        } = getUrlConfig() || {};
        let param = {
            width: "210",
            height: "297",
            roate_angle: 0,
            bd_pt1_x: "" + minPt.x,
            bd_pt1_y: "" + minPt.y,
            bd_pt2_x: "" + maxPt.x,
            bd_pt2_y: "" + maxPt.y
        };
        MxCpp.getCurrentMxCAD().saveFileToUrl(printPdfUrl, (iResult: number, sserverResult: string) => {
            try {
                let ret = JSON.parse(sserverResult);
                if (ret.ret == "ok") {
                    let filePath = baseUrl + mxfilepath + ret.file;
                    fetch(filePath).then(async (res) => {
                        const blob = await res.blob()
                        await MxTools.saveAsFileDialog({
                            blob,
                            filename: ret.file,
                            types: [{
                                description: "pdf" + t("文件"),
                                accept: {
                                    "application/octet-stream": [".pdf"],
                                },
                            }]
                        })
                    })
                }
                else {
                    console.log(sserverResult);
                }
            } catch {
                console.log("Mx: sserverResult error");
            }
        }, undefined, JSON.stringify(param));

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