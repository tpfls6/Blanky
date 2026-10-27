export interface PatternPreset {
    id: string;
    label: string;
    svg: string;
}
export const PATTERN_PRESETS: PatternPreset[] = [
    { id: 'dots', label: '도트', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="4" cy="4" r="1.4" fill="#c4c4c4"/></svg>' },
    { id: 'grid', label: '격자', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M24 0H0v24" fill="none" stroke="#c4c4c4" stroke-width="1"/></svg>' },
    { id: 'checks', label: '체크', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="12" height="12" fill="#d9d9d9"/><rect x="12" y="12" width="12" height="12" fill="#d9d9d9"/></svg>' },
    { id: 'stars', label: '별', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="#c4c4c4" d="M8 3l1.2 3.6H13l-3 2.2 1.1 3.6L8 10.2 4.9 12.4 6 8.8 3 6.6h3.8z"/></svg>' },
];
