const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

function convertValue(value) {
    if (typeof value === 'string' && containsChinese(value)) {
        if (endsWithParenthesesOrAngleBracketsAndLetters(value)) {
            // 匹配中文字符后跟一个由英文字符组成的括号或尖括号，并且这个括号必须位于字符串的末尾
            const chinesePattern = /([\u4e00-\u9fa5]+)([<>(][a-zA-Z0-9]+[)>])$/;
            const match = value.match(chinesePattern);
            if (match) {
                const [fullMatch, chinesePart, suffix] = match;
                // 修改返回值格式
                return chinesePart;
            }
        } else {
            return value
        }
    }
    return value;
  }
  
  // 检查字符串是否包含中文
  function containsChinese(str) {
      return /[\u4e00-\u9fa5]/.test(str);
  }
  
  // 检查字符串末尾是否有 (字母) 或 <字母>
  function endsWithParenthesesOrAngleBracketsAndLetters(str) {
      return /\([a-zA-Z0-9]+\)$|<[a-zA-Z0-9]+>$/.test(str);
  }
/**
 * 提取JSON 内容 自动翻译成i18n 自定义配置语言列表JSON
   查看languages/translates/mxUIConfig.json文件是否存在 如果不存在就创建
   提取public/mxUIConfig.json中的内容 是一个多嵌套的对象， 只要发现一个对象属性是name 就读取这个name属性的值
    然后在languages/translates/mxUIConfig.json 对象中查看public/mxUIConfig.json对象的name属性的值是不是该对象中的键
    如果不是就添加， 例如发现一个值是"ABC" 如果没有对应的键就加上： "ABC": {"$files": []}最后在$files 中加入 public/mxUIConfig.json相对项目的路径
    最后写入languages/translates/mxUIConfig.json
 * */
const extractI18nMxUIConfigJson = async (sourceFilePath, targetFilePath, keysToMatch = ['name']) => {
    // 确保目标目录存在
    fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });

    // 读取源文件
    let sourceData;
    try {
        const data = fs.readFileSync(sourceFilePath, 'utf8');
        sourceData = JSON.parse(data);
    } catch (error) {
        console.error('Error reading or parsing source file:', error);
    }

    // 尝试读取目标文件，如果不存在则初始化为空对象
    let targetData = {};
    if (fs.existsSync(targetFilePath)) {
        try {
            const data = fs.readFileSync(targetFilePath, 'utf8');
            targetData = JSON.parse(data);
        } catch (error) {
            console.error('Error reading or parsing target file:', error);
        }
    }

    // 递归函数用于查找所有指定属性
    const findAndProcessKeys = (obj, relativePath) => {
        if (typeof obj === 'object' && obj !== null) {
            for (let key in obj) {
                if (keysToMatch.includes(key)) {
                    let keyValue = obj[key];
                    keyValue = convertValue(keyValue)
                    if (!targetData[keyValue]) {
                        targetData[keyValue] = { "$files": [relativePath] };
                    } else if (!targetData[keyValue].$files.includes(relativePath)) {
                        targetData[keyValue].$files.push(relativePath);
                    }
                } else {
                    findAndProcessKeys(obj[key], relativePath);
                }
            }
        }
    };

    // 处理源数据
    findAndProcessKeys(sourceData, path.relative(__dirname, sourceFilePath));

    // 写入目标文件
    try {
        fs.writeFileSync(targetFilePath, JSON.stringify(targetData, null, 2));
        console.log(`Updated ${targetFilePath}`);
    } catch (error) {
        console.error('Error writing to target file:', error);
    }
};

// 主程序
function main() {
    const __dirname = process.cwd();
    extractI18nMxUIConfigJson(path.join(__dirname, 'public', 'mxUIConfig.json'), path.join(__dirname, 'src', 'languages', 'translates', 'mxUIConfig.json'), ['name', 'text'])
    try {
        child_process.execSync("npm run i18nInit && npm run i18nExtract && npm run i18nAutoTranslate && npm run i18nCompile", { stdio: 'inherit' })
    } catch(e) {

    }
}

main();
