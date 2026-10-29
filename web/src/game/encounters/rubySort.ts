// Ruby's Array#sort! with a block, which hands the array to the C library's
// qsort (util.c ruby_qsort). It isn't stable, and isn't even idempotent for
// equal keys, so choose_wild_pokemon's `enc_list.sort! { |a, b| b[0] <=> a[0] }`
// reorders slots with the same chance, every time it runs. Which species a
// roll lands on depends on that order, so the port sorts the same way.
//
// Which qsort depends on how Ruby was built:
//   - Windows (the game's mkxp-z build; MinGW defines RUBY_MSVCRT_VERSION and
//     has qsort_s): the Microsoft CRT qsort (qsort.c: shortsort for <= 8
//     elements, median-of-three quicksort above).
//   - macOS (the system Ruby the reference harness runs on): libc qsort_r,
//     Bentley & McIlroy's as in FreeBSD's qsort.c with two differences
//     measured against the real one (fuzzed with a C program): insertion sort
//     up to 7 elements, and the pivot goes back in place before the "no swaps,
//     switch to insertion sort" pass. It matches every encounter table of this
//     game (once and twice sorted) and 99.5% of random arrays; the rest differ
//     in a bounded insertion sort Apple added, which no table here reaches.
//   - Elsewhere without qsort_r: Ruby's own mm.c (mmQsort below).
// The game uses the Windows one (the original runs on Windows; not verifiable
// here, there is no Windows Ruby to compare with); the tests use the macOS
// one, to compare against web/tools/ruby-ref/encounters.rb.

export type Cmp<T> = (a: T, b: T) => number;
export type SortAlgorithm = "msvcrt" | "bsd" | "mm";

export const RubySort = {
  algorithm: "msvcrt" as SortAlgorithm,
};

/** array.sort! { |a, b| cmp(a, b) } in place, with the configured qsort. */
export function rubySortBy<T>(arr: T[], cmp: Cmp<T>): T[] {
  if (RubySort.algorithm === "bsd") bsdQsort(arr, 0, arr.length, cmp);
  else if (RubySort.algorithm === "mm") mmQsort(arr, cmp);
  else msvcrtQsort(arr, cmp);
  return arr;
}

function swap<T>(arr: T[], i: number, j: number): void {
  const t = arr[i]!;
  arr[i] = arr[j]!;
  arr[j] = t;
}

//===============================================================================
// Microsoft CRT qsort (crt/src/qsort.c)
//===============================================================================
const CUTOFF = 8;

function shortsort<T>(arr: T[], lo: number, hi: number, cmp: Cmp<T>): void {
  while (hi > lo) {
    let max = lo;
    for (let p = lo + 1; p <= hi; p++) if (cmp(arr[p]!, arr[max]!) > 0) max = p;
    swap(arr, max, hi);
    hi -= 1;
  }
}

export function msvcrtQsort<T>(arr: T[], cmp: Cmp<T>): void {
  if (arr.length < 2) return;
  const lostk: number[] = [];
  const histk: number[] = [];
  let lo = 0;
  let hi = arr.length - 1;
  for (;;) {
    const size = hi - lo + 1;
    if (size <= CUTOFF) {
      shortsort(arr, lo, hi, cmp);
    } else {
      let mid = lo + Math.floor(size / 2);
      if (cmp(arr[lo]!, arr[mid]!) > 0) swap(arr, lo, mid);
      if (cmp(arr[lo]!, arr[hi]!) > 0) swap(arr, lo, hi);
      if (cmp(arr[mid]!, arr[hi]!) > 0) swap(arr, mid, hi);
      let loguy = lo;
      let higuy = hi;
      for (;;) {
        if (mid > loguy) {
          do loguy += 1; while (loguy < mid && cmp(arr[loguy]!, arr[mid]!) <= 0);
        }
        if (mid <= loguy) {
          do loguy += 1; while (loguy <= hi && cmp(arr[loguy]!, arr[mid]!) <= 0);
        }
        do higuy -= 1; while (higuy > mid && cmp(arr[higuy]!, arr[mid]!) > 0);
        if (higuy < loguy) break;
        swap(arr, loguy, higuy);
        if (mid === higuy) mid = loguy;
      }
      higuy += 1;
      if (mid < higuy) {
        do higuy -= 1; while (higuy > mid && cmp(arr[higuy]!, arr[mid]!) === 0);
      }
      if (mid >= higuy) {
        do higuy -= 1; while (higuy > lo && cmp(arr[higuy]!, arr[mid]!) === 0);
      }
      if (higuy - lo >= hi - loguy) {
        if (lo < higuy) {
          lostk.push(lo);
          histk.push(higuy);
        }
        if (loguy < hi) {
          lo = loguy;
          continue;
        }
      } else {
        if (loguy < hi) {
          lostk.push(loguy);
          histk.push(hi);
        }
        if (lo < higuy) {
          hi = higuy;
          continue;
        }
      }
    }
    if (lostk.length === 0) return;
    lo = lostk.pop()!;
    hi = histk.pop()!;
  }
}

