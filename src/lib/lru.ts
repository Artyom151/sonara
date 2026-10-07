/** Map with a size cap: reading refreshes an entry, inserting past `max` evicts the oldest. */
export class LruMap<K, V> extends Map<K, V> {
  constructor(private readonly max: number) {
    super();
  }

  override get(key: K): V | undefined {
    if (!super.has(key)) return undefined;
    const v = super.get(key)!;
    super.delete(key);
    super.set(key, v);
    return v;
  }

  override set(key: K, value: V): this {
    if (super.has(key)) super.delete(key);
    super.set(key, value);
    while (this.size > this.max) super.delete(this.keys().next().value as K);
    return this;
  }
}
