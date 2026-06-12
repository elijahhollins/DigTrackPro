import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Employee, Equipment, Material, ServiceJob, WorkLog, InvoiceSettings } from '../../services/schedulingTypes.ts';
import { CostTotals, employeeName, equipmentName, resolveUnitPrice } from './costUtils.ts';

type RGB = [number, number, number];

const PDF_COLORS = {
  white:    [255, 255, 255] as RGB,
  slate300: [203, 213, 225] as RGB,
  slate700: [51, 65, 85] as RGB,
  slate900: [15, 23, 42] as RGB,
};

const hexToRgb = (hex: string): RGB => {
  let clean = hex.replace('#', '');
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [10, 20, 45];
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
};
const lighten = (rgb: RGB, f: number): RGB =>
  rgb.map(c => Math.min(255, Math.round(c + (255 - c) * f))) as RGB;

export interface InvoicePdfArgs {
  job: ServiceJob;
  logs: WorkLog[];
  totals: CostTotals;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  branding: InvoiceSettings;
  employees: Employee[];
  equipment: Equipment[];
  materials: Material[];
}

/**
 * Generates and downloads a branded invoice PDF. Faithful port of the
 * service-track-pro invoice layout (gold stripe, navy header card, per-day line
 * item tables, totals box, footer with payment terms).
 */
