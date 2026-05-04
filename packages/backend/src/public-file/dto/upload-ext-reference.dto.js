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
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
let UploadExtReferenceDto = (() => {
    var _a;
    let _srcFileHash_decorators;
    let _srcFileHash_initializers = [];
    let _srcFileHash_extraInitializers = [];
    let _extRefFile_decorators;
    let _extRefFile_initializers = [];
    let _extRefFile_extraInitializers = [];
    let _hash_decorators;
    let _hash_initializers = [];
    let _hash_extraInitializers = [];
    return _a = class UploadExtReferenceDto {
            constructor() {
                this.srcFileHash = __runInitializers(this, _srcFileHash_initializers, void 0);
                this.extRefFile = (__runInitializers(this, _srcFileHash_extraInitializers), __runInitializers(this, _extRefFile_initializers, void 0));
                this.hash = (__runInitializers(this, _extRefFile_extraInitializers), __runInitializers(this, _hash_initializers, void 0));
                __runInitializers(this, _hash_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _srcFileHash_decorators = [ApiProperty({
                    description: '源图纸文件的哈希值（主图纸文件的 hash）',
                    example: '4b298dd48355af1202b532fc4d051658',
                }), IsString(), IsNotEmpty()];
            _extRefFile_decorators = [ApiProperty({
                    description: '外部参照文件名（含扩展名）',
                    example: 'A1.dwg',
                }), IsString(), IsNotEmpty()];
            _hash_decorators = [ApiProperty({
                    description: '文件哈希值（可选，用于秒传检查）',
                    required: false,
                }), IsString(), IsOptional()];
            __esDecorate(null, null, _srcFileHash_decorators, { kind: "field", name: "srcFileHash", static: false, private: false, access: { has: obj => "srcFileHash" in obj, get: obj => obj.srcFileHash, set: (obj, value) => { obj.srcFileHash = value; } }, metadata: _metadata }, _srcFileHash_initializers, _srcFileHash_extraInitializers);
            __esDecorate(null, null, _extRefFile_decorators, { kind: "field", name: "extRefFile", static: false, private: false, access: { has: obj => "extRefFile" in obj, get: obj => obj.extRefFile, set: (obj, value) => { obj.extRefFile = value; } }, metadata: _metadata }, _extRefFile_initializers, _extRefFile_extraInitializers);
            __esDecorate(null, null, _hash_decorators, { kind: "field", name: "hash", static: false, private: false, access: { has: obj => "hash" in obj, get: obj => obj.hash, set: (obj, value) => { obj.hash = value; } }, metadata: _metadata }, _hash_initializers, _hash_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UploadExtReferenceDto };
//# sourceMappingURL=upload-ext-reference.dto.js.map