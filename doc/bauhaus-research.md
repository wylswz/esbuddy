# Esbuddy 的包豪斯设计调研

日期：2026-10-17

状态：研究与设计依据，不是已经通过评审的视觉规范。早期纯视觉试作已撤回；
后续按交互设计说明推进第一轮画布交互，不将视觉符号直接推广成全站皮肤。

## 1. 需要先纠正的问题

此前的试作从三原色、基本几何形、几何无衬线字体、直角边框出发，
再把这些符号应用到界面。这证明了对一种视觉印象的模仿，
没有证明设计回应了 Esbuddy 的使用需求。

尤其值得警惕的是：MoMA 的设计团队在介绍 2009 年包豪斯回顾展时，
明确提到要与包豪斯的视觉陈词滥调保持距离，
并直接列出了三原色、Bayer 式字体、圆形／方形／三角形。[1]

这不意味着这些元素不能使用，而是它们的出现本身不能构成设计依据。

本笔记区分三件事：

- 历史材料能支持什么判断。
- 哪些是面向数字产品的当代转译，而不是历史事实。
- 哪些仍是需要用原型和使用验证检验的假设。

## 2. 包豪斯不是一套始终不变的外观

包豪斯在 1919—1933 年间持续变化，三位校长的侧重点并不相同。[2][3]

| 阶段与侧重 | 对“包豪斯风格”的修正 |
| --- | --- |
| 早期魏玛：艺术与手工艺的结合，工坊与基础课程 | 不能把整个学校的历史等同于机器感、纯几何、无装饰 |
| 1923 年后，尤其德绍时期：艺术与技术结合，面向工业生产的模型与原型 | 形式与材料、构造、制作方法、成本之间存在关系，不是先选外形再套用 |
| Hannes Meyer 任内：社会需求、成本意识、需求调查与功能分析 | 设计对象的使用者和生活过程必须进入设计依据 |
| Mies van der Rohe 任内：教学进一步集中于建筑 | 不存在一个能代表所有阶段、所有工坊的单一 UI 模板 |

柏林包豪斯档案馆对创校宣言的解释也很明确：
Gropius 要求的不是一种新风格，而是对艺术工作方式的改革。[4]

因此，把“包豪斯”理解为一套可复用的 CSS 外观是不充分的。
但反过来，把它简化为普通的“越实用越好”，同样会忽略其形式实验和审美追求。

## 3. 从具体案例理解形式为什么出现

### 3.1 Marianne Brandt 的茶器：几何是构造，不是贴花

MoMA 对 Brandt 1924 年茶壶的说明同时强调：
它将日常器物化约为基本几何形，设计具有实用性，
乌木把手与盖钮适合握持，并探索适于工业生产的形式。[5]

Met 对另一件约 1924 年茶滤器的说明更加具体：
它很小，是因为用途是制作浓缩茶液；较高的 D 形乌木把手便于倾倒。[6]

重要的不是“壶上有圆和半圆”，而是：
容纳、持握、倾倒、材料和生产目标共同组织了形态。
也不能把生产愿景说成已经实现的事实：MoMA 的这件茶壶仍停留在原型阶段。

**对 Esbuddy 的转译：**
形状若进入界面，应帮助理解结构或操作，例如边界、附着、连接和状态。
孤立的三形图案没有参与这些工作，不能借此说明应用已经采用包豪斯方法。

### 3.2 Anni Albers 的墙面材料：表面效果有性能依据

MoMA 对 Albers 1929 年毕业项目的介绍指出，
墙面材料需要同时吸收声音、反射光线：
背面的雪尼尔与正面的玻璃纸承担不同作用；
光泽来自纤维和织物结构的处理。[7]

Getty 对基础课程的研究也强调，学生通过木、纸、金属、玻璃、纤维等材料实验，
学习它们的表面、结构和相互作用。[8]

这不能推导出“数字界面必须拟物”，也不能推导出“所有纹理、阴影都不包豪斯”。
它能支持的判断是：应研究媒介的特性，而不是机械排除某种视觉效果。

**对 Esbuddy 的转译：**
便利贴的纸感可以是支持工作坊认知的隐喻；
阴影若表达层叠、拿起和附着，就有可讨论的作用。
但是否真的让用户更好理解操作，需要验证，不能只凭历史类比认定。

### 3.3 新字体排印：清晰传播，不是指定某款字体

包豪斯档案馆对印刷品的整理显示了多样的字体排印实践：
清晰文本块、标准化格式、图文结合，以及颜色、尺度、位置的对比。[9]

