# 第三方组件与相应源码

## Pokemon Cards 151

作者：**Simon Goellner (simeydotme)**。上游：https://github.com/simeydotme/pokemon-cards-151 。固定提交：`98030f941cdc4919b648457200277e29b60d5f5a`。采用 GPL-3.0，完整许可证见 [LICENSE](licenses/pokemon-cards-151/LICENSE.txt)。

赛琉弥斯于 2026-11-12 将指针交互、旋转和全息 CSS 改编为独立 Vue 组件，并适配固定高度人物面板；使用上游 iri-7/8/9 纹理。详细改动与未使用的素材见 [使用与改动说明](licenses/pokemon-cards-151/使用与改动说明.txt)。未采用宝可梦卡图、标志及 Galaxy Holo 素材。

## Inspira UI Glare Card

版权署名：**Copyright (c) 2024-2026 rahulv.dev**。上游：https://github.com/unovue/inspira-ui 。固定提交：`eec920b047589058b4b02ba64deb614869e7237a`。原柔光组件采用 MIT，完整声明见 [LICENSE](licenses/inspira-ui/LICENSE.txt)，上游源文件及来源记录一并保留。

## 对应源码与构建

本目录的 `index.js` 对应 [source/](source/) 内的人物与宝物源码、构建入口、类型、依赖锁文件及必要的共用源码，完整名单与校验值见 [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json)。构建命令见 [构建说明](source/构建说明.txt)。目录内的模块素材与上游纹理为构建交付内容，不是玩家的聊天或存档图片。

含 GPL 改编代码的本模块程序按 GPL-3.0 条款提供；MIT 部分保留原声明。署名不替代许可证和对应源码交付。其余独立脚本的署名与许可不因本目录声明而自动改变。参考 [GPLv3 第 4–6 节](https://www.gnu.org/licenses/gpl-3.0.html)。

本地整理日期：2026-11-15。仅调整发布组织；没有改写原作者声明。
