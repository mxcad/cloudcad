import { Module, forwardRef } from '@nestjs/common';
import { FileConversionService } from './file-conversion.service';
import { AsyncConversionService } from './async-conversion.service';
import { UnifiedConversionService } from './conversion-task.service';
import { ConversionReconciliationService } from './conversion-reconciliation.service';
import { ConversionStatusController } from './conversion-status.controller';
import { ConversionTaskController } from './conversion-task.controller';
import { ConversionTaskSseService } from './conversion-task.sse.service';
import { MXCAD_CONVERSION_SERVICE } from '../interfaces/mxcad-service-tokens';
import { FunctionExecutorModule } from '../../function-executor/function-executor.module';
import { FileOperationsModule } from '../../file-operations/file-operations.module';

@Module({
  imports: [forwardRef(() => FunctionExecutorModule), FileOperationsModule],
  controllers: [ConversionStatusController, ConversionTaskController],
  providers: [
    FileConversionService,
    AsyncConversionService,
    UnifiedConversionService,
    ConversionReconciliationService,
    ConversionTaskSseService,
    { provide: MXCAD_CONVERSION_SERVICE, useExisting: FileConversionService },
  ],
  exports: [
    FileConversionService,
    AsyncConversionService,
    UnifiedConversionService,
    MXCAD_CONVERSION_SERVICE,
  ],
})
export class MxcadConversionModule {}
