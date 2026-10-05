// icon js 文件替换批处理
//
// 重跑前须先从 iconfont.cn 重新下载 src/assets/icons/iconfont.js（下载后的
// fill 色值与本项目主题不符，本脚本统一改为 currentColor）。
// 用 .cjs 而非 .js：本包 package.json 是 "type": "module"，.js 里的 require 会
// 直接抛 ReferenceError（3dda171 引入时写成 .js，pnpm iconReplace 自始不可用）。

const fs = require('fs')
const path = require('path')
const filePath = path.resolve(__dirname, '../src/assets/icons/iconfont.js')
const svgProps = 'shape-rendering="geometricPrecision"'

function insertStr(source, start, newStr) {
  return source.slice(0, start) + newStr + source.slice(start)
}

fs.readFile(filePath, 'utf-8', (err, data) => {
  if (err) {
    console.error(err)
    return
  }

  let newData = data
    .replace(/fill="#FFFFFF"/gi, 'fill="currentColor"')
    .replace(/fill="#00A99E"/gi, '')

  // 使 svg 渲染更平滑
  if (newData.indexOf(svgProps) < 0) {
    const queryCriteriaStr = '<svg'
    const index = newData.indexOf(queryCriteriaStr)
    newData = insertStr(newData, index + queryCriteriaStr.length, ' ' + svgProps)
  }

  fs.writeFile(filePath, newData, (err) => {
    if (err) {
      console.log(err)
      return
    }
    console.log(filePath + ' 转换成功')
  })
})
