import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeftRight, ArrowUp, ArrowUpRight, Braces, Briefcase,
  ChevronDown, ChevronRight, CircleHelp, Clipboard, FileImage, FileText,
  Files, Fingerprint, GraduationCap, KeyRound, Layers3, Menu, MoveRight,
  Search, ShieldCheck, Table2, Terminal, Type, Upload, UserCog, WandSparkles,
  X, Zap,
} from 'lucide-react';
import {
  calculateRoi, decodeJwt, getTextMetrics, parseCsv, parsePageRanges, stringifyCsv,
} from './tools.js';

const tools = [
  { id: 'merge', name: 'Merge PDFs', description: 'Combine files, reorder them, rotate pages and add dividers.', category: 'PDF', icon: Files },
  { id: 'split', name: 'Split PDF', description: 'Extract page ranges or package every page separately.', category: 'PDF', icon: FileText },
  { id: 'optimize', name: 'Optimize PDF', description: 'Rewrite PDF structure and compare the resulting file size.', category: 'PDF', icon: ArrowDown },
  { id: 'image', name: 'Image converter', description: 'Resize and export images as PNG, JPEG or WebP.', category: 'Image', icon: FileImage },
  { id: 'key', name: 'Color key', description: 'Remove a flat color background and export a transparent PNG.', category: 'Image', icon: WandSparkles },
  { id: 'json', name: 'JSON formatter', description: 'Validate, format, minify or sort JSON data.', category: 'Developer', icon: Braces },
  { id: 'jwt', name: 'JWT decoder', description: 'Inspect token claims and expiration without verifying signatures.', category: 'Developer', icon: KeyRound },
  { id: 'base64', name: 'Base64', description: 'Encode and decode UTF-8 text safely.', category: 'Developer', icon: ArrowLeftRight },
  { id: 'hash', name: 'Hash & UUID', description: 'Generate SHA digests and RFC 4122 version 4 identifiers.', category: 'Developer', icon: Fingerprint },
  { id: 'text', name: 'Text tools', description: 'Count, transform, deduplicate and replace text.', category: 'Text', icon: Type },
  { id: 'csv', name: 'CSV ↔ JSON', description: 'Convert quoted tabular data in either direction.', category: 'Data', icon: Table2 },
  { id: 'roi', name: 'SaaS ROI', description: 'Estimate profit, return, margin and payback from your inputs.', category: 'Business', icon: ArrowDown },
];

