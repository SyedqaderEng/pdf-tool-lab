export function parsePageRanges(value, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('The PDF contains no pages.');
  const pages = [];
  const seen = new Set();
  const parts = value.split(',').map((part) => part.trim());
  if (!parts.length || parts.some((part) => !part)) throw new Error('Enter page numbers like 1-3, 5, 8-10.');

  for (const part of parts) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) throw new Error(`Invalid page range: “${part}”.`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > pageCount) {
      throw new Error(`Range “${part}” is outside the document (1–${pageCount}).`);
    }
    for (let page = start; page <= end; page += 1) {
      if (!seen.has(page)) pages.push(page - 1);
      seen.add(page);
    }
  }
  return pages;
}

export function parseCsv(input, delimiter = ',') {
  if (delimiter.length !== 1) throw new Error('Choose a single-character delimiter.');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let quoteClosed = false;
  const text = input.replace(/^\uFEFF/, '');

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        quoteClosed = true;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
      quoteClosed = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell.length > 0) || field.length > 0) rows.push(row);
      row = [];
      field = '';
      quoteClosed = false;
    } else if (quoteClosed) {
      throw new Error('Unexpected character after a closing quote.');
    } else if (char === '"' && field.length > 0) {
      throw new Error('A quote inside a CSV field must be escaped as "".');
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  row.push(field);
  if (row.some((cell) => cell.length > 0) || field.length > 0) rows.push(row);
  if (!rows.length) return [];

  const headers = rows.shift().map((header, index) => header.trim() || `column_${index + 1}`);
  const uniqueHeaders = headers.map((header, index) => {
    let candidate = header;
    let suffix = 2;
    while (headers.slice(0, index).includes(candidate)) candidate = `${header}_${suffix++}`;
    return candidate;
  });
  return rows.map((cells) => Object.fromEntries(uniqueHeaders.map((header, index) => [header, cells[index] ?? ''])));
}

export function stringifyCsv(rows, delimiter = ',') {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const quote = (value) => {
    const text = String(value ?? '');
    return text.includes(delimiter) || /["\r\n]/.test(text)
      ? `"${text.replaceAll('"', '""')}"`
      : text;
  };
  return [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ''))]
    .map((row) => row.map(quote).join(delimiter))
    .join('\r\n');
}

export function calculateRoi(investment, monthlyRevenue, monthlyCosts) {
  const initial = Math.max(0, Number(investment) || 0);
  const revenue = Math.max(0, Number(monthlyRevenue) || 0);
  const costs = Math.max(0, Number(monthlyCosts) || 0);
  const monthlyProfit = revenue - costs;
  const annualProfit = monthlyProfit * 12;
  return {
    monthlyProfit,
    annualProfit,
    roi: initial > 0 ? (annualProfit / initial) * 100 : null,
    paybackMonths: monthlyProfit > 0 && initial > 0 ? initial / monthlyProfit : null,
    margin: revenue > 0 ? (monthlyProfit / revenue) * 100 : null,
  };
}

export function decodeJwt(token) {
  const segments = token.trim().split('.');
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw new Error('A JWT must contain three non-empty dot-separated segments.');
  }
  const decodeSegment = (segment, label) => {
    try {
      const base64 = segment.replaceAll('-', '+').replaceAll('_', '/');
      const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error(`The JWT ${label} is not valid base64url-encoded JSON.`);
    }
  };
  const header = decodeSegment(segments[0], 'header');
  const payload = decodeSegment(segments[1], 'payload');
  const expiration = Number(payload.exp);
  return {
    header,
    payload,
    signature: segments[2],
    status: Number.isFinite(expiration) ? (expiration * 1000 > Date.now() ? 'Not expired' : 'Expired') : 'No expiration claim',
  };
}

export function getTextMetrics(text) {
  const words = text.trim().match(/\S+/gu) ?? [];
  const sentences = text.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.filter((part) => part.trim()) ?? [];
  return {
    words: words.length,
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/gu, '').length,
    sentences: sentences.length,
    readingMinutes: words.length === 0 ? 0 : Math.max(1, Math.ceil(words.length / 200)),
  };
}
