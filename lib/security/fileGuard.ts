import { Unzip, UnzipInflate } from 'fflate';
import { ImportError } from '@/lib/import/errors';
import { parseOptionsSchema, rawTableSchema, type ParseOptions, type RawTable } from '@/lib/import/schema';
import type { ImportAdapter } from '@/lib/import/adapters/types';
import { MAX_DOCUMENT_BYTES, MAX_ROWS, MAX_EXPANDED_BYTES, MAX_COLUMNS } from '@/lib/import/limits';
export { MAX_DOCUMENT_BYTES, MAX_ROWS, MAX_EXPANDED_BYTES, MAX_COLUMNS } from '@/lib/import/limits';
export type FileFormat = 'xlsx' | 'xls' | 'ods' | 'json' | 'xml' | 'msproject' | 'text' | 'pdf' | 'png' | 'jpeg' | 'webp' | 'heic' | 'docx' | 'pptx' | 'eml' | 'msg';
export type InspectedFile = { bytes: Buffer; fileName: string; mimeType: string; format: FileFormat; text?: string };
const formats: Record<string, FileFormat> = { xlsx: 'xlsx', xls: 'xls', ods: 'ods', json: 'json', xml: 'xml', csv: 'text', tsv: 'text', txt: 'text', pdf: 'pdf', png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', heic: 'heic', docx: 'docx', pptx: 'pptx', eml: 'eml', msg: 'msg' };
export function extension(name: string) { return name.toLowerCase().split('.').pop() ?? ''; }
export function decodeText(bytes: Buffer) {
  try {
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
    if (/[\x00-\x08\x0E-\x1F]/.test(text)) throw new Error('binary');
    return text;
  } catch { throw new ImportError('This file contains binary or invalid text. Choose a supported document.'); }
}
export function rejectDTD(text: string) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) throw new ImportError('XML files containing DOCTYPE or entity declarations are not supported. Export the file without a DTD.');
}
/** Inspect directory sizes BEFORE inflation; then stream and verify actual expanded sizes. */
export function inspectZip(bytes: Buffer): 'xlsx' | 'ods' | 'docx' | 'pptx' {
  const invalid = () => new ImportError('This spreadsheet archive is damaged or unsupported. Export it again and retry.');
  let end = -1;
  for (let pos = bytes.length - 22; pos >= Math.max(0, bytes.length - 65557); pos--) {
    if (bytes.readUInt32LE(pos) === 0x06054b50 && pos + 22 + bytes.readUInt16LE(pos + 20) === bytes.length) { end = pos; break; }
  }
  if (end < 0) throw invalid();
  const count = bytes.readUInt16LE(end + 10), length = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || count === 65535 || start === 0xffffffff || count > 2000 || start + length !== end) throw invalid();
  const entries = new Map<string, number>();
  let expanded = 0, pos = start;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || bytes.readUInt32LE(pos) !== 0x02014b50) throw invalid();
    const flags = bytes.readUInt16LE(pos + 8), method = bytes.readUInt16LE(pos + 10);
    const compressedSize = bytes.readUInt32LE(pos + 20), size = bytes.readUInt32LE(pos + 24);
    const nameLength = bytes.readUInt16LE(pos + 28), extra = bytes.readUInt16LE(pos + 30), comment = bytes.readUInt16LE(pos + 32), offset = bytes.readUInt32LE(pos + 42);
    if (pos + 46 + nameLength + extra + comment > end || offset + 30 > start || bytes.readUInt32LE(offset) !== 0x04034b50) throw invalid();
    const name = bytes.subarray(pos + 46, pos + 46 + nameLength).toString('utf8');
    if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..') || entries.has(name)) throw invalid();
    if ((flags & 1) || ![0, 8].includes(method)) throw new ImportError('Encrypted or unsupported spreadsheet archives cannot be imported. Save an unencrypted copy.');
    expanded += size;
    if (expanded > MAX_EXPANDED_BYTES || size > MAX_EXPANDED_BYTES) throw new ImportError('This spreadsheet expands beyond the 32 MB safety limit. Split it into smaller files.');
    if (compressedSize > bytes.length || offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28) + compressedSize > start) throw invalid();
    entries.set(name, size); pos += 46 + nameLength + extra + comment;
  }
  if (pos !== end) throw invalid();
  const isXlsx = entries.has('[Content_Types].xml') && entries.has('xl/workbook.xml');
  const isOds = entries.has('mimetype') && entries.has('content.xml') && entries.has('META-INF/manifest.xml');
  const isDocx=entries.has('[Content_Types].xml')&&entries.has('word/document.xml');
  const isPptx=entries.has('[Content_Types].xml')&&entries.has('ppt/presentation.xml');
  if ([...entries.keys()].some(name=>/vbaProject\.bin$/i.test(name))) throw new ImportError('Macro-enabled documents are not supported.');
  if (!isXlsx && !isOds && !isDocx && !isPptx) throw new ImportError('This ZIP file is not a supported Office or OpenDocument file.');
  let actualTotal = 0, failure: Error | null = null, odsMime = '';
  const completed = new Set<string>();
  const unzip = new Unzip(file => {
    if (!entries.has(file.name)) { failure = invalid(); return; }
    let actualSize = 0, tail = '';
    file.ondata = (error, data, final) => {
      if (error) { failure = invalid(); return; }
      actualSize += data.length; actualTotal += data.length;
      if (actualTotal > MAX_EXPANDED_BYTES || actualSize > (entries.get(file.name) ?? 0)) { failure = new ImportError('This spreadsheet expands beyond its declared size or safety limit. Export a smaller copy.'); file.terminate(); return; }
      if (/\.(?:xml|rels)$/i.test(file.name)) {
        const chunk = tail + Buffer.from(data).toString('utf8').replace(/\0/g, '');
        if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(chunk)) { failure = new ImportError('Spreadsheet XML containing DOCTYPE or entities is not supported.'); file.terminate(); return; }
        tail = chunk.slice(-40);
      }
      if (file.name === 'mimetype') {
        if (actualSize > 256) { failure = invalid(); return; }
        odsMime += Buffer.from(data).toString('utf8');
      }
      if (final) { if (actualSize !== entries.get(file.name) || completed.has(file.name)) failure = invalid(); completed.add(file.name); }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    for (let offset = 0; offset < bytes.length; offset += 1024) {
      unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
      if (failure) throw failure;
    }
  } catch (error) { if (error instanceof ImportError) throw error; throw invalid(); }
  if (completed.size !== entries.size) throw invalid();
  if (isOds && odsMime !== 'application/vnd.oasis.opendocument.spreadsheet') throw invalid();
  return isXlsx ? 'xlsx' : isOds ? 'ods' : isDocx ? 'docx' : 'pptx';
}
export async function inspectFile(input: File | Buffer | string, options: ParseOptions = {}): Promise<InspectedFile> {
  const isFile = typeof File !== 'undefined' && input instanceof File;
  const size = isFile ? input.size : typeof input === 'string' ? Buffer.byteLength(input, 'utf8') : (input as Buffer).length;
  if (size > MAX_DOCUMENT_BYTES) throw new ImportError('Documents must be 10 MB or smaller. Split this file and try again.', 413);
  if (!size) throw new ImportError('This file is empty. Choose a file containing a header and data rows.');
  const bytes = isFile ? Buffer.from(await input.arrayBuffer()) : Buffer.isBuffer(input) ? input : Buffer.from(input as string, 'utf8');
  const fileName = isFile ? input.name : options.fileName ?? 'import.txt';
  if (!fileName || fileName.length > 255) throw new ImportError('Use a file name of at most 255 characters.');
  const mimeType = (isFile ? input.type : options.mimeType ?? '').split(';')[0].toLowerCase();
  const base = { bytes, fileName, mimeType };
  if (bytes.subarray(0, 2).toString() === 'MZ' || bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || [0xfeedface, 0xfeedfacf, 0xcafebabe, 0x0061736d].includes(bytes.length >= 4 ? bytes.readUInt32BE(0) : 0)) throw new ImportError('Executable files cannot be imported, even if they have been renamed.');
  if (bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]))) return { ...base, format: inspectZip(bytes) };
  if (bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return { ...base, format: bytes.includes(Buffer.from('__properties_version1.0','utf16le')) ? 'msg' : 'xls' };
  if (bytes.subarray(0, 5).toString() === '%PDF-') return { ...base, format: 'pdf' };
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { ...base, format: 'png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ...base, format: 'jpeg' };
  if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return {...base,format:'webp'};
  if(bytes.subarray(4,8).toString()==='ftyp'&&/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(bytes.subarray(8,12).toString()))return {...base,format:'heic'};
  const text = decodeText(bytes);
  if(/^(?:[!-9;-~]+:[^\r\n]*\r?\n)+/i.test(text)&&/^(?:from|mime-version|content-type):/im.test(text))return {...base,text,format:'eml'};
  rejectDTD(text);
  const trimmed = text.trimStart();
  const format: FileFormat = /^[\[{]/.test(trimmed) ? 'json' : trimmed.startsWith('<') ? (/<(?:[\w.-]+:)?Project(?:\s|>)/.test(trimmed) && /<(?:[\w.-]+:)?Tasks(?:\s|>)/.test(trimmed) ? 'msproject' : 'xml') : 'text';
  return { ...base, text, format };
}
const guarded = Symbol('guarded-adapter');
export function guardedAdapter(adapter: ImportAdapter, allowedFormats?: FileFormat[]): ImportAdapter {
  if (guarded in adapter) return adapter;
  const parse = adapter.parse.bind(adapter);
  return Object.assign({ ...adapter, async parse(input: File | Buffer | string, options?: ParseOptions): Promise<RawTable> {
    const parsed = parseOptionsSchema.safeParse(options ?? {});
    if (!parsed.success) throw new ImportError('The selected import options are invalid. Choose a sheet or data path again.');
    const settings = { fileName: adapter.kind === 'online' ? 'online-source' : `import${adapter.accepts.extensions[0]}`, ...parsed.data };
    let fileName = settings.fileName, mimeType = settings.mimeType;
    if (adapter.kind !== 'online') {
      const file = await inspectFile(input, settings);
      const ext = `.${extension(file.fileName)}`;
      if (!adapter.accepts.extensions.includes(ext)) throw new ImportError(`Choose a supported ${adapter.label} file (${adapter.accepts.extensions.join(', ')}).`);
      const accepted = allowedFormats ?? adapter.accepts.extensions.map(ext => formats[ext.slice(1)]).filter(Boolean);
      if (!accepted.includes(file.format)) throw new ImportError('The file contents do not match its format. Export the file again instead of renaming it.');
      fileName = file.fileName; mimeType = file.mimeType;
    }
    try {
      const table = await parse(input, { ...settings, fileName, mimeType });
      if (table.rows.length > MAX_ROWS) throw new ImportError('This table has more than 5,000 rows. Split it into smaller files.');
      if (table.columns.length > MAX_COLUMNS) throw new ImportError('This table has more than 256 columns. Remove unused columns and retry.');
      const checked = rawTableSchema.safeParse(table);
      if (!checked.success) throw new ImportError('No usable table was found, or its columns are invalid. Check the file and try again.');
      return checked.data;
    } catch (error) {
      if (error instanceof ImportError || error instanceof Error && ['AiError','RateLimitError','RateLimitUnavailableError'].includes(error.name)) throw error;
      console.error('Import parser failed', { adapter: adapter.id, errorType: error instanceof Error ? error.name : 'unknown' });
      throw new ImportError(`We could not read this ${adapter.label} file. Check its contents and export it again.`);
    }
  } }, { [guarded]: true });
}