Letterform Archive 对实际用字的研究指出，
Moholy-Nagy 在 1923 年展览目录中使用了当时可获得的
Breite Grotesk 和 Venus，而不是今天想象中的统一“包豪斯字体”。[10]
同一研究也不回避这些历史作品的局限，例如过宽文本块和拥挤版面。
历史案例不是不可批评、可以直接复制的标准答案。

Futura 是 Paul Renner 于 1927 年推出的字体，
与包豪斯几何字母实验具有相似性，但只出现在少量晚期包豪斯作品里。
不能用“换成 Futura”替代排版研究。[11]

Moholy-Nagy 的《新字体排印》强调传播的清晰性，
反对先验审美妨碍可读性；MoMA 对新字体排印运动的介绍，
也把多层次地澄清视觉与文字意义视为主要关切。[12][13]

**对 Esbuddy 的转译：**
应先确定工具、内容、元信息与反馈的阅读层次，
研究中英文、长标签、小字号和缩放下的辨识，再决定字体与版式。
展示字体不必承担所有界面文字。
不对称也应组织阅读和工作区域，而不是为了显得先锋而偏移元素。

### 3.4 色彩课程：探索关系，而不是限定三个色号

Getty 的研究描述了 Itten 的色彩星与十二色相，
以及明暗、冷暖、补色、饱和度等色彩对比的研究。[14]
Kandinsky 的形色配对则包含调查、假设与课堂实验，
不能视为所有包豪斯作品都必须遵守的图形编码。[15]

**对 Esbuddy 的转译：**
颜色的面积、对比、相邻关系和语义，比“是否出现红黄蓝”更重要。
事件风暴已经使用多种便签色传达领域类型；
再强行叠加一套三原色功能分类，可能增加而非降低理解负担。

### 3.5 Hannes Meyer 的住宅：先分析生活，再组织空间

德绍包豪斯基金会对外廊住宅的说明包括：
起居空间朝南以利用日照，入口和附属空间朝北；
外廊的通行方式同时考虑建造成本和居民相遇的机会。[16]
基金会的校史也明确提到系统需求调查、详细功能分析和科学方法。[3]

这比“所有面板画黑边”更接近可转译到产品的依据：
根据实际使用过程组织空间。

**对 Esbuddy 的转译：**
主工作面、常用工具、临时检查、协作反馈不应处于相同视觉等级。
需要先分析它们的使用频率、持续时间、相互依赖和遮挡关系，
而不是给每个区域使用同样强的边框。

## 4. 对现有试作的具体判断

以下是设计审视，不是已经完成用户测试的结论：

1. **几何图案没有功能来源。**
   登录页与标识中的三形组合提供了风格暗示，
   但尚未与这个应用的叙事、结构或使用方式建立足够关系。
2. **把字体名称当作排版方案。**
   大号几何字体和高字重可以制造海报感，
   但没有回答长时间建模、中英文混排和缩放阅读的问题。
3. **用统一边框代替层级。**
   方角、黑线、硬阴影不是包豪斯的必要条件，也不是充分条件。
   让所有控件同样突出，会与“画布内容优先”的目标冲突。
4. **编号未说明实际意义。**
   为了构图加入的 01、02，不等于有效的信息架构；
   应确认它们是否表达真实顺序、步骤或身份。
5. **颜色先于语义被指定。**
   “黄色负责创建、蓝色负责动作、红色负责身份”目前只是提案，
   并没有完成与便签类型色、错误、选中、远端协作颜色的冲突检查。
6. **先做通用皮肤，后理解核心场景。**
   应以真实建模画布检验设计，而不是先用登录海报证明风格成立。

某些实现中的功能改进，例如卡片的键盘可操作性，
可以独立评估，但不能作为视觉方向正确的证据。

## 5. 面向 Esbuddy 的设计命题

建议研究的命题是：

> 让界面的形式显露建模工作的组织、层次与操作关系，
> 而不是让界面摆放包豪斯的识别符号。

这是面向当代数字工具的转译，不是声称历史包豪斯已经规定了软件应如何设计。

在设计之前，应以当前真实示例板梳理至少三条使用路径：

- **铺开故事：** 找到并新增事件，快速命名，调整位置，梳理先后。
- **建立模型：** 添加命令和参与者，连接或附着，组织聚合，处理不合法关系。
- **共同讨论：** 找到热点并投票，理解他人选中状态，查看诊断，发布可读版本。

