//引入路径模块
import path from "path";


//引入文件模块
import fs from "fs"
import { parse } from "node-html-parser"
import { fileURLToPath } from 'url'
const __filenameNew = fileURLToPath(import.meta.url)
const __dirnameNew = path.dirname(__filenameNew)

let pathName = path.join(__dirnameNew, "dist/index.html")
fs.readFile(pathName, 'utf8', function(err,html){
    if(err){
        return console.log('读取index.html文件失败'+err.message)
    }
    const root = parse(html);
    const elList = root.querySelectorAll('script')

    for(let i = 0; i< elList.length; i++) {
        // 1、移除 <script type=module> 元素
        const data = elList[i].getAttribute('type')
        if(data && data === 'module') {
            elList[i].remove()
        }

       // 2、移除其他 <script> 的 nomodule 属性
       const hasNoModule = elList[i].hasAttribute('nomodule')
       if(hasNoModule) {
           elList[i].removeAttribute('nomodule')
       }

       // 3、移除 <script id=vite-legacy-entry> 元素的内容，并把 data-src 属性名改为 src
        const hasDataSrc = elList[i].hasAttribute('data-src')
        if(hasDataSrc) {
            const legacyEle = elList[i]
            if(!legacyEle) return
            const srcData = legacyEle.getAttribute('data-src')
            if(!srcData) return
            legacyEle.setAttribute('src', srcData)
            legacyEle.removeAttribute('data-src')
            // @ts-ignore
            // legacyEle.innerText = ''
        }
    }

    // 将新的组合的内容写入原有index.html
    fs.writeFileSync(pathName, root.toString())
})
