import { MxCpp } from "mxcad";
import { MxDbAlignedDimension, MrxDbgUiPrPoint, McEdGetPointWorldDrawObject, MxType, MxFun, MxDb2LineAngularDimension, MxDbCoord, MrxDbgUiPrBaseReturn, MxDbArea, MxDbArrow, MxDbCloudLine, MxDbLeadComment, MxDbRectBoxLeadComment } from "mxdraw";
import { t } from '@/languages';

export class MyAlignedDimension extends MxDbAlignedDimension {
    constructor() {
        super()
    }
    public getDimText(): string {
        var v2ndPtTo1stPt = new THREE.Vector3(this.point1.x - this.point2.x, this.point1.y - this.point2.y, 0);
        var fLen = v2ndPtTo1stPt.length()
        return fLen.toFixed(2)
    }

    public create() {
        return new MyAlignedDimension();
    }

    public getTypeName(): string {
        return this.constructor.name
    }
}

async function Mx_Linear() {
    // 让用户在图上点取第一点.
    const getPoint = new MrxDbgUiPrPoint();
    getPoint.setMessage(t("指定第一点:"));
    getPoint.go((status) => {
        if (status != 0) {
            return;
        }
        const pt1 = getPoint.value();

        // 定义一个尺寸对象.
        //let dim = new MxDbAlignedDimension();
        let dim = new MyAlignedDimension();

        dim.setPoint1(pt1);
        dim.setColor(0xff22);

        // 在点取第二点时，设置动态绘制.
        const worldDrawComment = new McEdGetPointWorldDrawObject();
        worldDrawComment.setDraw((currentPoint: THREE.Vector3) => {
            // 动态绘制调用。
            dim.setPoint2(currentPoint);
            worldDrawComment.drawCustomEntity(dim);
        });

        getPoint.setBasePt(pt1);

        getPoint.setUseBasePt(true);
        getPoint.setUserDraw(worldDrawComment);
        getPoint.setMessage(t("指定第二点:"));

        getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
        getPoint.go((status) => {
            if (status != 0) {
                console.log(status);
                return;
            }

            // 成功取到第二点.
            const pt2 = getPoint.value();

            // 得到尺寸线的第二个点.
            dim.setPoint2(pt2);

            // 绘制自定义实体到图上.
            MxFun.getCurrentDraw().addMxEntity(dim);

            //计算长度.
            alert(t("测试长度是：") + dim.getDimText());
        });
    });
}

// 测量角度
function BR_AngleMeasure() {
    // 动态点对象 存储顶点数组
    const point = new MrxDbgUiPrPoint()
    // 绘制控件
    const mxDraw = MxFun.getCurrentDraw()

    const angleDim = new MxDb2LineAngularDimension()

    angleDim.color = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor();
    // 开启连续点击
    const worldDraw = new McEdGetPointWorldDrawObject()
    worldDraw.setColor(MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor());
    point.setMessage(t("指定第一点:"));
    point.go((status) => {
        if (status !== 0) {
            return
        }
        point.setMessage(t("指定第二个角度点:"));
        angleDim.point1 = point.value()
        worldDraw.setDraw((currentPoint, pWorldDraw) => {
            angleDim.point2 = currentPoint
            pWorldDraw.drawLine(angleDim.point1, currentPoint)
        })
        point.setUserDraw(worldDraw)
        point.go((status) => {
            point.setMessage(t("指定最后一个点:"));
            if (status !== 0) {
                return
            }
            angleDim.point2 = point.value()
            worldDraw.setDraw((currentPoint, pWorldDraw) => {
                angleDim.point3 = currentPoint
                worldDraw.drawCustomEntity(angleDim);
            })
            point.go((status) => {
                if (status !== 0) {
                    return
                }
                mxDraw.addMxEntity(angleDim)
            })
        })
    })
}

function BR_CoordMeasure() {
    // 让用户在图上点取第一点.
    const getPoint = new MrxDbgUiPrPoint();
    getPoint.setMessage(t("指定坐标点:"));
    getPoint.go((status) => {
        if (status != 0) {
            return;
        }

        const pt1 = getPoint.value();

        let mxCoord = new MxDbCoord();
        mxCoord.point1 = pt1;
        mxCoord.point2 = pt1.clone();
        mxCoord.color = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor();

        getPoint.setBasePt(pt1);
        getPoint.setUseBasePt(true);

        getPoint.setUserDraw((curPoint, pWorldDraw) => {
            mxCoord.point2 = curPoint;
            pWorldDraw.drawCustomEntity(mxCoord);
        });

        getPoint.setMessage(t("指定标注点:"));

        getPoint.go((status) => {
            if (status != 0) {
                console.log(status);
                return;
            }
            mxCoord.point2 = getPoint.value();
            MxFun.addToCurrentSpace(mxCoord);
        });
    });
}

