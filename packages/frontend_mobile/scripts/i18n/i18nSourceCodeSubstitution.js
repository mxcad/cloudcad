import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const parseArgs = (argMap, args = process.argv.slice(2)) => {
    const result = {};
    let currentKey = null;

    args.forEach((arg) => {
        if (arg.startsWith('-')) {
            // 如果是参数名
            const mappedKey = argMap[arg];
            if (mappedKey) {
                currentKey = mappedKey;
                result[currentKey] = null; // 初始化值
            } else {
                console.warn(`未知参数: ${arg}`);
            }
        } else if (currentKey !== null) {
            // 如果是参数值
            result[currentKey] = arg;
            currentKey = null;
        }
    });

    return result;
};

/** 读取src/languages/settings.json 如果发现没有运行 npm run i18nInit 然后再次尝试读取， 还是没有就报错 */
const getI18nConfig = async () => {
    const settingsPath = path.join(process.cwd(), 'src', 'languages', 'settings.json');

    // 尝试读取配置文件
    try {
        const data = await fs.promises.readFile(settingsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') { // 文件不存在
            console.log('settings.json not found, running initialization command...');

            // 执行初始化命令
            return new Promise((resolve, reject) => {
                try {
                    execSync('npm run i18nInit', { stdio: 'inherit' })
                } catch (err) {
                    if (err) {
                        return reject(err);
                    }
                    // 再次尝试读取文件
                    fs.promises.readFile(settingsPath, 'utf8')
                        .then(data => resolve(JSON.parse(data)))
                        .catch(error => {
                            console.error('Failed to read settings.json after initialization.');
                            reject(error);
                        });
                }

            });
        } else {
            console.error('Error reading file:', error);
            throw error;
        }
    }
};

const setI18nConfig = async (defaultLanguageName) => {
    const configPath = path.join(process.cwd(), 'src', 'languages', 'settings.json');

    try {
        // 读取 settings.json 文件
        const configData = await fs.promises.readFile(configPath, 'utf8');
        let config = JSON.parse(configData);

        // 遍历 languages 数组，找到 default 为 true 的项
        const currentDefault = config.languages.find(lang => lang.default === true);

        // 移除当前默认语言的 default 和 active 属性
        if (currentDefault) {
            delete currentDefault.default;
            delete currentDefault.active;
        }

        // 找到新的默认语言
        const newDefault = config.languages.find(lang => lang.name === defaultLanguageName);

        if (newDefault) {
            // 设置新的默认语言
            newDefault.default = true;
            newDefault.active = true;

            // 写回 settings.json 文件
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
            console.log(`设置默认语言为 ${defaultLanguageName} 成功`);
        } else {
            console.error(`未找到语言 ${defaultLanguageName}`);
        }
    } catch (error) {
        console.error(`读取或写入 settings.json 时出错: ${error.message}`);
    }
};

// 得到配置的默认语言
const getConfigDefaultLanguageName = (config) => {
    // 遍历 languages 数组，找到 default 为 true 的项
    const defaultLanguage = config.languages.find(lang => lang.default === true);

    // 如果找到了默认语言，返回其 name 属性
    if (defaultLanguage) {
        return defaultLanguage.name;
    }

    // 如果没有找到默认语言，可以返回中文zh
    return "zh"
};

/**
 
去src/languages/translates/default.json 读取json数据 格式类似如下：
 {"距离": {
    "en": "distance",
    "cht": "距離",
    "$files": [
        "command\\m_mx_chamfer.ts"
    ]
}}
如果defaultLanguageName 与configDefaultLanguageName一样就不做处理
否则我们要遍历这个对象下的属性 如"距离"
遍历 "距离"中的属性是 $files 得到文件路径 这些文件路径是相对于src的 也就是command\\m_mx_chamfer.ts 是src\\command\\m_mx_chamfer.ts
试用正则表达式找到文件中的每个字符串 t("距以将src/languages/default.json中 对应的键"距离"按照如下规则替换
将"距离"键 替换成 "distance" 然后 删除en键以及它的值离")或者 t('距离')
先在"距离"对应的值中找到与defaultLanguageName匹配的键 得到的值就是要替换的内容
如果defaultLanguageName 是en 而 configDefaultLanguageName 是zh
那么对应要替换的内容是"distance" 最终 这个文件中的t("距离")或者 t('距离')都会被替换成t("distance")或者t('distance')
如果替换文件期间发生错误应该还原文件本来的内容
最后"距离"对象中的"$files"全部遍历完成 并且没有发生错误就可
同时 新增或者替换zh键 对应的值为"距离"
替换后的数据应该是这样的
 {"distance": {
    "zh": "距离",
    "cht": "距離",
    "$files": [
        "command\\m_mx_chamfer.ts"
    ]
}}
 * 
*/