const categories = ['All tools', ...new Set(tools.map((tool) => tool.category))];
const bytesLabel = (bytes) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KB`
  : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const safeName = (name) => name.replace(/\.pdf$/i, '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 80) || 'document';
const jsonText = (value) => JSON.stringify(value, null, 2);

function Field({ label, children, hint }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

function TextArea({ className = '', ...props }) {
  return <textarea className={`input textarea ${className}`} spellCheck="false" {...props} />;
}

function ActionButton({ children, variant = 'primary', ...props }) {
  return <button className={`button button-${variant}`} {...props}>{children}</button>;
}

function OutputMessage({ error, children }) {
  if (!children && !error) return null;
  return <div className={`notice ${error ? 'notice-error' : 'notice-success'}`} role="status">{error || children}</div>;
}

function FilePicker({ accept, multiple = false, files, onChange, title, detail }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const acceptFiles = (incoming) => onChange(Array.from(incoming ?? []));
  return <div
    className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
    onClick={() => input.current?.click()}
    onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFiles(event.dataTransfer.files); }}
    role="button"
    tabIndex={0}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') input.current?.click(); }}
  >
    <input ref={input} type="file" accept={accept} multiple={multiple} hidden onClick={(event) => event.stopPropagation()} onChange={(event) => acceptFiles(event.target.files)} />
    <span className="drop-icon"><Upload size={19} /></span>
    <span className="drop-copy"><strong>{files?.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : title}</strong><small>{files?.length ? files.map((file) => file.name).join(' · ') : detail}</small></span>
    <span className="drop-browse">Browse</span>
  </div>;
}

function MergePdf() {
  const [files, setFiles] = useState([]);
  const [name, setName] = useState('merged-document.pdf');
  const [dividers, setDividers] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const reorder = (index, offset) => setFiles((current) => {
    const next = [...current];
    const target = index + offset;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const merge = async () => {
    setError(''); setMessage('');
    if (files.length < 2) return setError('Choose at least two PDF files to merge.');
    if (files.reduce((total, file) => total + file.size, 0) > 250 * 1024 * 1024) return setError('The combined upload limit is 250 MB.');
    setBusy(true);
    try {
      const { PDFDocument, degrees } = await import('pdf-lib');
      const output = await PDFDocument.create();
      for (const file of files) {
        if (file.size > 100 * 1024 * 1024) throw new Error(`${file.name} exceeds the 100 MB per-file limit.`);
        const source = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
        const pages = await output.copyPages(source, source.getPageIndices());
        pages.forEach((page) => {
          if (rotation) page.setRotation(degrees((page.getRotation().angle + rotation) % 360));
          output.addPage(page);
        });
        if (dividers && file !== files.at(-1)) output.addPage([612, 792]);
      }
      const blob = new Blob([await output.save({ useObjectStreams: true })], { type: 'application/pdf' });
      downloadBlob(blob, name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`);
      setMessage(`Merged ${files.length} files into ${bytesLabel(blob.size)}.`);
    } catch (cause) {
      setError(cause.message || 'Could not read these PDF files.');
    } finally { setBusy(false); }
  };
  return <>
    <FilePicker accept="application/pdf,.pdf" multiple files={files} onChange={(next) => setFiles((current) => [...current, ...next].filter((file, index, all) => all.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index))} title="Drop PDFs here or choose files" detail="PDF files only · Up to 100 MB each · Files stay in this browser" />
    {files.length > 0 && <div className="file-list">{files.map((file, index) => <div className="file-row" key={`${file.name}-${file.lastModified}`}><span className="file-index">{String(index + 1).padStart(2, '0')}</span><span className="file-details"><strong>{file.name}</strong><small>{bytesLabel(file.size)}</small></span><button className="icon-button" title="Move up" aria-label={`Move ${file.name} up`} onClick={() => reorder(index, -1)}><ArrowUp size={16} /></button><button className="icon-button" title="Move down" aria-label={`Move ${file.name} down`} onClick={() => reorder(index, 1)}><ArrowDown size={16} /></button><button className="icon-button remove-button" title="Remove file" aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, i) => i !== index))}><X size={16} /></button></div>)}</div>}
    <div className="form-grid">
      <Field label="Output file name"><input className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /></Field>
      <Field label="Page rotation"><select className="input" value={rotation} onChange={(event) => setRotation(Number(event.target.value))}><option value="0">No rotation</option><option value="90">Rotate all pages 90° clockwise</option><option value="180">Rotate all pages 180°</option><option value="270">Rotate all pages 270° clockwise</option></select></Field>
    </div>
    <label className="check-row"><input type="checkbox" checked={dividers} onChange={(event) => setDividers(event.target.checked)} /> Add a blank page between files</label>
    <div className="tool-actions"><ActionButton onClick={merge} disabled={busy}>{busy ? 'Merging…' : 'Merge and download'}</ActionButton></div>
    <OutputMessage error={error}>{message}</OutputMessage>
  </>;
}

function SplitPdf() {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('range');
  const [range, setRange] = useState('1-3');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const split = async () => {
    setError(''); setMessage('');
    if (!file) return setError('Choose a PDF to split.');
    if (file.size > 100 * 1024 * 1024) return setError('PDF files must be smaller than 100 MB.');
    setBusy(true);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const JSZip = (await import('jszip')).default;
      const source = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
      const count = source.getPageCount();
      if (count > 500) throw new Error('This tool supports PDFs with up to 500 pages.');
      const selected = mode === 'range' ? parsePageRanges(range, count) : source.getPageIndices();
      if (mode === 'range') {
        const output = await PDFDocument.create();
        const pages = await output.copyPages(source, selected);
        pages.forEach((page) => output.addPage(page));
        downloadBlob(new Blob([await output.save({ useObjectStreams: true })], { type: 'application/pdf' }), `${safeName(file.name)}-pages.pdf`);
        setMessage(`Exported ${selected.length} page${selected.length === 1 ? '' : 's'} from a ${count}-page PDF.`);
      } else {
        const zip = new JSZip();
        for (const index of selected) {
          const output = await PDFDocument.create();
          const [page] = await output.copyPages(source, [index]);
          output.addPage(page);
          zip.file(`${safeName(file.name)}-page-${String(index + 1).padStart(3, '0')}.pdf`, await output.save({ useObjectStreams: true }));
        }
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        downloadBlob(blob, `${safeName(file.name)}-pages.zip`);
        setMessage(`Packaged ${count} individual pages (${bytesLabel(blob.size)}).`);
      }
    } catch (cause) { setError(cause.message || 'Could not split this PDF.'); }
    finally { setBusy(false); }
  };
  return <>
    <FilePicker accept="application/pdf,.pdf" files={file ? [file] : []} onChange={(next) => setFile(next[0] ?? null)} title="Choose a PDF to split" detail="PDF files only · Processed locally" />
    <div className="form-grid">
      <Field label="Split method"><select className="input" value={mode} onChange={(event) => setMode(event.target.value)}><option value="range">Extract page range</option><option value="all">Export every page separately (ZIP)</option></select></Field>
      {mode === 'range' && <Field label="Pages"><input className="input" value={range} onChange={(event) => setRange(event.target.value)} placeholder="1-3, 5, 8-10" /><span className="field-hint">Page numbers start at 1. Example: 1-3, 5, 8-10</span></Field>}
    </div>
    <div className="tool-actions"><ActionButton onClick={split} disabled={busy}>{busy ? 'Preparing…' : 'Split and download'}</ActionButton></div>
    <OutputMessage error={error}>{message}</OutputMessage>
  </>;
}

