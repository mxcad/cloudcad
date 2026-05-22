///////////////////////////////////////////////////////////////////////////////
// ‍ 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// ‍ Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.

// ‍ 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// ‍ The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement

// ‍ 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// ‍ This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials

//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import axios from "axios";
// let baseURL;
// if(process.env.NODE_ENV === 'development') {
//     baseURL = 'https://c.mxdraw3d.com';
// } else if(process.env.NODE_ENV === 'production') {
//     baseURL = 'https://c.mxdraw3d.com';
// }

const instance = axios.create({
  baseURL: "",
  headers: {
    // 'Content-Type': 'application/x-www-form-urlencoded'
  },
  withCredentials: true,
  timeout: 15000  // ‍  毫秒
// ‍ Milliseconds

})

instance.interceptors.request.use((req)=> {
  if(req.method === "post") {
    // req.data.token = localStorage.getItem("token")
    if(!req.data) req.data = {}
    req.data.token = "yjd0VY6sWG6B4pLuQ5eZ5Q=="
  }
  return req
}, (err)=> {
  return Promise.reject(err)
});

export default instance.post.bind(instance)
