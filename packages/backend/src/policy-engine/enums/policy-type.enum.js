///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
/**
 * 权限策略类型枚举
 *
 * 定义系统支持的所有策略类型
 */
export var PolicyType;
(function (PolicyType) {
    /** 时间策略 - 基于时间段的访问控制 */
    PolicyType["TIME"] = "TIME";
    /** IP 地址策略 - 基于 IP 地址的访问控制 */
    PolicyType["IP"] = "IP";
    /** 设备策略 - 基于设备类型的访问控制 */
    PolicyType["DEVICE"] = "DEVICE";
})(PolicyType || (PolicyType = {}));
/**
 * 策略类型元数据
 */
export const PolicyTypeMetadata = {
    [PolicyType.TIME]: '时间策略',
    [PolicyType.IP]: 'IP 地址策略',
    [PolicyType.DEVICE]: '设备策略',
};
//# sourceMappingURL=policy-type.enum.js.map