import React from 'react';

type ProviderProps = {
  children: React.ReactNode;
};

const emptyResults: any[] & {filtered?: any; sorted?: any} = [] as any;
emptyResults.filtered = () => emptyResults;
emptyResults.sorted = () => emptyResults;

const offlineRealm = {
  write: (callback: any) => {
    if (typeof callback === 'function') {
      callback();
    }
  },
  create: () => ({}),
  objects: () => emptyResults,
  objectForPrimaryKey: () => null,
  delete: () => undefined,
};

export function RealmProvider({children}: ProviderProps) {
  return <>{children}</>;
}

export function useRealm() {
  return offlineRealm;
}

export function useQuery() {
  return emptyResults;
}

export function useObject() {
  return null;
}
