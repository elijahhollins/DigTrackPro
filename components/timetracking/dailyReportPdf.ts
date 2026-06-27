// ─────────────────────────────────────────────────────────────────────────────
// Daily Report PDF — generates a foreman's end-of-day report.
//
// Layout follows the busybusy-style daily report the customer supplied: a header
// card (company + project), a progress summary, a photo grid, an employee
// summary with stat tiles, the full time-entry log, a cost-code roll-up, safety
// + JULIE-locate notes, and a sign-off line.
//
// Crew hours / time entries / cost-code totals are DERIVED here from the raw
// `time_entries` rows (filtered to the report's job + calendar day) so they are
// never stale. Styling reuses the brand-color treatment from invoicePdf.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Employee } from '../../services/schedulingTypes.ts';
import {
  CostCode,
  DailyReport,
  TimeEntry,
  entryDurationMs,
  formatHoursMinutes,
} from '../../services/timeTrackingTypes.ts';

type RGB = [number, number, number];

const PDF_COLORS = {
  white:    [255, 255, 255] as RGB,
  slate100: [241, 245, 249] as RGB,
  slate300: [203, 213, 225] as RGB,
  slate500: [100, 116, 139] as RGB,
  slate700: [51, 65, 85] as RGB,
  slate900: [15, 23, 42] as RGB,
};

const hexToRgb = (hex: string): RGB => {
  let clean = (hex || '').replace('#', '');
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [59, 130, 246];
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
};
const lighten = (rgb: RGB, f: number): RGB =>
  rgb.map(c => Math.min(255, Math.round(c + (255 - c) * f))) as RGB;
const darken = (rgb: RGB, f: number): RGB =>
  rgb.map(c => Math.max(0, Math.round(c * (1 - f)))) as RGB;

// ── local time helpers ───────────────────────────────────────────────────────

/** Local calendar day (YYYY-MM-DD) of an ISO timestamp. */
export const localDay = (iso: string): string => {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

const timeOfDay = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const usDate = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
};

const longDate = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ── derived report data ──────────────────────────────────────────────────────

export interface DailyReportComputed {
  entryRows: { employee: string; date: string; time: string; total: string; costCode: string; equipment: string }[];
  employeeRows: { name: string; hours: string }[];
  costCodeRows: { label: string; hours: string }[];
  employeesOnSite: number;
  totalHours: string;
}

/**
 * Pull the entries for a report's job + calendar day out of a flat entry list,
 * and roll them up into the per-employee, per-cost-code and total figures the
 * report shows. Exposed so the on-screen form can preview the same numbers.
 */
export function computeDailyReport(
  report: { jobKind: string; jobRef: string; reportDate: string },
  allEntries: TimeEntry[],
  employees: Employee[],
  costCodes: CostCode[],
  now: number = Date.now(),
): DailyReportComputed {
  const empName = (id: number) => employees.find(e => e.id === id)?.name || `Employee #${id}`;
  const codeById = new Map(costCodes.map(c => [c.id, c]));
  const codeLabel = (id: number | null) => {
    if (id == null) return '—';
    const c = codeById.get(id);
    return c ? `${c.code}${c.description ? `  ${c.description}` : ''}` : '—';
  };

  const entries = allEntries
    .filter(e => e.jobKind === report.jobKind && e.jobRef === report.jobRef && localDay(e.clockedInAt) === report.reportDate)
    .sort((a, b) => empName(a.employeeId).localeCompare(empName(b.employeeId)) || a.clockedInAt.localeCompare(b.clockedInAt));

  const entryRows = entries.map(e => ({
    employee: empName(e.employeeId),
    date: usDate(report.reportDate),
    time: `${timeOfDay(e.clockedInAt)} - ${e.clockedOutAt ? timeOfDay(e.clockedOutAt) : '?'}`,
    total: formatHoursMinutes(entryDurationMs(e, now)),
    costCode: codeLabel(e.costCodeId),
    equipment: '—',
  }));

  // Per-employee hours.
  const byEmp = new Map<number, number>();
  entries.forEach(e => byEmp.set(e.employeeId, (byEmp.get(e.employeeId) ?? 0) + entryDurationMs(e, now)));
  const employeeRows = [...byEmp.entries()]
    .sort((a, b) => empName(a[0]).localeCompare(empName(b[0])))
    .map(([id, ms]) => ({ name: empName(id), hours: formatHoursMinutes(ms) }));

  // Per-cost-code hours.
  const byCode = new Map<string, number>();
  entries.forEach(e => {
    const key = codeLabel(e.costCodeId);
    byCode.set(key, (byCode.get(key) ?? 0) + entryDurationMs(e, now));
  });
  const costCodeRows = [...byCode.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, ms]) => ({ label, hours: formatHoursMinutes(ms) }));

  const totalMs = entries.reduce((sum, e) => sum + entryDurationMs(e, now), 0);

  return {
    entryRows,
    employeeRows,
    costCodeRows,
    employeesOnSite: byEmp.size,
    totalHours: formatHoursMinutes(totalMs),
  };
}

