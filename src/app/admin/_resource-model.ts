export interface ResourceRecord<T> { owner: string; path: string; epoch: number; data: T | null; error: string }
export function readableData<T>(record: ResourceRecord<T> | null, owner: string, path: string, allowed: boolean): T | null {
  return allowed && owner && record?.owner === owner && record.path === path ? record.data : null;
}
export function errorFallbackData<T>(status: number | null, record: ResourceRecord<T> | null, owner: string, path: string): T | null {
  return status === 401 || status === 403 ? null : readableData(record, owner, path, true);
}
