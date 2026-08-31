import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STRATEGIES } from './algorithm/packing'
import { JDL_LOGO_DATA_URI } from './assets/jdlLogo'
import { ContainerScene } from './components/ContainerScene'
import { Icon } from './components/Icons'
import { CONTAINER_PRESETS } from './data/containers'
import { SAMPLE_CARGO } from './data/sampleCargo'
import { usePackingStore } from './store/usePackingStore'
import type {
  CargoInput,
  ContainerSpec,
  PackingSolution,
  PackingStrategy,
  Placement,
  SearchTraceEvent,
  SolutionMetrics,
  WorkerRequest,
  WorkerResponse,
} from './types'
import { cargoToCsv, demoJson, parseCargoFile } from './utils/importCargo'

const STRATEGY_COPY: Record<PackingStrategy, { cn: string; en: string; accent: string }> = {
  volume: { cn: '空间优先', en: 'VOLUME', accent: '#4ca7ff' },
  weight: { cn: '重量优先', en: 'PAYLOAD', accent: '#ffb547' },
  balanced: { cn: '综合平衡', en: 'BALANCED', accent: '#42d6a4' },
}

function formatPercent(value = 0) {
  return `${(value * 100).toFixed(1)}%`
}

function formatWeight(value = 0) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} t` : `${Math.round(value)} kg`
}

function strategyResult(solution: PackingSolution) {
  if (solution.strategy === 'volume') return solution.metrics.volumeUtilization
  if (solution.strategy === 'weight') return solution.metrics.weightUtilization
  const sum = solution.metrics.volumeUtilization + solution.metrics.weightUtilization
  return sum ? (2 * solution.metrics.volumeUtilization * solution.metrics.weightUtilization) / sum : 0
}

function calculateVisibleMetrics(placements: Placement[], container: ContainerSpec, totalCount: number): SolutionMetrics {
  const volume = placements.reduce((sum, item) => sum + item.sizeMm[0] * item.sizeMm[1] * item.sizeMm[2], 0)
  const weight = placements.reduce((sum, item) => sum + item.weightKg, 0)
  const denominator = Math.max(weight, 1)
  const centerOfGravity = [0, 1, 2].map((axis) => placements.reduce(
    (sum, item) => sum + (item.positionMm[axis] + item.sizeMm[axis] / 2) * item.weightKg,
    0,
  ) / denominator) as [number, number, number]
  return {
    volumeUtilization: volume / (container.lengthMm * container.widthMm * container.heightMm),
    weightUtilization: weight / container.maxPayloadKg,
    loadedVolumeM3: volume / 1e9,
    loadedWeightKg: weight,
    centerOfGravity,
    supportScore: placements.length ? placements.reduce((sum, item) => sum + item.supportRatio, 0) / placements.length : 0,
    routeScore: 0,
    maxFloorLoadKgM2: placements
      .filter((item) => item.positionMm[2] === 0)
      .reduce((max, item) => Math.max(max, (item.weightKg + item.topLoadKg) / ((item.sizeMm[0] * item.sizeMm[1]) / 1e6)), 0),
    loadedCount: placements.length,
    totalCount,
  }
}

function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function MetricGauge({
  label,
  english,
  value,
  detail,
  color,
  icon,
}: {
  label: string
  english: string
  value: number
  detail: string
  color: string
  icon: 'cube' | 'weight'
}) {
  const percent = Math.max(0, Math.min(100, value * 100))
  return (
    <div className="metric-gauge">
      <div className="metric-head">
        <span className="metric-icon" style={{ color }}><Icon name={icon} /></span>
        <span>{label}<small>{english}</small></span>
      </div>
      <div className="metric-value" style={{ color }}>{percent.toFixed(1)}<small>%</small></div>
      <div className="meter-track"><motion.span animate={{ width: `${percent}%` }} style={{ background: color }} /></div>
      <div className="metric-detail">{detail}</div>
    </div>
  )
}

function StrategySelector() {
  const active = usePackingStore((state) => state.activeStrategy)
  const solutions = usePackingStore((state) => state.solutions)
  const liveSolutions = usePackingStore((state) => state.liveSolutions)
  const setActive = usePackingStore((state) => state.setActiveStrategy)

  return (
    <div className="strategy-grid" role="tablist" aria-label="装载优化策略">
      {STRATEGIES.map((strategy) => {
        const copy = STRATEGY_COPY[strategy]
        const solution = solutions?.[strategy] ?? liveSolutions[strategy]
        return (
          <button
            key={strategy}
            type="button"
            role="tab"
            aria-selected={active === strategy}
            className={`strategy-card ${active === strategy ? 'is-active' : ''}`}
            style={{ '--strategy': copy.accent } as React.CSSProperties}
            onClick={() => setActive(strategy)}
          >
            <span className="strategy-radio" />
            <span className="strategy-name">{copy.cn}<small>{copy.en}</small></span>
            <span className="strategy-score">{solution ? formatPercent(strategyResult(solution)) : '—'}</span>
          </button>
        )
      })}
    </div>
  )
}

function ContainerEditor({ initial, onClose, onSave }: { initial: ContainerSpec; onClose: () => void; onSave: (container: ContainerSpec) => void }) {
  const [draft, setDraft] = useState<ContainerSpec>({ ...initial, id: 'custom', name: '自定义容器' })
  const field = (key: keyof Pick<ContainerSpec, 'lengthMm' | 'widthMm' | 'heightMm' | 'maxPayloadKg'>, label: string, unit: string) => (
    <label className="form-field">
      <span>{label}</span>
      <div><input type="number" min="1" value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} /><em>{unit}</em></div>
    </label>
  )
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.section className="modal" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-label="自定义容器">
        <div className="section-heading"><div><span className="eyebrow">CONTAINER PROFILE</span><h2>自定义容器</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭">×</button></div>
        <div className="form-grid">
          {field('lengthMm', '内部长度', 'mm')}
          {field('widthMm', '内部宽度', 'mm')}
          {field('heightMm', '内部高度', 'mm')}
          {field('maxPayloadKg', '最大载重', 'kg')}
        </div>
        <div className="modal-actions"><button className="button secondary" onClick={onClose}>取消</button><button className="button primary" onClick={() => onSave(draft)}>应用规格</button></div>
      </motion.section>
    </motion.div>
  )
}

function App() {
  const fileInput = useRef<HTMLInputElement>(null)
  const animationFrame = useRef<number>(0)
  const lastFrame = useRef<number>(0)
  const [selected, setSelected] = useState<Placement>()
  const [showContainerEditor, setShowContainerEditor] = useState(false)
  const [clock, setClock] = useState('')

  const store = usePackingStore()
  const {
    mode, container, cargo, demoBundle, solutions, liveBest, activeStrategy, stage, statusText, error,
    playbackProgress, playbackSpeed, isPlaying, xray, cameraView, ghost,
    setDemoBundle, setImportedCargo, beginLive, applyTrace, finishLive, fail, setPlaybackProgress,
    setPlaying, setPlaybackSpeed, setXray, setCameraView, setWorker, replay, restoreDemo,
  } = store

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}demo/bundle.json`)
      .then((response) => {
        if (!response.ok) throw new Error('预计算数据未生成')
        return response.json()
      })
      .then(setDemoBundle)
      .catch((loadError: Error) => fail(loadError.message))
  }, [fail, setDemoBundle])

  useEffect(() => {
    const update = () => setClock(new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isPlaying || !solutions?.[activeStrategy]) return
    const tick = (time: number) => {
      if (!lastFrame.current) lastFrame.current = time
      const delta = Math.min(50, time - lastFrame.current)
      lastFrame.current = time
      const current = usePackingStore.getState()
      const duration = current.mode === 'demo' ? 7600 : 5400
      const next = current.playbackProgress + (delta / duration) * current.playbackSpeed
      current.setPlaybackProgress(next)
      if (next < 1) animationFrame.current = requestAnimationFrame(tick)
    }
    animationFrame.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(animationFrame.current)
      lastFrame.current = 0
    }
  }, [activeStrategy, isPlaying, solutions])

  const solution = solutions?.[activeStrategy] ?? liveBest
  const trace = demoBundle?.traces[activeStrategy] ?? []

  const visualState = useMemo(() => {
    if (!solution) return { placements: [] as Placement[], ghost }
    if (mode === 'live' && stage === 'searching') return { placements: liveBest?.placements ?? [], ghost }
    if (playbackProgress < 0.32) {
      const searchRatio = playbackProgress / 0.32
      const eventIndex = Math.min(trace.length - 1, Math.floor(searchRatio * trace.length))
      const current = trace[eventIndex] as SearchTraceEvent | undefined
      const count = Math.max(0, Math.floor(searchRatio * Math.min(14, solution.placements.length)))
      return {
        placements: solution.placements.slice(0, count),
        ghost: current?.type === 'scan' ? current.candidate : solution.placements[count],
      }
    }
    const packingRatio = (playbackProgress - 0.32) / 0.68
    return {
      placements: solution.placements.slice(0, Math.ceil(packingRatio * solution.placements.length)),
      ghost: undefined,
    }
  }, [ghost, liveBest, mode, playbackProgress, solution, stage, trace])

  const totalCount = cargo.reduce((sum, item) => sum + item.quantity, 0)
  const visibleMetrics = useMemo(() => calculateVisibleMetrics(visualState.placements, container, totalCount), [container, totalCount, visualState.placements])

  const runLive = useCallback(() => {
    store.worker?.terminate()
    beginLive()
    const worker = new Worker(new URL('./worker/packing.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === 'trace') applyTrace(data.event)
      if (data.type === 'all-complete') finishLive(data.solutions)
      if (data.type === 'error') fail(data.message)
    }
    worker.onerror = () => fail('计算线程异常，请检查导入数据后重试')
    setWorker(worker)
    worker.postMessage({ type: 'solve', container, cargo, iterations: 54 } satisfies WorkerRequest)
  }, [applyTrace, beginLive, cargo, container, fail, finishLive, setWorker, store.worker])

  const handleFile = async (file?: File) => {
    if (!file) return
    try {
      const parsed = await parseCargoFile(file)
      setImportedCargo(parsed.cargo, parsed.container)
      setSelected(undefined)
    } catch (importError) {
      fail(importError instanceof Error ? importError.message : '无法读取文件')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const applyContainer = (next: ContainerSpec) => {
    setImportedCargo(cargo, next)
    setShowContainerEditor(false)
  }

  const selectPreset = (id: string) => {
    if (id === 'custom') return setShowContainerEditor(true)
    const preset = CONTAINER_PRESETS[id as keyof typeof CONTAINER_PRESETS]
    setImportedCargo(cargo, preset)
  }

  const cargoTotalVolume = cargo.reduce((sum, item) => sum + item.lengthMm * item.widthMm * item.heightMm * item.quantity, 0) / 1e9
  const cargoTotalWeight = cargo.reduce((sum, item) => sum + item.weightKg * item.quantity, 0)
  const activeCopy = STRATEGY_COPY[activeStrategy]

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src={JDL_LOGO_DATA_URI} alt="京东物流" />
          <span className="brand-divider" />
          <div><strong>智能装载实验室</strong><small>LOAD OPTIMIZATION LAB</small></div>
        </div>
        <div className="system-strip">
          <span className={`live-dot ${stage === 'error' ? 'is-error' : ''}`} />
          <span>{mode === 'demo' ? 'DEMO CACHE / ONLINE' : 'LOCAL WORKER / ACTIVE'}</span>
          <i />
          <span>CN · SHANGHAI</span>
          <span className="system-clock">{clock}</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="left-rail panel-rail">
          <div className="rail-section source-section">
            <div className="section-heading compact">
              <div><span className="eyebrow">DATA SOURCE</span><h2>装载任务</h2></div>
              <span className={`mode-chip ${mode}`}>{mode === 'demo' ? '预计算' : '实时'}</span>
            </div>

            <button className={`source-card ${mode === 'demo' ? 'is-active' : ''}`} onClick={restoreDemo} type="button">
              <span className="source-icon"><Icon name="database" /></span>
              <span><strong>内置运输样例</strong><small>50 件 · 3 个卸货站</small></span>
              <Icon name={mode === 'demo' ? 'check' : 'play'} />
            </button>

            <button className={`source-card ${mode === 'live' ? 'is-active' : ''}`} onClick={() => fileInput.current?.click()} type="button">
              <span className="source-icon"><Icon name="upload" /></span>
              <span><strong>导入货物数据</strong><small>CSV / JSON · 最大 500 件</small></span>
              <Icon name="upload" />
            </button>
            <input ref={fileInput} className="sr-only" type="file" accept=".csv,.json" onChange={(event) => void handleFile(event.target.files?.[0])} />

            <div className="template-links">
              <button onClick={() => downloadText('boxanime-template.csv', cargoToCsv(SAMPLE_CARGO), 'text/csv;charset=utf-8')}><Icon name="download" />CSV 模板</button>
              <button onClick={() => downloadText('boxanime-template.json', demoJson(SAMPLE_CARGO), 'application/json')}><Icon name="download" />JSON 模板</button>
            </div>
          </div>

          <div className="rail-section">
            <div className="section-heading compact"><div><span className="eyebrow">CONTAINER</span><h2>容器规格</h2></div><button className="icon-button" onClick={() => setShowContainerEditor(true)} aria-label="编辑容器"><Icon name="settings" /></button></div>
            <label className="select-wrap">
              <select value={container.id} onChange={(event) => selectPreset(event.target.value)} aria-label="容器规格">
                <option value="20GP">20GP 标准箱</option>
                <option value="40GP">40GP 标准箱</option>
                <option value="40HQ">40HQ 高柜</option>
                <option value="custom">自定义规格</option>
              </select>
            </label>
            <div className="dimension-readout">
              <div><span>L</span><strong>{(container.lengthMm / 1000).toFixed(2)}</strong><small>m</small></div>
              <i>×</i><div><span>W</span><strong>{(container.widthMm / 1000).toFixed(2)}</strong><small>m</small></div>
              <i>×</i><div><span>H</span><strong>{(container.heightMm / 1000).toFixed(2)}</strong><small>m</small></div>
            </div>
            <div className="capacity-line"><span>最大载重 / PAYLOAD</span><strong>{formatWeight(container.maxPayloadKg)}</strong></div>
          </div>

          <div className="rail-section strategy-section">
            <div className="section-heading compact"><div><span className="eyebrow">OBJECTIVE</span><h2>优化策略</h2></div></div>
            <StrategySelector />
          </div>

          <div className="run-block">
            {mode === 'live' ? (
              <button className="run-button" onClick={runLive} disabled={stage === 'searching'}>
                <span>{stage === 'searching' ? '正在搜索最优布局' : '开始实时计算'}<small>{stage === 'searching' ? 'LIVE OPTIMIZATION' : 'RUN OPTIMIZER'}</small></span>
                <Icon name={stage === 'searching' ? 'target' : 'play'} />
              </button>
            ) : (
              <button className="run-button secondary-run" onClick={replay}><span>重播计算轨迹<small>REPLAY TRACE</small></span><Icon name="reset" /></button>
            )}
          </div>
        </aside>

        <section className="scene-stage" aria-label="三维装载场景">
          <div className="scene-meta top-left">
            <span className="coordinate">SCENE / CARGO_BAY_01</span>
            <strong>{container.id} · {activeCopy.en}</strong>
          </div>
          <div className="scene-meta top-right">
            <span>{mode === 'demo' ? 'PRECOMPUTED DEMO' : 'LIVE OPTIMIZATION'}</span>
            <b>{visualState.placements.length.toString().padStart(2, '0')}<i>/</i>{totalCount.toString().padStart(2, '0')}</b>
          </div>
          <ContainerScene
            container={container}
            placements={visualState.placements}
            ghost={visualState.ghost}
            xray={xray}
            cameraView={cameraView}
            centerOfGravity={visibleMetrics.centerOfGravity}
            selectedId={selected?.cargoInstanceId}
            onSelect={setSelected}
          />
          <div className="scanline" aria-hidden="true" />
          <div className="scene-corners" aria-hidden="true"><i /><i /><i /><i /></div>

          <div className="camera-tools" aria-label="相机视角">
            {(['perspective', 'side', 'top'] as const).map((view) => <button key={view} className={cameraView === view ? 'is-active' : ''} onClick={() => setCameraView(view)}>{view === 'perspective' ? '3D' : view === 'side' ? '侧' : '顶'}</button>)}
          </div>

          <div className="xray-control">
            <div><Icon name="layers" /><span>X-RAY<small>外壳透视</small></span></div>
            <input type="range" min="0" max="1" step="0.01" value={xray} onChange={(event) => setXray(Number(event.target.value))} aria-label="外壳透明度" />
            <output>{Math.round(xray * 100)}</output>
          </div>

          <AnimatePresence>
            {selected && (
              <motion.div className="cargo-inspector" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
                <button onClick={() => setSelected(undefined)} aria-label="关闭">×</button>
                <span className="eyebrow">CARGO INSTANCE</span>
                <strong>{selected.name}</strong>
                <small>{selected.cargoInstanceId}</small>
                <dl><div><dt>尺寸</dt><dd>{selected.sizeMm.join(' × ')} mm</dd></div><div><dt>重量</dt><dd>{selected.weightKg} kg</dd></div><div><dt>卸货站</dt><dd>STOP {selected.stopOrder}</dd></div><div><dt>支撑率</dt><dd>{formatPercent(selected.supportRatio)}</dd></div></dl>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <aside className="right-rail panel-rail">
          <div className="rail-section metrics-section">
            <div className="section-heading compact"><div><span className="eyebrow">UTILIZATION</span><h2>实时装载率</h2></div><span className="pulse-label"><i />LIVE</span></div>
            <MetricGauge label="体积利用率" english="VOLUME" value={visibleMetrics.volumeUtilization} detail={`${visibleMetrics.loadedVolumeM3.toFixed(1)} / ${(container.lengthMm * container.widthMm * container.heightMm / 1e9).toFixed(1)} m³`} color="#4ca7ff" icon="cube" />
            <MetricGauge label="重量利用率" english="PAYLOAD" value={visibleMetrics.weightUtilization} detail={`${formatWeight(visibleMetrics.loadedWeightKg)} / ${formatWeight(container.maxPayloadKg)}`} color="#ffb547" icon="weight" />
          </div>

          <div className="rail-section health-section">
            <div className="section-heading compact"><div><span className="eyebrow">LOAD HEALTH</span><h2>运输约束</h2></div></div>
            <div className="health-grid">
              <div className="health-item"><span><Icon name="target" />重心</span><strong>{visualState.placements.length === 0 ? '—' : solution && solution.warnings.some((item) => item.includes('重心')) ? '偏移' : '安全'}{visualState.placements.length > 0 && <i className={solution && solution.warnings.some((item) => item.includes('重心')) ? 'warn' : ''} />}</strong><small>X {(visibleMetrics.centerOfGravity[0] / 1000).toFixed(2)} · Y {(visibleMetrics.centerOfGravity[1] / 1000).toFixed(2)} m</small></div>
              <div className="health-item"><span><Icon name="route" />卸货顺序</span><strong>{solution ? formatPercent(solution.metrics.routeScore) : '—'}<i /></strong><small>STOP 01 靠近箱门</small></div>
              <div className="health-item"><span><Icon name="layers" />平均支撑</span><strong>{formatPercent(visibleMetrics.supportScore)}<i /></strong><small>最低要求 70%</small></div>
              <div className="health-item"><span><Icon name="weight" />地板峰值</span><strong>{Math.round(visibleMetrics.maxFloorLoadKgM2)}<small> kg/m²</small></strong><small>相对载荷监测</small></div>
            </div>
          </div>

          <div className="rail-section manifest-section">
            <div className="section-heading compact"><div><span className="eyebrow">MANIFEST</span><h2>货物清单</h2></div><strong className="manifest-count">{solution?.unloadedCargoIds.length ?? '—'} <small>未装</small></strong></div>
            <div className="manifest-summary"><div><span>输入体积</span><strong>{cargoTotalVolume.toFixed(1)} m³</strong></div><div><span>输入重量</span><strong>{formatWeight(cargoTotalWeight)}</strong></div></div>
            <div className="stop-legend">
              {[1, 2, 3].map((stop, index) => <span key={stop}><i style={{ background: ['#4ca7ff', '#42d6a4', '#ffb547'][index] }} />STOP {stop}</span>)}
            </div>
            {solution?.warnings.length ? <div className="warning-list">{solution.warnings.map((warning) => <span key={warning}><Icon name="warning" />{warning}</span>)}</div> : <div className="all-clear"><Icon name="check" />当前硬约束全部通过</div>}
          </div>
        </aside>
      </section>

      <footer className="timeline-bar">
        <button className="transport-button" onClick={() => setPlaying(!isPlaying)} disabled={!solution} aria-label={isPlaying ? '暂停' : '播放'}><Icon name={isPlaying ? 'pause' : 'play'} /></button>
        <button className="transport-button subtle" onClick={replay} disabled={!solution} aria-label="重新播放"><Icon name="reset" /></button>
        <div className="timeline-readout"><span>STEP</span><strong>{Math.min(visualState.placements.length, solution?.placements.length ?? 0).toString().padStart(2, '0')}</strong><i>/</i><small>{(solution?.placements.length ?? 0).toString().padStart(2, '0')}</small></div>
        <div className="timeline-track-wrap">
          <div className="timeline-labels"><span>{statusText}</span><span>{Math.round(playbackProgress * 100)}%</span></div>
          <input type="range" min="0" max="1" step="0.001" value={playbackProgress} disabled={!solution} onChange={(event) => { setPlaying(false); setPlaybackProgress(Number(event.target.value)) }} aria-label="计算和装载进度" />
        </div>
        <div className="speed-control"><span>SPEED</span>{[0.5, 1, 2].map((speed) => <button key={speed} className={playbackSpeed === speed ? 'is-active' : ''} onClick={() => setPlaybackSpeed(speed)}>{speed}×</button>)}</div>
        <div className="algorithm-stamp"><span>ALGORITHM</span><strong>EXTREME POINT · MULTI START</strong></div>
      </footer>

      <AnimatePresence>
        {error && <motion.div className="toast error-toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Icon name="warning" /><span><strong>无法继续</strong>{error}</span><button onClick={restoreDemo}>恢复样例</button></motion.div>}
        {showContainerEditor && <ContainerEditor initial={container} onClose={() => setShowContainerEditor(false)} onSave={applyContainer} />}
      </AnimatePresence>
    </main>
  )
}

export default App