function OptimizePdf() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const optimize = async () => {
    setError(''); setMessage('');
    if (!file) return setError('Choose a PDF to optimize.');
    if (file.size > 100 * 1024 * 1024) return setError('PDF files must be smaller than 100 MB.');
    setBusy(true);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const document = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
      const output = await document.save({ useObjectStreams: true, objectsPerTick: 50 });
      downloadBlob(new Blob([output], { type: 'application/pdf' }), `${safeName(file.name)}-optimized.pdf`);
      const difference = file.size - output.length;
      setMessage(`Original ${bytesLabel(file.size)} · Output ${bytesLabel(output.length)} · ${difference >= 0 ? `${bytesLabel(difference)} smaller` : `${bytesLabel(-difference)} larger`}. Structural rewrite only; embedded images are not downsampled.`);
    } catch (cause) { setError(cause.message || 'Could not optimize this PDF.'); }
    finally { setBusy(false); }
  };
  return <><FilePicker accept="application/pdf,.pdf" files={file ? [file] : []} onChange={(next) => setFile(next[0] ?? null)} title="Choose a PDF to optimize" detail="Rewrites PDF object streams; may not reduce every file" /><div className="tool-actions"><ActionButton onClick={optimize} disabled={busy}>{busy ? 'Optimizing…' : 'Optimize and download'}</ActionButton></div><OutputMessage error={error}>{message}</OutputMessage></>;
}

function useObjectUrl(file) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) { setUrl(''); return undefined; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The selected file is not a supported image.')); };
    image.src = url;
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob || blob.type !== type) reject(new Error(`This browser cannot export ${type}.`));
    else resolve(blob);
  }, type, quality));
}

function ImageTool({ colorKey = false }) {
  const [file, setFile] = useState(null);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [format, setFormat] = useState('image/webp');
  const [quality, setQuality] = useState(85);
  const [background, setBackground] = useState('#ffffff');
  const [tolerance, setTolerance] = useState(36);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const preview = useObjectUrl(file);
  const process = async () => {
    setError(''); setMessage('');
    if (!file) return setError('Choose an image first.');
    if (file.size > 50 * 1024 * 1024) return setError('Images must be smaller than 50 MB.');
    setBusy(true);
    try {
      const image = await loadImage(file);
      const outputWidth = colorKey ? image.naturalWidth : Number(width) || image.naturalWidth;
      const outputHeight = colorKey ? image.naturalHeight : Number(height) || image.naturalHeight;
      if (outputWidth < 1 || outputHeight < 1 || outputWidth * outputHeight > 40000000) throw new Error('Output dimensions must be positive and below 40 megapixels.');
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth; canvas.height = outputHeight;
      const context = canvas.getContext('2d', { willReadFrequently: colorKey });
      if (!context) throw new Error('Canvas processing is unavailable in this browser.');
      if (!colorKey && format === 'image/jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, outputWidth, outputHeight); }
      context.drawImage(image, 0, 0, outputWidth, outputHeight);
      if (colorKey) {
        const pixels = context.getImageData(0, 0, outputWidth, outputHeight);
        const target = [1, 3, 5].map((start) => Number.parseInt(background.slice(start, start + 2), 16));
        const limit = tolerance * tolerance * 3;
        for (let index = 0; index < pixels.data.length; index += 4) {
          const distance = (pixels.data[index] - target[0]) ** 2 + (pixels.data[index + 1] - target[1]) ** 2 + (pixels.data[index + 2] - target[2]) ** 2;
          if (distance <= limit) pixels.data[index + 3] = 0;
        }
        context.putImageData(pixels, 0, 0);
      }
      const blob = await canvasBlob(canvas, colorKey ? 'image/png' : format, quality / 100);
      downloadBlob(blob, `${safeName(file.name)}-${colorKey ? 'color-key' : 'converted'}.${colorKey ? 'png' : format.split('/')[1]}`);
      setMessage(`Exported ${outputWidth} × ${outputHeight} px · ${bytesLabel(blob.size)}.`);
    } catch (cause) { setError(cause.message || 'Image processing failed.'); }
    finally { setBusy(false); }
  };
  return <>
    <FilePicker accept="image/*" files={file ? [file] : []} onChange={(next) => { const selected = next[0] ?? null; setFile(selected); setError(''); setMessage(''); if (selected) { const url = URL.createObjectURL(selected); const image = new window.Image(); image.onload = () => { setWidth(String(image.naturalWidth)); setHeight(String(image.naturalHeight)); URL.revokeObjectURL(url); }; image.onerror = () => URL.revokeObjectURL(url); image.src = url; } }} title="Choose an image" detail="PNG, JPEG, WebP and browser-supported image formats · Up to 50 MB" />
    {preview && <div className="image-preview"><img src={preview} alt="Selected image preview" /><span>{file.name} · {bytesLabel(file.size)}</span></div>}
    {colorKey ? <div className="form-grid"><Field label="Background color"><input className="color-input" type="color" value={background} onChange={(event) => setBackground(event.target.value)} /></Field><Field label={`Color tolerance · ${tolerance}`}><input className="range-input" type="range" min="5" max="120" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} /><span className="field-hint">Removes matching flat-color pixels only; this is not AI subject detection.</span></Field></div> : <><div className="form-grid"><Field label="Width (px)"><input className="input" type="number" min="1" max="10000" value={width} onChange={(event) => setWidth(event.target.value)} /></Field><Field label="Height (px)"><input className="input" type="number" min="1" max="10000" value={height} onChange={(event) => setHeight(event.target.value)} /></Field><Field label="Output format"><select className="input" value={format} onChange={(event) => setFormat(event.target.value)}><option value="image/webp">WebP</option><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option></select></Field></div><Field label={`Quality · ${quality}%`}><input className="range-input" type="range" min="10" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></Field></>}
    <div className="tool-actions"><ActionButton onClick={process} disabled={busy}>{busy ? 'Processing…' : colorKey ? 'Remove color and download PNG' : 'Convert and download'}</ActionButton></div><OutputMessage error={error}>{message}</OutputMessage>
  </>;
}