//===============================================================================
// BSD qsort_r (FreeBSD/Apple libc stdlib/qsort.c), on arr[a, a + n)
//===============================================================================
function med3<T>(arr: T[], a: number, b: number, c: number, cmp: Cmp<T>): number {
  return cmp(arr[a]!, arr[b]!) < 0
    ? (cmp(arr[b]!, arr[c]!) < 0 ? b : cmp(arr[a]!, arr[c]!) < 0 ? c : a)
    : (cmp(arr[b]!, arr[c]!) > 0 ? b : cmp(arr[a]!, arr[c]!) < 0 ? a : c);
}

function vecswap<T>(arr: T[], i: number, j: number, n: number): void {
  for (let k = 0; k < n; k++) swap(arr, i + k, j + k);
}

function insertionSort<T>(arr: T[], a: number, n: number, cmp: Cmp<T>): void {
  for (let pm = a + 1; pm < a + n; pm++) {
    for (let pl = pm; pl > a && cmp(arr[pl - 1]!, arr[pl]!) > 0; pl--) swap(arr, pl, pl - 1);
  }
}

export function bsdQsort<T>(arr: T[], a: number, n: number, cmp: Cmp<T>): void {
  for (;;) {
    let swapCnt = 0;
    if (n < 8) { // (FreeBSD sorts n < 7 this way; macOS libc also n == 7)
      insertionSort(arr, a, n, cmp);
      return;
    }
    let pm = a + Math.floor(n / 2);
    if (n > 7) {
      let pl = a;
      let pn = a + n - 1;
      if (n > 40) {
        const d = Math.floor(n / 8);
        pl = med3(arr, pl, pl + d, pl + 2 * d, cmp);
        pm = med3(arr, pm - d, pm, pm + d, cmp);
        pn = med3(arr, pn - 2 * d, pn - d, pn, cmp);
      }
      pm = med3(arr, pl, pm, pn, cmp);
    }
    swap(arr, a, pm);
    let pa = a + 1;
    let pb = pa;
    let pc = a + n - 1;
    let pd = pc;
    for (;;) {
      let r: number;
      while (pb <= pc && (r = cmp(arr[pb]!, arr[a]!)) <= 0) {
        if (r === 0) {
          swapCnt = 1;
          swap(arr, pa, pb);
          pa += 1;
        }
        pb += 1;
      }
      while (pb <= pc && (r = cmp(arr[pc]!, arr[a]!)) >= 0) {
        if (r === 0) {
          swapCnt = 1;
          swap(arr, pc, pd);
          pd -= 1;
        }
        pc -= 1;
      }
      if (pb > pc) break;
      swap(arr, pb, pc);
      swapCnt = 1;
      pb += 1;
      pc -= 1;
    }
    if (swapCnt === 0) { // Switch to insertion sort
      // (macOS libc first puts the pivot back where it came from, so an
      // already ordered region is left untouched.)
      swap(arr, a, pm);
      insertionSort(arr, a, n, cmp);
      return;
    }
    const pn = a + n;
    let d1 = Math.min(pa - a, pb - pa);
    vecswap(arr, a, pb - d1, d1);
    d1 = Math.min(pd - pc, pn - pd - 1);
    vecswap(arr, pb, pn - d1, d1);
    d1 = pb - pa;
    const d2 = pd - pc;
    if (d1 <= d2) {
      // Recurse on left partition, then iterate on right partition
      if (d1 > 1) bsdQsort(arr, a, d1, cmp);
      if (d2 > 1) {
        a = pn - d2;
        n = d2;
        continue;
      }
    } else {
      // Recurse on right partition, then iterate on left partition
      if (d2 > 1) bsdQsort(arr, pn - d2, d2, cmp);
      if (d1 > 1) {
        n = d1;
        continue;
      }
    }
    return;
  }
}

