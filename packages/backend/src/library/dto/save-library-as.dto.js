var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
/**
 * 图块/图纸另存为到库的 DTO
 * 与普通的 SaveMxwebAsDto 不同，库的 save-as 不需要 targetType、projectId、format 等字段
 */
let SaveLibraryAsDto = (() => {
    var _a;
    let _file_decorators;
    let _file_initializers = [];
    let _file_extraInitializers = [];
    let _targetParentId_decorators;
    let _targetParentId_initializers = [];
    let _targetParentId_extraInitializers = [];
    let _fileName_decorators;
    let _fileName_initializers = [];
    let _fileName_extraInitializers = [];
    return _a = class SaveLibraryAsDto {
            constructor() {
                this.file = __runInitializers(this, _file_initializers, void 0);
                this.targetParentId = (__runInitializers(this, _file_extraInitializers), __runInitializers(this, _targetParentId_initializers, void 0));
                this.fileName = (__runInitializers(this, _targetParentId_extraInitializers), __runInitializers(this, _fileName_initializers, void 0));
                __runInitializers(this, _fileName_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _file_decorators = [ApiProperty({
                    description: 'mxweb 文件',
                    type: 'string',
                    format: 'binary',
                }), IsOptional()];
            _targetParentId_decorators = [ApiProperty({
                    description: '目标父节点ID',
                }), IsString()];
            _fileName_decorators = [ApiProperty({
                    description: '文件名（不含扩展名）',
                    required: false,
                }), IsString(), IsOptional()];
            __esDecorate(null, null, _file_decorators, { kind: "field", name: "file", static: false, private: false, access: { has: obj => "file" in obj, get: obj => obj.file, set: (obj, value) => { obj.file = value; } }, metadata: _metadata }, _file_initializers, _file_extraInitializers);
            __esDecorate(null, null, _targetParentId_decorators, { kind: "field", name: "targetParentId", static: false, private: false, access: { has: obj => "targetParentId" in obj, get: obj => obj.targetParentId, set: (obj, value) => { obj.targetParentId = value; } }, metadata: _metadata }, _targetParentId_initializers, _targetParentId_extraInitializers);
            __esDecorate(null, null, _fileName_decorators, { kind: "field", name: "fileName", static: false, private: false, access: { has: obj => "fileName" in obj, get: obj => obj.fileName, set: (obj, value) => { obj.fileName = value; } }, metadata: _metadata }, _fileName_initializers, _fileName_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { SaveLibraryAsDto };
//# sourceMappingURL=save-library-as.dto.js.map