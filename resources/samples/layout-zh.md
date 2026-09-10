# 让文字安静地呈现

印页 将你的想法带到纸上。这份示例展示字体、纸张和间距如何配合，让文档清晰而自然。

## 给内容一些秩序

- 用简单的文字表达想法。
- 为每个段落留出呼吸的空间。
- 分享一份容易阅读的文档。

> 好的排版，让读者专注于文字本身。

| 元素 | 用途         |
| ---- | ------------ |
| 标题 | 引导阅读     |
| 列表 | 清晰呈现要点 |
| 表格 | 方便比较信息 |

### JavaScript 代码示例

```javascript
function publish(document) {
  return document.toPDF();
}
```

### Python 代码示例

```python
# Export a collection of notes
def publish(notes: list[str]) -> int:
    for note in notes:
        print(f"Exporting {note}")
    return len(notes)
```

<div style="break-before: page"></div>

## 细节也很重要

行内公式 $E = mc^2$ 与文字自然地排在一起。

$$\int_0^1 x^2\,dx = \frac{1}{3}$$

<p align="center">
  <img src="sample-badge.svg" alt="印页 · Markdown" height="22">
  <img src="sample-badge.svg" alt="印页 · Markdown" height="22">
</p>

### 准备分享

作者署名与页码，让文档更加完整。[回到开头](#让文字安静地呈现)，也可以检查标题与链接的效果。

#### 导出前检查

检查代码、公式和表格，确认内容清晰完整。

##### 留意排版细节

标题与正文之间的留白，让信息层级更加清晰。

###### 关于这份示例

这是固定的示例文档。预览不会使用或修改你的 Markdown 文件。
