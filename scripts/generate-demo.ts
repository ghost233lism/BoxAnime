import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ALGORITHM_VERSION, solveAllStrategies } from '../src/algorithm/packing'
import { DEFAULT_CONTAINER } from '../src/data/containers'
import { SAMPLE_CARGO } from '../src/data/sampleCargo'
import type { DemoBundle, PackingStrategy } from '../src/types'

const outputDirectory = resolve(process.cwd(), 'public/demo')
const bundlePath = resolve(outputDirectory, 'bundle.json')
const verify = process.argv.includes('--verify')

const result = solveAllStrategies(DEFAULT_CONTAINER, SAMPLE_CARGO, {
  iterations: 54,
  seed: 20260831,
})

const comparable = {
  algorithmVersion: ALGORITHM_VERSION,
  container: DEFAULT_CONTAINER,
  cargo: SAMPLE_CARGO,
  solutions: result.solutions,
  traces: result.traces,
}

if (verify) {
  const existing = JSON.parse(await readFile(bundlePath, 'utf8')) as DemoBundle
  const currentComparable = {
    algorithmVersion: existing.algorithmVersion,
    container: existing.container,
    cargo: existing.cargo,
    solutions: existing.solutions,
    traces: existing.traces,
  }
  if (JSON.stringify(currentComparable) !== JSON.stringify(comparable)) {
    throw new Error('预计算演示已过期，请运行 npm run generate:demo')
  }
  console.log('预计算演示与当前算法一致')
} else {
  const bundle: DemoBundle = {
    generatedAt: new Date().toISOString(),
    ...comparable,
  }
  await mkdir(outputDirectory, { recursive: true })
  const strategies: PackingStrategy[] = ['volume', 'weight', 'balanced']
  await Promise.all([
    writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`),
    writeFile(resolve(outputDirectory, 'cargo.json'), `${JSON.stringify({ container: DEFAULT_CONTAINER, cargo: SAMPLE_CARGO }, null, 2)}\n`),
    writeFile(resolve(outputDirectory, 'search-trace.json'), `${JSON.stringify(result.traces, null, 2)}\n`),
    ...strategies.map((strategy) =>
      writeFile(resolve(outputDirectory, `${strategy}-solution.json`), `${JSON.stringify(result.solutions[strategy], null, 2)}\n`),
    ),
  ])
  console.log(`已生成预计算演示：${bundlePath}`)
}
