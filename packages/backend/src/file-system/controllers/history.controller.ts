import { Controller, Get, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FileHistoryService } from '../file-history/file-history.service';
import { FileTreeService } from '../file-tree/file-tree.service';

@ApiTags('File History')
@Controller('file-system')
export class HistoryController {
  private readonly logger = new Logger(HistoryController.name);

  constructor(
    private readonly fileHistoryService: FileHistoryService,
    private readonly fileTreeService: FileTreeService,
  ) {}

  @Get('nodes/:nodeId/history')
  @ApiOperation({ summary: '获取文件版本历史（跨存储节点透明）' })
  async getNodeHistory(@Param('nodeId') nodeId: string) {
    const node = await this.fileTreeService.getNode(nodeId);
    const nodePath = node.path || '';
    const entries = await this.fileHistoryService.getHistory(nodePath);
    return { nodeId, path: nodePath, entries };
  }
}