// 转换 i18n 默认json
const replacedI18nDefaultJSONContent = async (defaultLanguageName, configDefaultLanguageName) => {
    const __dirname = process.cwd()
    const defaultJsonPath = path.join(__dirname, 'src', 'languages', 'translates', 'default.json');
    try {
        // 读取 default.json 文件
        const defaultJsonData = await fs.promises.readFile(defaultJsonPath, 'utf8');
        const defaultJson = JSON.parse(defaultJsonData);

        // 遍历 default.json 中的每个键
        for (const [key, value] of Object.entries(defaultJson)) {
            if (value.$files) {
                const translatedValue = value[defaultLanguageName];
                if (translatedValue) {
                    // 遍历文件路径
                    for (const filePath of value.$files) {
                        const fullPath = path.join(__dirname, 'src', filePath);
                        // 读取文件内容
                        let fileContent
                        try {
                            fileContent = await fs.promises.readFile(fullPath, 'utf8');
                        } catch (e) {
                            continue
                        }
                        if (!fileContent) continue
                        try {

                            const regex = new RegExp(`t\\(["']${key}["']\\)`, 'g');
                            const updatedContent = fileContent.replace(regex, `t("${translatedValue}")`);
                            // 写回文件
                            await fs.promises.writeFile(fullPath, updatedContent, 'utf8');
                            console.log(`文件 ${fullPath} 替换成功`);
                        } catch (error) {
                            console.error(`处理文件 ${fullPath} 时出错: ${error.message}`);
                            // 还原文件内容
                            await fs.promises.writeFile(fullPath, fileContent, 'utf8');
                            console.log(`文件 ${fullPath} 已还原`);
                        }
                    }
                    // 更新 default.json 文件
                    defaultJson[translatedValue] = {
                        ...value,
                        [configDefaultLanguageName]: key,
                        [defaultLanguageName]: void 0,
                        $files: value.$files
                    };
                    delete defaultJson[key];
                }
            }
        }
        // 写回 default.json 文件
        await fs.promises.writeFile(defaultJsonPath, JSON.stringify(defaultJson, null, 2), 'utf8');
    } catch (error) {
        console.error(`读取或写入 default.json 时出错: ${error.message}`);
    }
};

/** 提取JSON 内容 自动翻译成i18n 自定义配置语言列表JSON
    查看languages/translates/mxUIConfig.json文件是否存在 如果不存在就创建
    提取public/mxUIConfig.json中的内容 是一个多嵌套的对象， 只要发现一个对象属性是name 就读取这个name属性的值
    然后在languages/translates/mxUIConfig.json 对象中查看public/mxUIConfig.json对象的name属性的值是不是该对象中的键
    如果不是就添加， 例如发现一个值是"ABC" 如果没有对应的键就加上： "ABC": {"$files": []}最后在$files 中加入 public/mxUIConfig.json相对项目的路径
    最后写入languages/translates/mxUIConfig.json
    最后运行自动翻译 npm run i18nAutoTranslate
 *  */
const extractI18nMxUIConfigJson = async () => {
    return new Promise((res, rej) => {
        const __dirname = process.cwd()
        const sourceFilePath = path.join(__dirname, 'public', 'mxUIConfig.json');
        const targetFilePath = path.join(__dirname, 'src', 'languages', 'translates', 'mxUIConfig.json');

        // 确保目标目录存在
        fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });

        // 读取源文件
        let sourceData;
        try {
            const data = fs.readFileSync(sourceFilePath, 'utf8');
            sourceData = JSON.parse(data);
        } catch (error) {
            console.error('Error reading or parsing source file:', error);
            return;
        }

        // 尝试读取目标文件，如果不存在则初始化为空对象
        let targetData = {};
        if (fs.existsSync(targetFilePath)) {
            try {
                const data = fs.readFileSync(targetFilePath, 'utf8');
                targetData = JSON.parse(data);
            } catch (error) {
                console.log('Error reading or parsing target file:', error);
            }
        }

        // 递归函数用于查找所有名为name的属性
        const findAndProcessName = (obj, relativePath) => {
            if (typeof obj === 'object' && obj !== null) {
                for (let key in obj) {
                    if (key === 'name') {
                        const nameValue = obj[key];
                        if (!targetData[nameValue]) {
                            targetData[nameValue] = { "$files": [relativePath] };
                        } else if (!targetData[nameValue].$files.includes(relativePath)) {
                            targetData[nameValue].$files.push(relativePath);
                        }
                    } else {
                        findAndProcessName(obj[key], relativePath);
                    }
                }
            }
        };

        // 处理源数据
        findAndProcessName(sourceData, path.relative(__dirname, sourceFilePath));

        // 写入目标文件
        try {
            fs.writeFileSync(targetFilePath, JSON.stringify(targetData, null, 2));
            console.log(`Updated ${targetFilePath}`);
        } catch (error) {
            console.error('Error writing to target file:', error);
        }
        // 自动翻译
        execSync('npm run i18nAutoTranslate', { stdio: 'inherit' })
        res({
            sourceFilePath,
            targetFilePath
        })
    })

};



