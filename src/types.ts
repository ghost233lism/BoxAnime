export type Vec3 = [number, number, number]

export type PackingStrategy = 'volume' | 'weight' | 'balanced'

export type ContainerSpec = {
  id: '20GP' | '40GP' | '40HQ' | 'custom'
  name: string
  lengthMm: number
  widthMm: number
  heightMm: number
  maxPayloadKg: number
  floorLoadWarningKgM2?: number
}

export type CargoInput = {
  id: string
  name: string
  lengthMm: number
  widthMm: number
  heightMm: number
  weightKg: number
  quantity: number
  stopOrder: number
  canRotate: boolean
  keepUpright: boolean
  stackable: boolean
  maxTopLoadKg: number
}

export type CargoInstance = Omit<CargoInput, 'quantity'> & {
  sourceId: string
  instanceId: string
}

export type Placement = {
  cargoInstanceId: string
  sourceId: string
  name: string
  positionMm: Vec3
  sizeMm: Vec3
  rotation: Vec3
  weightKg: number
  stopOrder: number
  stackable: boolean
  maxTopLoadKg: number
  supportRatio: number
  topLoadKg: number
  step: number
}

export type SolutionMetrics = {
  volumeUtilization: number
  weightUtilization: number
  loadedVolumeM3: number
  loadedWeightKg: number
  centerOfGravity: Vec3
  supportScore: number
  routeScore: number
  maxFloorLoadKgM2: number
  loadedCount: number
  totalCount: number
}

export type PackingSolution = {
  strategy: PackingStrategy
  placements: Placement[]
  unloadedCargoIds: string[]
  metrics: SolutionMetrics
  score: number
  seed: number
  warnings: string[]
}

export type SearchTraceEvent =
  | {
      type: 'scan'
      strategy: PackingStrategy
      iteration: number
      totalIterations: number
      candidate?: Placement
      elapsedMs: number
    }
  | {
      type: 'best'
      strategy: PackingStrategy
      iteration: number
      solution: PackingSolution
      elapsedMs: number
    }
  | {
      type: 'complete'
      strategy: PackingStrategy
      solution: PackingSolution
      elapsedMs: number
    }

export type StrategySolutions = Record<PackingStrategy, PackingSolution>
export type StrategyTraces = Record<PackingStrategy, SearchTraceEvent[]>

export type DemoBundle = {
  generatedAt: string
  algorithmVersion: string
  container: ContainerSpec
  cargo: CargoInput[]
  solutions: StrategySolutions
  traces: StrategyTraces
}

export type WorkerRequest = {
  type: 'solve'
  container: ContainerSpec
  cargo: CargoInput[]
  iterations?: number
}

export type WorkerResponse =
  | { type: 'trace'; event: SearchTraceEvent }
  | { type: 'all-complete'; solutions: StrategySolutions }
  | { type: 'error'; message: string }
