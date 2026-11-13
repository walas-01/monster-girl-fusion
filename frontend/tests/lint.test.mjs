import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { ESLint } from 'eslint'

const cwd = resolve(import.meta.dirname, '..')

test('lint glob patterns still discover the application and Vite configuration', async () => {
  const eslint = new ESLint({ cwd })
  const results = await eslint.lintFiles(['src/**/*.{ts,tsx}', 'vite.config.ts'])
  const paths = results.map(result => result.filePath)

  for (const path of ['src/App.tsx', 'src/main.tsx', 'src/i18n.ts', 'vite.config.ts']) {
    assert.ok(paths.includes(resolve(cwd, path)), `ESLint must check ${path}`)
  }

  for (const result of results) {
    assert.equal(result.fatalErrorCount, 0, result.filePath)
    assert.equal(result.errorCount, 0, result.filePath)
  }
})

test('nested TSX files retain type rules while generated output stays ignored', async () => {
  const eslint = new ESLint({ cwd })
  const config = await eslint.calculateConfigForFile('src/nested/probe.tsx')

  assert.equal(config.rules['@typescript-eslint/typedef'][0], 2)
  assert.equal(config.rules['@typescript-eslint/explicit-function-return-type'][0], 2)
  assert.equal(config.rules['@typescript-eslint/no-explicit-any'][0], 2)
  assert.equal(await eslint.isPathIgnored('dist/probe.ts'), true)
})

test('lint rejects missing parameter/return types and explicit any after the security override', async () => {
  const eslint = new ESLint({ cwd })
  const cases = [
    ['export const probe = value => value;', '@typescript-eslint/typedef'],
    ['export const probe = (value: number) => value;', '@typescript-eslint/explicit-function-return-type'],
    ['export const probe = (value: any): number => value;', '@typescript-eslint/no-explicit-any'],
  ]

  for (const [code, rule] of cases) {
    const [result] = await eslint.lintText(code, { filePath: 'src/nested/probe.tsx' })
    assert.ok(result.messages.some(message => message.ruleId === rule && message.severity === 2), rule)
  }

  const [valid] = await eslint.lintText('export const probe = (value: number): number => value;', { filePath: 'src/nested/probe.tsx' })
  assert.deepEqual(valid.messages, [])
})
