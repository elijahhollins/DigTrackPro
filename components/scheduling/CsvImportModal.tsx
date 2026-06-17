import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { X, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { scheduleService } from '../../services/scheduleService.ts';

type ImportType = 'equipment' | 'materials';

interface CsvImportModalProps {
  type: ImportType;
  companyId: string;
  isDarkMode?: boolean;
  onClose: () => void;
  onImported: () => void;
}

type EquipmentDraft = {
  unitNumber: string;
  equipmentType: string;
  year: number | null;
  make: string;
  model: string;
  hourlyRate: number;
  vin: string;
  serialNumber: string;
  licensePlate: string;
  notes: string;
};
type MaterialDraft  = { name: string; unitPrice: number | null };

function norm(s: string) { return s.toLowerCase().replace(/[\s_\-\/\.#()]/g, ''); }

function findKey(keys: string[], candidates: string[]): string | undefined {
  return keys.find(k => candidates.includes(norm(k)));
}

async function parseSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' }));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Splits "2020 Chevrolet 2500 HD LT" → { year: 2020, make: "Chevrolet", model: "2500 HD LT" }
function parseYearMakeModel(raw: string): { year: number | null; make: string; model: string } {
  const s = (raw ?? '').trim();
  if (!s || s === 'X') return { year: null, make: '', model: '' };
  const m = s.match(/^(\d{4})\s+(.+)/);
  if (m) {
    const year = parseInt(m[1], 10);
    const rest = m[2];
    const sp   = rest.indexOf(' ');
    return sp === -1
      ? { year, make: rest, model: '' }
      : { year, make: rest.slice(0, sp), model: rest.slice(sp + 1) };
  }
  const sp = s.indexOf(' ');
  return sp === -1
    ? { year: null, make: s, model: '' }
    : { year: null, make: s.slice(0, sp), model: s.slice(sp + 1) };
}

// Splits "VIN#1GC4..." → vin field; "Ser#..." / "SN#..." → serialNumber field
function parseVinSerial(raw: string): { vin: string; serialNumber: string } {
  const s = (raw ?? '').trim();
  if (!s) return { vin: '', serialNumber: '' };
  if (/^VIN#?\s*/i.test(s)) {
    return { vin: s.replace(/^VIN#?\s*/i, '').split('/')[0].trim(), serialNumber: '' };
  }
  const serial = s.replace(/^(S\/N#?|SN#?|Ser#?|Serial#?)\s*/i, '').split('/')[0].trim();
  return { vin: '', serialNumber: serial };
}

// Strips "Lic# " prefix and trailing asterisks from license plate values
function parseLicense(raw: string): string {
  return (raw ?? '').trim().replace(/^Lic\s*#?\s*/i, '').replace(/\*$/, '').trim();
}

function toEquipmentRows(raw: Record<string, unknown>[]): EquipmentDraft[] {
  return raw.map(row => {
    const keys = Object.keys(row);
    const unitKey     = findKey(keys, ['unitnumber', 'unit', 'unitno', 'unit#', 'equipno', 'equipnumber', 'equipmentnumber', 'truckno', 'assetno', 'assetnumber']);
    const typeKey     = findKey(keys, ['equipmenttype', 'type', 'category', 'class', 'kind']);
    const yearKey     = findKey(keys, ['year', 'yr', 'modelyear']);
    const makeKey     = findKey(keys, ['make', 'manufacturer', 'brand', 'mfg']);
    const modelKey    = findKey(keys, ['model', 'modelnumber', 'modelno', 'series']);
    const rateKey     = findKey(keys, ['hourlyrate', 'rate', 'hr', 'hourlycost', 'costperhr', 'costperhour', 'hourlyrental']);
    const ymmKey      = findKey(keys, ['yearmakemodel', 'yearmodel', 'makemodel', 'ymm']);
    const vinKey      = findKey(keys, ['vinserial', 'vinserialnumber', 'vin', 'serial', 'serialnumber', 'sn']);
    const licenseKey  = findKey(keys, ['license', 'licensenumber', 'licenseplate', 'licno', 'lic', 'plate']);
    const notesKey    = findKey(keys, ['notes', 'note', 'comments', 'comment', 'remarks']);

    const rawRate = String(row[rateKey ?? ''] ?? '').replace(/[^0-9.]/g, '');

    // Year/Make/Model: prefer separate columns, fall back to combined column
    let year: number | null = null;
    let make = '';
    let model = '';
    if (yearKey || makeKey || modelKey) {
      const rawYear = yearKey ? String(row[yearKey] ?? '').replace(/[^0-9]/g, '') : '';
      year  = rawYear ? parseInt(rawYear, 10) : null;
      make  = makeKey  ? String(row[makeKey]  ?? '').trim() : '';
      model = modelKey ? String(row[modelKey] ?? '').trim() : '';
    } else if (ymmKey) {
      ({ year, make, model } = parseYearMakeModel(String(row[ymmKey] ?? '')));
    }

    const { vin, serialNumber } = vinKey
      ? parseVinSerial(String(row[vinKey] ?? ''))
      : { vin: '', serialNumber: '' };

    const rawType = typeKey ? String(row[typeKey] ?? '').trim() : '';

    return {
      unitNumber:    unitKey  ? String(row[unitKey]  ?? '').trim() : '',
      equipmentType: rawType === 'X' ? '' : rawType,
      year,
      make,
      model,
      hourlyRate:    rawRate  ? parseFloat(rawRate)  : 0,
      vin,
      serialNumber,
      licensePlate:  licenseKey ? parseLicense(String(row[licenseKey] ?? '')) : '',
      notes:         notesKey   ? String(row[notesKey] ?? '').trim() : '',
    };
  }).filter(r => r.unitNumber || r.make || r.model || r.equipmentType);
}

function toMaterialRows(raw: Record<string, unknown>[]): MaterialDraft[] {
  return raw.map(row => {
    const keys = Object.keys(row);
    const nameKey = findKey(keys, ['name', 'material', 'item', 'description', 'materialname']) ?? keys[0];
    const priceKey = findKey(keys, ['unitprice', 'price', 'cost', 'unitcost', 'priceperunit', 'rate']) ?? keys[1];
    const rawPrice = priceKey ? String(row[priceKey] ?? '').replace(/[^0-9.]/g, '') : '';
    return {
      name: String(row[nameKey ?? ''] ?? '').trim(),
      unitPrice: rawPrice ? parseFloat(rawPrice) : null,
    };
  }).filter(r => r.name);
}

function downloadTemplate(type: ImportType) {
  const header  = type === 'equipment'
    ? 'unitNumber,equipmentType,year,make,model,hourlyRate'
    : 'name,unitPrice';
  const example = type === 'equipment'
    ? '1001,Excavator,2020,Caterpillar,320,75\n1002,Dump Truck,2019,Kenworth,T880,50\n1003,Compactor,2021,Bomag,BW213D,40'
    : 'Concrete (cu yd),120\nRebar (ton),850\nConduit (ft),3.50';
  const blob = new Blob([`${header}\n${example}`], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${type}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CsvImportModal({ type, companyId, isDarkMode, onClose, onImported }: CsvImportModalProps) {
  const [isDragging,   setIsDragging]   = useState(false);
  const [equipRows,    setEquipRows]    = useState<EquipmentDraft[] | null>(null);
  const [matRows,      setMatRows]      = useState<MaterialDraft[]  | null>(null);
  const [parseError,   setParseError]   = useState<string | null>(null);
  const [importing,    setImporting]    = useState(false);
  const [importError,  setImportError]  = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const label = type === 'equipment' ? 'Equipment' : 'Materials';
  const rows  = (type === 'equipment' ? equipRows : matRows) as (EquipmentDraft | MaterialDraft)[] | null;
  const count = rows?.length ?? 0;

  const overlay  = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4';
  const card     = isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const subtext  = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const dropZone = [
    'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition',
    isDragging
      ? 'border-brand bg-brand/5'
      : isDarkMode ? 'border-slate-600 hover:border-slate-400' : 'border-slate-300 hover:border-slate-400',
  ].join(' ');
  const thCls = `px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide border-b ${isDarkMode ? 'text-slate-400 border-slate-700' : 'text-slate-500 border-slate-200'}`;
  const tdCls = `px-3 py-1.5 border-b text-sm ${isDarkMode ? 'border-slate-700 text-slate-200' : 'border-slate-100 text-slate-700'}`;

  const clearRows = () => { setEquipRows(null); setMatRows(null); setParseError(null); };

  const processFile = async (file: File) => {
    clearRows();
    try {
      const raw = await parseSpreadsheet(file);
      if (type === 'equipment') setEquipRows(toEquipmentRows(raw));
      else setMatRows(toMaterialRows(raw));
    } catch {
      setParseError('Could not parse this file. Make sure it is a valid CSV or Excel spreadsheet.');
    }
  };

  const handleFiles = (files: FileList | null) => { if (files?.length) processFile(files[0]); };

  const doImport = async () => {
    if (!rows?.length) return;
    setImporting(true);
    setImportError(null);
    try {
      if (type === 'equipment') {
        await scheduleService.bulkCreateEquipment(
          companyId,
          equipRows!.map(e => ({
            ...e,
            name: [e.year, e.make, e.model].filter(Boolean).join(' ') || e.unitNumber || e.equipmentType || 'Equipment',
            vin:          e.vin,
            serialNumber: e.serialNumber,
            licensePlate: e.licensePlate,
            notes:        e.notes,
          }))
        );
      } else {
        await scheduleService.bulkCreateMaterial(companyId, matRows!);
      }
      onImported();
      onClose();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className={overlay} onClick={onClose}>
      <div
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl ${card} p-6`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand/10 text-brand">
              <FileSpreadsheet size={16} />
            </span>
            <h2 className="text-lg font-bold">Import {label} List</h2>
          </div>
          <button onClick={onClose} className={`w-8 h-8 flex items-center justify-center rounded-lg ${subtext} hover:text-rose-500 hover:bg-rose-500/10 transition`}><X size={18} /></button>
        </div>

        {/* Drop zone (shown until a file is parsed) */}
        {!rows && (
          <>
            <div
              className={dropZone}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current?.click()}
            >
              <FileSpreadsheet size={40} className="mx-auto mb-3 text-brand opacity-80" />
              <p className="font-semibold">Drop your spreadsheet here</p>
              <p className={`text-sm mt-1 ${subtext}`}>or click to browse — CSV, XLSX, or XLS</p>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".csv,.xlsx,.xls"
                onChange={e => handleFiles(e.target.files)}
              />
            </div>

            <div className={`mt-3 text-xs ${subtext} text-center`}>
              {type === 'equipment' ? (
                <>
                  Expected columns:{' '}
                  <code className="font-mono">unitNumber</code>,{' '}
                  <code className="font-mono">equipmentType</code>,{' '}
                  <code className="font-mono">year</code>,{' '}
                  <code className="font-mono">make</code>,{' '}
                  <code className="font-mono">model</code>,{' '}
                  <code className="font-mono">hourlyRate</code>
                </>
              ) : (
                <>
                  Expected columns:{' '}
                  <code className="font-mono">name</code>,{' '}
                  <code className="font-mono">unitPrice</code>
                </>
              )}
              {' · '}
              <button
                className="underline hover:opacity-75"
                onClick={e => { e.stopPropagation(); downloadTemplate(type); }}
              >
                Download template
              </button>
            </div>

            {parseError && (
              <div className="flex items-start gap-2 p-3 mt-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
          </>
        )}

        {/* Preview table */}
        {rows && rows.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-500 shrink-0" />
              <span className="text-sm font-medium">{count} row{count !== 1 ? 's' : ''} ready to import</span>
              <button onClick={clearRows} className={`ml-auto text-xs underline ${subtext}`}>Change file</button>
            </div>

            <div className={`overflow-auto max-h-56 rounded-lg border ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <table className="w-full">
                <thead className={isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}>
                  <tr>
                    {type === 'equipment' ? (
                      <>
                        <th className={thCls}>Unit #</th>
                        <th className={thCls}>Type</th>
                        <th className={thCls}>Year</th>
                        <th className={thCls}>Make / Model</th>
                        <th className={`${thCls} text-right`}>Rate / hr</th>
                      </>
                    ) : (
                      <>
                        <th className={thCls}>Name</th>
                        <th className={`${thCls} text-right`}>Unit Price</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      {type === 'equipment' ? (() => {
                        const e = r as EquipmentDraft;
                        return (
                          <>
                            <td className={tdCls}>{e.unitNumber || <span className={subtext}>—</span>}</td>
                            <td className={tdCls}>{e.equipmentType || <span className={subtext}>—</span>}</td>
                            <td className={tdCls}>{e.year ?? <span className={subtext}>—</span>}</td>
                            <td className={tdCls}>{[e.make, e.model].filter(Boolean).join(' ') || <span className={subtext}>—</span>}</td>
                            <td className={`${tdCls} text-right`}>${e.hourlyRate.toFixed(2)}/hr</td>
                          </>
                        );
                      })() : (
                        <>
                          <td className={tdCls}>{(r as MaterialDraft).name}</td>
                          <td className={`${tdCls} text-right`}>
                            {(r as MaterialDraft).unitPrice != null
                              ? `$${(r as MaterialDraft).unitPrice!.toFixed(2)}`
                              : <span className={subtext}>—</span>}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition ${isDarkMode ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-300 hover:bg-slate-50'}`}
              >
                Cancel
              </button>
              <button
                onClick={doImport}
                disabled={importing}
                className="flex-1 py-2 rounded-lg bg-brand text-white text-sm font-semibold disabled:opacity-60 transition"
              >
                {importing ? 'Importing…' : `Import ${count} item${count !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* Empty parse result */}
        {rows && rows.length === 0 && (
          <div className={`text-sm text-center py-6 space-y-2 ${subtext}`}>
            <p>No valid rows found. Make sure the file has a header row with:</p>
            {type === 'equipment' ? (
              <p>
                <code className="font-mono text-xs">unitNumber</code>{', '}
                <code className="font-mono text-xs">equipmentType</code>{', '}
                <code className="font-mono text-xs">year</code>{', '}
                <code className="font-mono text-xs">make</code>{', '}
                <code className="font-mono text-xs">model</code>{', '}
                <code className="font-mono text-xs">hourlyRate</code>
              </p>
            ) : (
              <p>
                <code className="font-mono text-xs">name</code>{', '}
                <code className="font-mono text-xs">unitPrice</code>
              </p>
            )}
            <button className="underline text-xs mt-1" onClick={clearRows}>Try another file</button>
          </div>
        )}
      </div>
    </div>
  );
}
