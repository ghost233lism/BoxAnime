# BoxAnime · 智能装载实验室

一个以京东物流为视觉主题的浏览器端 3D 集装箱装载演示。内置任务使用提前生成的真实搜索轨迹，导入 CSV/JSON 后则在 Web Worker 中实时计算。

## 功能

- Three.js / React Three Fiber 集装箱数字孪生场景
- 空间优先、重量优先、综合平衡三种装载方案
- 尺寸、限重、旋转、直立、支撑率、顶部承重、重心和卸货顺序约束
- CSV/JSON 导入、数据校验、未装货物说明
- 预计算轨迹回放、实时搜索动画、时间轴、X-Ray 和相机视角
- 20GP、40GP、40HQ 与自定义容器
- GitHub Pages 自动部署

## 本地运行

```bash
npm install
npm run dev
```

质量检查：

```bash
npm run verify:demo
npm test
npm run build
```

修改样例数据或算法后重新生成缓存：

```bash
npm run generate:demo
```

## 导入字段

所有尺寸使用毫米，重量使用千克。

| 字段 | 含义 |
| --- | --- |
| `id`, `name` | SKU 编号和货物名称 |
| `lengthMm`, `widthMm`, `heightMm` | 外包装尺寸 |
| `weightKg`, `quantity` | 单件重量与数量 |
| `stopOrder` | 卸货站序，`1` 最先卸货、优先靠门 |
| `canRotate`, `keepUpright` | 是否允许旋转、是否必须直立 |
| `stackable`, `maxTopLoadKg` | 是否可堆叠、顶部最大承重 |

JSON 可以直接使用货物数组，也可以使用 `{ "container": ..., "cargo": [...] }`。页面内提供 CSV 和 JSON 模板下载。

## 算法说明

当前版本采用确定性多起点 Extreme Point 启发式算法。它适合交互演示和中小规模任务，但不是数学意义上的全局最优证明，也不能代替装车安全审核。地板载荷默认作为相对热点展示；只有用户提供明确阈值时才产生绝对超限告警。

## 部署

推送 `main` 分支后，`.github/workflows/deploy-pages.yml` 会完成测试、构建并发布到：

`https://ghost233lism.github.io/BoxAnime/`

首次发布需要在仓库 **Settings → Pages → Build and deployment** 中将 Source 设为 **GitHub Actions**。

## 品牌声明

京东物流 Logo 来源于京东物流官方网站公开静态资源，仅用于本项目的非官方技术演示。BoxAnime 与京东物流不存在隶属或授权关系。
