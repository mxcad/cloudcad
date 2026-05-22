import { addCommand } from "@/plugins/mxcad/command"

import { showConfirmDialog, Field, showNotify } from "vant"
import { McObjectIdType, MxCpp } from "mxcad"
import { ref } from "vue"
import { t  } from "@/languages"

async function new_layer() {
    const text = ref("")
    showConfirmDialog({
        title: t("新建图层"),
        message: ()=> (<Field v-model={ text.value } label={t("图层名")} placeholder={t("请输入新建的图层名称")} border clearable clickable autofocus></Field>),
        showCancelButton: true,
    }).then(()=> {
        const mxcad = MxCpp.getCurrentMxCAD()
        const layerId = mxcad.addLayer(text.value)
        if(layerId.type === McObjectIdType.kInvalid) {
            showNotify({
                type: "danger",
                message: t("图层创建失败") + "!",
                duration: 1000
            })
        }else {
            showNotify({
                type: "success",
                message: t("图层创建成功") + "!",
                duration: 1000
            })
        }
    })
}
addCommand("new_layer", new_layer)

