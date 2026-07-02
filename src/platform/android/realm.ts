export type ObjectSchema = any;

type ConstructorValue = string | number | undefined | null;

const makeObjectIdValue = (value?: ConstructorValue) => {
  if (value !== undefined && value !== null) {
    return String(value);
  }

  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
};

export const BSON = {
  ObjectId: class ObjectId {
    private value: string;

    constructor(value?: ConstructorValue) {
      this.value = makeObjectIdValue(value);
    }

    toHexString() {
      return this.value;
    }

    toString() {
      return this.value;
    }

    valueOf() {
      return this.value;
    }
  },
};

class RealmObject {}

const emptyResults: any[] & {filtered?: any; sorted?: any} = [] as any;
emptyResults.filtered = () => emptyResults;
emptyResults.sorted = () => emptyResults;

const Realm = {
  Object: RealmObject,
  BSON,
  open: async () => ({
    write: (callback: any) => {
      if (typeof callback === 'function') {
        callback();
      }
    },
    create: () => ({}),
    objects: () => emptyResults,
    objectForPrimaryKey: () => null,
    delete: () => undefined,
    close: () => undefined,
  }),
};

export default Realm;
