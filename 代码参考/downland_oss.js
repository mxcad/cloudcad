"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
var express = require('express');
var router = express.Router();
var fs = require('fs');
var request = require("request");
const datasource_1 = require("../mysql/datasource");
const tools_1 = require("../tools");
const gallery_1 = require("./gallery");
const async = require("async");
function download_file(fileLink, filePath) {
    fileLink = encodeURI(fileLink);
    request({
        url: fileLink,
        method: 'GET',
        encoding: null
    }, (err, response, body) => {
        if (!err && response.statusCode === 200) {
            fs.writeFileSync(filePath, body, { encoding: "binary" });
        }
        else {
        }
    });
}
function getBlockFileDir() {
    return __dirname + "/../../public/blocks";
}
function getLocalUpLoadBlockFileDir() {
    return __dirname + "/../../local_upload_blocks";
}
function download_allfile_form_oss() {
    let local_file_dir = getLocalUpLoadBlockFileDir();
    let block_file_dir = getBlockFileDir();
    gallery_1.blocks.getAllTypes((types) => {
        let maptypes = {};
        types.allblocks.forEach(val => {
            maptypes[val.id] = val;
            if (val.pid == 0) {
                let new_file_dir = local_file_dir + "/" + val.name;
                (0, tools_1.createDir)(new_file_dir);
                let new_file_dir2 = block_file_dir + "/" + val.id;
                (0, tools_1.createDir)(new_file_dir2);
            }
        });
        types.allblocks.forEach(val => {
            if (val.pid != 0) {
                let new_file_dir = local_file_dir + "/" + maptypes[val.pid].name + "/" + val.name;
                (0, tools_1.createDir)(new_file_dir);
                let new_file_dir2 = block_file_dir + "/" + maptypes[val.pid].id + "/" + val.id;
                (0, tools_1.createDir)(new_file_dir2);
            }
        });
        gallery_1.blocks.getGallery("", 0, 0, 0, (val) => {
            let iCount = 0;
            val.forEach((dwg_data) => {
                iCount++;
                if (iCount > 10)
                    return;
                let filepath = local_file_dir + "/" + maptypes[dwg_data.firstType].name + "/" + maptypes[dwg_data.secondType].name + "/" + dwg_data.filename;
                let url = dwg_data.ossUrl;
                download_file(url, filepath);
            });
        });
    });
}
router.post('/downland/oss', function (req, res, next) {
    download_allfile_form_oss();
});
// 从oos下载所有图纸
class DownlandAllDwgFormOss {
    getFileDir() {
        return __dirname + "/../../public/drawings";
    }
    getLocalUpLoadFileDir() {
        return __dirname + "/../../local_upload_drawings";
    }
    getDwgInfo() {
        return new Promise((res, rej) => {
            let allblocks = `SELECT * FROM file_gallery`;
            async.auto({
                allblocks: (cb) => datasource_1.default.exe(allblocks, [], (rs) => cb(null, rs)),
            }, (err, result) => {
                res(result);
            });
        });
    }
    download_file(fileLink, filePath) {
        return new Promise((res, rej) => {
            fileLink = encodeURI(fileLink);
            request({
                url: fileLink,
                method: 'GET',
                encoding: null
            }, (err, response, body) => {
                if (!err && response.statusCode === 200) {
                    fs.writeFileSync(filePath, body, { encoding: "binary" });
                    res(true);
                }
                else {
                    res(false);
                }
            });
        });
    }
    do() {
        return __awaiter(this, void 0, void 0, function* () {
            let type = { 2: "建筑", 3: "给排水", 4: "电力电气", 5: "园林", 6: "交通", 7: "室内设计", 8: "机械", 9: "服装", 10: "市政", 11: "水利", 12: "水利" };
            let path = this.getLocalUpLoadFileDir();
            Object.keys(type).forEach(key => {
                let make_dir = path + "/" + type[key];
                (0, tools_1.createDir)(make_dir);
                let other_dir = make_dir + "/" + "其它";
                (0, tools_1.createDir)(other_dir);
            });
            let dwgs = yield this.getDwgInfo();
            dwgs = dwgs.allblocks;
            for (let i = 0; i < dwgs.length; i++) {
                let val = dwgs[i];
                if (type[val.professiontype]) {
                    let savePath = path + "/" + type[val.professiontype] + "/" + "其它";
                    let saveFile = savePath + "/" + val.filename + ".dwg";
                    console.log(`download_dwg_from_oss:(${dwgs.length}/${i})`);
                    yield this.download_file(val.ossUrl, saveFile);
                }
            }
        });
    }
}
;
router.post('/download_dwg_from_oss', function (req, res, next) {
    let down = new DownlandAllDwgFormOss();
    down.do();
    res.send({
        code: 0,
        msg: 'ok'
    });
});
exports.default = router;
//# sourceMappingURL=downland_oss.js.map