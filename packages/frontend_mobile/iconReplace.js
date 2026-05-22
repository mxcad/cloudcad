
// icon js文件替换批处理

const fs = require('fs')
const path = require('path')
const filePath = path.resolve(__dirname, './src/assets/icons/iconfont.js')
const color = '#FFFFFF'
const color1 = '#00A99E"'
const svgProps = `shape-rendering="geometricPrecision"`

function insertStr(soure, start, newStr){
  return soure.slice(0, start) + newStr + soure.slice(start);
}
fs.readFile(filePath,'utf-8', (err, data)=> {
    if(err) console.error(err)

    let newData =  data.replace(
        /fill=\"#FFFFFF\"/gi,
        `fill="currentColor"`)?.replace(/fill=\"#00A99E\"/gi, "")
    // 使svg渲染更平滑
    if(newData.indexOf(svgProps) < 0) {
      const queryCriteriaStr = '<svg'
      const index = newData.indexOf(queryCriteriaStr)
      newData = insertStr(newData, index + queryCriteriaStr.length, ' ' + svgProps)

    }
    fs.writeFile(filePath, newData, (err)=> {
        if(err) console.log(err)
        console.log(filePath + ' 转换成功')
    })
})