// ── image loading (for embedding photos) ─────────────────────────────────────

interface LoadedImage { dataUrl: string; w: number; h: number; }

function loadImage(url: string): Promise<LoadedImage | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), w: img.naturalWidth, h: img.naturalHeight });
      } catch { resolve(null); /* tainted canvas / CORS */ }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ── PDF ───────────────────────────────────────────────────────────────────────

export interface DailyReportPdfArgs {
  report: DailyReport;
  entries: TimeEntry[];                 // company entries; filtered internally
  employees: Employee[];
  costCodes: CostCode[];
  company?: { name?: string; phone?: string; city?: string; state?: string; brandColor?: string };
  projectNumber?: string;
  projectName?: string;
  customer?: string;
}

export async function generateDailyReportPdf(args: DailyReportPdfArgs): Promise<void> {
  const { report, entries, employees, costCodes, company, projectNumber, projectName, customer } = args;
  const data = computeDailyReport(report, entries, employees, costCodes);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const { white, slate100, slate300, slate500, slate700, slate900 } = PDF_COLORS;

  const brand     = hexToRgb(company?.brandColor || '#3b82f6');
  const brandDark = darken(brand, 0.35);
  const brandTint = lighten(brand, 0.88);

  const fill   = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
  const text   = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);

  const topStripe = () => { fill(brand); pdf.rect(0, 0, pageW, 3, 'F'); };
  let y = 0;
  const ensure = (needed: number, reset = 16) => {
    if (y + needed > pageH - 16) { pdf.addPage(); topStripe(); y = reset; }
  };

  // ── Header card ────────────────────────────────────────────────────────────
  topStripe();
  const cardTop = 10;
  const cardH = 38;
  fill(brandDark); pdf.roundedRect(margin, cardTop, contentW, cardH, 2, 2, 'F');
  fill(brand); pdf.roundedRect(margin, cardTop, 3.5, cardH, 1, 1, 'F');

  text(white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15);
  pdf.text(company?.name || 'Daily Report', margin + 8, cardTop + 11);
  text(slate300); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
  const sub = [company?.phone, [company?.city, company?.state].filter(Boolean).join(', ')].filter(Boolean).join('  •  ');
  if (sub) pdf.text(sub, margin + 8, cardTop + 17);

  const rightX = pageW - margin - 5;
  text(white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
  pdf.text('DAILY REPORT', rightX, cardTop + 11, { align: 'right' });
  text(slate300); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
  if (projectNumber) pdf.text(`Project #: ${projectNumber}`, rightX, cardTop + 18, { align: 'right' });
  pdf.text(longDate(report.reportDate), rightX, cardTop + 24, { align: 'right' });
  if (customer) pdf.text(`Customer: ${customer}`, rightX, cardTop + 30, { align: 'right' });

  text(slate300); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
  pdf.text(projectName || report.jobLabel || '', margin + 8, cardTop + 30, { maxWidth: contentW * 0.55 });

  y = cardTop + cardH + 8;

  // ── Section header helper ────────────────────────────────────────────────--
  const sectionHeader = (label: string) => {
    ensure(14);
    fill(brandTint); pdf.roundedRect(margin, y, contentW, 8, 1.5, 1.5, 'F');
    fill(brand); pdf.roundedRect(margin, y, 2.5, 8, 0.8, 0.8, 'F');
    text(brandDark); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    pdf.text(label.toUpperCase(), margin + 6, y + 5.5);
    y += 12;
  };

  const paragraphOrEmpty = (body: string) => {
    text(slate700); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
    if (body.trim()) {
      const lines = pdf.splitTextToSize(body.trim(), contentW);
      lines.forEach((line: string) => { ensure(6); pdf.text(line, margin, y + 4); y += 5.2; });
      y += 3;
    } else {
      text(slate500); pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8.5);
      ensure(6); pdf.text('No data', margin, y + 4); y += 8;
    }
  };

  // ── Progress summary ─────────────────────────────────────────────────────--
  sectionHeader('Progress Summary');
  paragraphOrEmpty(report.progressSummary);

  // ── Photos ───────────────────────────────────────────────────────────────--
  if (report.photos.length > 0) {
    sectionHeader('Photos');
    const loaded = await Promise.all(report.photos.map(p => loadImage(p.url)));
    const cols = 2;
    const gap = 5;
    const cellW = (contentW - gap * (cols - 1)) / cols;
    let col = 0;
    let rowTop = y;
    let rowMaxH = 0;
    report.photos.forEach((photo, i) => {
      const img = loaded[i];
      const cellH = 52;            // fixed visual slot; image fit inside
      if (col === 0) { ensure(cellH + 8); rowTop = y; rowMaxH = 0; }
      const x = margin + col * (cellW + gap);
      if (img) {
        const ratio = img.w / img.h;
        let drawW = cellW, drawH = cellW / ratio;
        if (drawH > cellH) { drawH = cellH; drawW = cellH * ratio; }
        const ox = x + (cellW - drawW) / 2;
        try { pdf.addImage(img.dataUrl, 'JPEG', ox, rowTop, drawW, drawH); } catch { /* skip */ }
        rowMaxH = Math.max(rowMaxH, drawH);
        if (photo.caption) {
          text(slate500); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
          pdf.text(photo.caption, x, rowTop + cellH + 4, { maxWidth: cellW });
        }
      } else {
        fill(slate100); pdf.roundedRect(x, rowTop, cellW, cellH, 2, 2, 'F');
        text(slate500); pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7);
        pdf.text('Photo unavailable', x + 4, rowTop + cellH / 2);
        rowMaxH = Math.max(rowMaxH, cellH);
      }
      col++;
      if (col >= cols || i === report.photos.length - 1) {
        col = 0;
        y = rowTop + cellH + 9;
      }
    });
  }

  // ── Employee summary ─────────────────────────────────────────────────────--
  sectionHeader('Employee Summary');
  ensure(20);
  const tiles: [string, string][] = [
    ['EMPLOYEES ON SITE', String(data.employeesOnSite)],
    ['INJURIES REPORTED', String(report.injuriesCount)],
    ['HOURS', data.totalHours],
  ];
  const tileGap = 4;
  const tileW = (contentW - tileGap * (tiles.length - 1)) / tiles.length;
  tiles.forEach(([label, value], i) => {
    const x = margin + i * (tileW + tileGap);
    fill(brandTint); pdf.roundedRect(x, y, tileW, 16, 2, 2, 'F');
    text(brandDark); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
    pdf.text(value, x + 4, y + 8);
    text(slate500); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5);
    pdf.text(label, x + 4, y + 13);
  });
  y += 22;

  if (data.employeeRows.length > 0) {
    autoTable(pdf, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      head: [['EMPLOYEE', 'HOURS']],
      body: data.employeeRows.map(r => [r.name, r.hours]),
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.5, textColor: slate700, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, lineColor: [226, 232, 240], lineWidth: 0.2 },
      headStyles: { fillColor: slate100, textColor: slate900, fontStyle: 'bold', fontSize: 7, lineColor: brand, lineWidth: { bottom: 0.8 } },
      columnStyles: { 1: { halign: 'right', cellWidth: 30, fontStyle: 'bold' } },
      didDrawPage: topStripe,
    });
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── Time entries ─────────────────────────────────────────────────────────--
  sectionHeader('Time Entries');
  if (data.entryRows.length > 0) {
    autoTable(pdf, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      head: [['EMPLOYEE', 'DATE', 'TIME', 'TOTAL', 'COST CODE', 'EQUIP.']],
      body: data.entryRows.map(r => [r.employee, r.date, r.time, r.total, r.costCode, r.equipment]),
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8, textColor: slate700, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 }, lineColor: [226, 232, 240], lineWidth: 0.2 },
      headStyles: { fillColor: slate100, textColor: slate900, fontStyle: 'bold', fontSize: 6.5, lineColor: brand, lineWidth: { bottom: 0.8 } },
      columnStyles: {
        3: { halign: 'right', fontStyle: 'bold', cellWidth: 16 },
        5: { halign: 'center', cellWidth: 16 },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didDrawPage: topStripe,
    });
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  } else {
    paragraphOrEmpty('');
  }

  // ── Cost code summary ────────────────────────────────────────────────────--
  if (data.costCodeRows.length > 0) {
    sectionHeader('Cost Code Summary');
    autoTable(pdf, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      head: [['COST CODE', 'HOURS']],
      body: data.costCodeRows.map(r => [r.label, r.hours]),
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.5, textColor: slate700, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, lineColor: [226, 232, 240], lineWidth: 0.2 },
      headStyles: { fillColor: slate100, textColor: slate900, fontStyle: 'bold', fontSize: 7, lineColor: brand, lineWidth: { bottom: 0.8 } },
      columnStyles: { 1: { halign: 'right', cellWidth: 30, fontStyle: 'bold' } },
      didDrawPage: topStripe,
    });
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── Safety + JULIE locates ───────────────────────────────────────────────--
  sectionHeader('Safety');
  paragraphOrEmpty(report.safetyNotes);

  sectionHeader('JULIE Locates or Refreshes Needed');
  paragraphOrEmpty(report.locatesNotes);

  // ── Sign-off ─────────────────────────────────────────────────────────────--
  sectionHeader('Sign-Off');
  ensure(20);
  text(slate900); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
  pdf.text(report.preparedByName || '—', margin, y + 6);
  stroke(slate300); pdf.setLineWidth(0.3);
  pdf.line(margin, y + 9, margin + 70, y + 9);
  text(slate500); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
  pdf.text(`Prepared by  •  ${usDate(report.reportDate)}`, margin, y + 13);
  y += 18;

  // ── Footer on every page ─────────────────────────────────────────────────--
  const pageCount = (pdf as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p);
    const fy = pageH - 10;
    stroke(slate300); pdf.setLineWidth(0.3); pdf.line(margin, fy - 3, pageW - margin, fy - 3);
    text(slate500); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
    pdf.text(`Prepared by: ${report.preparedByName || '—'}`, margin, fy);
    pdf.text(`Page ${p} of ${pageCount}`, pageW - margin, fy, { align: 'right' });
  }

  const safeName = (projectNumber || report.jobLabel || 'job').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
  pdf.save(`Daily_Report_${safeName}_${report.reportDate}.pdf`);
}
