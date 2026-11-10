export abstract class BaseRepository<T extends { id: string }> {
  protected cache: Record<string, T> = Object.create(null);
  protected isLoaded = false;
  protected pendingWrites: Set<Promise<any>> = new Set();

  public get(id: string): T | undefined {
    return this.cache[id];
  }

  public has(id: string): boolean {
    return id in this.cache;
  }

  public async set(id: string, record: T): Promise<T> {
    await this.persistInsertOrUpdate(record);
    this.cache[id] = record;
    return record;
  }

  public setLocal(id: string, record: T): this {
    this.cache[id] = record;
    return this;
  }

  public async delete(id: string): Promise<boolean> {
    const existed = id in this.cache;
    if (existed) {
      await this.persistDelete(id);
      delete this.cache[id];
    }
    return existed;
  }

  public async clear(): Promise<void> {
    await this.persistClear();
    this.cache = Object.create(null);
  }

  public async flush(): Promise<void> {
    if (this.pendingWrites.size > 0) {
      await Promise.allSettled(Array.from(this.pendingWrites));
    }
  }

  public get size(): number {
    return Object.keys(this.cache).length;
  }

  public values(): IterableIterator<T> {
    return Object.values(this.cache)[Symbol.iterator]();
  }

  public keys(): IterableIterator<string> {
    return Object.keys(this.cache)[Symbol.iterator]();
  }

  public entries(): IterableIterator<[string, T]> {
    return Object.entries(this.cache)[Symbol.iterator]() as IterableIterator<[string, T]>;
  }

  public [Symbol.iterator](): IterableIterator<[string, T]> {
    return this.entries();
  }

  public forEach(callbackfn: (value: T, key: string, map: Map<string, T> | any) => void): void {
    for (const [key, val] of Object.entries(this.cache)) {
      callbackfn(val, key, this as any);
    }
  }

  public populateFromCache(records: T[]): void {
    this.cache = Object.create(null);
    for (const r of records) {
      this.cache[r.id] = r;
    }
    this.isLoaded = true;
  }

  public abstract loadFromDb(): Promise<void>;
  public abstract persistInsertOrUpdate(record: T): Promise<void>;
  public abstract persistDelete(id: string): Promise<void>;
  public abstract persistClear(): Promise<void>;
}
