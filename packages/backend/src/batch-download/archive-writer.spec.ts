import { Test, type TestingModule } from '@nestjs/testing';
import { ArchiveWriter, ArchiveEntry } from './archive-writer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ArchiveWriter', () => {
  let service: ArchiveWriter;
  let testDir: string;

  beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-writer-test-'));
    const module: TestingModule = await Test.createTestingModule({
      providers: [ArchiveWriter],
    }).compile();
    service = module.get<ArchiveWriter>(ArchiveWriter);
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    const files = fs.readdirSync(testDir);
    for (const f of files) {
      fs.rmSync(path.join(testDir, f), { recursive: true, force: true });
    }
  });

  describe('createArchive', () => {
    const makeEntry = (name: string, content: string): ArchiveEntry => ({
      name,
      stream: require('stream').Readable.from(Buffer.from(content)),
    });

    it('should create zip archive and rename tmp to final', async () => {
      const entries: ArchiveEntry[] = [
        makeEntry('file1.dwg', 'dwg content'),
        makeEntry('file2.pdf', 'pdf content'),
      ];

      const result = await service.createArchive(entries, testDir, 'test-export');

      expect(result).toBe(path.join(testDir, 'test-export.zip'));
      expect(fs.existsSync(result)).toBe(true);
      expect(fs.statSync(result).size).toBeGreaterThan(0);

      const tmpPath = path.join(testDir, 'test-export.zip.tmp');
      expect(fs.existsSync(tmpPath)).toBe(false);
    });

    it('should use custom compression level', async () => {
      const entries: ArchiveEntry[] = [makeEntry('file.dwg', 'test')];
      const low = await service.createArchive(entries, testDir, 'low-compress', 1);
      const high = await service.createArchive(entries, testDir, 'high-compress', 9);
      expect(fs.existsSync(low)).toBe(true);
      expect(fs.existsSync(high)).toBe(true);
    });

    it('should handle empty entries list', async () => {
      const result = await service.createArchive([], testDir, 'empty-archive');
      expect(fs.existsSync(result)).toBe(true);
      expect(fs.statSync(result).size).toBeGreaterThan(0);
    });

    it('should create output directory if missing', async () => {
      const nestedDir = path.join(testDir, 'nested', 'dir');
      const entries: ArchiveEntry[] = [makeEntry('f.dwg', 'x')];
      const result = await service.createArchive(entries, nestedDir, 'nested-archive');
      expect(fs.existsSync(result)).toBe(true);
      expect(result).toBe(path.join(nestedDir, 'nested-archive.zip'));
    });

    it('should handle many entries', async () => {
      const entries: ArchiveEntry[] = [];
      for (let i = 0; i < 100; i++) {
        entries.push(makeEntry(`file-${i}.dwg`, `content-${i}`));
      }
      const result = await service.createArchive(entries, testDir, 'many-files');
      expect(fs.existsSync(result)).toBe(true);
      expect(fs.statSync(result).size).toBeGreaterThan(0);
    });

    it('should produce valid zip file', async () => {
      const entries: ArchiveEntry[] = [
        makeEntry('doc.txt', 'hello world'),
      ];
      const result = await service.createArchive(entries, testDir, 'valid-zip');
      expect(fs.existsSync(result)).toBe(true);

      const buffer = fs.readFileSync(result);
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4B);
    });
  });
});
