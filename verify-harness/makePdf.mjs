// Generate a 6-page test PDF with numbered grid pages so zoom-anchoring drift
// is visually and programmatically detectable. Page 4 is landscape to exercise
// mixed page sizes.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'fs';

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.HelveticaBold);

for (let p = 1; p <= 6; p++) {
  const landscape = p === 4;
  const W = landscape ? 792 : 612, H = landscape ? 612 : 792;
  const page = doc.addPage([W, H]);
  // 50pt grid with coordinate labels
  for (let x = 0; x <= W; x += 50) {
    page.drawLine({ start: { x, y: 0 }, end: { x, y: H }, thickness: x % 100 === 0 ? 1 : 0.4, color: rgb(0.75, 0.8, 0.9) });
  }
  for (let y = 0; y <= H; y += 50) {
    page.drawLine({ start: { x: 0, y }, end: { x: W, y }, thickness: y % 100 === 0 ? 1 : 0.4, color: rgb(0.75, 0.8, 0.9) });
    page.drawText(String(H - y), { x: 4, y: y + 2, size: 8, font, color: rgb(0.4, 0.45, 0.55) });
  }
  page.drawText(`PAGE ${p}`, { x: W / 2 - 90, y: H / 2 - 30, size: 60, font, color: rgb(0.15, 0.3, 0.75) });
  page.drawCircle({ x: W / 2, y: H / 2, size: 6, color: rgb(0.9, 0.2, 0.2) });
}

writeFileSync(new URL('./test.pdf', import.meta.url), await doc.save());
console.log('wrote test.pdf');
