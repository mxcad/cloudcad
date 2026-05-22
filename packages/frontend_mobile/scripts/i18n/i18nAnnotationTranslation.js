import * as fs from "fs"
import * as path from "path"
import * as http from "http"
import * as crypto from "crypto"
const baiduAppId = '20230922001825895'; // 百度翻译 API App ID
const baiduSecretKey = 'UeUQKzvpZgp_wkyh5dyi'; // 百度翻译 API Secret Key
const sourceLanguage = 'zh'; // 源语言
const targetLanguage = 'en'; // 目标语言
const rootDir = path.join(process.cwd(), 'src');; // 需要处理的根目录
const supportFileSuffix = ['.ts', 'tsx', 'sass', '.vue', "!.d.ts"] // 过滤文件后缀
// ZWJ 零宽字符作为翻译过的标识符
const identification = "\u200D"
async function main() {
    const files = await walkDirectory(rootDir);
    for (const file of files) {
        const is = supportFileSuffix.some((suffix) => {
            const negated = suffix.startsWith("!")
            if (negated) suffix = suffix.slice(1)
            const is = file.endsWith(suffix)
            return negated ? !is : is
        })
        is && await processFile(file);
    }
}

function walkDirectory(dir) {
    return new Promise((resolve, reject) => {
        fs.readdir(dir, { withFileTypes: true }, (err, files) => {
            if (err) return reject(err);
            const promises = files.filter(dirent => {
                return !dirent.isDirectory() || dirent.isDirectory() && !dirent.name.startsWith('.')
            })
                .map(dirent => dirent.isDirectory() ? walkDirectory(path.join(dir, dirent.name)) : path.join(dir, dirent.name));
            Promise.all(promises)
                .then(paths => resolve(paths.flat()))
                .catch(reject);
        });
    });
}

async function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const comments = extractComments(content);
    if (comments.length > 0) {
        const translations = await translateTexts(comments);
        const updatedContent = replaceComments(content, translations);
        fs.writeFileSync(filePath, updatedContent, 'utf-8');
        console.log(filePath, "替换成功")
    }
}

function extractComments(content) {
    const commentRegex = /\/\*[\s\S]*?\*\/|\/\/.*?(\r\n|\n|$)|<!--[\s\S]*?-->/g;
    const comments = [];
    let match;
    while ((match = commentRegex.exec(content)) !== null) {
        if (!isTranslated(match[0]) && /[\u4e00-\u9fff]/.test(match[0])) {
            comments.push(match[0]);
        }
    }

    return comments;
}

function isTranslated(comment) {
    return comment.includes(identification)
}

function addEnToComments(code) {
    if (!code) return ""
    // 单行注释处理
    code = code.replace(/(\/\/)(?!.*--en)(.*)/g, (match, p1, p2) => `${p1} ${identification} ${p2}`);

    // 多行注释处理
    code = code.replace(/(\/\*[*\s]*)(?!.*--en)([\s\S]*?)(\*\/)/g, (match, p1, p2, p3) => `${p1} ${identification} ${p2}${p3}`);

    // HTML 注释处理
    code = code.replace(/(<!--)(?!.*--en)([\s\S]*?)(-->)/g, (match, p1, p2, p3) => `${p1} ${identification} ${p2}${p3}`);

    return code;
}
async function translateTexts(texts) {
    const accessToken = await getAccessToken();
    const F8FF = "\uF8FF\n"
    const response = await sendTranslationRequest(texts.join(F8FF), accessToken);
    return response.trans_result
}

function replaceComments(content, translations) {
    let updatedContent = content;
    for (let i = 0; i < translations.length; i++) {
        const translation = translations[i];
        const translatedComment = formatTranslatedComment(translation);

        updatedContent = updatedContent.replace(translation.src, translatedComment);
    }
    return updatedContent;
}

function formatTranslatedComment(translated) {
    const text = addEnToComments(translated.src)
    return text + (text.endsWith("\n") ? '' : "\n") + addEnToComments(translated.dst) + "\n";
}

async function getAccessToken() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'openapi.baidu.com',
            port: 80,
            path: '/oauth/2.0/token',
            method: 'GET',
        };

        const params = {
            grant_type: 'client_credentials',
            client_id: baiduAppId,
            client_secret: baiduSecretKey
        };

        const query = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');
        options.path += '?' + query;

        const req = http.request(options, res => {
            let data = '';
            res.on('data', chunk => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result.access_token);
                } catch (error) {
                    reject(new Error('Failed to get access token: ' + data));
                }
            });
        });

        req.on('error', error => {
            reject(error);
        });

        req.end();
    });
}

async function sendTranslationRequest(query, accessToken) {
    return new Promise((resolve, reject) => {
        const salt = Math.random();
        const sign = createSign(query, baiduAppId, baiduSecretKey, salt);

        const options = {
            hostname: 'api.fanyi.baidu.com',
            port: 80,
            path: '/api/trans/vip/translate',
            method: 'GET',
        };

        const params = {
            q: query,
            from: sourceLanguage,
            to: targetLanguage,
            appid: baiduAppId,
            salt: salt,
            sign: sign,
            access_token: accessToken
        };

        const queryStr = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');
        options.path += '?' + queryStr;

        const req = http.request(options, res => {
            let data = '';
            res.on('data', chunk => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result);
                } catch (error) {
                    reject(new Error('Failed to translate: ' + data));
                }
            });
        });

        req.on('error', error => {
            reject(error);
        });

        req.end();
    });
}

function createSign(query, appId, secretKey, salt) {
    const str = appId + query + salt + secretKey;
    return crypto.createHash('md5').update(str).digest('hex');
}

main().catch(console.error);