/**  
 * 转换 i18n MxUIConfig.json
 * 通过匹配"name": "xxx" 替换 语言 更新languages/translates/mxUIConfig.json文件
 * 
 */
const replacedI18nMxUiConfigJSONContent = async (sourceFilePath, targetFilePath, defaultLanguageName, configDefaultLanguageName) => {
    try {
        // 读取 default.json 文件
        const defaultJsonData = await fs.promises.readFile(targetFilePath, 'utf8');
        const defaultJson = JSON.parse(defaultJsonData);
        // 遍历 default.json 中的每个键
        // 读取文件内容
        let fileContent
        try {
            fileContent = await fs.promises.readFile(sourceFilePath, 'utf8');
        } catch (e) {
            return console.error("读取文件失败" + sourceFilePath)
        }
        if (!fileContent) return console.error(sourceFilePath + "文件没有内容")
        let updatedContent = fileContent
        for (const [key, value] of Object.entries(defaultJson)) {
            const translatedValue = value[defaultLanguageName];
            if (!translatedValue) continue;

            if (!fileContent) continue
            const regex = new RegExp(`"name"\\s*:\\s*"${key}"`, 'g');
            updatedContent = updatedContent.replace(regex, `"name": "${translatedValue}"`);
            // 更新 default.json 文件
            defaultJson[translatedValue] = {
                ...value,
                [configDefaultLanguageName]: key,
                [defaultLanguageName]: void 0,
                $files: value.$files
            };
            delete defaultJson[key];
        }
        if (updatedContent === fileContent) return console.error("没有更新的内容")

        try {
            // 写回文件
            await fs.promises.writeFile(sourceFilePath, updatedContent, 'utf8');
            console.log(`文件 ${sourceFilePath} 替换成功`);
        } catch (error) {
            console.error(`处理文件 ${sourceFilePath} 时出错: ${error.message}`);
            // 还原文件内容
            await fs.promises.writeFile(sourceFilePath, fileContent, 'utf8');
            console.log(`文件 ${sourceFilePath} 已还原`);
        }
        await fs.promises.writeFile(targetFilePath, JSON.stringify(defaultJson, null, 2), 'utf8');
    } catch (error) {
        console.error(`读取或写入 ${targetFilePath} 时出错: ${error.message}`);
    }
}

async function main() {
    console.log("main")
    // 解析外部传入的参数
    const { defaultLanguageName } = parseArgs({
        '-d': 'defaultLanguageName',
    })
    if (!defaultLanguageName) throw "请指定需要改变的参数 如 -d en"
    // 读取配置
    const config = await getI18nConfig()
    // 得到默认语言
    const configDefaultLanguageName = getConfigDefaultLanguageName(config)
    console.log("配置默认语言为:", configDefaultLanguageName)
    console.log("需要改变成的默认语言:", defaultLanguageName)
    // 如果 defaultLanguageName 与 configDefaultLanguageName 一样，不做处理
    if (defaultLanguageName === configDefaultLanguageName) {
        console.log('默认语言相同，无需处理');
        return;
    }
    // json 提取
    const { sourceFilePath, targetFilePath } = await extractI18nMxUIConfigJson()
    // json替换
    await replacedI18nMxUiConfigJSONContent(sourceFilePath, targetFilePath, defaultLanguageName, configDefaultLanguageName)
    // t("") 替换
    await replacedI18nDefaultJSONContent(defaultLanguageName, configDefaultLanguageName)
    await setI18nConfig(defaultLanguageName)

    execSync("npm run i18nCompile",  { stdio: 'inherit' })
}

main()