# ChordKeyboard 功能介绍
ChordKeyboard 是一款在浏览器中运行的简单演奏工具，允许通过电脑键盘演奏预设和弦。

功能：
- 两种音色：钢琴（piano）与弦乐（strings）。
- 支持按键直接触发和弦，并可通过选择主音（移调）改变全部和弦的音高。

默认键位映射（基于 C 调）：

- `1` → C
- `2` → Dm
- `3` → Em
- `4` → F
- `5` → G
- `6` → Am
- `7` → Bdim
- `E` → E (大三和弦)
- `D` → E7
- `Y` → A (大三和弦)

运行方法：

1. 在浏览器中打开 [index.html](index.html)。
2. 选择主音（默认 C）和音色（钢琴/弦乐）。
3. 按下上述键位即可演奏对应和弦。

实现说明：

使用 WebAudio API 合成音频，无需外部样本，便于跨平台快速体验。

音色说明：
1
- 当前实现已集成 `soundfont-player`（方案 B），优先使用 SoundFont 采样播放：
	- 钢琴：`acoustic_grand_piano`（更自然的钢琴音色）
	- 弦乐：`violin`（单弦乐器示例，可换为其它 SoundFont 名称）
- 若浏览器或网络无法加载 SoundFont，则回退到基于 `OscillatorNode` 的合成音色。

如果你想要更高质量的音色（如多力度分层采样或完整 SoundFont / FluidSynth 支持），我可以继续帮你集成 FluidSynth WASM 或引入更完整的 SoundFont 文件。
