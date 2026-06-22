import { ApiProperty } from '@nestjs/swagger';

export class PayParamsDto {
  @ApiProperty()
  appId: string;

  @ApiProperty()
  timeStamp: string;

  @ApiProperty()
  nonceStr: string;

  @ApiProperty()
  package: string;

  @ApiProperty()
  signType: string;

  @ApiProperty()
  paySign: string;
}
