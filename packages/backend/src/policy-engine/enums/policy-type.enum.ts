///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 权限策略类型枚举
 *
 * 定义系统支持的所有策略类型
 */
export enum PolicyType {
  /** 时间策略 - 基于时间段的访问控制 */
  TIME = 'TIME',

  /** IP 地址策略 - 基于 IP 地址的访问控制 */
  IP = 'IP',

  /** 设备策略 - 基于设备类型的访问控制 */
  DEVICE = 'DEVICE',
}

/**
 * 策略类型元数据
 */
export const PolicyTypeMetadata: Record<PolicyType, string> = {
  [PolicyType.TIME]: '时间策略',
  [PolicyType.IP]: 'IP 地址策略',
  [PolicyType.DEVICE]: '设备策略',
};
