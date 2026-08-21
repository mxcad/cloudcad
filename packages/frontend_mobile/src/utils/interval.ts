///////////////////////////////////////////////////////////////////////////////
// ‍ 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// ‍ Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.

// ‍ 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// ‍ The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement

// ‍ 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// ‍ This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials

//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

// ‍  计时执行
// ‍ Timing execution

export function interval(ms: number, callback: Function) {
  const start = (document.timeline
    ? document.timeline.currentTime
    : performance.now()) as number;
  let isCancel = false
  function timer1(time: number) {
    if (isCancel) return
    const gaps = time - start;
    const seconds = Math.round(gaps / ms);
    callback(seconds);
    const targetNext = (seconds + 1) * ms + start; // ‍  算出下次interval开始的时间
// ‍ Calculate the start time of the next interval

    const delay = (document.timeline
      ? document.timeline.currentTime
      : performance.now()) as number; // ‍  取出更新完的时间
// ‍ Retrieve the updated time

    return setTimeout(
      () => {
        requestAnimationFrame(timer1); // ‍  requestAnimationFrame 执行回调函数的时刻 当作参数，传入到callback
// ‍ The time when requestAnimationFrame executes the callback function is taken as a parameter and passed to the callback

      },
      targetNext - delay // ‍  算出距离下次interval开始时间
// ‍ Calculate the start time of the next interval

    );
  }
  timer1(start);
  return () => {
    isCancel = true
  }
}
