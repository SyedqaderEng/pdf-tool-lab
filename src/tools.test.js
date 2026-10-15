import { describe, expect, it } from 'vitest';
import {
  calculateRoi, decodeJwt, getTextMetrics, parseCsv, parsePageRanges, stringifyCsv,
} from './tools.js';

describe('PDF page ranges', () => {
  it('expands ranges and removes duplicate pages', () => {
    expect(parsePageRanges('1-3, 2, 5', 5)).toEqual([0, 1, 2, 4]);
  });

  it.each(['0', '1-6', '3-2', '1,,2', 'chapter'])('rejects invalid range %s', (value) => {
    expect(() => parsePageRanges(value, 5)).toThrow();
  });
});

describe('CSV conversion', () => {
  it('parses escaped quotes, delimiters and newlines in quoted fields', () => {
    expect(parseCsv('name,note\r\nAda,"says ""hello"",\nand leaves"')).toEqual([
      { name: 'Ada', note: 'says "hello",\nand leaves' },
    ]);
  });

  it('makes duplicate or empty headers unique', () => {
    expect(parseCsv('name,name,\nA,B,C')).toEqual([{ name: 'A', name_2: 'B', column_3: 'C' }]);
  });

  it('round trips records with delimiters, quotes and newlines', () => {
    const records = [{ name: 'Ada', note: 'hello, "world"\nagain' }, { name: 'Lin', note: 'plain' }];
    expect(parseCsv(stringifyCsv(records))).toEqual(records);
  });

  it('rejects unterminated quoted fields', () => {
    expect(() => parseCsv('name,note\nAda,"unfinished')).toThrow(/unclosed/i);
  });

  it('rejects characters after a closing quote and quotes in unquoted fields', () => {
    expect(() => parseCsv('name,note\nAda,"quoted"tail')).toThrow(/after a closing quote/i);
    expect(() => parseCsv('name,note\nAda,un"escaped')).toThrow(/must be escaped/i);
  });
});

describe('business and text calculations', () => {
  it('calculates annual profit, ROI, margin, and payback', () => {
    expect(calculateRoi(12000, 8500, 2200)).toEqual({
      monthlyProfit: 6300,
      annualProfit: 75600,
      roi: 630,
      paybackMonths: 12000 / 6300,
      margin: 6300 / 8500 * 100,
    });
  });

  it('handles zero investment and revenue without infinities', () => {
    expect(calculateRoi(0, 0, 100)).toMatchObject({ roi: null, paybackMonths: null, margin: null, annualProfit: -1200 });
  });

  it('counts words, characters, sentences and reading time', () => {
    expect(getTextMetrics('One sentence. Two!')).toEqual({ words: 3, characters: 18, charactersNoSpaces: 16, sentences: 2, readingMinutes: 1 });
  });
});

describe('JWT inspection', () => {
  it('decodes base64url header and payload without claiming signature verification', () => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'user-1' })}.signature`;
    expect(decodeJwt(token)).toMatchObject({ header: { alg: 'none', typ: 'JWT' }, payload: { sub: 'user-1' }, signature: 'signature', status: 'No expiration claim' });
  });

  it('rejects malformed tokens', () => {
    expect(() => decodeJwt('not.a.jwt.payload')).toThrow(/three non-empty/);
  });
});
