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
 * IP 地址策略
 *
 * 基于 IP 地址的访问控制，支持 IP 地址和 CIDR 范围
 */
export class IpPolicy extends BasePolicy {
    constructor(policyId, config) {
        super(policyId);
        this.config = config;
    }
    getType() {
        return 'IP';
    }
    getName() {
        return 'IP 地址策略';
    }
    getDescription() {
        const count = this.config.allowedIps.length + (this.config.allowedRanges?.length || 0);
        return `基于 IP 地址的访问控制，允许 ${count} 个 IP 地址/范围访问`;
    }
    async evaluate(context) {
        if (!context.ipAddress) {
            return this.createDeniedResult('未提供 IP 地址');
        }
        const ipAddress = context.ipAddress;
        // 检查拒绝列表
        if (this.config.deniedIps && this.config.deniedIps.includes(ipAddress)) {
            return this.createDeniedResult(`IP 地址 ${ipAddress} 在拒绝列表中`);
        }
        if (this.config.deniedRanges) {
            for (const range of this.config.deniedRanges) {
                if (this.isIpInRange(ipAddress, range)) {
                    return this.createDeniedResult(`IP 地址 ${ipAddress} 在拒绝范围 ${range} 中`);
                }
            }
        }
        // 检查允许列表
        if (this.config.allowedIps.includes(ipAddress)) {
            return this.createAllowedResult();
        }
        if (this.config.allowedRanges) {
            for (const range of this.config.allowedRanges) {
                if (this.isIpInRange(ipAddress, range)) {
                    return this.createAllowedResult();
                }
            }
        }
        return this.createDeniedResult(`IP 地址 ${ipAddress} 不在允许列表中`);
    }
    /**
     * 检查 IP 地址是否在 CIDR 范围内
     */
    isIpInRange(ip, cidr) {
        const [range, prefixLength] = cidr.split('/');
        if (!range || !prefixLength) {
            return false;
        }
        const prefixNum = parseInt(prefixLength, 10);
        if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 32) {
            return false;
        }
        const ipNum = this.ipToNumber(ip);
        const rangeNum = this.ipToNumber(range);
        const mask = 0xffffffff << (32 - prefixNum);
        return (ipNum & mask) === (rangeNum & mask);
    }
    /**
     * 将 IP 地址转换为数字
     */
    ipToNumber(ip) {
        const parts = ip.split('.');
        if (parts.length !== 4) {
            return 0;
        }
        let num = 0;
        for (let i = 0; i < 4; i++) {
            const part = parseInt(parts[i], 10);
            if (isNaN(part) || part < 0 || part > 255) {
                return 0;
            }
            num = (num << 8) | part;
        }
        return num >>> 0; // 转换为无符号整数
    }
    validateConfig(config) {
        if (!super.validateConfig(config)) {
            return false;
        }
        const ipConfig = config;
        // 验证允许的 IP 地址
        for (const ip of ipConfig.allowedIps) {
            if (!this.isValidIp(ip)) {
                this.logger.warn(`无效的 IP 地址: ${ip}`);
                return false;
            }
        }
        // 验证允许的 IP 范围
        if (ipConfig.allowedRanges) {
            for (const range of ipConfig.allowedRanges) {
                if (!this.isValidCidr(range)) {
                    this.logger.warn(`无效的 CIDR 范围: ${range}`);
                    return false;
                }
            }
        }
        // 验证拒绝的 IP 地址
        if (ipConfig.deniedIps) {
            for (const ip of ipConfig.deniedIps) {
                if (!this.isValidIp(ip)) {
                    this.logger.warn(`无效的拒绝 IP 地址: ${ip}`);
                    return false;
                }
            }
        }
        // 验证拒绝的 IP 范围
        if (ipConfig.deniedRanges) {
            for (const range of ipConfig.deniedRanges) {
                if (!this.isValidCidr(range)) {
                    this.logger.warn(`无效的拒绝 CIDR 范围: ${range}`);
                    return false;
                }
            }
        }
        return true;
    }
    /**
     * 验证 IP 地址格式
     */
    isValidIp(ip) {
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(ip)) {
            return false;
        }
        const parts = ip.split('.');
        for (const part of parts) {
            const num = parseInt(part, 10);
            if (isNaN(num) || num < 0 || num > 255) {
                return false;
            }
        }
        return true;
    }
    /**
     * 验证 CIDR 格式
     */
    isValidCidr(cidr) {
        const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
        if (!cidrRegex.test(cidr)) {
            return false;
        }
        const [ip, prefix] = cidr.split('/');
        if (!this.isValidIp(ip)) {
            return false;
        }
        const prefixNum = parseInt(prefix, 10);
        if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 32) {
            return false;
        }
        return true;
    }
    getConfigSchema() {
        return {
            properties: {
                allowedIps: {
                    type: 'array',
                    description: '允许的 IP 地址列表',
                    items: {
                        type: 'string',
                        description: 'IP 地址（如 192.168.1.1）',
                    },
                },
                allowedRanges: {
                    type: 'array',
                    description: '允许的 IP 范围列表（CIDR 格式）',
                    items: {
                        type: 'string',
                        description: 'CIDR 范围（如 192.168.1.0/24）',
                    },
                },
                deniedIps: {
                    type: 'array',
                    description: '拒绝的 IP 地址列表',
                    items: {
                        type: 'string',
                        description: 'IP 地址',
                    },
                },
                deniedRanges: {
                    type: 'array',
                    description: '拒绝的 IP 范围列表（CIDR 格式）',
                    items: {
                        type: 'string',
                        description: 'CIDR 范围',
                    },
                },
            },
            required: ['allowedIps'],
        };
    }
}
//# sourceMappingURL=ip-policy.js.map