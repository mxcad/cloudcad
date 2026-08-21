import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  IVersionControl,
  VERSION_CONTROL_TOKEN,
} from '../../version-control/interfaces/version-control.interface';
import type { HistoryEntry } from '../../version-control/interfaces/version-control.interface';

@Injectable()
export class FileHistoryService {
  private readonly logger = new Logger(FileHistoryService.name);

  constructor(
    @Inject(VERSION_CONTROL_TOKEN)
    private readonly versionControlService: IVersionControl,
  ) {}

  async getHistory(nodePath: string): Promise<HistoryEntry[]> {
    try {
      const result = await this.versionControlService.getFileHistory(nodePath);
      if (!result.success) {
        this.logger.warn(
          `Failed to get history for ${nodePath}: ${result.message}`
        );
        return [];
      }
      return result.entries;
    } catch (error) {
      this.logger.error(`Failed to get history for ${nodePath}: ${error.message}`);
      return [];
    }
  }
}