export function generateInvoicePdf(args: InvoicePdfArgs): void {
  const { job, logs, totals, invoiceNumber, invoiceDate, dueDate, branding, employees, equipment, materials } = args;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const { white, slate300, slate700, slate900 } = PDF_COLORS;

  const navyDark  = hexToRgb(branding.headerColor || '#0a142d');
  const navyMid   = lighten(navyDark, 0.3);
  const gold      = hexToRgb(branding.accentColor || '#c49614');
  const goldLight = lighten(gold, 0.25);

  const fill   = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
  const text   = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);

  // ── Top gold stripe + header card ──────────────────────────────────────────
  fill(gold); pdf.rect(0, 0, pageW, 3, 'F');

  const cardTop = 10;
  const cardH = 40;
  fill(navyDark); pdf.roundedRect(margin, cardTop, contentW, cardH, 2, 2, 'F');
  fill(gold); pdf.roundedRect(margin, cardTop, 3.5, cardH, 1, 1, 'F');

  // Logo badge + company name
  text(goldLight); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
  pdf.text(branding.companyName || 'Invoice', margin + 8, cardTop + 12);
  text(slate300); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
  pdf.text(branding.companyAddress || '', margin + 8, cardTop + 19, { maxWidth: contentW * 0.55 });
  pdf.text([branding.companyPhone, branding.companyEmail].filter(Boolean).join('  •  '), margin + 8, cardTop + 30);

  // Invoice meta (right aligned)
  const rightX = pageW - margin - 4;
  text(white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
  pdf.text('INVOICE', rightX, cardTop + 11, { align: 'right' });
  text(slate300); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
  pdf.text(`# ${invoiceNumber}`, rightX, cardTop + 18, { align: 'right' });
  pdf.text(`Date: ${invoiceDate.toLocaleDateString('en-US')}`, rightX, cardTop + 24, { align: 'right' });
  pdf.text(`Due:  ${dueDate.toLocaleDateString('en-US')}`, rightX, cardTop + 30, { align: 'right' });

  // ── Bill-to ────────────────────────────────────────────────────────────────
  let cursorY = cardTop + cardH + 8;
  text(slate900); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
  pdf.text('BILL TO', margin, cursorY);
  text(slate700); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
  pdf.text(job.customerName || job.jobName || '—', margin, cursorY + 6);
  if (job.address) pdf.text(job.address, margin, cursorY + 11);
  text(slate700); pdf.setFontSize(8);
  pdf.text(`Job: ${job.jobNumber || job.jobName}`, rightX, cursorY, { align: 'right' });
  cursorY += 18;

  // ── Line items — one table per daily log ──────────────────────────────────
  logs.forEach(log => {
    const logDate = new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (cursorY > pageH - 60) { pdf.addPage(); cursorY = 18; fill(gold); pdf.rect(0, 0, pageW, 3, 'F'); }

    fill(navyMid); pdf.roundedRect(margin, cursorY, contentW, 10, 2, 2, 'F');
    text(goldLight); pdf.setFontSize(8); pdf.setFont('helvetica', 'bold');
    pdf.text(`Daily Log — ${logDate}`, margin + 4, cursorY + 6.8);
    if (log.notes) {
      text(slate300); pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7);
      const n = log.notes.length > 70 ? log.notes.slice(0, 69) + '…' : log.notes;
      pdf.text(n, pageW - margin - 2, cursorY + 6.8, { align: 'right' });
    }
    cursorY += 12;

    const rows: (string | number)[][] = [];
    log.data.employees.forEach(e =>
      rows.push([`Labor — ${employeeName(e.employeeId, employees)}`, `${e.hours}h`, `$${e.rate.toFixed(2)}`, `$${(e.hours * e.rate).toFixed(2)}`]));
    log.data.equipment.forEach(e =>
      rows.push([`Equipment — ${equipmentName(e.equipmentId, equipment)}`, `${e.hours}h`, `$${e.rate.toFixed(2)}`, `$${(e.hours * e.rate).toFixed(2)}`]));
    log.data.materials.forEach(m => {
      const price = resolveUnitPrice(m, materials);
      rows.push([`Material — ${m.name}`, `${m.quantity}`, `$${price.toFixed(2)}`, `$${(m.quantity * price).toFixed(2)}`]);
    });
    if (rows.length === 0) rows.push(['No items recorded', '', '', '']);

    autoTable(pdf, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      head: [['DESCRIPTION', 'QTY / HRS', 'UNIT RATE', 'AMOUNT']],
      body: rows,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.5, textColor: slate700, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 }, lineColor: [220, 228, 240], lineWidth: 0.3 },
      headStyles: { fillColor: [229, 234, 245], textColor: slate900, fontStyle: 'bold', fontSize: 7, lineColor: [196, 150, 20], lineWidth: { bottom: 1 } },
      columnStyles: {
        0: { cellWidth: contentW * 0.52 },
        1: { cellWidth: contentW * 0.14, halign: 'center' },
        2: { cellWidth: contentW * 0.17, halign: 'right' },
        3: { cellWidth: contentW * 0.17, halign: 'right', fontStyle: 'bold', textColor: slate900 },
      },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      didDrawPage: () => { fill(gold); pdf.rect(0, 0, pageW, 3, 'F'); },
    });
    cursorY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  });

  // ── Totals ─────────────────────────────────────────────────────────────────
  if (cursorY + 52 > pageH - 25) { pdf.addPage(); cursorY = 18; fill(gold); pdf.rect(0, 0, pageW, 3, 'F'); }
  cursorY += 4;
  stroke(gold); pdf.setLineWidth(0.8); pdf.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 6;

  const totalsX = pageW - margin - 75;
  const totalsValX = pageW - margin;
  const rows: [string, string][] = [
    ['Labor Subtotal', `$${totals.labor.toFixed(2)}`],
    ['Equipment Subtotal', `$${totals.equipment.toFixed(2)}`],
    ['Material Subtotal', `$${totals.material.toFixed(2)}`],
  ];
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
  rows.forEach(([label, val]) => {
    text(slate700); pdf.text(label, totalsX, cursorY);
    text(slate900); pdf.setFont('helvetica', 'bold');
    pdf.text(val, totalsValX, cursorY, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    cursorY += 8;
  });

  cursorY += 2;
  fill(navyDark); pdf.roundedRect(totalsX - 4, cursorY - 5, 79, 16, 2, 2, 'F');
  fill(gold); pdf.roundedRect(totalsX - 4, cursorY - 5, 3.5, 16, 1, 1, 'F');
  text(white); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
  pdf.text('TOTAL DUE', totalsX + 2, cursorY + 5);
  text(goldLight); pdf.setFontSize(13);
  pdf.text(`$${totals.grand.toFixed(2)}`, totalsValX, cursorY + 5.5, { align: 'right' });

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = pageH - 22;
  stroke(slate300); pdf.setLineWidth(0.3); pdf.line(margin, footerY, pageW - margin, footerY);
  text(slate700); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
  pdf.text('THANK YOU FOR YOUR BUSINESS', pageW / 2, footerY + 6, { align: 'center' });
  text(slate300); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
  pdf.text(branding.paymentTerms || '', pageW / 2, footerY + 12, { align: 'center', maxWidth: contentW });

  pdf.save(`${invoiceNumber}.pdf`);
}
