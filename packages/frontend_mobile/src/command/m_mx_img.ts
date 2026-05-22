import { t } from "@/languages"
import { addCommand } from "@/plugins/mxcad/command"
import { McGePoint3d, MxCADUiPrAngle, MxCADUiPrPoint, MxCpp } from "mxcad"
import { DetailedResult, MxType } from "mxdraw"
import { showToast } from "vant"
export const getRetainDecimalPlaces = (val: string | number, n: number) => {
    return Number(Number(val).toFixed(n))
}
function m_mx_img() {
    let url = ""
    const img = {
        width: 0,
        height: 0
    }
    const input = document.createElement("input")
    input.type = "file"
    input.style.display = "none"
    input.accept = 'image/*'
    document.body.appendChild(input)


    input.click()


    input.onchange = () => {
        if (input.files && input.files[0]) {
            url = URL.createObjectURL(input.files[0])
            const mxcad = MxCpp.getCurrentMxCAD();
            try {
                mxcad.loadImage(url, async (image) => {
                    if (!image) {
                        console.log("loadImage failed");
                        url = ""
                        showToast(t("加载图片失败"))
                        return;
                    }
                    img.width = image.width
                    img.height = image.height
                    const pt = {
                        x: 0,
                        y: 0
                    }
                    const getPoint = new MxCADUiPrPoint()
                    getPoint.setOffsetInputPostion(true)
                    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd)
                    getPoint.setMessage(t("指定插入点"))
                    const point = await getPoint.go()
                    if (!point) return
                    pt.x = point.x
                    pt.y = point.y
                    const basePt = new McGePoint3d(pt.x, pt.y)
                    getPoint.setBasePt(basePt)
                    getPoint.setMessage("指定缩放比例")

                    getPoint.setUserDraw((pt, pw) => {
                        const z = pt.distanceTo(basePt) / img.width
                        const w = img.width * z
                        const h = img.height * z
                        const pt2 = new THREE.Vector3(basePt.x + w, basePt.y + h)
                        pw.drawRect(basePt.toVector3(), pt2)
                    })
                    const point1 = await getPoint.go()
                    if (!point1) return
                    const zoomRatio = getRetainDecimalPlaces(point1.distanceTo(basePt) / img.width, 3)
                    const getAngle = new MxCADUiPrAngle()
                    getAngle.setOffsetInputPostion(true)
                    getAngle.setInputToucheType(MxType.InputToucheType.kGetEnd)
                    getAngle.setMessage(t("指定旋转角度"))
                    const basePt1 = new McGePoint3d(pt.x, pt.y)
                    getAngle.setBasePt(basePt1)
                    const val = await getAngle.go()
                    if (!val) return
                    let rotationAngle = 0
                    if (getAngle.getDetailedResult() === DetailedResult.kCoordIn) {
                        rotationAngle = getRetainDecimalPlaces(val, 3)
                    } else {
                        rotationAngle = getRetainDecimalPlaces(val / (Math.PI / 180), 3)
                    }
                     mxcad.drawImage(pt.x, pt.y, img.width * zoomRatio, img.height * zoomRatio, rotationAngle, url)
                });
            } catch (e) {
                console.log("loadImage failed", e);
                url = ""
                showToast(t("加载图片失败"))
            }
        }
    }
    input.remove()

}
addCommand("m_mx_img", m_mx_img)