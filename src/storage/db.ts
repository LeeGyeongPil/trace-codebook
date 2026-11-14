// IndexedDB 저장소(idb 래퍼). 파일 지문 하나 = 프로젝트 하나.
// 주석·유형 상태를 통째로 한 레코드에 저장한다 — 수천 건이어도 작고, 한 번에 읽고 쓰므로 반쯤 저장된 상태가 없다.
// 데이터는 이 브라우저의 이 사이트 저장소에만 있다(서버로 가지 않는다).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ProjectState } from '../core/annotations';

export const DB_NAME = 'trace-codebook';
const DB_VERSION = 1;

export type SavedProject = {
  fingerprint: string;
  fileName: string;
  savedAt: string;
  state: ProjectState;
};

interface Schema extends DBSchema {
  projects: { key: string; value: SavedProject };
}

export type ProjectStore = {
  load(fingerprint: string): Promise<SavedProject | undefined>;
  save(fingerprint: string, fileName: string, state: ProjectState): Promise<void>;
  list(): Promise<SavedProject[]>;
  remove(fingerprint: string): Promise<void>;
  /** 연결을 닫는다(테스트·페이지 종료 때) */
  close(): void;
};

export async function openProjectStore(name = DB_NAME): Promise<ProjectStore> {
  const db: IDBPDatabase<Schema> = await openDB<Schema>(name, DB_VERSION, {
    upgrade(d) {
      d.createObjectStore('projects', { keyPath: 'fingerprint' });
    },
  });
  return {
    load: (fp) => db.get('projects', fp),
    async save(fp, fileName, state) {
      await db.put('projects', { fingerprint: fp, fileName, savedAt: new Date().toISOString(), state });
    },
    list: () => db.getAll('projects'),
    remove: (fp) => db.delete('projects', fp),
    close: () => db.close(),
  };
}