function JsonTool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const transform = (mode) => {
    setError('');
    try {
      const parsed = JSON.parse(input);
      const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value;
      setOutput(JSON.stringify(mode === 'sort' ? sortKeys(parsed) : parsed, null, mode === 'minify' ? 0 : 2));
    } catch (cause) { setOutput(''); setError(`${cause.message}`); }
  };
  const copy = async () => { if (output) await navigator.clipboard.writeText(output); };
  return <><div className="editor-grid"><Field label="Input JSON"><TextArea rows={12} value={input} onChange={(event) => setInput(event.target.value)} placeholder={'Paste JSON here\n{"status":"ready"}'} /></Field><Field label="Result"><TextArea rows={12} value={output} readOnly placeholder="Formatted output appears here" /></Field></div><div className="tool-actions"><ActionButton onClick={() => transform('format')}>Format</ActionButton><ActionButton variant="secondary" onClick={() => transform('minify')}>Minify</ActionButton><ActionButton variant="secondary" onClick={() => transform('sort')}>Sort keys</ActionButton><ActionButton variant="quiet" onClick={copy}><Clipboard size={15} /> Copy result</ActionButton></div><OutputMessage error={error}>{!error && output ? 'Valid JSON.' : ''}</OutputMessage></>;
}

function JwtTool() {
  const [input, setInput] = useState('');
  const [decoded, setDecoded] = useState(null);
  const [error, setError] = useState('');
  const inspect = () => { try { setDecoded(decodeJwt(input)); setError(''); } catch (cause) { setDecoded(null); setError(cause.message); } };
  return <><Field label="Encoded JWT"><TextArea rows={5} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste a three-part JWT" /></Field><div className="tool-actions"><ActionButton onClick={inspect}>Decode token</ActionButton></div><OutputMessage error={error} />{decoded && <><div className="notice notice-warning"><ShieldCheck size={17} /> Decoded locally. The token signature is not verified; do not treat these claims as trusted.</div><p className="token-state">Expiration: <strong>{decoded.status}</strong></p><div className="editor-grid"><Field label="Header"><TextArea rows={7} readOnly value={jsonText(decoded.header)} /></Field><Field label="Payload"><TextArea rows={7} readOnly value={jsonText(decoded.payload)} /></Field></div><Field label="Signature segment"><TextArea rows={3} readOnly value={decoded.signature} /></Field></>}</>;
}

function Base64Tool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const encode = () => { setError(''); try { const bytes = new TextEncoder().encode(input); let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); setOutput(btoa(binary)); } catch { setError('Could not encode this text.'); } };
  const decode = () => { setError(''); try { const binary = atob(input.replace(/\s/g, '')); setOutput(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))); } catch { setOutput(''); setError('Input is not valid Base64-encoded UTF-8 text.'); } };
  return <><div className="editor-grid"><Field label="Input"><TextArea rows={9} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Text or Base64" /></Field><Field label="Output"><TextArea rows={9} value={output} readOnly placeholder="Result" /></Field></div><div className="tool-actions"><ActionButton onClick={encode}>Encode text</ActionButton><ActionButton variant="secondary" onClick={decode}>Decode Base64</ActionButton><ActionButton variant="quiet" onClick={() => navigator.clipboard.writeText(output)}><Clipboard size={15} /> Copy result</ActionButton></div><OutputMessage error={error} /></>;
}

