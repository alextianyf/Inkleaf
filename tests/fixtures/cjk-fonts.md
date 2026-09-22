<h1 id="cjk-title">波与光：从概念到应用</h1>

<p id="cjk-body">当波进入另一种介质时，频率保持不变，波长随波速改变。波传递能量，不会把介质整体搬走。</p>

<p id="latin-body">A wave transfers energy. Clear text matters.</p>

## 阅读重点

**理解概念，比记忆结论更重要。**

*注意波长、周期和频率的区别。*

> [!NOTE]
> 公式、单位与文字需要一起阅读。

| 物理量 | 含义 |
| :--- | :--- |
| 波长 | 相邻同相位点之间的距离 |
| 周期 | 完成一次振动所需的时间 |

### Python 计算示例

```python
def wave_speed(frequency, wavelength):
    # 频率与波长的乘积就是波速
    speed = frequency * wavelength
    return speed

print(wave_speed(50, 0.32))
```

<p><code id="cjk-code">波动练习</code></p>

波速公式：$v = f\lambda$，例如 $50 \times 0.32 = 16\,\mathrm{m/s}$。
