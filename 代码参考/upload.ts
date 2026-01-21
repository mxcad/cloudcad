import { Router } from "express";
import fs = require("fs")
const { createReadStream, readdirSync, createWriteStream } = require('fs');
import multer = require('multer');
import path = require('path')
const routers = Router();
import mxconfig from '../../mxconfig';
import child_process = require("child_process")
const { promisify } = require('util');
const execAsync = promisify(child_process.exec);

import { callCADTools, createUuid, getFileExtName, MxPost } from '../convert';
import { proctz, status_tz } from './proctz';
import mxlog from '../../logs/log';

enum MxUploadReturn {
    kOk = "ok",
    kErrorParam = "errorparam",
    kChunkAlreadyExist = "chunkAlreadyExist",
    kChunkNoExist = "chunkNoExist",
    kFileAlreadyExist = "fileAlreadyExist",
    kFileNoExist = "fileNoExist",
    kConvertFileError = "convertFileError"

};

export function fileisExist(filepath: string, call: (boolean) => void): void {
    fs.access(filepath, fs.constants.F_OK, (err) => {
        call(!err);
    });
}

export function callMxCadAssembly(param: any, retcall: (ret: any) => void) {
    const exec = child_process.exec;
    var pathConvertExt = '"' + mxconfig.getMxCADAppPath() + '"';
    var cmd = "";
    var curDirBak = process.cwd();
    if (mxconfig.isLinux()) {
        process.chdir(mxconfig.getMxCADBinPath());
        var paramstr = JSON.stringify(param);
        paramstr = paramstr.replace(/"/g, "'");
        cmd = pathConvertExt + ' "' + paramstr + '"';
    }
    else {
        cmd = pathConvertExt + ' "' + JSON.stringify(param) + '"';
    }

    mxlog.info(cmd);
    exec(cmd, (err, stdout, stderr) => {
        if (mxconfig.isLinux()) {
            process.chdir(curDirBak);
        }
        let strStdout: string = stdout;
        try {
            let iPos = strStdout.lastIndexOf('{"code"');
            if (iPos != -1) {
                strStdout = strStdout.substring(iPos);
            }
            let ret = JSON.parse(strStdout);
            if (ret.code == 0)
                retcall(ret);
            else {
                retcall(ret);
            }
        } catch (e) {
            console.log(e);
            mxlog.info(JSON.stringify(e));
            mxlog.info(strStdout);
            retcall({ code: -1, message: "cmd catch error" });
        }
    });
}
export function GetRandomNum(Min, Max) {
    var Range = Max - Min;
    var Rand = Math.random();
    return (Min + Math.round(Rand * Range));
}

export async function callImageMagick(inFile: string, outFile: string) {
    let wmf_to_png_cmd = mxconfig.getWmfToPngCmd();
    wmf_to_png_cmd = wmf_to_png_cmd.replace("${inFile}", inFile);
    wmf_to_png_cmd = wmf_to_png_cmd.replace("${outFile}", outFile);
    const exec = child_process.exec;
    try {
        const { stdout, stderr } = await execAsync(wmf_to_png_cmd);
    } catch (error) {
        console.log(JSON.stringify(error));
        console.log(wmf_to_png_cmd);
        return false;
    }
    return true;
}
export function callMxCadAssembly_ConvertFile(path: string, sFileMd5: string, fun: (isOk: boolean, ret: any) => void, create_preloading_data: boolean = false) {
    console.log("mx:convert file: " + path);
    const exec = child_process.exec;
    var pathConvertExt = '"' + mxconfig.getMxCADAppPath() + '"';
    var param: any = {};
    param.srcpath = path;
    param.src_file_md5 = sFileMd5;
    param.create_preloading_data = create_preloading_data;
    if (mxconfig.isDebug) {
        param.debug = mxconfig.isDebug();
    }

    var cmd = "";

    var curDirBak = process.cwd();
    if (mxconfig.isLinux()) {
        process.chdir(mxconfig.getMxCADBinPath());
        var paramstr = JSON.stringify(param);
        paramstr = paramstr.replace(/"/g, "'");
        cmd = pathConvertExt + ' "' + paramstr + '"';
    }
    else {
        cmd = pathConvertExt + ' "' + JSON.stringify(param) + '"';
    }

    mxlog.info(cmd);
    exec(cmd, (err, stdout, stderr) => {
        if (mxconfig.isLinux()) {
            process.chdir(curDirBak);
        }
        let newpath = path + "_" + GetRandomNum(11291, 94552) + ".dwg";

        fs.rename(path, newpath, function (err) {
            try {
                if (err) {
                    throw err
                } else {
                    console.log("Successfully renamed the file!")
                }

                if (stdout) {
                    let strStdout: string = stdout;
                    let iPos = strStdout.lastIndexOf('{"code"');
                    if (iPos != -1) {
                        strStdout = strStdout.substring(iPos);
                    }
                    let ret = JSON.parse(strStdout);

                    ret.newpath = newpath;
                    if (ret.code == 0) {
                        console.log("mx:convert file ok");
                        fun(true, ret);
                    }
                    else {
                        console.log("mx:convert file failed");
                        mxlog.info(stdout);
                        fun(false, ret);
                    }
                }
                else {
                    console.log("mx:convert file failed,stdout undefined");
                    fun(false, {});
                }
            } catch (e) {
                mxlog.info(stdout);
                mxlog.info(e);
                console.log("mx:convert file catch failed");
                fun(false, {});
            }
        });

    });
}

export class MxUpload {

    // 上传文件存放位置。
    public uploadPath = mxconfig.getMxCADUpLoadPath();

    public resFilePath: string[] = [];

    // 当前正在合并转换的文件，因为是异步的，它用防止同一个文件，同时多次进行转换合并调用
    public mapCurrentFilesBeingMerged: any = {};

    constructor() {
        this.resFilePath.push(this.uploadPath);
        let aryStaticResDir = mxconfig.getStaticResDirs();
        aryStaticResDir.forEach(val => {
            this.resFilePath.push(val + mxconfig.getStaticMxCADResDir() );
        })
    }

    // 保存上传状态文件.
    public writeStatusFile(name, size, hash) {
        let student: object = {
            name: name,
            size: size,
            hash: hash
        }
        let jsonPath = this.uploadPath + hash + '.json'
        fs.writeFileSync(jsonPath, JSON.stringify(student));
    }



    //递归删除临时文件夹以及文件夹内文件分片
    private delFileDir(path: string) {
        let myThis = this;
        if (fs.existsSync(path)) {
            fs.readdirSync(path).forEach(function (file) {
                var curPath = path + "/" + file;
                if (fs.statSync(curPath).isDirectory()) { // recurse
                    myThis.delFileDir(curPath);
                } else { // delete file
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
        }
    }

    public findWamFiles(dir: string): string[] {
        try {
            const files = fs.readdirSync(dir);
            const wmfFiles = files.filter(file => {
                return path.extname(file).toLowerCase() === '.wmf';
            });
            return wmfFiles;
        } catch (error) {
            console.error('读取目录时出错:', error);
            return [];
        }
    }

    public async converWmfs2Png(isOk: boolean, ret, fileMd5: string) {
        if (isOk) {
            if (ret.extract_ole !== undefined && ret.extract_ole > 0) {
                let dir = this.uploadPath + fileMd5;
                let aryWmf = this.findWamFiles(dir);
                for (const file of aryWmf) {
                    const inputPath = path.join(dir, file);
                    const outputPath = path.join(dir, `${file}.png`);
                    try {
                        await callImageMagick(inputPath, outputPath);
                    } catch (error) {
                    }
                }
            }
        }
        return true;
    }

    // 把dwg转成mxweb
    public convertFile(path: string, fileMd5: string, fun: (isOk: boolean, ret: any) => void) {
        callMxCadAssembly_ConvertFile(path, fileMd5, (isOk: boolean, ret) => {
            this.converWmfs2Png(isOk, ret, fileMd5).then(() => {
                fun(isOk, ret);
                if (isOk && mxconfig.isSupportTz() && ret.tz) {
                    proctz(ret.newpath, fileMd5, (isOk: boolean) => {
                        if (!isOk) {
                            console.log("proc tz file error:" + path)
                        }
                    });
                }
            }
        )},true);
    }

    // 切片文件存放位置。
    public getChunkTempDirPath(fileMd5: string): string {
        return this.uploadPath + `chunk_${fileMd5}`;
    }

    public getMd5Path(fileMd5: string): string {
        return this.uploadPath + `${fileMd5}`;
    }



    /**
 * @desc 多个文件通过Stream合并为一个文件
 * 设置可读流的 end 为 false 可保持写入流一直处于打开状态，不自动关闭
 * 直到所有的可读流结束，再将可写流给关闭。
 * @param {object[]} fileList
 * @param {string} fileList.filePath 待合并的文件路径
 * @param {WriteStream} fileWriteStream 可写入文件的流
 * @returns {*}
 */
    public streamMergeRecursive(fileList, fileWriteStream, resultCall: any) {
        if (!fileList.length) {

            // 最后关闭可写流，防止内存泄漏
            // 关闭流之前立即写入最后一个额外的数据块(Stream 合并完成)。
            fileWriteStream.end('done');
            resultCall(0);
            return;
        }
        const data = fileList.shift();
        const { filePath: chunkFilePath } = data;

        // 获取当前的可读流
        const currentReadStream = createReadStream(chunkFilePath);
        // 监听currentReadStream的on('data'),将读取到的内容调用fileWriteStream.write方法
        // end:true 读取结束时终止写入流,设置 end 为 false 写入的目标流(fileWriteStream)将会一直处于打开状态，不自动关闭
        currentReadStream.pipe(fileWriteStream, { end: false });
        // 监听可读流的 end 事件，结束之后递归合并下一个文件 或者 手动调用可写流的 end 事件
        currentReadStream.on('end', () => {
            this.streamMergeRecursive(fileList, fileWriteStream, resultCall);
        });

        // 监听错误事件，关闭可写流，防止内存泄漏
        currentReadStream.on('error', (error) => {
            console.error('WriteStream 合并失败\n', error);
            fileWriteStream.close();
            resultCall(1);
        });
    }

    /**
     * @desc 合并文件入口
     * @param {string} sourceFiles 源文件目录
     * @param {string} targetFile 目标文件
     */
    public streamMergeMain(sourceFiles, targetFile, resultCall: any) {
        // 获取源文件目录(sourceFiles)下的所有文件
        const chunkFilesDir = sourceFiles;
        const list: [] = readdirSync(chunkFilesDir);

        const aryList = [];
        list.forEach((val: string) => {
            let strNum = val.substring(0, val.indexOf("_"));
            aryList.push({ num: parseInt(strNum), file: val })
        })
        aryList.sort((a, b) => {
            return a.num - b.num;
        })

        const fileList = aryList.map((val) => ({
            name: val.file,
            filePath: path.resolve(chunkFilesDir, val.file),
        }));

        // 创建一个可写流
        const fileWriteStream = createWriteStream(targetFile);
        this.streamMergeRecursive(fileList, fileWriteStream, resultCall);
    }


    public mergeConvertFile(hashFile: string, chunks: number, fileName: string, fileSize: number, resultCall: any) {
        let fileMd5 = hashFile;
        let tmpDir = this.getChunkTempDirPath(fileMd5);
        let stack: string[] = fs.readdirSync(tmpDir);
        //判断当前上传的切片等于切片总数
        if (chunks == stack.length) {
            let fileMd5 = hashFile;
            if (this.mapCurrentFilesBeingMerged[fileMd5]) {
                // 文件已经在合并中了，就直接返回
                resultCall({ ret: MxUploadReturn.kOk });
                return;
            }
            let name = fileName;
            let fileExtName = name.substring(name.lastIndexOf(".") + 1);
            let filename = fileMd5 + "." + fileExtName;

            // 合并输出的文件。
            let filepath = this.uploadPath + filename;

            let myThis = this;
            // tmpDir需要合并的目录。
            this.mapCurrentFilesBeingMerged[fileMd5] = true;
            this.streamMergeMain(tmpDir, filepath, (ret) => {
                try {
                    myThis.writeStatusFile(fileName, fileSize, hashFile);
                    // 不要在这里面，删片文件，可能文件还没有合并完成。
                    //myThis.delFileDir(tmpDir);
                } catch (e) {
                    console.log("");
                }

                if (ret == 0) {
                    // 对合并的文件进行格式转换。
                    myThis.convertFile(filepath, fileMd5, (isOK: boolean, ret: any) => {
                        this.mapCurrentFilesBeingMerged[fileMd5] = false;
                        if (isOK) {
                            myThis.delFileDir(tmpDir);
                            if (ret.tz) {
                                resultCall({ ret: MxUploadReturn.kOk, tz: true })
                            }
                            else {
                                resultCall({ ret: MxUploadReturn.kOk })
                            }

                        } else {
                            resultCall({ ret: MxUploadReturn.kConvertFileError })
                        }
                    })
                }
                else {
                    // 合并操作结束
                    this.mapCurrentFilesBeingMerged[fileMd5] = false;
                    console.log("streamMergeMain error");
                    resultCall({ ret: MxUploadReturn.kConvertFileError });
                }

            });
        }
        else {
            resultCall({ ret: MxUploadReturn.kOk })
        }
    }

    // 处理一个切片上传
    public uploadChunk(req, res) {

        this.mergeConvertFile(req.body.hash, req.body.chunks, req.body.name, req.body.size, (ret)=>{
            res.json(ret);
        });
        /*

        let fileMd5 = req.body.hash;
        let tmpDir = this.getChunkTempDirPath(fileMd5);
        let stack: string[] = fs.readdirSync(tmpDir);
        //判断当前上传的切片等于切片总数
        if (req.body.chunks == stack.length) {
            let fileMd5 = req.body.hash;
            if (this.mapCurrentFilesBeingMerged[fileMd5]) {
                // 文件已经在合并中了，就直接返回
                res.json({ ret: MxUploadReturn.kOk })
                return;
            }
            let name = req.body.name;
            let fileExtName = name.substring(name.lastIndexOf(".") + 1);
            let filename = fileMd5 + "." + fileExtName;

            // 合并输出的文件。
            let filepath = this.uploadPath + filename;

            let myThis = this;
            // tmpDir需要合并的目录。
            this.mapCurrentFilesBeingMerged[fileMd5] = true;
            this.streamMergeMain(tmpDir, filepath, (ret) => {
                try {
                    myThis.writeStatusFile(req.body.name, req.body.size, req.body.hash);
                    // 不要在这里面，删片文件，可能文件还没有合并完成。
                    //myThis.delFileDir(tmpDir);
                } catch (e) {
                    console.log("");
                }

                if (ret == 0) {
                    // 对合并的文件进行格式转换。
                    myThis.convertFile(filepath, fileMd5, (isOK: boolean, ret: any) => {
                        this.mapCurrentFilesBeingMerged[fileMd5] = false;
                        if (isOK) {
                            myThis.delFileDir(tmpDir);
                            if (ret.tz) {
                                res.json({ ret: MxUploadReturn.kOk, tz: true })
                            }
                            else {
                                res.json({ ret: MxUploadReturn.kOk })
                            }

                        } else {
                            res.json({ ret: MxUploadReturn.kConvertFileError })
                        }
                    })
                }
                else {
                    // 合并操作结束
                    this.mapCurrentFilesBeingMerged[fileMd5] = false;
                    console.log("streamMergeMain error");
                    res.json({ ret: MxUploadReturn.kConvertFileError });
                }

            });
        }
        else {
            res.json({ ret: MxUploadReturn.kOk })
        }*/
    }

    //
    public filesChunkIsAlreadyExist(req, res): void {
        if (req.body.chunk === undefined) {
            console.log("req.body.chunk error");
            res.json({ ret: MxUploadReturn.kErrorParam })
            return;
        }
        let myThis = this;
        let size = req.body.size;
        let fileMd5 = req.body.fileHash;
        var cbfilename = req.body.chunk + "_" + fileMd5;
        let tmpDir = this.getChunkTempDirPath(fileMd5);

        //todo 次数先验证切片是否存在指纹文件夹下，存在则再次验证切片大小是否等于当前切片大小，当切片存在并且大小相等时，则认为当前切片已经上传，反之则重新上传
        fs.access(tmpDir + `/${cbfilename}`, fs.constants.F_OK, (err) => {
            if (!err) {
                fs.stat(tmpDir + `/${cbfilename}`, function (error, stats) {
                    if (error) {
                        res.json({ ret: MxUploadReturn.kChunkNoExist });
                    } else {
                        //文件大小
                        if (stats.size == size) {

                            // 如果切片已经都齐全了，也需要进行合并操作。
                            myThis.mergeConvertFile(fileMd5, req.body.chunks, req.body.fileName, req.body.size, (ret) => {
                                if (ret.ret == MxUploadReturn.kOk) {
                                    res.json({ ret: MxUploadReturn.kChunkAlreadyExist });
                                }
                                else {
                                    res.json({ ret: MxUploadReturn.kChunkNoExist });
                                }
                            });
                        } else {
                            res.json({ ret: MxUploadReturn.kChunkNoExist });
                        }
                    }
                })
            } else {
                res.json({ ret: MxUploadReturn.kChunkNoExist });
            }
        });

    }
    
    public req_fileisExist(req, res): void {
        let suffix = req.body.filename.substring(req.body.filename.lastIndexOf(".") + 1);
        let mxwebFile = req.body.fileHash + '.' + suffix + mxconfig.getMxCADFileExtName(true);

        let i = 0;
        for (; i < this.resFilePath.length; i++) {
            if (fs.existsSync(this.resFilePath[i] + `/${mxwebFile}`)) {
                res.json({ ret: MxUploadReturn.kFileAlreadyExist })
                return;
            }
        }
        res.json({ ret: MxUploadReturn.kFileNoExist })
    }
}

let mxUpload = new MxUpload();
routers.post("/files/chunkisExist", function (req, res) {
    mxUpload.filesChunkIsAlreadyExist(req, res)
})

routers.post("/files/fileisExist", function (req, res) {
    mxUpload.req_fileisExist(req, res)
})

routers.post("/files/tz", function (req, res) {
    status_tz(req.body.fileHash, (isOk: boolean) => {
        res.json({ code: isOk ? 0 : 1 })
    })
})


var storage = multer.diskStorage({
    // 返回文件保存位置。
    destination: function (req, file, cb) {
        if (req.body.chunk !== undefined) {
            // 返回分片文件存放位置。
            let fileMd5 = req.body.hash;
            let tmpDir = mxUpload.getChunkTempDirPath(fileMd5);
            if (!fs.existsSync(tmpDir)) {
                // 新建文件夹
                fs.mkdirSync(tmpDir);
            }
            cb(null, tmpDir)
        }
        else {
            cb(null, mxUpload.uploadPath);
        }
    },

    // 返回文件上传保存的文件名.
    filename: function (req, file, cb) {
        let fileMd5 = req.body.hash;
        if (req.body.chunk !== undefined) {
            // 返回分片文件名.
            cb(null, req.body.chunk + "_" + fileMd5);
        } else {
            let suffix = file.originalname.substring(file.originalname.lastIndexOf(".") + 1);
            cb(null, fileMd5 + "." + suffix);
        }
    }
});

// 分片上传文件创建 multer 对象
var upload = multer({ storage: storage });
routers.post("/files/uploadFiles", upload.single('file'), function (req: any, res) {
    var file = req.file
    if (req.body.chunk !== undefined) {
        console.log("mx:proc chunk file... ")
        // 上传一个分段文件。
        var body = req.body
        if (file && body) {
            mxUpload.uploadChunk(req, res);

        } else {
            res.json({ ret: MxUploadReturn.kErrorParam })
        }
    }
    else {
        console.log("mx:proc up file: " + file.path);
        let fileMd5 = req.body.hash;
        mxUpload.writeStatusFile(req.body.name, req.body.size, req.body.hash);
        mxUpload.convertFile(file.path, fileMd5, (isOK: boolean, ret) => {
            if (!isOK) {
                console.log('图纸转换失败');
                res.json({ ret: MxUploadReturn.kConvertFileError })
            } else {
                console.log('图纸转换成功');
                if (ret.tz) {
                    res.json({ ret: MxUploadReturn.kOk, tz: true })
                }
                else {
                    res.json({ ret: MxUploadReturn.kOk })
                }
            }
        })
    }
})

routers.post("/files/testupfile", upload.single('file'), function (req: any, res) {
    var file = req.file
    console.log("path:" + file.path);
    res.send("ok");
})


// 转换服务器上的文件.
routers.post('/convert', function (req, res) {
    try {
        let param: any = req.body.param;
        if (!param) {
            param = req.body;
        }
        if (typeof param == "string") {
            param = JSON.parse(param);
        }

        let cad_outjpg: any = { cmd: "cadtojpg"};
        if (param.outjpg) {
            cad_outjpg.param = "file=" + param.srcpath + " " + param.outjpg;
        }
        
        if (param.async === "true" && param.resultposturl) {
            let traceid = "";
            if (param.traceid) traceid = param.traceid;

            callMxCadAssembly(param, (ret: any) => {

                if (param.outjpg) {

                    callCADTools(cad_outjpg, (ret: any) => {
                        ret["traceid"] = traceid;
                        MxPost(param.resultposturl, ret, (error: any, response: any, body: any) => {
                            if (!error && response.statusCode == 200) {
                                //console.log(body) // 请求成功的处理逻辑
                            }
                            else {
                                console.log("MxPost error");
                                console.log(error);
                                console.log(response);
                            }
                        });
                    });
                }
                else {
                    ret["traceid"] = traceid;
                    MxPost(param.resultposturl, ret, (error: any, response: any, body: any) => {
                        if (!error && response.statusCode == 200) {
                            //console.log(body) // 请求成功的处理逻辑
                        }
                        else {
                            console.log("MxPost error");
                            console.log(error);
                            console.log(response);
                        }
                    });

                }
              

            });


            res.json({ code: 0, message: "aysnc calling" });
        }
        else {
            callMxCadAssembly(param, (ret: any) => {

                if (param.outjpg) {
                    callCADTools(cad_outjpg, (ret: any) => {
                        res.json(ret);
                    });
                }
                else {
                    res.json(ret);
                }
            });
        }
    }
    catch (err) {
        //console.log(err);
        res.json({ code: 12, message: "param error" });
    }
});


// 使用硬盘存储模式设置存放接收到的文件的路径以及文件名
var storageconvert = multer.diskStorage({
    destination: function (req, file, cb) {
        // 接收存放位置
        //cb(null, './file');
        cb(null, mxconfig.getMxCADUpLoadPath());
    },
    filename: function (req, file, cb) {
        // 上传的文件名自动生成一个guid.
        let sFileName;
        let sExName = getFileExtName(file.originalname);
        if (sExName.length == 0) {
            sFileName = createUuid();
        }
        else {
            sFileName = createUuid() + "." + sExName;
        }
        cb(null, sFileName);
    }
});

var uploadconvert = multer({ storage: storageconvert });


// 上传文件 进行转的换，不会断点续传.
routers.post('/upfile', uploadconvert.single('file'), function (req: any, res, next) {
    var file = req.file.path;
    file = file.replace(/\\/g, '/');

    var param: any = {};
    param.srcpath = file;

    callMxCadAssembly(param, (ret) => {
        try {
            let fileName = file.substring(file.lastIndexOf("/") + 1);
            if (ret) {
                ret.filename = fileName;
            }
            res.json(ret);
        } catch (e) {
            res.json({ code: -1, message: "catch error" });
        }
    });

});



// 上传某个dwg文件的外部参文件。
routers.post('/up_ext_reference_dwg', uploadconvert.single('file'), function (req: any, res, next) {
    var file = req.file.path;
    var srcDwgFileHash = req.body.src_dwgfile_hash;
    var ext_ref_file = req.body.ext_ref_file;

    file = file.replace(/\\/g, '/');
    var param: any = {};
    param.srcpath = file;
    callMxCadAssembly(param, (ret) => {
        try {
            var hashDir = mxconfig.getMxCADUpLoadPath() + "/" + srcDwgFileHash;
            if (!fs.existsSync(hashDir)) {
                fs.mkdirSync(hashDir);
            }
            fs.copyFileSync(file + mxconfig.getMxCADFileExtName(true), hashDir + "/" + ext_ref_file + mxconfig.getMxCADFileExtName(true));
            res.json(ret);
        } catch (e) {
            res.json({ code: -1, message: "catch error" });
        }
    });


});

// 上传某个dwg文件的外部参照图片。。
routers.post('/up_ext_reference_image', uploadconvert.single('file'), function (req: any, res, next) {
    var file = req.file.path;
    var srcDwgFileHash = req.body.src_dwgfile_hash;
    var ext_ref_file = req.body.ext_ref_file;

    try {
        var hashDir = mxconfig.getMxCADUpLoadPath() + "/" + srcDwgFileHash;
        if (!fs.existsSync(hashDir)) {
            fs.mkdirSync(hashDir);
        }
        fs.copyFileSync(file, hashDir + "/" + ext_ref_file);
        res.json({ code: 0, message: "ok" });
    } catch (e) {
        res.json({ code: -1, message: "catch error" });
    }
});





// 保存mxweb到服务器
routers.post('/savemxweb', uploadconvert.single('file'), function (req: any, res, next) {
    var file = req.file.filename;
    res.json({ code: 0, file: file, ret: "ok" });
});

// 保存dwg到服务器
routers.post('/savedwg', uploadconvert.single('file'), function (req: any, res, next) {
    var file = req.file.path;
    file = file.replace(/\\/g, '/');
    let sOutFile = req.file.filename + ".dwg";
    var param: any = {};
    param.srcpath = file;
    param.outname = sOutFile;
    callMxCadAssembly(param, (ret) => {
        try {
            ret.file = sOutFile;
            if (ret.code == 0)
                ret.ret = 'ok';
            else
                ret.ret = 'failed';
            res.json(ret);
        } catch (e) {
            res.json({ ret: 'failed', code: -1, message: "catch error" });
        }
    });
});


routers.post('/savepdf', uploadconvert.single('file'), function (req: any, res, next) {

    let param: any = req.body.param;
    if (!param) {
        param = req.body;
    }
    if (typeof param == "string") {
        param = JSON.parse(param);
    }

    if (!param) {
        param = { width: "2000", height: "2000" }
    }

    var file = req.file.path;
    file = file.replace(/\\/g, '/');
    let sOutFile = req.file.filename + ".pdf";

    param.srcpath = file;
    param.outname = sOutFile;
    if (!param.colorPolicy) {
        param.colorPolicy = "mono";
    }

    callMxCadAssembly(param, (ret) => {
        try {
            ret.file = sOutFile;
            if (ret.code == 0)
                ret.ret = 'ok';
            else
                ret.ret = 'failed';
            res.json(ret);
        } catch (e) {
            res.json({ ret: 'failed', code: -1, message: "catch error" });
        }
    });
});


routers.post('/print_to_pdf', uploadconvert.single('file'), function (req: any, res, next) {

    let param: any = req.body.param;
    if (!param) {
        param = req.body;
    }
    if (typeof param == "string") {
        param = JSON.parse(param);
    }

    if (!param) {
        res.json({ ret: 'failed', code: -1, message: "param error" });
        return;
    }

    var file = req.file.path;
    file = file.replace(/\\/g, '/');
    let sOutFile = req.file.filename + ".pdf";
    
    param.cmd = 'print_to_pdf';
    param.srcpath = file;
    param.outname = sOutFile;
    if (!param.colorPolicy) {
        param.colorPolicy = "mono";
    }

    callMxCadAssembly(param, (ret) => {
        try {
            ret.file = sOutFile;
            if (ret.code == 0)
                ret.ret = 'ok';
            else
                ret.ret = 'failed';
            res.json(ret);
        } catch (e) {
            res.json({ ret: 'failed', code: -1, message: "catch error" });
        }
    });
});

routers.post('/cut_dwg', uploadconvert.single('file'), function (req: any, res, next) {

    let param: any = req.body.param;
    if (!param) {
        param = req.body;
    }
    if (typeof param == "string") {
        param = JSON.parse(param);
    }

    if (!param) {
        res.json({ ret: 'failed', code: -1, message: "param error" });
        return;
    }

    var file = req.file.path;
    file = file.replace(/\\/g, '/');
    let sOutFile = req.file.filename + ".dwg";

    param.cmd = 'cut_dwg';
    param.srcpath = file;
    param.outname = sOutFile;

    callMxCadAssembly(param, (ret) => {
        try {
            ret.file = sOutFile;
            if (ret.code == 0)
                ret.ret = 'ok';
            else
                ret.ret = 'failed';
            res.json(ret);
        } catch (e) {
            res.json({ ret: 'failed', code: -1, message: "catch error" });
        }
    });
});


routers.post('/cut_mxweb', uploadconvert.single('file'), function (req: any, res, next) {

    let param: any = req.body.param;
    if (!param) {
        param = req.body;
    }
    if (typeof param == "string") {
        param = JSON.parse(param);
    }

    if (!param) {
        res.json({ ret: 'failed', code: -1, message: "param error" });
        return;
    }

    var file = req.file.path;
    file = file.replace(/\\/g, '/');
    let sOutFile = req.file.filename + ".mxweb";

    param.cmd = 'cut_dwg';
    param.srcpath = file;
    param.outname = sOutFile;

    callMxCadAssembly(param, (ret) => {
        try {
            ret.file = sOutFile;
            if (ret.code == 0)
                ret.ret = 'ok';
            else
                ret.ret = 'failed';
            res.json(ret);
        } catch (e) {
            res.json({ ret: 'failed', code: -1, message: "catch error" });
        }
    });
});


// 可以插入图时，上传图片。
routers.post('/up_image', uploadconvert.single('file'), function (req: any, res, next) {
    var fileName = req.file.filename
    try {
        res.json({ code: 0, message: "ok", file: fileName });
    } catch (e) {
        res.json({ code: -1, message: "catch error" });
    }
});
export default routers;