// In-memory stand-in for the Supabase-backed apiService, aliased in by
// verify-harness/vite.config.ts so the markup editor runs without a backend.
import { PdfAnnotation } from '../types.ts';

let anns: PdfAnnotation[] = [];

export const apiService = {
  async downloadJobPrint(_storagePath: string): Promise<ArrayBuffer> {
    const res = await fetch('/verify-harness/test.pdf');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.arrayBuffer();
  },
  async getAnnotations(_printId: string): Promise<PdfAnnotation[]> {
    return [...anns];
  },
  async saveAnnotation(a: Omit<PdfAnnotation, 'id' | 'createdAt'>): Promise<PdfAnnotation> {
    const saved: PdfAnnotation = { ...a, id: 'ann-' + Math.random().toString(36).slice(2), createdAt: Date.now() };
    anns.push(saved);
    return saved;
  },
  async deleteAnnotation(id: string): Promise<void> {
    anns = anns.filter(x => x.id !== id);
  },
};
