# Binary search

Lecture notes · Algorithms 101 · Week 3

These notes cover how binary search works, why it is fast, and the three small details that make most first attempts wrong. Read sections 01–03 before class; section 06 is the homework.

**Contents:** [The idea](#01-the-idea) · [The algorithm](#02-the-algorithm) · [A worked trace](#03-a-worked-trace) · [Cost](#04-cost) · [Edge cases](#05-edge-cases) · [Practice](#06-practice)

## 01 The idea

Looking for a word in a dictionary, nobody starts at page one. You open it near the middle, see whether your word comes _before_ or _after_ that page, and throw the wrong half away. **Binary search** is that habit written down precisely: every comparison halves the part of a sorted list that could still hold the answer.

> [!NOTE]
> Binary search only works on data that is already sorted. Sorting costs more than one search, so it pays off when the same list is searched many times.

### Why halving is so fast

Each step keeps at most half of the remaining items. After $k$ steps at most $n / 2^k$ items are left, so the search ends once $2^k \geq n$:

$$
k = \lceil \log_2 n \rceil
\qquad\Rightarrow\qquad
\log_2 1\,000\,000 \approx 20
$$

Twenty comparisons are enough for a million items. A linear scan could need all one million.

## 02 The algorithm

The loop keeps two indices around the region that could still contain the target:

- `lo`, the first index still in play;
- `hi`, the last index still in play;
- `mid`, the index halfway between them, recomputed on every pass.

```python
def binary_search(items: list[int], target: int) -> int:
    """Return the index of target in a sorted list, or -1."""
    lo, hi = 0, len(items) - 1

    while lo <= hi:
        mid = (lo + hi) // 2
        if items[mid] == target:
            return mid
        if items[mid] < target:
            lo = mid + 1  # the target can only be to the right
        else:
            hi = mid - 1  # the target can only be to the left

    return -1
```

> [!IMPORTANT]
> The **invariant**: if the target is in the list at all, it is somewhere between `lo` and `hi`. Every line of the loop exists to keep that sentence true.

#### Why the loop runs while `lo <= hi`

When `lo` equals `hi` there is still exactly one candidate left, and it has not been checked yet. Stopping at `lo < hi` would skip it.

> [!CAUTION]
> Writing `lo = mid` instead of `lo = mid + 1` looks harmless and can loop forever: once `lo` and `hi` are neighbours, `mid` equals `lo` and nothing moves. Always step **past** the index you just ruled out.

## 03 A worked trace

Search for `26` in nine sorted numbers. The first comparison lands on index 4:

<p align="center"><img src="binary-search-step.svg" alt="Array of nine sorted numbers with lo, mid and hi pointers" width="560"></p>

_Figure 1. Step 1: a[4] = 21 is smaller than 26, so indices 0–4 are discarded._

| Step | `lo` | `hi` | `mid` | `a[mid]` | Decision             |
| ---: | ---: | ---: | ----: | -------: | :------------------- |
|    1 |    0 |    8 |     4 |       21 | 21 < 26, go right    |
|    2 |    5 |    8 |     6 |       30 | 30 > 26, go left     |
|    3 |    5 |    5 |     5 |       26 | **found** at index 5 |

Three comparisons instead of six. Notice that in step 3 the region has shrunk to a single item — exactly the case the `lo <= hi` condition protects.

## 04 Cost

|     Items $n$ | Linear search, worst case | Binary search, worst case |
| ------------: | ------------------------: | ------------------------: |
|            10 |                        10 |                         4 |
|         1,000 |                     1,000 |                        10 |
|     1,000,000 |                 1,000,000 |                        20 |
| 1,000,000,000 |             1,000,000,000 |                        30 |

Multiplying the input by a thousand adds only about ten comparisons. That is what $O(\log n)$ means in practice.

> [!TIP]
> To estimate the number of steps in your head, count how many times you can halve $n$ before reaching 1. For a thousand items: 500, 250, 125, 63, 32, 16, 8, 4, 2, 1 — ten halvings.

## 05 Edge cases

##### Empty list

`len(items) - 1` is `-1`, so `lo <= hi` is false immediately and the function returns `-1` without touching the list.

##### Repeated values

If the target appears more than once, the function returns _one_ of the matching indices, not necessarily the first.

###### What callers should assume

Only that the returned index holds the target. If you need the first or last occurrence, use a variant such as `bisect_left`:

```python
from bisect import bisect_left
index = bisect_left(items, target)
```

A test run should show every case passing:

```text nonumbers
test_empty_list ............. ok
test_single_item ............ ok
test_target_at_both_ends .... ok
test_target_missing ......... ok
test_repeated_values ........ ok
```

> [!WARNING]
> Passing an unsorted list does not raise an error. The function simply returns wrong answers, which is harder to notice than a crash.

## 06 Practice

- [x] Read sections 01–03.
- [ ] Trace the search for `8` and for `27` by hand, using the table format above.
- [ ] Implement the function and run it against the five tests.

1. Why does `mid = (lo + hi) // 2` never go outside the list?
2. How many comparisons does a list of 5,000 items need in the worst case?
3. Change the function so it returns the **first** occurrence of a repeated value.

<details><summary>Hint for question 3</summary><p>When you find a match, do not return yet. Record the index and keep searching the left half with <code>hi = mid - 1</code>.</p></details>

> Many experienced programmers get binary search wrong on the first attempt.[^bentley] Test the boundaries, not just the middle.

Run the tests with <kbd>Ctrl</kbd> + <kbd>F5</kbd> in the course editor.

[^bentley]: Jon Bentley, _Programming Pearls_, 2nd edition, column 4.
