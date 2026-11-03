import { ForbiddenException, Injectable } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import type { PaymentGateway } from './payment-gateway.interface';
import { MockPaymentGateway } from './mock/mock-payment.gateway';
import { WechatPayGateway } from './wechat-pay/wechat-pay.gateway';

@Injectable()
export class PaymentGatewayFactory {
  private gateways: Map<string, PaymentGateway> = new Map();

  constructor(
    private runtimeConfigService: RuntimeConfigService,
    mockPaymentGateway: MockPaymentGateway,
    wechatPayGateway: WechatPayGateway,
  ) {
    this.gateways.set(mockPaymentGateway.name, mockPaymentGateway);
    this.gateways.set(wechatPayGateway.name, wechatPayGateway);
  }

  async getActiveGateway(): Promise<PaymentGateway> {
    const provider = await this.resolveProvider();
    const gateway = this.gateways.get(provider);
    if (!gateway) {
      throw new Error(`active payment gateway not found: ${provider}`);
    }
    return gateway;
  }

  getGateway(name: string): PaymentGateway {
    const gateway = this.gateways.get(name);
    if (!gateway) {
      throw new Error(`unsupported payment gateway: ${name}`);
    }
    return gateway;
  }

  getAvailableGateways(): string[] {
    return Array.from(this.gateways.keys());
  }

  private async resolveProvider(): Promise<string> {
    const runtimeEnabled = await this.runtimeConfigService.getValue<boolean>('paymentEnabled');
    // BUG-USER-02：支付功能关闭是「业务前置状态」而非服务器错误——
    // 抛 ForbiddenException(403) 而非裸 Error(→500)，与 ADR-0068「后端 403 文案
    // 原样透出」的设计一致；文案走 i18n（前端无法预判 isPublic:false 的开关，
    // 故由下单失败的错误态承载提示，而非隐藏入口）。
    if (!runtimeEnabled) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.billing.payment_disabled') ??
          '支付功能未开启，暂时无法购买或续费'
      );
    }
    // 三层解析（runtime > env(PAYMENT_PROVIDER) > 默认 mock），与凭据键同一出口
    const provider = await this.runtimeConfigService.getValue<string>('paymentProvider');

    // Mock 网关不真实收款，默认拒绝：MockPaymentGateway.queryOrder 在 15s 后自动判
    // SUCCESS，一旦支付开关打开却接到 mock，订单会静默完成、零收款、无任何异常。
    // 本地联调需显式开启 paymentMockAllowed（dangerous，默认 false）。
    if (
      provider === 'mock' &&
      !(await this.runtimeConfigService.getValue<boolean>('paymentMockAllowed'))
    ) {
      throw new Error(
        'paymentProvider=mock 不产生真实收款；本地联调请开启 paymentMockAllowed，生产环境禁止开启'
      );
    }
    return provider;
  }
}
