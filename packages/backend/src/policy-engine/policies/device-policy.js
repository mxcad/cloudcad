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
import { BasePolicy } from './base-policy';
/**
 * 设备类型枚举
 */
export var DeviceType;
(function (DeviceType) {
    /** 桌面浏览器 */
    DeviceType["DESKTOP"] = "DESKTOP";
    /** 移动设备 */
    DeviceType["MOBILE"] = "MOBILE";
    /** 平板设备 */
    DeviceType["TABLET"] = "TABLET";
    /** API 客户端 */
    DeviceType["API_CLIENT"] = "API_CLIENT";
    /** 未知设备 */
    DeviceType["UNKNOWN"] = "UNKNOWN";
})(DeviceType || (DeviceType = {}));
/**
 * 设备策略
 *
 * 基于设备类型的访问控制，通过 User-Agent 识别设备类型
 */
export class DevicePolicy extends BasePolicy {
    constructor(policyId, config) {
        super(policyId);
        this.config = config;
    }
    getType() {
        return 'DEVICE';
    }
    getName() {
        return '设备策略';
    }
    getDescription() {
        const types = this.config.allowedTypes.join(', ');
        return `基于设备类型的访问控制，允许 ${types} 设备访问`;
    }
    async evaluate(context) {
        if (!context.userAgent) {
            return this.createDeniedResult('未提供 User-Agent');
        }
        const deviceType = this.detectDeviceType(context.userAgent);
        // 检查拒绝列表
        if (this.config.deniedTypes &&
            this.config.deniedTypes.includes(deviceType)) {
            return this.createDeniedResult(`设备类型 ${deviceType} 在拒绝列表中`);
        }
        // 检查允许列表
        if (this.config.allowedTypes.includes(deviceType)) {
            return this.createAllowedResult();
        }
        // 检查是否允许未知设备
        if (deviceType === DeviceType.UNKNOWN && this.config.allowUnknown) {
            return this.createAllowedResult();
        }
        return this.createDeniedResult(`设备类型 ${deviceType} 不在允许列表中`);
    }
    /**
     * 检测设备类型
     */
    detectDeviceType(userAgent) {
        const ua = userAgent.toLowerCase();
        // 检测移动设备
        if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop/i.test(ua)) {
            // 检测平板设备
            if (/ipad|tablet|kindle|silk/i.test(ua)) {
                return DeviceType.TABLET;
            }
            return DeviceType.MOBILE;
        }
        // 检测桌面浏览器
        if (/mozilla|chrome|safari|firefox|edge|opera|msie|trident/i.test(ua)) {
            return DeviceType.DESKTOP;
        }
        // 检测 API 客户端
        if (/curl|wget|python|java|node|axios|http/i.test(ua)) {
            return DeviceType.API_CLIENT;
        }
        return DeviceType.UNKNOWN;
    }
    validateConfig(config) {
        if (!super.validateConfig(config)) {
            return false;
        }
        const deviceConfig = config;
        // 验证允许的设备类型
        for (const type of deviceConfig.allowedTypes) {
            if (!Object.values(DeviceType).includes(type)) {
                this.logger.warn(`无效的设备类型: ${type}`);
                return false;
            }
        }
        // 验证拒绝的设备类型
        if (deviceConfig.deniedTypes) {
            for (const type of deviceConfig.deniedTypes) {
                if (!Object.values(DeviceType).includes(type)) {
                    this.logger.warn(`无效的拒绝设备类型: ${type}`);
                    return false;
                }
            }
        }
        return true;
    }
    getConfigSchema() {
        return {
            properties: {
                allowedTypes: {
                    type: 'array',
                    description: '允许的设备类型',
                    items: {
                        type: 'string',
                        description: '设备类型',
                        enum: Object.values(DeviceType),
                    },
                },
                deniedTypes: {
                    type: 'array',
                    description: '拒绝的设备类型',
                    items: {
                        type: 'string',
                        description: '设备类型',
                        enum: Object.values(DeviceType),
                    },
                },
                allowUnknown: {
                    type: 'boolean',
                    description: '是否允许未知设备',
                    default: false,
                },
            },
            required: ['allowedTypes'],
        };
    }
}
//# sourceMappingURL=device-policy.js.map