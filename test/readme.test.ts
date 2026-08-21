import * as fs from 'node:fs'
import * as path from 'node:path'

import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

const README_PATH = path.resolve(import.meta.dirname, '../README.md')

describe('README.md: Tension Decisions', () => {
  it('AC-74 contains a "Tension Decisions" heading with T1-T5 subsections', () => {
    let readme = fs.readFileSync(README_PATH, 'utf8')

    assert.match(readme, /##\s+Tension Decisions/)
    for (let id of ['T1', 'T2', 'T3', 'T4', 'T5']) {
      assert.match(readme, new RegExp(`###\\s+${id}\\b`))
    }
  })

  it('AC-75 marks T1, T4, T5 as implemented and T2, T3 as decided-only', () => {
    let readme = fs.readFileSync(README_PATH, 'utf8')
    let sections = splitSections(readme)

    for (let id of ['T1', 'T4', 'T5']) {
      assert.match(sections[id] ?? '', /IMPLEMENTED/i)
    }
    for (let id of ['T2', 'T3']) {
      assert.match(sections[id] ?? '', /decided.*not implemented/i)
    }
  })
})

function splitSections(readme: string): Record<string, string> {
  let sections: Record<string, string> = {}
  let matches = [...readme.matchAll(/^###\s+(T[1-5])\b.*$/gm)]

  for (let i = 0; i < matches.length; i++) {
    let start = matches[i]!.index!
    let end = i + 1 < matches.length ? matches[i + 1]!.index! : readme.length
    let id = matches[i]![1]!
    sections[id] = readme.slice(start, end)
  }

  return sections
}
