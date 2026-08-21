import { addCommand } from "@/plugins/mxcad/command";
import { MxCADUiPrPoint, MxCpp } from "mxcad";
import { MxDbLeadComment, MxFun, MxType } from "mxdraw"
import { getTextDimensions } from "@/utils/getTextDimensions"
import { Field, showConfirmDialog, showToast } from "vant";
import { ref } from "vue";
import { t } from "@/languages";
async function m_mx_lead_comment() {
    const getPoint = new MxCADUiPrPoint();
    getPoint.setOffsetInputPostion(true)
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getPoint.setMessage(t("指定第一点"));
    const pt1 = await getPoint.go()
    if(!pt1) return
    let leadComment = new MxDbLeadComment();

    leadComment.point1 = pt1.toVector3();

    const text = ref("")
    const res = await showConfirmDialog({
        title: t("插入文字"),
        message: ()=> (<Field v-model={ text.value } label={t("内容")} placeholder={t("请输入文字")} border clearable clickable autofocus></Field>),
    })
    if(res === "cancel") return
    if(text.value === "") return showToast(t("内容不能为空"))
    leadComment.text = text.value
    const { width, height } = getTextDimensions(text.value)
    leadComment.textHeight = MxFun.screenCoordLong2Doc(height);
    leadComment.textWidth = MxFun.screenCoordLong2Doc(width * 1.4);

    leadComment.color = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor();
    getPoint.setUserDraw((currentPoint, pWorldDraw)=> {
        leadComment.point2 = currentPoint.toVector3();
        pWorldDraw.drawCustomEntity(leadComment);
    })
    getPoint.setBasePt(pt1);
    getPoint.setUseBasePt(true);

    getPoint.setMessage(t("指定第二点"));

    const pt2 = await getPoint.go();
    if(!pt2) return
    leadComment.point2 = pt2?.toVector3();
    MxFun.addToCurrentSpace(leadComment);
}
addCommand("m_mx_lead_comment", m_mx_lead_comment)