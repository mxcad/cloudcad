import { useColorPicker } from "@/pages/home/useColorPicker";
import { addCommand } from "@/plugins/mxcad/command";
import iro from "@jaames/iro";
import { McCmColor, McObjectIdType, MxCADUtility, MxCpp } from "mxcad";

async function Mx_SetObjectColor() {
    const ids = MxCADUtility.getCurrentSelect()
    console.log(ids)
    if(ids.length === 0) return
    const id = ids[0]
    if(id.isErase() || !id.isValid() || id.isNull()) return
    if(id.type === McObjectIdType.kInvalid) return
    const { openColorPicker, isShowColorPicker } = useColorPicker()
    const mxcad = MxCpp.getCurrentMxCAD()
    if(id.type === McObjectIdType.kMxCAD) {
        const entity = id.getMcDbEntity()
        if(!entity) return
        const color = entity.trueColor.getColorValue(entity.layerId).replace("0x", "#")
        console.log(color)
        await openColorPicker((color)=> {
            entity.trueColor = new McCmColor(color.red, color.green, color.blue)
            mxcad.updateDisplay()
        }, new iro.Color(color))
        isShowColorPicker.value = false
    } 
    if(id.type === McObjectIdType.kMxDraw) {
        const entity = id.getMxDbEntity()
        if(!entity?.color) return
        await openColorPicker((color)=> {
            entity.color = color.hexString
            mxcad.updateDisplay()
        }, new iro.Color(entity.color))
        isShowColorPicker.value = false
    }
}

addCommand("Mx_SetObjectColor", Mx_SetObjectColor)