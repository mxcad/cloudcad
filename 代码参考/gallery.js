"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blocks = exports.blocksdwgPage = exports.cratePageData = exports.MxPageData = void 0;
const async = require("async");
const datasource_1 = require("../mysql/datasource");
const express_1 = require("express");
class MxBlockFileData {
}
class MxPageData {
    constructor() {
        this.index = 0;
        this.size = 0;
        this.count = 0;
        this.max = 0;
        this.up = false;
        this.down = false;
    }
}
exports.MxPageData = MxPageData;
class MxBlockFileInfo {
}
function cratePageData(pageIndex, pageSize, count) {
    var max = count / pageSize + (count % pageSize == 0 ? 0 : 1);
    var up = false;
    var down = false;
    if (pageIndex != 0) {
        up = true;
    }
    if (pageIndex < max - 1) {
        down = true;
    }
    let ret = new MxPageData();
    ret.index = pageIndex;
    ret.size = pageSize;
    ret.count = count;
    ret.max = parseInt(max);
    ret.up = up;
    ret.down = down;
    return ret;
}
exports.cratePageData = cratePageData;
class blocksdwgPage {
    //得到图块库的总数
    getGalleryCount(keywords, firstType, ret) {
        let file_galleryCount = "select count(1) c from blocks_gallery ";
        let file_gallery_where2 = " where 1=1 ";
        if (firstType != 0) {
            file_gallery_where2 += ` and firstType=${firstType}`;
        }
        if (keywords) {
            file_gallery_where2 += ` and filename like concat('%','${keywords}','%')`;
        }
        file_galleryCount += file_gallery_where2;
        datasource_1.default.do(file_galleryCount, function (rs2) {
            //查询出图库表数量
            let fileGalleryCount = rs2[0].c;
            ret(fileGalleryCount);
        });
    }
    // 得到图块库数据
    getGallery(keywords, firstType, pageSize, pageIndex, ret) {
        let file_gallery = "SELECT a.uuid, a.filename,a.firstType,a.secondType,a.filehash,b.name as type FROM blocks_gallery a LEFT JOIN blocks_type b ON a.secondType = b.id ";
        let file_gallery_where1 = " where 1=1 ";
        if (firstType != 0) {
            file_gallery_where1 += ` and a.firstType = ${firstType} `;
        }
        if (keywords) {
            file_gallery_where1 += ` and a.filename like concat('%','${keywords}','%') `;
        }
        file_gallery += file_gallery_where1;
        if (pageSize != 0) {
            file_gallery += `order by a.createTime desc limit ${pageIndex * pageSize},${pageSize} `;
        }
        datasource_1.default.do(file_gallery, function (rs1) {
            //查询图库表的数据
            let fileGalleryList = rs1 && rs1.length > 0 ? rs1 : [];
            ret(fileGalleryList);
        });
    }
    getDwgInfo(fileid, ret) {
        let sql = `SELECT * FROM blocks_file_info WHERE fileuuid IN(${fileid})`;
        datasource_1.default.do(sql, (rs) => ret(rs && rs.length > 0 ? rs : []));
    }
    deleteBlockFormName(filename, call) {
        datasource_1.default.exe("delete from blocks_gallery where filename = ?", [filename], function (rs) { call(rs); });
    }
    deleteTypeFormName(name, call) {
        datasource_1.default.exe("delete from blocks_type where name = ?", [name], function (rs) { call(rs); });
    }
    getBlock(filename, firstType, secondType, call) {
        let sql = `SELECT * FROM blocks_gallery WHERE filename = '${filename}' AND secondType = ${secondType} AND firstType = ${firstType}`;
        datasource_1.default.do(sql, (rs) => call(rs && rs.length > 0 ? rs : []));
    }
    setBlockFileHash(filename, hash, call) {
        //mysql.exe('update blocks_gallery set ossImg = ?,filename = ?,ossUrl = ?,uploadState =1 where uuid = ?', [imgUrl, file.originalname, ossUrl, uuid], function () { })
        datasource_1.default.exe("update blocks_gallery set filehash = ? WHERE filename = ?", [hash, filename], function (rs) { call(rs); });
    }
    getTypesFromName(name, call) {
        let sql = `SELECT * FROM blocks_type WHERE name = '${name}'`;
        datasource_1.default.do(sql, (rs) => call(rs && rs.length > 0 ? rs : []));
    }
    getTypeFromId(id, call) {
        let sql = `SELECT * FROM blocks_type WHERE id = ${id}`;
        datasource_1.default.do(sql, (rs) => call(rs && rs.length > 0 ? rs : []));
    }
    getTypes(ret) {
        //https://www.runoob.com/sql/sql-join.html
        // 从blocks_type表中查找到所有数据到a，从从blocks_type表中查找到name数据并改名为pname到b,然后把a,b表合并，合并条件是a.pid等于b.id.  并且a.status = 1 AND a.pid!= 0
        let allblocks = `SELECT a.*,b.name AS pname FROM blocks_type  a  JOIN  blocks_type b ON a.pid = b.id WHERE a.status = 1 AND a.pid!= 0`;
        async.auto({
            allblocks: (cb) => datasource_1.default.exe(allblocks, [], (rs) => cb(null, rs)),
        }, (err, result) => {
            ret(result);
        });
    }
    getAllTypes(ret) {
        let allblocks = `SELECT * FROM blocks_type`;
        async.auto({
            allblocks: (cb) => datasource_1.default.exe(allblocks, [], (rs) => cb(null, rs)),
        }, (err, result) => {
            ret(result);
        });
    }
}
exports.blocksdwgPage = blocksdwgPage;
/*
let data =  {};
axios({
   method: "post",
   url: "http://localhost:1337/gallery/blocks/types",
   data
 }).then((ret) => {
     alert(JSON.stringify(ret.data))
 }).catch((err)=>{alert("网络错误") })
*/
exports.blocks = new blocksdwgPage();
const routers = (0, express_1.Router)();
routers.post("/blocks/types", function (req, res) {
    exports.blocks.getTypes(function (result) {
        res.send({
            code: "success",
            result: result,
        });
    });
});
/*
let data =  {pageIndex:0,pageSize:20,firstType:1,keywords:"箭头"};
axios({
   method: "post",
   url: "http://localhost:1337/gallery/blocks/filelist",
   data
 }).then((ret) => {
     alert(JSON.stringify(ret.data))
 }).catch((err)=>{alert("网络错误") })
*/
routers.post("/blocks/filelist", function (req, res) {
    let keywords = req.body.keywords || "";
    let firstType = req.body.firstType || 0;
    let pageIndex = req.body.pageIndex || 0;
    let pageSize = req.body.pageSize || 50;
    if (typeof (pageIndex) == 'string') {
        pageIndex = parseInt(pageIndex);
    }
    if (typeof (pageSize) == 'string') {
        pageSize = parseInt(pageSize);
    }
    async.auto({
        galleryCount: (cb) => exports.blocks.getGalleryCount(keywords, firstType, (rs) => cb(null, rs)),
    }, (err, result) => {
        exports.blocks.getGallery(keywords, firstType, pageSize, pageIndex, (galleryDwgDatas) => {
            let fileIDs = [];
            galleryDwgDatas.forEach(function (e) {
                fileIDs.push('"' + e.uuid + '"');
            });
            if (fileIDs.length == 0) {
                // 返回空的数据.
                let data = {};
                data.sharedwgs = galleryDwgDatas;
                data.page = cratePageData(pageIndex, pageSize, result.galleryCount);
                res.send(data);
            }
            else {
                exports.blocks.getDwgInfo(fileIDs, (rs) => {
                    galleryDwgDatas.forEach(function (e) {
                        e.collect = false;
                    });
                    for (var i = 0; i < galleryDwgDatas.length; i++) {
                        for (var j = 0; j < rs.length; j++) {
                            if (galleryDwgDatas[i].uuid === rs[j].fileuuid) {
                                galleryDwgDatas[i].lookNum = rs[j].lookNum;
                                galleryDwgDatas[i].likeNum = rs[j].likeNum;
                                break;
                            }
                            else {
                                galleryDwgDatas[i].lookNum = 0;
                                galleryDwgDatas[i].likeNum = 0;
                            }
                        }
                    }
                    let data = {};
                    data.sharedwgs = galleryDwgDatas;
                    data.page = cratePageData(pageIndex, pageSize, result.galleryCount);
                    res.send(data);
                });
            }
        });
    });
});
exports.default = routers;
//# sourceMappingURL=gallery.js.map