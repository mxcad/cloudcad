import { Controller, Post, Get, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { AsyncConversionService } from './async-conversion.service';
import {
  ConversionStatusResponseDto,
  TriggerConversionResponseDto,
} from './dto/conversion-status.dto';

@ApiTags('Conversion')
@Controller('mxcad/conversion')
export class ConversionStatusController {
  private readonly logger = new Logger(ConversionStatusController.name);

  constructor(
    private readonly asyncConversionService: AsyncConversionService
  ) {}

  @Post('nodes/:nodeId/convert')
  @ApiOperation({ summary: '触发节点文件的异步转换' })
  @ApiParam({ name: 'nodeId', description: '文件节点 ID' })
  async triggerConversion(
    @Param('nodeId') nodeId: string
  ): Promise<TriggerConversionResponseDto> {
    const taskId = await this.asyncConversionService.convertNode(nodeId);
    this.logger.log(`Conversion triggered for node ${nodeId}: task ${taskId}`);
    return {
      taskId,
      nodeId,
      async: true,
    };
  }

  @Get('nodes/:nodeId/status')
  @ApiOperation({ summary: '查询节点文件的转换状态' })
  @ApiParam({ name: 'nodeId', description: '文件节点 ID' })
  @ApiResponse({ type: ConversionStatusResponseDto })
  async getConversionStatus(
    @Param('nodeId') nodeId: string
  ): Promise<ConversionStatusResponseDto> {
    return this.asyncConversionService.getNodeConversionStatus(nodeId);
  }
}