async function BR_Comment() {
    const getPoint = new MrxDbgUiPrPoint();
    getPoint.setMessage(t("指定第一点:"));
    getPoint.go((status) => {
        if (status != 0) {
            return;
        }

        const pt1 = getPoint.value();

        let leadComment = new MxDbLeadComment();
        leadComment.point1 = pt1.clone();
        leadComment.textHeight = MxFun.screenCoordLong2Doc(50);
        leadComment.text = "测试Test1";
        leadComment.textWidth = MxFun.screenCoordLong2Doc(300);

        leadComment.fixedSize = true;
        if (leadComment.fixedSize) {
            leadComment.textHeight = 50;
            leadComment.textWidth = 250;
        }
        leadComment.color = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor();

        const worldDrawComment = new McEdGetPointWorldDrawObject();
        worldDrawComment.setDraw(
            (currentPoint: THREE.Vector3, pWorldDraw) => {

                leadComment.point2 = currentPoint;
                pWorldDraw.drawCustomEntity(leadComment);

            }
        );

        getPoint.setBasePt(pt1);
        getPoint.setUseBasePt(true);

        getPoint.setUserDraw(worldDrawComment);
        getPoint.setMessage(t(" 指定第二点:"));

        getPoint.go((status) => {
            if (status != 0) {
                console.log(status);
                return;
            }
            const currentPoint = getPoint.value();
            leadComment.point2 = currentPoint;
            MxFun.addToCurrentSpace(leadComment);

        });
    });
}


function myCreateCanvasImageData(param: any): Promise<String> {
    return new Promise<String>((resolve, reject) => {
        MxFun.getCurrentDraw().createCanvasImageData(
            (imageData: String) => {
                resolve(imageData)
            },
            param
        );
    });
}

async function TestMyCreateCanvasImageData() {

    for (let i = 0; i < 10; i++) {
        let imageData = await myCreateCanvasImageData({
            type: "image/bmp",
            width: 349,
            height: 536,
        });
        console.log(imageData);
    }

}

function BR_Print() {
    MxFun.getCurrentDraw().createCanvasImageData(
        (imageData: String) => {
            const newWindow: any = window.open();
            if (newWindow != null) {
                newWindow.document.write('<img src="' + imageData + '"/>');
                setTimeout(() => {
                    newWindow.print();
                }, 300);
            }
        },
        {
            width: 349,
            height: 536,
        }
    );
}





async function BR_CheckDraw() {
    let color = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor();
    const point = new MrxDbgUiPrPoint()
    const mxDraw = MxFun.getCurrentDraw()
    const worldDrawComment = new McEdGetPointWorldDrawObject()
    const mxCheckDraw = new MxDbRectBoxLeadComment()
    mxCheckDraw.color = color.getHex();
    if (mxCheckDraw.color == 0) mxCheckDraw.color = 0x010101;
    mxCheckDraw.radius = MxFun.screenCoordLong2Doc(8);
    mxCheckDraw.setLineWidth(3);
    mxCheckDraw.setLineWidthByPixels(true);
    point.setMessage(t(" 云线框起始点:"));
    point.go((status) => {
        if (status != MrxDbgUiPrBaseReturn.kOk) {
            return
        }
        mxCheckDraw.point1 = point.value()
        worldDrawComment.setDraw((currentPoint) => {
            mxCheckDraw.point2 = currentPoint
            worldDrawComment.drawCustomEntity(mxCheckDraw)

        })

        point.setUserDraw(worldDrawComment)
        point.setMessage(t(" 云线框结束点:"));
        point.go((status) => {
            if (status != MrxDbgUiPrBaseReturn.kOk) {
                return
            }
            mxCheckDraw.point2 = point.value()

            worldDrawComment.setDraw((currentPoint) => {
                mxCheckDraw.point3 = currentPoint
                worldDrawComment.drawCustomEntity(mxCheckDraw)
            })
            mxCheckDraw.text = "审图批注XXXXXXXXXX"

            //mxCheckDraw.text = "审图批注XXTest12345678901234567890123456789111111";
            mxCheckDraw.textWidth = MxFun.screenCoordLong2Doc(200);
            mxCheckDraw.textHeight = MxFun.screenCoordLong2Doc(50);

            mxCheckDraw.fixedSize = true;
            if (mxCheckDraw.fixedSize) {
                mxCheckDraw.textHeight = 20;
                mxCheckDraw.textWidth = 230;
            }


            point.setMessage(t(" 审图标注点:"));
            point.go((status) => {
                if (status != MrxDbgUiPrBaseReturn.kOk) {
                    return
                }
                mxCheckDraw.point3 = point.value()
                mxDraw.addMxEntity(mxCheckDraw)
            })
        })
    })
}

