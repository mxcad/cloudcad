import { Injectable } from '@nestjs/common';
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
    if (!runtimeEnabled) throw new Error('payment is disabled');
    // 三层解析（runtime > env(PAYMENT_PROVIDER) > 默认 mock），与凭据键同一出口
    return this.runtimeConfigService.getValue<string>('paymentProvider');
  }
}