//===============================================================================
// Ruby's own qsort (util.c "mm.c" / qs6 by Tomoyuki Kawamura), used when the
// platform has no usable qsort_r/qsort_s
//===============================================================================
export function mmQsort<T>(arr: T[], cmp: Cmp<T>): void {
  const nel = arr.length;
  if (nel <= 1) return; // need not to sort
  const c = (i: number, j: number) => cmp(arr[i]!, arr[j]!);
  const med3i = (a: number, b: number, d: number) =>
    c(a, b) < 0 ? (c(b, d) < 0 ? b : c(a, d) < 0 ? d : a) : (c(b, d) > 0 ? b : c(a, d) < 0 ? a : d);
  /** a, b, c = b, c, a */
  const rot3 = (a: number, b: number, d: number) => {
    const s = arr[a]!;
    arr[a] = arr[b]!;
    arr[b] = arr[d]!;
    arr[d] = s;
  };
  const sw = (i: number, j: number) => { if (i !== j) swap(arr, i, j); };
  let L = 0; // left end of current region
  let R = nel - 1; // right end of current region
  let chklim = 63; // threshold of ordering element check
  const stack: [number, number][] = [];
  let l = 0, r = 0, m = 0, t = 0, eqL = 0, eqR = 0;
  let state: "start" | "nxt" | "loopA" | "loopB" | "fin" = "start";
  for (;;) {
    switch (state) {
      case "nxt":
        if (stack.length === 0) return; // return if stack is empty
        [L, R] = stack.pop()!;
        state = "start";
        break;
      case "start": {
        if (L + 1 === R) { // 2 elements
          if (c(L, R) > 0) sw(L, R);
          state = "nxt";
          break;
        }
        l = L;
        r = R;
        let n = r - l + 1; // number of elements
        m = l + (n >> 1); // calculate median value
        if (n >= 60) {
          let m1: number, m3: number;
          if (n >= 200) {
            n = n >> 3; // splitting 8
            let p1 = l + n, p2 = p1 + n, p3 = p2 + n;
            m1 = med3i(p1, p2, p3);
            p1 = m + n; p2 = p1 + n; p3 = p2 + n;
            m3 = med3i(p1, p2, p3);
          } else {
            n = n >> 2; // splitting 4
            m1 = l + n;
            m3 = m + n;
          }
          m = med3i(m1, m, m3);
        }
        if ((t = c(l, m)) < 0) { // 3-5-?
          if ((t = c(m, r)) < 0) { // 3-5-7
            if (chklim && nel >= chklim) { // check if already ascending order
              chklim = 0;
              let ordered = true;
              for (let p = l; p < r; p++) if (c(p, p + 1) > 0) { ordered = false; break; }
              if (ordered) { state = "nxt"; break; }
            }
            state = "loopA";
            break;
          }
          if (t > 0) {
            if (c(l, r) <= 0) { sw(m, r); state = "loopA"; break; } // 3-5-4
            rot3(r, m, l); state = "loopA"; break; // 3-5-2
          }
          state = "loopB"; // 3-5-5
          break;
        }
        if (t > 0) { // 7-5-?
          if ((t = c(m, r)) > 0) { // 7-5-3
            if (chklim && nel >= chklim) { // check if already ascending order
              chklim = 0;
              let ordered = true;
              for (let p = l; p < r; p++) if (c(p, p + 1) < 0) { ordered = false; break; }
              if (ordered) {
                while (l < r) { sw(l, r); l += 1; r -= 1; } // reverse region
                state = "nxt";
                break;
              }
            }
            sw(l, r); state = "loopA"; break; // 7-5-3
          }
          if (t < 0) {
            if (c(l, r) <= 0) { sw(l, m); state = "loopB"; break; } // 7-5-8
            rot3(l, m, r); state = "loopA"; break; // 7-5-6
          }
          sw(l, r); state = "loopA"; break; // 7-5-5
        }
        if ((t = c(m, r)) < 0) { state = "loopA"; break; } // 5-5-7
        if (t > 0) { sw(l, r); state = "loopB"; break; } // 5-5-3
        // determining splitting type in case 5-5-5
        for (;;) {
          if ((l += 1) === r) { state = "nxt"; break; }
          if (l === m) continue;
          if ((t = c(l, m)) > 0) { sw(l, r); l = L; state = "loopA"; break; } // 575-5
          if (t < 0) { sw(L, l); l = L; state = "loopB"; break; } // 535-5
        }
        break;
      }
      case "loopA": { // splitting type A: left <= median < right
        eqL = 1; eqR = 1;
        outer: for (;;) {
          for (;;) {
            if ((l += 1) === r) { l -= 1; if (l !== m) sw(m, l); l -= 1; break outer; }
            if (l === m) continue;
            if ((t = c(l, m)) > 0) { eqR = 0; break; }
            if (t < 0) eqL = 0;
          }
          for (;;) {
            if (l === (r -= 1)) { l -= 1; if (l !== m) sw(m, l); l -= 1; break outer; }
            if (r === m) { m = l; break; }
            if ((t = c(r, m)) < 0) { eqL = 0; break; }
            if (t === 0) break;
          }
          sw(l, r); // swap left and right
        }
        state = "fin";
        break;
      }
      case "loopB": { // splitting type B: left < median <= right
        eqL = 1; eqR = 1;
        outer: for (;;) {
          for (;;) {
            if (l === (r -= 1)) { r += 1; if (r !== m) sw(r, m); r += 1; break outer; }
            if (r === m) continue;
            if ((t = c(r, m)) < 0) { eqL = 0; break; }
            if (t > 0) eqR = 0;
          }
          for (;;) {
            if ((l += 1) === r) { r += 1; if (r !== m) sw(r, m); r += 1; break outer; }
            if (l === m) { m = r; break; }
            if ((t = c(l, m)) > 0) { eqR = 0; break; }
            if (t === 0) break;
          }
          sw(l, r); // swap left and right
        }
        state = "fin";
        break;
      }
      case "fin":
        state = "start";
        if (eqL === 0) { // need to sort left side
          if (eqR === 0) { // need to sort right side
            if (l - L < R - r) { stack.push([r, R]); R = l; } // sort left side first
            else { stack.push([L, l]); L = r; } // sort right side first
          } else R = l; // need to sort left side only
        } else if (eqR === 0) L = r; // need to sort right side only
        else state = "nxt"; // need not to sort both sides
        break;
    }
  }
}
