import { create } from 'zustand'
import { DEFAULT_CONTAINER } from '../data/containers'
import { SAMPLE_CARGO } from '../data/sampleCargo'
import type {
  CargoInput,
  ContainerSpec,
  DemoBundle,
  PackingSolution,
  PackingStrategy,
  Placement,
  SearchTraceEvent,
  StrategySolutions,
} from '../types'

export type RunStage = 'loading' | 'ready' | 'searching' | 'packing' | 'complete' | 'error'

type PackingState = {
  mode: 'demo' | 'live'
  container: ContainerSpec
  cargo: CargoInput[]
  demoBundle?: DemoBundle
  solutions?: StrategySolutions
  liveSolutions: Partial<StrategySolutions>
  liveBest?: PackingSolution
  activeStrategy: PackingStrategy
  stage: RunStage
  statusText: string
  error?: string
  searchProgress: number
  playbackProgress: number
  isPlaying: boolean
  playbackSpeed: number
  xray: number
  cameraView: 'perspective' | 'side' | 'top'
  ghost?: Placement
  worker?: Worker
  setDemoBundle: (bundle: DemoBundle) => void
  setActiveStrategy: (strategy: PackingStrategy) => void
  setContainer: (container: ContainerSpec) => void
  setImportedCargo: (cargo: CargoInput[], container?: ContainerSpec) => void
  beginLive: () => void
  applyTrace: (event: SearchTraceEvent) => void
  finishLive: (solutions: StrategySolutions) => void
  fail: (message: string) => void
  setPlaybackProgress: (progress: number) => void
  setPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void
  setXray: (xray: number) => void
  setCameraView: (view: PackingState['cameraView']) => void
  setWorker: (worker?: Worker) => void
  replay: () => void
  restoreDemo: () => void
}

export const usePackingStore = create<PackingState>((set, get) => ({
  mode: 'demo',
  container: DEFAULT_CONTAINER,
  cargo: SAMPLE_CARGO,
  liveSolutions: {},
  activeStrategy: 'balanced',
  stage: 'loading',
  statusText: '正在载入预计算轨迹',
  searchProgress: 0,
  playbackProgress: 0,
  isPlaying: false,
  playbackSpeed: 1,
  xray: 0.76,
  cameraView: 'perspective',

  setDemoBundle: (bundle) => set({
    mode: 'demo',
    demoBundle: bundle,
    container: bundle.container,
    cargo: bundle.cargo,
    solutions: bundle.solutions,
    stage: 'searching',
    statusText: '预计算轨迹回放 / PRECOMPUTED TRACE',
    playbackProgress: 0,
    searchProgress: 0,
    isPlaying: true,
    error: undefined,
  }),

  setActiveStrategy: (strategy) => set({
    activeStrategy: strategy,
    playbackProgress: 0,
    searchProgress: 0,
    isPlaying: get().mode === 'demo' || Boolean(get().solutions?.[strategy]),
    stage: get().mode === 'demo' ? 'searching' : get().solutions?.[strategy] ? 'packing' : get().stage,
    statusText: get().mode === 'demo' ? '预计算轨迹回放 / PRECOMPUTED TRACE' : get().statusText,
  }),

  setContainer: (container) => set({ container }),

  setImportedCargo: (cargo, container) => {
    get().worker?.terminate()
    set({
      mode: 'live',
      cargo,
      container: container ?? get().container,
      solutions: undefined,
      liveSolutions: {},
      liveBest: undefined,
      stage: 'ready',
      statusText: `${cargo.reduce((sum, item) => sum + item.quantity, 0)} 件货物已校验`,
      playbackProgress: 0,
      searchProgress: 0,
      isPlaying: false,
      ghost: undefined,
      error: undefined,
    })
  },

  beginLive: () => set({
    stage: 'searching',
    statusText: '实时搜索启动 / LIVE OPTIMIZATION',
    searchProgress: 0,
    playbackProgress: 0,
    isPlaying: false,
    error: undefined,
    ghost: undefined,
  }),

  applyTrace: (event) => {
    if (event.type === 'scan') {
      set({
        stage: 'searching',
        statusText: `${event.strategy.toUpperCase()} · 搜索 ${event.iteration + 1}/${event.totalIterations}`,
        searchProgress: (event.iteration + 1) / event.totalIterations,
        ghost: event.candidate,
      })
      return
    }
    if (event.type === 'best') {
      set((state) => ({
        stage: 'searching',
        statusText: `${event.strategy.toUpperCase()} · 发现更优方案`,
        liveBest: event.solution,
        liveSolutions: { ...state.liveSolutions, [event.strategy]: event.solution },
        ghost: event.solution.placements.at(-1),
      }))
      return
    }
    set((state) => ({
      liveSolutions: { ...state.liveSolutions, [event.strategy]: event.solution },
      liveBest: event.solution,
      ghost: undefined,
    }))
  },

  finishLive: (solutions) => set({
    solutions,
    liveSolutions: solutions,
    liveBest: undefined,
    stage: 'packing',
    statusText: '实时求解完成 / LIVE SOLUTION',
    searchProgress: 1,
    playbackProgress: 0.32,
    isPlaying: true,
    ghost: undefined,
    worker: undefined,
  }),

  fail: (message) => set({ stage: 'error', statusText: '数据需要处理', error: message, isPlaying: false, worker: undefined }),
  setPlaybackProgress: (progress) => {
    const normalized = Math.max(0, Math.min(1, progress))
    set({
      playbackProgress: normalized,
      stage: normalized >= 1 ? 'complete' : normalized >= 0.32 ? 'packing' : get().mode === 'demo' ? 'searching' : get().stage,
      statusText: normalized >= 1
        ? '方案就绪 / SOLUTION READY'
        : normalized >= 0.32
          ? '执行装载序列 / PACKING SEQUENCE'
          : get().statusText,
      isPlaying: normalized >= 1 ? false : get().isPlaying,
    })
  },
  setPlaying: (isPlaying) => set({ isPlaying }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setXray: (xray) => set({ xray }),
  setCameraView: (cameraView) => set({ cameraView }),
  setWorker: (worker) => set({ worker }),

  replay: () => set({
    playbackProgress: 0,
    searchProgress: 0,
    isPlaying: true,
    stage: get().mode === 'demo' ? 'searching' : 'packing',
    statusText: get().mode === 'demo' ? '预计算轨迹回放 / PRECOMPUTED TRACE' : '装载方案回放 / SOLUTION REPLAY',
  }),

  restoreDemo: () => {
    get().worker?.terminate()
    const bundle = get().demoBundle
    if (bundle) get().setDemoBundle(bundle)
  },
}))
