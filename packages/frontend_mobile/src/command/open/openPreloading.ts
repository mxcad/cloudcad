///////////////////////////////////////////////////////////////////////////////
// ‍ 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// ‍ Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.

// ‍ 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// ‍ The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement

// ‍ 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// ‍ This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials

//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

;
import { showExternalReferenceUploadPopup } from "@/plugins/vant/components/popup/showExternalReferenceUploadPopup";
import {  MxTools } from "mxcad";
export async function processorExternalFile(fileUrl:string, hash: string):Promise<object>{
  let sPreloadJsonFile = fileUrl + "_preloading.json";
  let sPreloading = await MxTools.getJsonFromUrl(sPreloadJsonFile);
  let retdata = {ok:true,tz:false}

  if(!sPreloading) {
    return new Promise((resolve, reject) => {
      resolve(retdata)
    })
  };

  if(sPreloading.tz){
    retdata.tz = sPreloading.tz;
  }

  // ‍  http的路径，就不需要上传文件了。.
// ‍ The HTTP path eliminates the need to upload files

  let images:string[] = [];
  sPreloading.images.forEach((val:any)=>{
    if(val.substring(0, 5) != "http:" && val.substring(0, 6) != "https:"){
      images.push(val);
    }
  })
  sPreloading.images = images;

  if(sPreloading.images.length === 0 && sPreloading.externalReference.length === 0) {
    return new Promise((resolve, reject) => {
      resolve(retdata)
    })
  }
  sPreloading.hash = hash
  console.log(sPreloading)
  let ret:any = {}
  try {
    ret = await showExternalReferenceUploadPopup(sPreloading)
  } catch(e) {
  }
  

  // ‍  data 为 true表示确定 false或undefined表示取消
// ‍ If the data is true, it means it is determined. If it is false or undefined, it means it is canceled

  if(ret?.data) {
    retdata.ok = true;
  }else {
    retdata.ok = false;
  }
  return new Promise((resolve, reject) => {
    resolve(retdata)
  })
}

