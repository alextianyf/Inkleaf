# A quieter way to publish

Inkleaf brings your ideas to the page. This sample shows how your chosen typography, paper size and spacing work together.

## A little structure

- Write with a clear purpose.
- Give each idea room to breathe.
- Share a document that is easy to read.

> Good typography makes the words feel at home.

| Element  | Purpose                   |
| -------- | ------------------------- |
| Headings | Guide the reader          |
| Lists    | Make details easy to scan |
| Tables   | Compare information       |

### JavaScript example

```javascript
function publish(document) {
  return document.toPDF();
}
```

### Python example

```python
# Export a collection of notes
def publish(notes: list[str]) -> int:
    for note in notes:
        print(f"Exporting {note}")
    return len(notes)
```

<div style="break-before: page"></div>

## Details that matter

Inline mathematics such as $E = mc^2$ stays with the sentence.

$$\int_0^1 x^2\,dx = \frac{1}{3}$$

<p align="center">
  <img src="sample-badge.svg" alt="Inkleaf · Markdown" height="22">
  <img src="sample-badge.svg" alt="Inkleaf · Markdown" height="22">
</p>

### Ready to share

Your author name and page numbers complete the document. [Return to the beginning](#a-quieter-way-to-publish) to see how headings and links work together.

#### Before you export

Check that code, mathematics and tables are clear and complete.

##### The finishing touches

Space between headings and body text makes the hierarchy easier to follow.

###### About this sample

This is a sample document. Your own Markdown files are never used or changed by this preview.
