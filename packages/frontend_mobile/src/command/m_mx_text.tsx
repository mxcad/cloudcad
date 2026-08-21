import { addCommand } from "@/plugins/mxcad/command";
import { McDbText, MxCADUiPrPoint, MxCpp } from "mxcad";
import { showConfirmDialog, Field, showToast } from "vant";
import { ref } from "vue";
import { MxType, MxFun } from "mxdraw"
import { t } from "@/languages";
async function m_mx_text() {
    const text = ref("")
    const res = await showConfirmDialog({
        title: t("插入文字"),
        message: ()=> (<Field v-model={ text.value } label={t("内容")} placeholder={t("请输入文字")} border clearable clickable autofocus></Field>),
    })
    if(res === "cancel") return
    if(text.value === "") return showToast(t("内容不能为空"))
    const getPoint = new MxCADUiPrPoint()
    getPoint.setOffsetInputPostion(true)
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd)
    getPoint.setMessage(t("请选择文字插入点"))
    const pt = await getPoint.go()
    if(!pt) return
    const mcText = new McDbText()
    mcText.textString = text.value
    mcText.position = pt
    const height = MxFun.screenCoordLong2World(16)
    mcText.height = height
    mcText.alignmentPoint = pt
    MxCpp.getCurrentMxCAD().drawEntity(mcText)
}

addCommand("m_mx_text", m_mx_text)