据此形成设计规则，而不是先决定色号：

- **空间：** 内容优先；持续工具、临时工具、检查结果有不同占位方式。
- **排版：** 通过字号、字重、距离和对齐表达层次，而非全局换展示字体。
- **色彩：** 保持领域色可靠；工具色尽量节制；状态不只依靠颜色区分。
- **几何：** 让边界、方向、重复和比例参与结构表达；不为了识别风格增加无意义形状。
- **材质：** 保留还是简化纸感，取决于是否帮助理解便签操作，而非“包豪斯必须扁平”的假设。
- **系统：** 共用的是交互与构造规则，不是要求登录页、工作台、弹窗长得完全一样。

## 6. 下一步应怎样验证，而不是直接重写

1. 先制作核心画布的一份带注释布局原型，注明每个形式选择解决什么问题。
2. 使用同一张真实示例板，与现有界面对照，不以空白画布或海报页作主要展示。
3. 检查新增、命名、连线、附着、投票、定位诊断等路径的可发现性和误操作。
4. 检查中英文、长标题、不同缩放、高密度便签和多人反馈并存时的阅读层级。
5. 检查桌面与手机：有效画布面积、工具遮挡、触控、键盘、对比度、焦点和减少动态效果。
6. 再决定哪些排版、比例、配色和材质规则应成为设计系统。

这些是拟议的验证步骤；本次调研没有进行用户访谈或可用性实验，
不应把方案假设写成已经证实的用户偏好。

进一步的产品转译见
[让 UI 服务于 EventStorming](eventstorming-interaction-brief.md)，
从工作坊动作、便签状态和现有实现出发组织交互原型，而不是继续扩展视觉皮肤。

## 资料

以下优先采用博物馆、档案馆、基金会的研究与馆藏说明。
历史文本的现代转载与当代解释，不等同于原件或作者对软件设计的主张。
访问日期：2026-10-17。

1. MoMA, *Bauhaus: The Graphic Design Department Goes Back to School*：
   https://www.moma.org/explore/inside_out/2009/11/06/bauhaus-the-graphic-design-department-goes-back-to-school/
2. Bauhaus-Archiv, *The Bauhaus: The Idea Behind the School and Its Educational Programme*：
   https://www.bauhaus.de/en/discover/article/the-bauhaus-idea-and-programme/
3. Stiftung Bauhaus Dessau, *Chronology*：
   https://bauhaus-dessau.de/en/institution/chronology/
4. Bauhaus-Archiv, *14 Years of Bauhaus*：
   https://www.bauhaus.de/en/discover/article/14-years-of-bauhaus/
5. MoMA, *Marianne Brandt. Teapot. 1924*：
   https://www.moma.org/collection/works/2438
6. The Metropolitan Museum of Art, *Marianne Brandt. Tea Infuser and Strainer*：
   https://www.metmuseum.org/en/art/collection/search/491299
7. MoMA, *Anni Albers*：
   https://www.moma.org/artists/96
8. Getty Research Institute, *Matter and Materials*：
   https://www.getty.edu/research/exhibitions_events/exhibitions/bauhaus/new_artist/matter_materials/
9. Bauhaus-Archiv, *Bauhaus.Typography*：
   https://www.bauhaus.de/en/research/publications/bauhaus-typography/
10. Letterform Archive, *Typefaces Used by the Bauhaus*：
    https://letterformarchive.org/news/bauhaus-typefaces-part-one/
11. Letterform Archive, *Futura: A Typeface for Our Time*：
    https://exhibitions.letterformarchive.org/bauhaus/walkthroughs/futura-type-specimen-no-1
12. László Moholy-Nagy, *The New Typography* (1923)，Reading Design 转载：
    https://www.readingdesign.org/the-new-typography
13. MoMA, *Rediscovering The New Typography*：
    https://www.moma.org/explore/inside_out/2010/02/12/rediscovering-the-new-typography
14. Getty Research Institute, *Color*：
    https://www.getty.edu/research/exhibitions_events/exhibitions/bauhaus/new_artist/form_color/color/
15. Getty Research Institute, *Kandinsky Form and Color Exercise*：
    https://www.getty.edu/research/exhibitions_events/exhibitions/bauhaus/new_artist/form_color/interactive/
16. Stiftung Bauhaus Dessau, *Houses with Balcony Access*：
    https://bauhaus-dessau.de/en/venues/houses-with-balcony-access/
