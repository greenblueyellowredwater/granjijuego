const MBIG = 2147483647;
const MSEED = 161803398;

export class DotNetRandom {
  private readonly seedArray = new Int32Array(56);
  private inext = 0;
  private inextp = 21;

  constructor(seed: number) {
    const subtraction = seed === -2147483648 ? MBIG : Math.abs(seed | 0);
    let mj = MSEED - subtraction;
    this.seedArray[55] = mj;
    let mk = 1;
    let ii = 0;
    for (let i = 1; i < 55; i++) {
      ii += 21;
      if (ii >= 55) ii -= 55;
      this.seedArray[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = this.seedArray[ii];
    }
    for (let k = 1; k < 5; k++) {
      for (let i = 1; i < 56; i++) {
        let n = i + 30;
        if (n >= 55) n -= 55;
        let v = this.seedArray[i] - this.seedArray[1 + n];
        if (v < 0) v += MBIG;
        this.seedArray[i] = v;
      }
    }
  }

  private internalSample() {
    let locINext = this.inext + 1;
    if (locINext >= 56) locINext = 1;
    let locINextp = this.inextp + 1;
    if (locINextp >= 56) locINextp = 1;
    let ret = this.seedArray[locINext] - this.seedArray[locINextp];
    if (ret === MBIG) ret--;
    if (ret < 0) ret += MBIG;
    this.seedArray[locINext] = ret;
    this.inext = locINext;
    this.inextp = locINextp;
    return ret;
  }

  private sample() {
    return this.internalSample() * (1.0 / MBIG);
  }

  private largeRangeSample() {
    let result = this.internalSample();
    if (this.internalSample() % 2 === 0) result = -result;
    return (result + (MBIG - 1)) / (2 * MBIG - 1);
  }

  next(): number;
  next(maxExclusive: number): number;
  next(minInclusive: number, maxExclusive: number): number;
  next(a?: number, b?: number) {
    if (a === undefined) return this.internalSample();
    if (b === undefined) return Math.trunc(this.sample() * a);
    const range = b - a;
    if (range <= MBIG) return Math.trunc(this.sample() * range) + a;
    return Math.trunc(this.largeRangeSample() * range) + a;
  }

  nextDouble() {
    return this.sample();
  }

  nextBool() {
    return this.nextDouble() < 0.5;
  }

  choose<T>(...options: T[]): T {
    if (options.length === 2) return this.nextDouble() < 0.5 ? options[0] : options[1];
    return options[this.next(options.length)];
  }
}

const P1 = 2654435761, P2 = 2246822519, P3 = 3266489917, P4 = 668265263, P5 = 374761393;

const rotl = (x: number, r: number) => ((x << r) | (x >>> (32 - r))) >>> 0;
const mul = (a: number, b: number) => Math.imul(a, b) >>> 0;

export function xxHash32(data: Uint8Array, seed = 0) {
  const len = data.length;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let p = 0;
  let h: number;
  if (len >= 16) {
    let v1 = (seed + P1 + P2) >>> 0, v2 = (seed + P2) >>> 0, v3 = seed >>> 0, v4 = (seed - P1) >>> 0;
    while (p <= len - 16) {
      v1 = mul(rotl((v1 + mul(view.getUint32(p, true), P2)) >>> 0, 13), P1);
      v2 = mul(rotl((v2 + mul(view.getUint32(p + 4, true), P2)) >>> 0, 13), P1);
      v3 = mul(rotl((v3 + mul(view.getUint32(p + 8, true), P2)) >>> 0, 13), P1);
      v4 = mul(rotl((v4 + mul(view.getUint32(p + 12, true), P2)) >>> 0, 13), P1);
      p += 16;
    }
    h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) >>> 0;
  } else h = (seed + P5) >>> 0;
  h = (h + len) >>> 0;
  while (p <= len - 4) {
    h = mul(rotl((h + mul(view.getUint32(p, true), P3)) >>> 0, 17), P4);
    p += 4;
  }
  while (p < len) {
    h = mul(rotl((h + mul(data[p], P5)) >>> 0, 11), P1);
    p++;
  }
  h = mul(h ^ (h >>> 15), P2);
  h = mul(h ^ (h >>> 13), P3);
  return (h ^ (h >>> 16)) >>> 0;
}

const toSeedInt = (v: number) => Math.trunc(v % 2147483647) | 0;

export function createRandomSeed(a: number, b = 0, c = 0, d = 0, e = 0) {
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  [a, b, c, d, e].forEach((v, i) => view.setInt32(i * 4, toSeedInt(v), true));
  return xxHash32(bytes) | 0;
}

export function createRandom(a: number, b = 0, c = 0, d = 0, e = 0) {
  return new DotNetRandom(createRandomSeed(a, b, c, d, e));
}
