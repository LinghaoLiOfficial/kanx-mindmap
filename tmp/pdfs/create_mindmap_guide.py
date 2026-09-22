# -*- coding: utf-8 -*-
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Preformatted, HRFlowable

OUT = Path('/Users/llh/CodexProjects/kanx-mindmap/output/pdf/mindmap-component-architecture-guide.pdf')
OUT.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('MindSans', '/System/Library/Fonts/STHeiti Medium.ttc'))
pdfmetrics.registerFont(TTFont('MindLight', '/System/Library/Fonts/STHeiti Light.ttc'))
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='Cover', fontName='MindSans', fontSize=26, leading=34, alignment=TA_CENTER, textColor=colors.HexColor('#203b35'), spaceAfter=10))
styles.add(ParagraphStyle(name='Sub', fontName='MindLight', fontSize=11, leading=18, alignment=TA_CENTER, textColor=colors.HexColor('#65756e'), spaceAfter=15))
styles.add(ParagraphStyle(name='H1CN', fontName='MindSans', fontSize=17, leading=24, textColor=colors.HexColor('#24493f'), spaceBefore=10, spaceAfter=7))
styles.add(ParagraphStyle(name='H2CN', fontName='MindSans', fontSize=12, leading=17, textColor=colors.HexColor('#3f6558'), spaceBefore=8, spaceAfter=4))
styles.add(ParagraphStyle(name='BodyCN', fontName='MindLight', fontSize=9.2, leading=15, textColor=colors.HexColor('#34423d'), wordWrap='CJK', spaceAfter=5))
styles.add(ParagraphStyle(name='SmallCN', fontName='MindLight', fontSize=7.8, leading=11, textColor=colors.HexColor('#53635a'), wordWrap='CJK'))
styles.add(ParagraphStyle(name='BulletCN', parent=styles['BodyCN'], leftIndent=12, firstLineIndent=-9, spaceAfter=3))
styles.add(ParagraphStyle(name='CodeCN', fontName='Courier', fontSize=7.1, leading=9.5, textColor=colors.HexColor('#263932'), backColor=colors.HexColor('#f2f6f2'), borderColor=colors.HexColor('#d7e4da'), borderWidth=.5, borderPadding=7, spaceBefore=3, spaceAfter=7))
styles.add(ParagraphStyle(name='Callout', fontName='MindLight', fontSize=9, leading=14, textColor=colors.HexColor('#355247'), backColor=colors.HexColor('#edf5ee'), borderColor=colors.HexColor('#b9d2be'), borderWidth=.7, borderPadding=8, wordWrap='CJK', spaceBefore=5, spaceAfter=7))

def P(t, s='BodyCN'): return Paragraph(t, styles[s])
def B(t): return P('- ' + t, 'BulletCN')
def C(t): return Preformatted(t.strip(), styles['CodeCN'])
def T(rows, widths):
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.4,colors.HexColor('#d9e2dc')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dcece0')),('FONTNAME',(0,0),(-1,0),'MindSans')]))
    return t

def footer(canvas, doc):
    canvas.saveState(); canvas.setStrokeColor(colors.HexColor('#dbe5dd')); canvas.line(18*mm,11*mm,A4[0]-18*mm,11*mm)
    canvas.setFont('MindLight',7.5); canvas.setFillColor(colors.HexColor('#7c8b82')); canvas.drawString(18*mm,6.5*mm,'Mindmap React 组件化方案'); canvas.drawRightString(A4[0]-18*mm,6.5*mm,str(doc.page)); canvas.restoreState()

class Doc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(filename, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=17*mm, bottomMargin=16*mm)
        f = Frame(self.leftMargin,self.bottomMargin,self.width,self.height,id='main')
        self.addPageTemplates([PageTemplate(id='guide',frames=f,onPage=footer)])

