import { parseSearchQuery, ParsedSearchQuery } from './search-query.parser';
import { SearchType } from '../dto/search.dto';

describe('parseSearchQuery', () => {
  const empty = (overrides: Partial<ParsedSearchQuery> = {}): ParsedSearchQuery => ({
    keyword: '',
    exactPhrase: null,
    extension: null,
    type: SearchType.ALL,
    fileStatus: null,
    dateRange: null,
    sizeRange: null,
    sortBy: null,
    sortOrder: null,
    excludeTerms: [],
    hasSyntax: false,
    ...overrides,
  });

  it('returns empty result for empty input', () => {
    expect(parseSearchQuery('')).toEqual(empty());
    expect(parseSearchQuery('   ')).toEqual(empty());
  });

  it('parses plain keyword', () => {
    const result = parseSearchQuery('hello world');
    expect(result.keyword).toBe('hello world');
    expect(result.hasSyntax).toBe(false);
  });

  it('parses extension filter', () => {
    const result = parseSearchQuery('drawing ext:.dwg');
    expect(result.keyword).toBe('drawing');
    expect(result.extension).toBe('.dwg');
    expect(result.hasSyntax).toBe(true);
  });

  it('normalizes extension without leading dot', () => {
    const result = parseSearchQuery('ext:dwg');
    expect(result.extension).toBe('.dwg');
  });

  it('parses type filter', () => {
    expect(parseSearchQuery('type:file').type).toBe(SearchType.FILE);
    expect(parseSearchQuery('type:folder').type).toBe(SearchType.FOLDER);
    expect(parseSearchQuery('type:dir').type).toBe(SearchType.FOLDER);
  });

  it('parses status filter', () => {
    const result = parseSearchQuery('plan status:completed');
    expect(result.keyword).toBe('plan');
    expect(result.fileStatus).toBe('COMPLETED');
  });

  it('parses date filter with > operator', () => {
    const result = parseSearchQuery('modified:>2024-01-01');
    expect(result.dateRange).not.toBeNull();
    expect(result.dateRange!.field).toBe('updatedAt');
    expect(result.dateRange!.operator).toBe('>');
  });

  it('parses date filter with >= operator', () => {
    const result = parseSearchQuery('created:>=2024-06-01');
    expect(result.dateRange).not.toBeNull();
    expect(result.dateRange!.field).toBe('createdAt');
    expect(result.dateRange!.operator).toBe('>=');
  });

  it('parses size filter with MB unit', () => {
    const result = parseSearchQuery('size:>10MB');
    expect(result.sizeRange).not.toBeNull();
    expect(result.sizeRange!.operator).toBe('>');
    expect(result.sizeRange!.value).toBe(10 * 1024 * 1024);
  });

  it('parses size filter with KB unit', () => {
    const result = parseSearchQuery('size:<500KB');
    expect(result.sizeRange).not.toBeNull();
    expect(result.sizeRange!.value).toBe(500 * 1024);
  });

  it('parses sort filter', () => {
    const result = parseSearchQuery('sort:name-asc');
    expect(result.sortBy).toBe('name');
    expect(result.sortOrder).toBe('asc');
  });

  it('parses exact phrase', () => {
    const result = parseSearchQuery('"building plan" ext:.dwg');
    expect(result.exactPhrase).toBe('building plan');
    expect(result.extension).toBe('.dwg');
  });

  it('parses exclude terms', () => {
    const result = parseSearchQuery('plan -old -backup');
    expect(result.keyword).toBe('plan');
    expect(result.excludeTerms).toEqual(['old', 'backup']);
  });

  it('handles mixed syntax gracefully', () => {
    const result = parseSearchQuery('project ext:.dwg type:file status:COMPLETED sort:updatedAt-desc');
    expect(result.keyword).toBe('project');
    expect(result.extension).toBe('.dwg');
    expect(result.type).toBe(SearchType.FILE);
    expect(result.fileStatus).toBe('COMPLETED');
    expect(result.sortBy).toBe('updatedAt');
    expect(result.sortOrder).toBe('desc');
  });

  it('returns hasSyntax=false for plain text', () => {
    expect(parseSearchQuery('just some words').hasSyntax).toBe(false);
  });
});
