export interface Note {
  id: string; // Composite key: `${source}::${key}`
  source: string;
  key: string;
  content: string;
}