S=[]
S += [Spacer(1,30*mm),P('kanx-mindmap React 组件化方案','Cover'),P('从应用内功能到可安装、可组合、可二次开发的 React 组件包','Sub'),HRFlowable(width='60%',thickness=1.2,color=colors.HexColor('#6d9c82'),spaceAfter=16),P('技术设计与实施说明','H2CN'),P('本文记录当前 kanx-mindmap 的组件化封装思路、公共 API、状态边界、样式隔离和发布验证方案，面向需要在其他 React 项目中直接集成并继续开发的工程团队。'),Spacer(1,28*mm),P('版本 0.1.0 · React 18/19 · React Flow · ELK · Zustand','SmallCN'),PageBreak()]
S += [P('1. 改造目标','H1CN'),P('当前 kanx-mindmap 已具备完整的树编辑能力，但最初是围绕单个 Next.js 页面构建的应用内功能。组件化改造的核心不是简单移动文件，而是重新定义组件边界、状态所有权和宿主项目的接入方式。'),P('目标结果','H2CN'),B('提供可直接安装的 React 组件包，支持 ESM、CJS、TypeScript 类型声明和独立 CSS。'),B('同时提供完整编辑器和低层组合接口，覆盖开箱即用与深度二次开发。'),B('同一页面支持多个独立实例，实例之间不共享选择、历史、快捷键或持久化 key。'),B('宿主可以选择完全控制数据，也可以使用内部状态，并按需启用 localStorage。'),B('保留编辑、布局、拖拽、折叠、撤销重做、导入导出和配色能力。'),P('典型接入','H2CN'),C('import { MindMapEditor } from "kanx-mindmap";\nimport "kanx-mindmap/styles.css";\n\n<MindMapEditor />'),P('组件填充宿主容器，因此父元素必须具有明确的宽度和高度。','Callout'),PageBreak()]
S += [P('2. 分层架构','H1CN'),P('组件包按纯业务模型、实例状态、画布渲染和完整界面四层组织。每层只依赖更底层能力，避免把 Next.js 页面逻辑或浏览器存储逻辑渗透到模型层。'),T([[P('层次','SmallCN'),P('职责','SmallCN'),P('对外价值','SmallCN')],[P('Model','SmallCN'),P('树结构、命令、校验、序列化、可见节点','SmallCN'),P('可在服务端、测试或自定义 UI 中复用','SmallCN')],[P('Store','SmallCN'),P('实例级选择、编辑、历史和变更通知','SmallCN'),P('Provider 隔离状态，多实例安全','SmallCN')],[P('Canvas','SmallCN'),P('React Flow、ELK、节点渲染、拖拽和快捷键','SmallCN'),P('可嵌入的核心画布','SmallCN')],[P('Editor','SmallCN'),P('标题栏、工具栏、配色、文件和帮助','SmallCN'),P('开箱即用的完整体验','SmallCN')]], [31*mm,77*mm,63*mm]),P('推荐的组合关系','H2CN'),C('MindMapEditor\n  └─ MindMapProvider\n       └─ ReactFlowProvider\n            └─ MindMapCanvas\n                 ├─ Topic renderer\n                 ├─ Edge renderer\n                 └─ ELK layout'),P('完整编辑器只是 Provider、Canvas 和外围 UI 的组合，不是唯一入口。宿主可以保留 Provider 和 Canvas，完全替换工具栏与业务操作。'),PageBreak()]
S += [P('3. 公共 API 设计','H1CN'),P('公共 API 以 React Flow 的使用方式为参考：组件负责渲染和交互，数据、类型和样式都从包入口显式导出。'),P('完整编辑器','H2CN'),C('type MindMapEditorProps = {\n  value?: MindMapTree;\n  defaultValue?: MindMapTree;\n  onChange?: (tree, detail) => void;\n  persistence?: { documentKey: string; paletteKey?: string; debounceMs?: number };\n  locale?: "zh-CN" | "en";\n  messages?: Partial<MindMapMessages>;\n  palettes?: MindMapPalette[];\n};'),P('低层组合接口','H2CN'),C('function CustomEditor() {\n  return (\n    <MindMapProvider defaultValue={tree} onChange={save}>\n      <CustomToolbar />\n      <div style={{ height: 600 }}>\n        <MindMapCanvas locale="en" />\n      </div>\n    </MindMapProvider>\n  );\n}'),P('useMindMap 返回树、选中状态、编辑状态、canUndo/canRedo，以及 select、edit、execute、addChild、addSibling、deleteSelected、undo、redo、fitView、zoomIn、zoomOut 等操作。'),T([[P('导出','SmallCN'),P('用途','SmallCN')],[P('MindMapTree / MindMapNode','SmallCN'),P('宿主保存、受控渲染和业务数据处理','SmallCN')],[P('MindMapCommand','SmallCN'),P('统一表达新增、删除、移动、编辑、折叠和导入','SmallCN')],[P('parseDocument / serializeDocument','SmallCN'),P('JSON 备份和外部数据校验','SmallCN')],[P('applyCommand / visible / descendants','SmallCN'),P('无 UI 的树操作和派生数据计算','SmallCN')]], [53*mm,118*mm]),PageBreak()]
S += [P('4. 数据与状态边界','H1CN'),P('组件化最关键的设计决定是明确数据谁负责。组件支持受控和非受控两种模式，但两种模式不能混用。'),P('受控模式','H2CN'),C('const [tree, setTree] = useState(initialTree);\n\n<MindMapEditor\n  value={tree}\n  onChange={(nextTree, detail) => {\n    audit(detail);\n    setTree(nextTree);\n  }}\n/>'),B('宿主是树数据的唯一来源，适合协作、路由切换、服务端保存和审计。'),B('组件内部仍维护选择、编辑态和撤销重做历史，但外部树替换会清理不再可靠的历史。'),P('非受控模式','H2CN'),C('<MindMapEditor\n  defaultValue={initialTree}\n  onChange={(tree, detail) => backup(tree, detail)}\n/>'),B('组件内部管理树和历史，宿主只订阅变更。'),B('默认不访问 localStorage，避免污染宿主项目和造成多个实例 key 冲突。'),P('变更来源','H2CN'),T([[P('source','SmallCN'),P('含义','SmallCN')],[P('user','SmallCN'),P('用户执行编辑、增删、移动、折叠或导入','SmallCN')],[P('undo','SmallCN'),P('撤销业务命令产生的树变化','SmallCN')],[P('redo','SmallCN'),P('重做业务命令产生的树变化','SmallCN')],[P('import','SmallCN'),P('导入 JSON 文档替换当前树','SmallCN')]], [35*mm,136*mm]),PageBreak()]
S += [P('5. 持久化、导入导出与国际化','H1CN'),P('持久化是宿主可选择的能力，不应成为组件不可见的副作用。通过 documentKey 和 paletteKey 显式隔离不同 mindmap 实例。'),C('<MindMapEditor\n  persistence={{\n    documentKey: "project-a.mindmap",\n    paletteKey: "project-a.palette",\n    debounceMs: 300,\n  }}\n/>'),B('首次挂载时读取并校验 version 1 文档；数据损坏时保留默认树并报告错误。'),B('树变化采用防抖写入，页面隐藏时执行一次同步保存。'),B('存储异常只影响持久化，不阻断继续编辑；宿主仍可使用 onChange 备份。'),P('导入导出','H2CN'),P('完整编辑器提供 JSON 导入和导出按钮；低层 Canvas 不强制提供文件操作，宿主可以使用 parseDocument、serializeDocument 和 execute({ type: "import" }) 自建流程。'),P('国际化','H2CN'),P('内置 zh-CN 和 en 两套文案，覆盖按钮、提示、错误、快捷键说明、拖拽提示和无障碍标签。messages 采用 Partial 类型，允许只覆盖宿主关心的文案。'),PageBreak()]
S += [P('6. 样式与宿主环境隔离','H1CN'),P('原实现依赖 app/globals.css 中的 body、button 和全局通配符规则。组件包不能继续依赖这些应用级规则，否则会在宿主项目中产生不可预测的样式污染。'),B('样式移动到 components/mindmap/styles.css，并通过独立入口 styles.css 发布。'),B('所有编辑器规则限定在 .mindmap-root 作用域内。'),B('React Flow 必需 CSS 合并进组件 CSS，使用方无需额外寻找内部依赖。'),B('编辑器根节点填充父容器，不再强制 100dvh；全屏高度由示例应用或宿主决定。'),B('CSS 变量保留为主题扩展点，例如 --map-root、--map-canvas 和 --branch。'),P('宿主接入约束','H2CN'),T([[P('项目','SmallCN'),P('接入要求','SmallCN')],[P('Vite / CRA','SmallCN'),P('安装包并导入 styles.css，父容器设置宽高','SmallCN')],[P('Next.js','SmallCN'),P('编辑器放在 Client Component 中，样式可在 layout 导入','SmallCN')],[P('多实例','SmallCN'),P('每个实例使用独立 Provider 和独立 persistence key','SmallCN')]], [42*mm,129*mm]),PageBreak()]
S += [P('7. 构建、发布与验证','H1CN'),P('构建链使用 tsup 生成 ESM、CJS 和类型声明，使用 esbuild 打包 CSS。package.json 通过 exports 明确约束公共入口。'),C('"exports": {\n  ".": {\n    "types": "./dist/index.d.ts",\n    "import": "./dist/index.js",\n    "require": "./dist/index.cjs"\n  },\n  "./styles.css": "./dist/style.css"\n}'),P('验证分层','H2CN'),B('模型和布局：树命令、导入校验、折叠、移动、历史和 ELK 非重叠布局。'),B('Provider：多实例隔离、受控同步、外部替换、持久化 key 和错误处理。'),B('组件：编辑、中文输入法、键盘导航、拖拽、配色、导入导出和容器适配。'),B('发布物：pnpm pack 后在独立临时项目中安装 tarball，验证 ESM、类型和 CSS exports。'),P('当前验证结果','H2CN'),T([[P('命令','SmallCN'),P('结果','SmallCN')],[P('pnpm typecheck','SmallCN'),P('通过','SmallCN')],[P('pnpm lint','SmallCN'),P('通过','SmallCN')],[P('pnpm test','SmallCN'),P('37 个测试通过','SmallCN')],[P('pnpm build','SmallCN'),P('库、CSS 和 Next.js 构建通过','SmallCN')],[P('pnpm pack','SmallCN'),P('生成 tarball 并完成消费验证','SmallCN')]], [52*mm,119*mm]),PageBreak()]
S += [P('8. 二次开发建议','H1CN'),P('组件包将通用能力与产品决定分开。宿主项目可以在不修改核心画布的情况下替换产品层行为。'),B('需要后端保存或协作时，优先使用受控模式，将 onChange 接入业务状态或同步层。'),B('需要自定义命令时，使用 MindMapCommand 和 execute，避免直接修改 tree 对象。'),B('需要自定义工具栏时，保留 MindMapProvider，使用 useMindMap 组合操作，并把 MindMapCanvas 放进有尺寸的容器。'),B('需要完全替换视觉风格时，导入组件 CSS 后用根 className 和 CSS 变量扩展。'),B('需要添加新的文案或品牌信息时，使用 locale、messages、title 和 palette 配置。'),P('推荐的演进方向','H2CN'),T([[P('方向','SmallCN'),P('建议','SmallCN')],[P('发布','SmallCN'),P('使用 kanx-mindmap 包名并接入 CI 发布流程','SmallCN')],[P('性能','SmallCN'),P('节点规模扩大后，将 ELK 布局移入 Web Worker','SmallCN')],[P('扩展','SmallCN'),P('增加导出适配器、主题 token 和可插拔节点渲染器','SmallCN')]], [40*mm,131*mm]),Spacer(1,8),P('结论：组件化的核心是建立稳定的实例边界和公共契约。宿主通过 Provider、受控数据和显式 CSS 接入，就可以在保留现有编辑能力的同时获得可安装、可组合、可持续演进的 kanx-mindmap 基础设施。','Callout')]

Doc(str(OUT)).build(S)
print(OUT)
