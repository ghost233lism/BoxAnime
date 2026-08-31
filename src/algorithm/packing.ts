import type {
  CargoInput,
  CargoInstance,
  ContainerSpec,
  PackingSolution,
  PackingStrategy,
  Placement,
  SearchTraceEvent,
  SolutionMetrics,
  StrategySolutions,
  StrategyTraces,
  Vec3,
} from '../types'

export const ALGORITHM_VERSION = 'extreme-point-1.0.0'
export const STRATEGIES: PackingStrategy[] = ['volume', 'weight', 'balanced']

type InternalPlacement = Placement & {
  supportingIds: string[]
}

type Candidate = {
  cargo: CargoInstance
  position: Vec3
  size: Vec3
  rotation: Vec3
  supportRatio: number
  supports: Array<{ placement: InternalPlacement; ratio: number }>
}

type SolveOptions = {
  iterations?: number
  seed?: number
  onEvent?: (event: SearchTraceEvent) => void
}

const EPSILON = 0.01

class SeededRandom {
  private value: number

  constructor(seed: number) {
    this.value = seed >>> 0
  }

  next() {
    this.value += 0x6d2b79f5
    let t = this.value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const volume = (size: Vec3) => size[0] * size[1] * size[2]
const cargoVolume = (cargo: CargoInstance) => cargo.lengthMm * cargo.widthMm * cargo.heightMm

export function expandCargo(cargo: CargoInput[]): CargoInstance[] {
  return cargo.flatMap((item) =>
    Array.from({ length: item.quantity }, (_, index) => ({
      ...item,
      sourceId: item.id,
      instanceId: `${item.id}-${String(index + 1).padStart(2, '0')}`,
    })),
  )
}

export function orientations(cargo: CargoInstance): Array<{ size: Vec3; rotation: Vec3 }> {
  const { lengthMm: l, widthMm: w, heightMm: h } = cargo
  const variants: Array<{ size: Vec3; rotation: Vec3 }> = cargo.canRotate
    ? cargo.keepUpright
      ? [
          { size: [l, w, h], rotation: [0, 0, 0] },
          { size: [w, l, h], rotation: [0, 0, 90] },
        ]
      : [
          { size: [l, w, h], rotation: [0, 0, 0] },
          { size: [w, l, h], rotation: [0, 0, 90] },
          { size: [l, h, w], rotation: [90, 0, 0] },
          { size: [h, l, w], rotation: [90, 0, 90] },
          { size: [w, h, l], rotation: [0, 90, 0] },
          { size: [h, w, l], rotation: [0, 90, 90] },
        ]
    : [{ size: [l, w, h], rotation: [0, 0, 0] }]

  const seen = new Set<string>()
  return variants.filter(({ size }) => {
    const key = size.join('x')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function overlaps(position: Vec3, size: Vec3, other: Placement) {
  return (
    position[0] < other.positionMm[0] + other.sizeMm[0] - EPSILON &&
    position[0] + size[0] > other.positionMm[0] + EPSILON &&
    position[1] < other.positionMm[1] + other.sizeMm[1] - EPSILON &&
    position[1] + size[1] > other.positionMm[1] + EPSILON &&
    position[2] < other.positionMm[2] + other.sizeMm[2] - EPSILON &&
    position[2] + size[2] > other.positionMm[2] + EPSILON
  )
}

function intersectionArea(position: Vec3, size: Vec3, other: Placement) {
  const x = Math.max(
    0,
    Math.min(position[0] + size[0], other.positionMm[0] + other.sizeMm[0]) -
      Math.max(position[0], other.positionMm[0]),
  )
  const y = Math.max(
    0,
    Math.min(position[1] + size[1], other.positionMm[1] + other.sizeMm[1]) -
      Math.max(position[1], other.positionMm[1]),
  )
  return x * y
}

function supportFor(position: Vec3, size: Vec3, placements: InternalPlacement[]) {
  if (position[2] <= EPSILON) return { ratio: 1, supports: [] as Candidate['supports'] }

  const supportArea = size[0] * size[1]
  const contacts = placements
    .filter((placed) => Math.abs(placed.positionMm[2] + placed.sizeMm[2] - position[2]) <= EPSILON)
    .map((placed) => ({ placement: placed, area: intersectionArea(position, size, placed) }))
    .filter(({ area }) => area > EPSILON)

  const covered = contacts.reduce((sum, contact) => sum + contact.area, 0)
  return {
    ratio: Math.min(1, covered / supportArea),
    supports: contacts.map(({ placement, area }) => ({ placement, ratio: area / Math.max(covered, 1) })),
  }
}

function accumulateLoad(
  supports: Candidate['supports'],
  weightKg: number,
  placementsById: Map<string, InternalPlacement>,
  loads = new Map<string, number>(),
) {
  for (const support of supports) {
    const contribution = weightKg * support.ratio
    loads.set(support.placement.cargoInstanceId, (loads.get(support.placement.cargoInstanceId) ?? 0) + contribution)
    const parent = placementsById.get(support.placement.cargoInstanceId)
    if (!parent || parent.supportingIds.length === 0) continue
    const parents = parent.supportingIds
      .map((id) => placementsById.get(id))
      .filter((item): item is InternalPlacement => Boolean(item))
    if (parents.length === 0) continue
    accumulateLoad(
      parents.map((placement) => ({ placement, ratio: 1 / parents.length })),
      contribution,
      placementsById,
      loads,
    )
  }
  return loads
}

function fitsCandidate(
  cargo: CargoInstance,
  position: Vec3,
  size: Vec3,
  placements: InternalPlacement[],
  container: ContainerSpec,
): Omit<Candidate, 'cargo' | 'position' | 'size' | 'rotation'> | null {
  if (
    position[0] < 0 ||
    position[1] < 0 ||
    position[2] < 0 ||
    position[0] + size[0] > container.lengthMm + EPSILON ||
    position[1] + size[1] > container.widthMm + EPSILON ||
    position[2] + size[2] > container.heightMm + EPSILON
  ) return null

  if (placements.some((placed) => overlaps(position, size, placed))) return null

  const support = supportFor(position, size, placements)
  if (support.ratio < 0.7) return null
  if (support.supports.some(({ placement }) => !placement.stackable)) return null

  const map = new Map(placements.map((placement) => [placement.cargoInstanceId, placement]))
  const extraLoads = accumulateLoad(support.supports, cargo.weightKg, map)
  for (const [id, load] of extraLoads) {
    const placement = map.get(id)
    if (placement && placement.topLoadKg + load > placement.maxTopLoadKg + EPSILON) return null
  }

  return { supportRatio: support.ratio, supports: support.supports }
}

function candidatePoints(placements: Placement[]): Vec3[] {
  const points: Vec3[] = [[0, 0, 0]]
  for (const placed of placements) {
    const [x, y, z] = placed.positionMm
    const [l, w, h] = placed.sizeMm
    points.push([x + l, y, z], [x, y + w, z], [x, y, z + h])
  }
  const seen = new Set<string>()
  return points.filter((point) => {
    const key = point.map((value) => Math.round(value)).join(':')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function strategyRank(cargo: CargoInstance, strategy: PackingStrategy) {
  const itemVolume = cargoVolume(cargo)
  if (strategy === 'volume') return itemVolume
  if (strategy === 'weight') return cargo.weightKg * 1e9
  return Math.sqrt(itemVolume * cargo.weightKg * 1e9)
}

function orderedCargo(cargo: CargoInstance[], strategy: PackingStrategy, rng: SeededRandom, iteration: number) {
  return [...cargo].sort((a, b) => {
    const rankDelta = strategyRank(b, strategy) - strategyRank(a, strategy)
    const jitter = iteration === 0 ? 0 : (rng.next() - 0.5) * Math.max(Math.abs(rankDelta), 1) * 0.22
    const routeNudge = (b.stopOrder - a.stopOrder) * Math.max(Math.abs(rankDelta), 1) * 0.025
    return rankDelta + jitter + routeNudge
  })
}

function pointScore(point: Vec3, size: Vec3, cargo: CargoInstance, container: ContainerSpec, maxStop: number) {
  const centerX = point[0] + size[0] / 2
  const desiredX = maxStop <= 1 ? container.lengthMm / 2 : ((maxStop - cargo.stopOrder) / (maxStop - 1)) * container.lengthMm
  const routeDistance = Math.abs(centerX - desiredX) / container.lengthMm
  const sideBalance = Math.abs(point[1] + size[1] / 2 - container.widthMm / 2) / container.widthMm
  return point[2] / container.heightMm + routeDistance * 0.7 + sideBalance * 0.08 + point[0] / container.lengthMm * 0.02
}

function calculateMetrics(placements: Placement[], container: ContainerSpec, totalCount: number): SolutionMetrics {
  const loadedVolumeMm3 = placements.reduce((sum, placement) => sum + volume(placement.sizeMm), 0)
  const loadedWeightKg = placements.reduce((sum, placement) => sum + placement.weightKg, 0)
  const safeWeight = Math.max(loadedWeightKg, 1)
  const centerOfGravity: Vec3 = [0, 1, 2].map((axis) =>
    placements.reduce(
      (sum, placement) =>
        sum + (placement.positionMm[axis] + placement.sizeMm[axis] / 2) * placement.weightKg,
      0,
    ) / safeWeight,
  ) as Vec3
  const maxStop = Math.max(1, ...placements.map((placement) => placement.stopOrder))
  const routeScore = placements.length
    ? placements.reduce((sum, placement) => {
        const centerX = placement.positionMm[0] + placement.sizeMm[0] / 2
        const actual = centerX / container.lengthMm
        const desired = maxStop <= 1 ? 0.5 : (maxStop - placement.stopOrder) / (maxStop - 1)
        return sum + Math.max(0, 1 - Math.abs(actual - desired))
      }, 0) / placements.length
    : 0
  const floorLoads = placements
    .filter((placement) => placement.positionMm[2] <= EPSILON)
    .map((placement) => (placement.weightKg + placement.topLoadKg) / Math.max((placement.sizeMm[0] * placement.sizeMm[1]) / 1e6, 0.01))

  return {
    volumeUtilization: loadedVolumeMm3 / (container.lengthMm * container.widthMm * container.heightMm),
    weightUtilization: loadedWeightKg / container.maxPayloadKg,
    loadedVolumeM3: loadedVolumeMm3 / 1e9,
    loadedWeightKg,
    centerOfGravity,
    supportScore: placements.length ? placements.reduce((sum, placement) => sum + placement.supportRatio, 0) / placements.length : 0,
    routeScore,
    maxFloorLoadKgM2: floorLoads.length ? Math.max(...floorLoads) : 0,
    loadedCount: placements.length,
    totalCount,
  }
}

function solutionScore(metrics: SolutionMetrics, strategy: PackingStrategy, container: ContainerSpec) {
  const volumeScore = Math.min(metrics.volumeUtilization, 1)
  const weightScore = Math.min(metrics.weightUtilization, 1)
  const balanced = volumeScore + weightScore > 0 ? (2 * volumeScore * weightScore) / (volumeScore + weightScore) : 0
  const objective = strategy === 'volume' ? volumeScore : strategy === 'weight' ? weightScore : balanced
  const cgX = metrics.centerOfGravity[0] / container.lengthMm
  const cgY = metrics.centerOfGravity[1] / container.widthMm
  const balance = Math.max(0, 1 - Math.abs(cgX - 0.5) * 1.5 - Math.abs(cgY - 0.5) * 2)
  return objective + metrics.routeScore * 0.03 + metrics.supportScore * 0.02 + balance * 0.025
}

function primaryObjective(metrics: SolutionMetrics, strategy: PackingStrategy) {
  if (strategy === 'volume') return metrics.volumeUtilization
  if (strategy === 'weight') return metrics.weightUtilization
  const sum = metrics.volumeUtilization + metrics.weightUtilization
  return sum > 0 ? (2 * metrics.volumeUtilization * metrics.weightUtilization) / sum : 0
}

function warningsFor(metrics: SolutionMetrics, unloaded: string[], container: ContainerSpec) {
  const warnings: string[] = []
  const cgX = metrics.centerOfGravity[0] / container.lengthMm
  const cgY = metrics.centerOfGravity[1] / container.widthMm
  if (unloaded.length) warnings.push(`${unloaded.length} 件货物未装载`)
  if (cgX < 0.35 || cgX > 0.65 || cgY < 0.4 || cgY > 0.6) warnings.push('整体重心偏离建议安全区')
  if (metrics.routeScore < 0.72) warnings.push('存在卸货站序交叉')
  if (container.floorLoadWarningKgM2 && metrics.maxFloorLoadKgM2 > container.floorLoadWarningKgM2) warnings.push('局部地板载荷超过自定义阈值')
  return warnings
}

function buildOnce(
  container: ContainerSpec,
  cargo: CargoInstance[],
  strategy: PackingStrategy,
  rng: SeededRandom,
  iteration: number,
) {
  const placements: InternalPlacement[] = []
  let totalWeight = 0
  const maxStop = Math.max(1, ...cargo.map((item) => item.stopOrder))

  for (const item of orderedCargo(cargo, strategy, rng, iteration)) {
    if (totalWeight + item.weightKg > container.maxPayloadKg + EPSILON) continue
    const candidates: Candidate[] = []
    for (const point of candidatePoints(placements)) {
      for (const orientation of orientations(item)) {
        const fit = fitsCandidate(item, point, orientation.size, placements, container)
        if (!fit) continue
        candidates.push({
          cargo: item,
          position: point,
          size: orientation.size,
          rotation: orientation.rotation,
          supportRatio: fit.supportRatio,
          supports: fit.supports,
        })
      }
    }

    candidates.sort(
      (a, b) => pointScore(a.position, a.size, item, container, maxStop) - pointScore(b.position, b.size, item, container, maxStop),
    )
    const chosen = candidates[0]
    if (!chosen) continue

    const byId = new Map(placements.map((placement) => [placement.cargoInstanceId, placement]))
    const extraLoads = accumulateLoad(chosen.supports, item.weightKg, byId)
    for (const [id, load] of extraLoads) {
      const supported = byId.get(id)
      if (supported) supported.topLoadKg += load
    }

    placements.push({
      cargoInstanceId: item.instanceId,
      sourceId: item.sourceId,
      name: item.name,
      positionMm: [...chosen.position],
      sizeMm: [...chosen.size],
      rotation: [...chosen.rotation],
      weightKg: item.weightKg,
      stopOrder: item.stopOrder,
      stackable: item.stackable,
      maxTopLoadKg: item.maxTopLoadKg,
      supportRatio: chosen.supportRatio,
      topLoadKg: 0,
      step: placements.length,
      supportingIds: chosen.supports.map(({ placement }) => placement.cargoInstanceId),
    })
    totalWeight += item.weightKg
  }

  return placements
}

export function solveStrategy(
  container: ContainerSpec,
  cargoInput: CargoInput[],
  strategy: PackingStrategy,
  options: SolveOptions = {},
) {
  const iterations = options.iterations ?? 54
  const baseSeed = options.seed ?? 20260831
  const cargo = expandCargo(cargoInput)
  let best: PackingSolution | undefined
  const trace: SearchTraceEvent[] = []

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const rng = new SeededRandom(baseSeed + iteration * 7919 + STRATEGIES.indexOf(strategy) * 104729)
    const internal = buildOnce(container, cargo, strategy, rng, iteration)
    const placements = internal.map(({ supportingIds: _supportingIds, ...placement }) => placement)
    const loadedIds = new Set(placements.map((placement) => placement.cargoInstanceId))
    const unloaded = cargo.filter((item) => !loadedIds.has(item.instanceId)).map((item) => item.instanceId)
    const metrics = calculateMetrics(placements, container, cargo.length)
    const solution: PackingSolution = {
      strategy,
      placements,
      unloadedCargoIds: unloaded,
      metrics,
      score: solutionScore(metrics, strategy, container),
      seed: baseSeed + iteration * 7919,
      warnings: warningsFor(metrics, unloaded, container),
    }

    const betterPrimary = !best || primaryObjective(solution.metrics, strategy) > primaryObjective(best.metrics, strategy) + 1e-8
    const equalPrimary = best && Math.abs(primaryObjective(solution.metrics, strategy) - primaryObjective(best.metrics, strategy)) <= 1e-8
    if (!best || betterPrimary || (equalPrimary && solution.score > best.score + 1e-8)) {
      best = solution
      const event: SearchTraceEvent = { type: 'best', strategy, iteration, solution, elapsedMs: iteration * 22 }
      trace.push(event)
      options.onEvent?.(event)
    } else if (iteration % 6 === 0) {
      const event: SearchTraceEvent = {
        type: 'scan',
        strategy,
        iteration,
        totalIterations: iterations,
        candidate: placements[Math.min(placements.length - 1, Math.floor(placements.length * 0.65))],
        elapsedMs: iteration * 22,
      }
      trace.push(event)
      options.onEvent?.(event)
    }
  }

  const solution = best ?? {
    strategy,
    placements: [],
    unloadedCargoIds: expandCargo(cargoInput).map((item) => item.instanceId),
    metrics: calculateMetrics([], container, expandCargo(cargoInput).length),
    score: 0,
    seed: baseSeed,
    warnings: ['没有找到可行装载方案'],
  }
  const complete: SearchTraceEvent = { type: 'complete', strategy, solution, elapsedMs: iterations * 22 }
  trace.push(complete)
  options.onEvent?.(complete)
  return { solution, trace }
}

export function solveAllStrategies(
  container: ContainerSpec,
  cargo: CargoInput[],
  options: SolveOptions = {},
): { solutions: StrategySolutions; traces: StrategyTraces } {
  const entries = STRATEGIES.map((strategy) => [strategy, solveStrategy(container, cargo, strategy, options)] as const)
  return {
    solutions: Object.fromEntries(entries.map(([strategy, result]) => [strategy, result.solution])) as StrategySolutions,
    traces: Object.fromEntries(entries.map(([strategy, result]) => [strategy, result.trace])) as StrategyTraces,
  }
}
