import type { ReadingRepository } from '../../../packages/api/src/readingRepository.ts';
import type { ReadingLog } from '../../types/records.ts';

// Stable IDs let interrupted imports resume without duplicating saved notes.
export async function legacyReadingNoteId(userId: string, bookId: string, logId: string): Promise<string> {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(logId))
        return logId.toLowerCase();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['blanky-legacy-reading-note', userId, bookId, logId])));
    const bytes = new Uint8Array(digest).slice(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x80;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

export async function importLegacyReadingNotes(repo: Pick<ReadingRepository, 'getReadingNotes' | 'createReadingNote'>, userId: string, legacyBookId: string, bookId: string, logs: ReadingLog[]): Promise<void> {
    const existing = await repo.getReadingNotes(bookId);
    const saved = new Set(existing.map(note => note.id.toLowerCase()));
    for (const log of logs.filter(log => log.bookId === legacyBookId)) {
        const id = await legacyReadingNoteId(userId, legacyBookId, log.id);
        // Local libraries may already contain notes imported with the old string ID.
        if (saved.has(id) || saved.has(log.id.toLowerCase())) continue;
        await repo.createReadingNote(bookId, { content: [log.date, log.page !== null ? 'p.' + log.page : '', log.note].filter(Boolean).join('\n'), tags: [] }, id);
        saved.add(id);
    }
}