function HashTool() {
  const [input, setInput] = useState('');
  const [algorithm, setAlgorithm] = useState('SHA-256');
  const [digest, setDigest] = useState('');
  const [uuids, setUuids] = useState([]);
  const [error, setError] = useState('');
  const hash = async () => { setError(''); try { const data = await crypto.subtle.digest(algorithm, new TextEncoder().encode(input)); setDigest([...new Uint8Array(data)].map((byte) => byte.toString(16).padStart(2, '0')).join('')); } catch { setError('Secure hashing requires a browser context with Web Crypto enabled.'); } };
  return <><Field label="Text to hash"><TextArea rows={5} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Enter text to hash" /></Field><div className="form-grid"><Field label="Algorithm"><select className="input" value={algorithm} onChange={(event) => setAlgorithm(event.target.value)}><option>SHA-256</option><option>SHA-384</option><option>SHA-512</option><option>SHA-1</option></select></Field><div className="field"><span className="field-label">UUID v4 batch</span><div className="inline-actions"><ActionButton variant="secondary" onClick={() => setUuids(Array.from({ length: 5 }, () => crypto.randomUUID()))}>Generate 5 UUIDs</ActionButton></div></div></div>{digest && <Field label={`${algorithm} digest`}><div className="digest-value">{digest}<button className="icon-button" aria-label="Copy digest" onClick={() => navigator.clipboard.writeText(digest)}><Clipboard size={16} /></button></div></Field>}{uuids.length > 0 && <Field label="UUID v4 identifiers"><TextArea rows={5} readOnly value={uuids.join('\n')} /></Field>}<div className="tool-actions"><ActionButton onClick={hash}>Generate digest</ActionButton></div><OutputMessage error={error} /></>;
}

