import LRU from "lru-cache";

interface KeyValueCache {
  get(key: string): void;
  set(key: string, value: any): void;
  has(key: string): boolean;
}

export class LRUCache implements KeyValueCache {
  private cache: LRU.Cache<string, object>;

  public static getInstance(options?: LRU.Options) {
    if (!options) {
      options = { max: 100, maxAge: 1000 * 60 * 60 };
    }
    return new LRUCache(options);
  }

  private constructor({ max, maxAge = 1000 * 60 * 60 }: LRU.Options) {
    this.cache = new LRU<string, object>({
      max,
      maxAge
    });
  }
  public get(key: string) {
    return this.cache.get(key);
  }

  public set(key: string, value: any) {
    return this.cache.set(key, value);
  }

  public has(key: string) {
    return this.cache.has(key);
  }
}

export function getCache(options?: LRU.Options) {
  return LRUCache.getInstance(options);
}
