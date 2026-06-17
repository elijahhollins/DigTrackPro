import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { X, FileSpreadsheet, CheckCircle, AlertCircle, Upload } from 'lucide-react';
import { InventoryItemType } from '../types.ts';
import { apiService } from '../services/apiService.ts';

type ImportType = 'EQUIPMENT' | 'MATERIAL';

interface InventoryImportModalProps {
  type: ImportType;
  companyId: string;
  isDarkMode?: boolean;
  onClose: () => void;
  onImported: () => void;
}

interface EquipRow {
  name: string;
  serialNumber: string;
  assetTag: string;
  licensePlate: string;
  vin: string;
  hourlyRate: number | null;
}

interface MatRow {
  name: string;
  quantity: number;
  unit: string;
}

type AnyRow = EquipRow | MatRow;

function norm(s: string) { return s.toLowerCase().replace(/[\s_\-\/]/g, ''); }

function findKey(keys: string[], candidates: string[]): string | undefined {
  return keys.find(k => candidates.some(c => norm(k) === c));
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
      } catch { reject(new Error('Unreadable file')); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function toEquipRows(raw: Record<string, unknown>[]): EquipRow[] {
  return raw.map(row => {
    const keys = Object.keys(row);
    const nameKey    = findKey(keys, ['name','equipment','item','description','equipmentname','assetname']) ?? keys[0];
    const serialKey  = findKey(keys, ['serialnumber','serial','sn','serialno']);
    const tagKey     = findKey(keys, ['assettag','tag','asset','assetid']);
    const plateKey   = findKey(keys, ['licenseplate','plate','license']);
    const vinKey     = findKey(keys, ['vin','vehicleidentificationnumber']);
    const rateKey    = findKey(keys, ['hourlyrate','rate','hr','hourlycost','costperhr','costperhour','hourlyrental','billingrate']);
    const raw$ = (k?: string) => k ? String(row[k] ?? '').trim() : '';
    const rawRate = raw$(rateKey).replace(/[^0-9.]/g, '');
    return {
      name:         raw$(nameKey),
      serialNumber: raw$(serialKey),
      assetTag:     raw$(tagKey),
      licensePlate: raw$(plateKey),
      vin:          raw$(vinKey),
      hourlyRate:   rawRate ? parseFloat(rawRate) : null,
    };
  }).filter(r => r.name);
}

function toMatRows(raw: Record<string, unknown>[]): MatRow[] {
  return raw.map(row => {
    const keys = Object.keys(row);
    const nameKey = findKey(keys, ['name','material','item','description','materialname','supply']) ?? keys[0];
    const qtyKey  = findKey(keys, ['quantity','qty','amount','count','stock']);
    const unitKey = findKey(keys, ['unit','uom','unitofmeasure','measure','per']);
    const raw$ = (k?: string) => k ? String(row[k] ?? '').trim() : '';
    const rawQty = raw$(qtyKey).replace(/[^0-9.]/g, '');
    return {
      name:     raw$(nameKey),
      quantity: rawQty ? parseFloat(rawQty) : 0,
      unit:     raw$(unitKey) || 'each',
    };
  }).filter(r => r.name);
}

function downloadTemplate(type: ImportType) {
  let header: string, example: string, filename: string;
  if (type === 'EQUIPMENT') {
    header  = 'name,serialNumber,assetTag,licensePlate,vin,hourlyRate';
    example = 'Excavator #1,SN-001,TAG-001,ABC-123,1HGBH41JXMN109186,150\nDump Truck,,TAG-002,XYZ-456,,80\nSkid Steer,SN-003,,,, 70';
    filename = 'equipment-template.csv';
  } else {
    header  = 'name,quantity,unit';
    example = '2in HDPE Pipe,500,ft\nRebar #4,200,lbs\nConduit 1in,100,ft';
    filename = 'materials-template.csv';
  }
  const blob = new Blob([`${header}\n${example}`], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function InventoryImportModal({ type, companyId, isDarkMode, onClose, onImported }: InventoryImportModalProps) {
  const [isDragging,  setIsDragging]  = useState(false);
  const [rows,        setRows]        = useState<AnyRow[] | null>(null);
  const [parseError,  setParseError]  = useState<string | null>(null);
  const [importing,   setImporting]   = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const label = type === 'EQUIPMENT' ? 'Equipment' : 'Materials';
  const count = rows?.length ?? 0;

  const card    = isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const sub     = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const dropZone = [
    'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition',
    isDragging
      ? 'border-brand bg-brand/5'
      : isDarkMode ? 'border-slate-600 hover:border-slate-400' : 'border-slate-300 hover:border-slate-400',
  ].join(' ');
  const thCls = `px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide border-b ${isDarkMode ? 'text-slate-400 border-slate-700' : 'text-slate-500 border-slate-200'}`;
  const tdCls = `px-3 py-1.5 border-b text-sm ${isDarkMode ? 'border-slate-700 text-slate-200' : 'border-slate-100 text-slate-700'}`;

  const clear = () => { setRows(null); setParseError(null); };

  const processFile = async (file: File) => {
    clear();
    try {
      const raw = await parseSpreadsheet(file);
      setRows(type === 'EQUIPMENT' ? toEquipRows(raw) : toMatRows(raw));
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
      await apiService.bulkCreateInventoryItems(
        companyId,
        rows.map(r => {
          if (type === 'EQUIPMENT') {
            const e = r as EquipRow;
            return {
              name: e.name,
              itemType: InventoryItemType.EQUIPMENT,
              serialNumber: e.serialNumber || undefined,
              assetTag: e.assetTag || undefined,
              licensePlate: e.licensePlate || undefined,
              vin: e.vin || undefined,
              hourlyRate: e.hourlyRate ?? 0,
            };
          } else {
            const m = r as MatRow;
            return { name: m.name, itemType: InventoryItemType.MATERIAL, quantity: m.quantity, unit: m.unit };
          }
        })
      );
      onImported();
      onClose();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className={`w-full max-w-xl rounded-2xl border shadow-2xl ${card} p-6`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-brand" />
            <h2 className="text-lg font-bold">Import {label}</h2>
          </div>
          <button onClick={onClose} className={`${sub} hover:text-rose-500 transition`}><X size={20} /></button>
        </div>

        {/* Drop zone */}
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
              <p className={`text-sm mt-1 ${sub}`}>or click to browse — CSV, XLSX, or XLS</p>
              <input ref={fileRef} type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={e => handleFiles(e.target.files)} />
            </div>

            {/* Column hints */}
            <div className={`mt-3 text-xs ${sub}`}>
              {type === 'EQUIPMENT' ? (
                <p className="text-center">
                  Columns: <code className="font-mono">name</code>, <code className="font-mono">serialNumber</code>, <code className="font-mono">assetTag</code>, <code className="font-mono">licensePlate</code>, <code className="font-mono">vin</code>, <code className="font-mono">hourlyRate</code>
                  {' · '}
                  <button className="underline hover:opacity-75" onClick={e => { e.stopPropagation(); downloadTemplate('EQUIPMENT'); }}>Download template</button>
                </p>
              ) : (
                <p className="text-center">
                  Columns: <code className="font-mono">name</code>, <code className="font-mono">quantity</code>, <code className="font-mono">unit</code>
                  {' · '}
                  <button className="underline hover:opacity-75" onClick={e => { e.stopPropagation(); downloadTemplate('MATERIAL'); }}>Download template</button>
                </p>
              )}
            </div>

            {parseError && (
              <div className="flex items-start gap-2 p-3 mt-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{parseError}</span>
              </div>
            )}
          </>
        )}

        {/* Preview table */}
        {rows && rows.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-500 shrink-0" />
              <span className="text-sm font-medium">{count} {label.toLowerCase()} item{count !== 1 ? 's' : ''} ready to import</span>
              <button onClick={clear} className={`ml-auto text-xs underline ${sub}`}>Change file</button>
            </div>

            <div className={`overflow-auto max-h-64 rounded-lg border ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <table className="w-full text-left">
                <thead className={isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}>
                  <tr>
                    <th className={thCls}>Name</th>
                    {type === 'EQUIPMENT' ? (
                      <>
                        <th className={thCls}>Serial #</th>
                        <th className={thCls}>Tag</th>
                        <th className={`${thCls} text-right`}>Rate/hr</th>
                      </>
                    ) : (
                      <>
                        <th className={`${thCls} text-right`}>Qty</th>
                        <th className={thCls}>Unit</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={isDarkMode ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50'}>
                      <td className={tdCls}>{r.name}</td>
                      {type === 'EQUIPMENT' ? (
                        <>
                          <td className={`${tdCls} ${sub}`}>{(r as EquipRow).serialNumber || '—'}</td>
                          <td className={`${tdCls} ${sub}`}>{(r as EquipRow).assetTag || '—'}</td>
                          <td className={`${tdCls} text-right`}>
                            {(r as EquipRow).hourlyRate != null ? `$${(r as EquipRow).hourlyRate!.toFixed(2)}` : <span className={sub}>—</span>}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className={`${tdCls} text-right tabular-nums`}>{(r as MatRow).quantity}</td>
                          <td className={tdCls}>{(r as MatRow).unit}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{importError}</span>
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
                className="flex-1 py-2 rounded-lg bg-brand text-white text-sm font-semibold disabled:opacity-60 transition hover:opacity-90"
              >
                {importing ? 'Importing…' : `Import ${count} item${count !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* Empty parse */}
        {rows && rows.length === 0 && (
          <div className={`text-sm text-center py-6 space-y-2 ${sub}`}>
            <p>No valid rows found. Make sure the file has a header row.</p>
            {type === 'EQUIPMENT'
              ? <p><code className="font-mono text-xs">name, serialNumber, assetTag, licensePlate, vin, hourlyRate</code></p>
              : <p><code className="font-mono text-xs">name, quantity, unit</code></p>}
            <button className="underline text-xs mt-1" onClick={clear}>Try another file</button>
          </div>
        )}
      </div>
    </div>
  );
}