function TextTool() {
  const [text, setText] = useState('');
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const metrics = getTextMetrics(text);
  const transform = (kind) => {
    if (kind === 'upper') setText(text.toLocaleUpperCase());
    if (kind === 'lower') setText(text.toLocaleLowerCase());
    if (kind === 'title') setText(text.toLocaleLowerCase().replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase()));
    if (kind === 'slug') setText(text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    if (kind === 'unique') setText([...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].join('\n'));
    if (kind === 'replace' && find) setText(text.replaceAll(find, replace));
  };
  return <><div className="metrics-grid">{[['Words', metrics.words], ['Characters', metrics.characters], ['No spaces', metrics.charactersNoSpaces], ['Sentences', metrics.sentences], ['Read time', `${metrics.readingMinutes} min`]].map(([label, value]) => <div className="metric" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><Field label="Text"><TextArea rows={9} value={text} onChange={(event) => setText(event.target.value)} placeholder="Write or paste text" /></Field><div className="form-grid"><Field label="Find"><input className="input" value={find} onChange={(event) => setFind(event.target.value)} /></Field><Field label="Replace with"><input className="input" value={replace} onChange={(event) => setReplace(event.target.value)} /></Field></div><div className="tool-actions"><ActionButton onClick={() => transform('upper')}>UPPERCASE</ActionButton><ActionButton variant="secondary" onClick={() => transform('lower')}>lowercase</ActionButton><ActionButton variant="secondary" onClick={() => transform('title')}>Title case</ActionButton><ActionButton variant="secondary" onClick={() => transform('slug')}>Slug</ActionButton><ActionButton variant="secondary" onClick={() => transform('unique')}>Remove duplicate lines</ActionButton><ActionButton variant="quiet" onClick={() => transform('replace')}>Find and replace</ActionButton></div></>;
}

function CsvTool() {
  const [direction, setDirection] = useState('csv-json');
  const [input, setInput] = useState('');
  const [delimiter, setDelimiter] = useState(',');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const convert = () => {
    setError('');
    try {
      if (direction === 'csv-json') setOutput(jsonText(parseCsv(input, delimiter)));
      else {
        const value = JSON.parse(input);
        if (!Array.isArray(value) || value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Input must be an array of JSON objects.');
        setOutput(stringifyCsv(value, delimiter));
      }
    } catch (cause) { setOutput(''); setError(cause.message || 'Could not convert the provided data.'); }
  };
  const save = () => downloadBlob(new Blob([output], { type: direction === 'csv-json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' }), direction === 'csv-json' ? 'converted.json' : 'converted.csv');
  return <><div className="form-grid"><Field label="Direction"><select className="input" value={direction} onChange={(event) => { setDirection(event.target.value); setOutput(''); setError(''); }}><option value="csv-json">CSV to JSON</option><option value="json-csv">JSON to CSV</option></select></Field><Field label="Delimiter"><select className="input" value={delimiter} onChange={(event) => setDelimiter(event.target.value)}><option value=",">Comma</option><option value=";">Semicolon</option><option value="\t">Tab</option></select></Field></div><div className="editor-grid"><Field label="Input"><TextArea rows={10} value={input} onChange={(event) => setInput(event.target.value)} placeholder={direction === 'csv-json' ? 'name,role\nAda,Engineer' : '[{"name":"Ada","role":"Engineer"}]'} /></Field><Field label="Output"><TextArea rows={10} readOnly value={output} placeholder="Converted data" /></Field></div><div className="tool-actions"><ActionButton onClick={convert}>Convert data</ActionButton><ActionButton variant="secondary" disabled={!output} onClick={save}>Download result</ActionButton></div><OutputMessage error={error}>{!error && output ? 'Conversion complete.' : ''}</OutputMessage></>;
}

function RoiTool() {
  const [investment, setInvestment] = useState(12000);
  const [revenue, setRevenue] = useState(8500);
  const [costs, setCosts] = useState(2200);
  const result = calculateRoi(investment, revenue, costs);
  const currency = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  const rows = [['Initial investment', currency(Number(investment) || 0)], ['Monthly revenue', currency(Number(revenue) || 0)], ['Monthly operating costs', currency(Number(costs) || 0)], ['Monthly net profit', currency(result.monthlyProfit)], ['Annual net profit', currency(result.annualProfit)], ['Annualized ROI', result.roi === null ? 'Not available' : `${result.roi.toFixed(1)}%`], ['Net margin', result.margin === null ? 'Not available' : `${result.margin.toFixed(1)}%`], ['Estimated payback', result.paybackMonths === null ? 'Not reached' : `${result.paybackMonths.toFixed(1)} months`]];
  return <><div className="form-grid"><Field label="Initial investment (USD)"><input className="input" type="number" min="0" step="100" value={investment} onChange={(event) => setInvestment(event.target.value)} /></Field><Field label="Monthly revenue (USD)"><input className="input" type="number" min="0" step="100" value={revenue} onChange={(event) => setRevenue(event.target.value)} /></Field><Field label="Monthly costs (USD)"><input className="input" type="number" min="0" step="100" value={costs} onChange={(event) => setCosts(event.target.value)} /></Field></div><div className="results-grid">{rows.map(([label, value], index) => <div className={index > 2 ? 'result-cell' : 'result-cell result-subtle'} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="field-hint">Annualized ROI = (12-month net profit ÷ initial investment) × 100. This is a projection, not financial advice.</p><div className="tool-actions"><ActionButton variant="secondary" onClick={() => downloadBlob(new Blob([['Metric,Value', ...rows.map(([label, value]) => `${JSON.stringify(label)},${JSON.stringify(value)}`)].join('\n')], { type: 'text/csv;charset=utf-8' }), 'roi-estimate.csv')}>Export CSV</ActionButton></div></>;
}

const panels = { merge: MergePdf, split: SplitPdf, optimize: OptimizePdf, image: ImageTool, key: () => <ImageTool colorKey />, json: JsonTool, jwt: JwtTool, base64: Base64Tool, hash: HashTool, text: TextTool, csv: CsvTool, roi: RoiTool };

const suites = [
  { code: 'SUITE_01', title: 'PDF & Document Processing', description: 'Merge, split and optimize PDF files with page-level controls, processed locally in your browser.', category: 'PDF', tool: 'merge', icon: Files, image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1000&q=85', alt: 'Detailed circuit board with electric blue components' },
  { code: 'SUITE_02', title: 'Developer Utilities', description: 'Format JSON, decode JWT claims, convert Base64, and generate cryptographic hashes.', category: 'Developer', tool: 'json', icon: Braces, image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1000&q=85', alt: 'Code editor on a developer workstation' },
  { code: 'SUITE_03', title: 'Text & Data', description: 'Measure and transform text or convert structured CSV and JSON data.', category: 'Text', tool: 'text', icon: Type, image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=85', alt: 'Notebook and pen on a desk' },
  { code: 'SUITE_04', title: 'Image & Media', description: 'Resize and convert images, or remove a flat-color background to transparent PNG.', category: 'Image', tool: 'image', icon: FileImage, image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=85', alt: 'Camera lens ready for image capture' },
  { code: 'SUITE_05', title: 'Business Calculators', description: 'Model SaaS revenue, operating costs, net margin, return and payback time.', category: 'Business', tool: 'roi', icon: ArrowUpRight, image: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=85', alt: 'Colleagues planning around a desk' },
];

function LandingPage({ onLaunch }) {
  const values = [
    ['01 // VALUE', 'Efficiency', 'Fast-executing tools that reduce friction and simplify everyday workflows.'],
    ['02 // VALUE', 'Accessibility', 'Practical utilities designed to be useful for students and experienced professionals alike.'],
    ['03 // VALUE', 'Privacy', 'Files and text are processed directly in your browser and are not uploaded.'],
    ['04 // VALUE', 'Practicality', 'Focused tools with clear inputs, understandable results and useful exports.'],
  ];
  const audiences = [
    [GraduationCap, 'Students'], [Briefcase, 'Office workers'],
    [Terminal, 'Developers'], [UserCog, 'Professionals'],
  ];
  const workflows = [
    ['PHASE 01', 'Execute tasks', 'Convert documents, format data or transform images with focused utilities.'],
    ['PHASE 02', 'Explore ideas', 'Use text and business tools to shape research, planning and early decisions.'],
    ['PHASE 03', 'Build workflows', 'Combine practical utilities into repeatable processes for your work.'],
  ];
  return <>
    <section id="overview" className="hero-section">
      <div className="landing-container hero-grid">
        <div className="hero-content">
          <div className="hero-badge"><Zap size={14} /> ALL-IN-ONE MICRO-SAAS PLATFORM</div>
          <h1 className="hero-title">Your go-to hub for developer utilities, file converters, and document tools.</h1>
          <p className="hero-description">ZapToolsCanvas brings together practical browser-based tools for students, office workers, developers, and professionals. Get useful work done without sending files to a server.</p>
          <div className="hero-actions"><a className="hero-primary" href="#dashboard-workspace">Explore the tools <MoveRight size={17} /></a><a className="hero-secondary" href="#products">View product suites <ChevronDown size={14} /></a></div>
          <div className="hero-proof"><ShieldCheck size={16} /><span>Local processing</span><i /><span>No account required</span></div>
        </div>
        <div className="hero-visual"><div className="hero-image-frame"><img src="https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=90" alt="Close-up of a blue and green circuit board" /><div className="hero-image-label"><span className="hero-image-dot" /> BROWSER-BASED WORKSPACE <span>01 / 12</span></div></div><div className="hero-image-accent" aria-hidden="true" /></div>
      </div>
      <div className="hero-bottom-rule" />
    </section>

    <section id="products" className="products-section landing-light-section">
      <div className="landing-container"><span className="section-tag">/ 01 PRODUCT SUITES</span><h2 className="landing-section-title">Functional utilities &amp; modular tools</h2><p className="landing-section-subtitle">A practical lineup for document handling, developer tasks, data manipulation, image processing and business planning.</p>
        <div className="products-grid">{suites.map((suite, index) => { const Icon = suite.icon; return <article className={`product-card product-span-${index === 0 ? '7' : index === 1 ? '5' : '4'}`} key={suite.code}>
          <div className="product-copy"><div className="product-header"><span className={`product-icon ${index % 2 ? 'product-icon-accent' : ''}`}><Icon size={21} /></span><span className="product-code">{suite.code}</span></div><h3 className="product-title">{suite.title}</h3><p className="product-description">{suite.description}</p><a className="product-link" href="#dashboard-workspace" onClick={() => onLaunch(suite.tool)}>Explore {suite.category.toLowerCase()} tools <MoveRight size={15} /></a></div>
          <div className="product-image"><img src={suite.image} alt={suite.alt} loading="lazy" /></div>
        </article>; })}</div>
      </div>
    </section>

    <section id="values" className="values-section">
      <div className="landing-container"><span className="section-tag">/ 02 CORE VALUES</span><h2 className="landing-section-title">Built for practical purpose</h2><p className="landing-section-subtitle">A focused set of tools, designed around the work people need to get done.</p><div className="values-grid">{values.map(([number, title, description]) => <article className="value-card" key={title}><span className="value-number">{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div></div>
    </section>

    <section id="workflows" className="workflows-section landing-light-section">
      <div className="landing-container"><span className="section-tag">/ 03 AUDIENCE &amp; WORKFLOWS</span><h2 className="landing-section-title">Who uses ZapToolsCanvas?</h2><p className="landing-section-subtitle">Straightforward utilities for everyday work, learning and building.</p><div className="audience-grid">{audiences.map(([Icon, label]) => <div className="audience-pill" key={label}><Icon size={22} /><span>{label}</span></div>)}</div><div className="workflow-box">{workflows.map(([phase, title, description]) => <article className="workflow-step" key={phase}><span className="step-tag">{phase}</span><h3>{title}</h3><p>{description}</p></article>)}</div></div>
    </section>
  </>;
}

export default function App() {
  const [activeId, setActiveId] = useState('merge');
  const [category, setCategory] = useState('All tools');
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeTool = tools.find((tool) => tool.id === activeId) ?? tools[0];
  const ActivePanel = panels[activeId];
  const filteredTools = tools.filter((tool) => (category === 'All tools' || tool.category === category) && `${tool.name} ${tool.description} ${tool.category}`.toLowerCase().includes(search.toLowerCase()));
  const activeIndex = tools.findIndex((tool) => tool.id === activeId);
  const groups = useMemo(() => categories.slice(1).map((name) => ({ name, items: tools.filter((tool) => tool.category === name) })), []);
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#home" aria-label="ZapToolsCanvas home"><span className="brand-mark"><Layers3 size={19} /></span><span>ZapToolsCanvas</span></a><nav className="site-nav" aria-label="Main navigation"><a href="#products">Product suites</a><a href="#values">Our values</a><a href="#workflows">Workflows</a></nav><div className="topbar-center"><span className="privacy-indicator"><span /> Local processing</span></div><button className="mobile-menu icon-button" aria-label="Toggle tool navigation" onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? <X size={19} /> : <Menu size={19} />}</button><a href="#tools" className="topbar-link">All tools <ChevronRight size={15} /></a></header>
    <main id="home">
      <LandingPage onLaunch={setActiveId} />
      <section className="dashboard-section" id="dashboard-workspace">
        <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-heading">WORKSPACE <span>12 tools</span></div>
        <button className={`sidebar-link ${category === 'All tools' ? 'sidebar-link-active' : ''}`} onClick={() => { setCategory('All tools'); setSidebarOpen(false); }}><Layers3 size={16} />All tools<span className="sidebar-count">12</span></button>
        {groups.map((group) => <div className="nav-group" key={group.name}><span className="nav-group-title">{group.name}</span>{group.items.map((tool) => { const Icon = tool.icon; return <button key={tool.id} className={`sidebar-link ${activeId === tool.id ? 'sidebar-link-active' : ''}`} onClick={() => { setActiveId(tool.id); setSidebarOpen(false); }}><Icon size={16} />{tool.name}</button>; })}</div>)}
        <div className="sidebar-footer"><ShieldCheck size={16} /><span><strong>Your files stay here</strong><small>Processing runs on this device.</small></span></div>
      </aside>
      <section className="content" id="tools">
        <div className="page-heading"><div><div className="eyebrow"><span>ZAPTOOLSCANVAS</span><span className="eyebrow-line" />{activeTool.category.toUpperCase()}</div><h1>{activeTool.name}<span className="heading-period">.</span></h1><p>{activeTool.description}</p></div><div className="heading-count"><span>{String(activeIndex + 1).padStart(2, '0')}</span><i />{String(tools.length).padStart(2, '0')}</div></div>
        <div className="workspace">
          <div className="workspace-top"><div className="workspace-title"><span className="workspace-icon"><activeTool.icon size={18} /></span><span><strong>{activeTool.name}</strong><small>{activeTool.category} utility <span>·</span> Private by design</small></span></div><div className="step-controls"><button className="icon-button" aria-label="Previous tool" onClick={() => setActiveId(tools[(activeIndex - 1 + tools.length) % tools.length].id)}><ArrowUp size={16} /></button><button className="icon-button" aria-label="Next tool" onClick={() => setActiveId(tools[(activeIndex + 1) % tools.length].id)}><ArrowDown size={16} /></button></div></div>
          <div className="workspace-body"><ActivePanel /></div>
        </div>
        <div className="local-note"><ShieldCheck size={15} /><span>Files and inputs are processed locally in your browser. Nothing is uploaded.</span><CircleHelp size={15} /></div>
        <section className="directory"><div className="directory-heading"><div><span className="eyebrow">THE TOOLBOX</span><h2>Pick up where you need.</h2></div><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a tool" aria-label="Search tools" />{search && <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}</label></div>
          <div className="category-tabs" role="tablist" aria-label="Filter tools">{categories.map((item) => <button key={item} className={`category-tab ${category === item ? 'category-tab-active' : ''}`} onClick={() => setCategory(item)} role="tab" aria-selected={category === item}>{item}</button>)}</div>
          <div className="tool-grid">{filteredTools.map((tool, index) => { const Icon = tool.icon; return <button key={tool.id} className={`tool-card ${activeId === tool.id ? 'tool-card-active' : ''}`} onClick={() => { setActiveId(tool.id); document.getElementById('dashboard-workspace')?.scrollIntoView({ behavior: 'smooth' }); }}><span className="tool-card-top"><span className="tool-card-icon"><Icon size={17} /></span><span className="tool-card-index">{String(index + 1).padStart(2, '0')}</span></span><span className="tool-card-title">{tool.name}<ChevronDown size={14} /></span><span className="tool-card-description">{tool.description}</span><span className="tool-card-category">{tool.category}</span></button>; })}{filteredTools.length === 0 && <p className="empty-state">No tools match “{search}”.</p>}</div>
        </section>
          </section>
        </div>
      </section>
    </main>
    <footer className="footer"><a className="brand footer-brand" href="#home"><span className="brand-mark"><Layers3 size={17} /></span><span>ZapToolsCanvas</span></a><span>Useful work, without the upload.</span><span>Browser-based utilities · 2026</span></footer>
  </div>;
}
