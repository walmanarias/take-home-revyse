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

  it('AC-75 marks all five tensions (T1-T5) as implemented (amended 2026-08-21 with T2/T3, AC-83..96)', () => {
    let readme = fs.readFileSync(README_PATH, 'utf8')
    let sections = splitSections(readme)

    for (let id of ['T1', 'T2', 'T3', 'T4', 'T5']) {
      // Case-sensitive: the literal uppercase "IMPLEMENTED" marker is the
      // convention this repo uses (see T1/T4/T5 today). A case-insensitive
      // match would be a false positive here — T2/T3's still-current
      // "decided, not implemented" text contains the substring "implemented"
      // (lowercase) and would otherwise incorrectly satisfy this assertion.
      assert.match(sections[id] ?? '', /IMPLEMENTED\b/)
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