function getScreenPixel(pixel: number, isFontSize?: boolean): number {
    let _pixel = MxFun.screenCoordLong2World(isFontSize ? pixel : pixel - pixel / 3)
    _pixel = MxFun.worldCoordLong2Doc(_pixel)
    return _pixel
}
export function BR_Arrow() {
    const worldDraw = new McEdGetPointWorldDrawObject()
    const lines = new MxDbArrow()
    const mxDraw = MxFun.getCurrentDraw();
    const point = new MrxDbgUiPrPoint();
    point.setUserDraw(worldDraw)
    lines.setLineWidth(10)
    lines.innerOffset = getScreenPixel(10)
    lines.outerOffset = getScreenPixel(22)
    lines.topOffset = getScreenPixel(36)
    lines.color = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor();
    point.go(() => {

        lines.startPoint = point.value()
        worldDraw.setDraw((v) => {
            lines.endPoint = v
            worldDraw.drawCustomEntity(lines)
        })
        point.go(async (status) => {
            lines.endPoint = point.value()

            mxDraw.addMxEntity(lines)

        })
    })
}

export default function BR_CloudLine() {
    const point = new MrxDbgUiPrPoint()
    const mxDraw = MxFun.getCurrentDraw()
    const worldDrawComment = new McEdGetPointWorldDrawObject()

    // 屏幕坐标半径
    const radius = MxFun.screenCoordLong2Doc(16);

    point.setMessage(t(" 点击开启绘制云线:"));

    point.go(() => {
        let pt = point.value()
        // 云线实例
        const mxCloudLine = new MxDbCloudLine()
        mxCloudLine.setRadius(radius);
        mxCloudLine.addPoint(pt);
        mxCloudLine.color = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor();
        worldDrawComment.setDraw((
            currentPoint,
        ) => {
            if (pt.distanceTo(currentPoint) > radius) {
                pt = currentPoint.clone();
                mxCloudLine.addPoint(currentPoint, true);
            }

            worldDrawComment.drawCustomEntity(mxCloudLine)
        })
        point.setUserDraw(worldDrawComment)
        point.setMessage(t(" 再次点击结束绘制云线:"));
        point.go(() => {
            mxDraw.addMxEntity(mxCloudLine)
        })
    })

}


let sSaveData = "";
export function BR_SaveAllMxEntity() {
    let mxobj = MxFun.getCurrentDraw();
    sSaveData = mxobj.saveMxEntityToJson();
    console.log(sSaveData);

}


export async function BR_LoadAllMxEntity() {
    if (sSaveData.length == 0) return;
    let mxobj = MxFun.getCurrentDraw();
    await mxobj.loadMxEntityFromJson(sSaveData, ["models/svg/mark.svg"]);
    mxobj.updateDisplay();
}

export function BR_Area() {
    const getPoint = new MrxDbgUiPrPoint()
    getPoint.setMessage(t(' 指定第一点:'))
    getPoint.go(status => {
        if (status != 0) {
            return
        }
        const pt1 = getPoint.value()
        let area = new MxDbArea()
        area.addPoint(pt1)
        area.color = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor();
        const worldDrawComment = new McEdGetPointWorldDrawObject()
        worldDrawComment.setDraw((currentPoint: THREE.Vector3, pWorldDraw) => {
            let tmp: MxDbArea = area.clone() as MxDbArea
            tmp.addPoint(currentPoint)
            worldDrawComment.drawCustomEntity(tmp)
        })
        getPoint.setUserDraw(worldDrawComment)
        getPoint.setMessage(t(' 指定下一点:'))
        getPoint.goWhile(
            status => {
                if (status == 0) {
                    const pt2 = getPoint.value()
                    area.addPoint(pt2)
                }
            },
            status => {
                area.isFill = true
                area.fillOpacity = 0.7
                area.fillColor = 0x663244
                MxFun.getCurrentDraw().addMxEntity(area)
            }
        )
    })
}
new MyAlignedDimension().rxInit();
MxFun.addCommand("Mx_Linear", Mx_Linear);
MxFun.addCommand("BR_AngleMeasure", BR_AngleMeasure);
MxFun.addCommand("BR_CoordMeasure", BR_CoordMeasure);
MxFun.addCommand("BR_Comment", BR_Comment);
MxFun.addCommand("BR_CheckDraw", BR_CheckDraw);
MxFun.addCommand("BR_Arrow", BR_Arrow);
MxFun.addCommand("BR_CloudLine", BR_CloudLine);
MxFun.addCommand("BR_Print", BR_Print);
MxFun.addCommand("BR_SaveAllMxEntity", BR_SaveAllMxEntity);
MxFun.addCommand("BR_LoadAllMxEntity", BR_LoadAllMxEntity);
MxFun.addCommand("BR_Area", BR_Area);