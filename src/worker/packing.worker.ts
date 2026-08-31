/// <reference lib="webworker" />

import { solveAllStrategies } from '../algorithm/packing'
import type { WorkerRequest, WorkerResponse } from '../types'

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

workerScope.onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type !== 'solve') return
  try {
    const result = solveAllStrategies(data.container, data.cargo, {
      iterations: data.iterations ?? 54,
      onEvent: (event) => workerScope.postMessage({ type: 'trace', event } satisfies WorkerResponse),
    })
    workerScope.postMessage({ type: 'all-complete', solutions: result.solutions } satisfies WorkerResponse)
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : '装载计算失败',
    } satisfies WorkerResponse)
  }
}

export {}
