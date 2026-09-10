# Notes worth sharing

A little structure brings an idea to life.

## Write once. Keep the details.

### Python

```python
def publish(notes):
    """Give every idea a page."""
    for note in notes:
        export_pdf(note, theme="minimal")
    return len(notes)
```

### Mathematics

$$\int_0^1 x^2\,dx = \frac{1}{3}$$

| Your words | On the page |
| :--- | :--- |
| Code & equations | Clear and readable |
| 中文与 English | Together, naturally |
