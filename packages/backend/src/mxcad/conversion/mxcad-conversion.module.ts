import { Module, forwardRef } from '@nestjs/common';
import { FileConversionService } from './file-conversion.service';
import { AsyncConversionService } from './async-conversion.service';
import { ConversionStatusController } from './conversion-status.controller';
import { MXCAD_CONVERSION_SERVICE } from '../interfaces/mxcad-service-tokens';
import { FunctionExecutorModule } from '../../function-executor/function-executor.module';
import { FileOperationsModule } from '../../file-operations/file-operations.module';

@Module({
  imports: [forwardRef(() => FunctionExecutorModule), FileOperationsModule],
  controllers: [ConversionStatusController],
  providers: [
    FileConversionService,
    AsyncConversionService,
    { provide: MXCAD_CONVERSION_SERVICE, useExisting: FileConversionService },
  ],
  exports: [
    FileConversionService,
    AsyncConversionService,
    MXCAD_CONVERSION_SERVICE,
  ],
})
export class MxcadConversionModule {}
