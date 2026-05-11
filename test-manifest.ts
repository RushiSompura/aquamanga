// Validate versioning.json against expected manifest format
import * as fs from 'fs'

const manifest = JSON.parse(fs.readFileSync('bundles/dist/versioning.json', 'utf-8'))

console.log('=== Repository Level ===')
console.log(`buildTime: ${manifest.buildTime ? '✓' : '✗ MISSING'}`)
console.log(`builtWith: ${manifest.builtWith ? '✓' : '✗ MISSING'}`)
console.log(`repository: ${manifest.repository ? '✓' : '✗ MISSING'}`)
console.log(`sources: ${Array.isArray(manifest.sources) ? `✓ (${manifest.sources.length} sources)` : '✗ MISSING'}`)

// Known field sets that different app versions might expect
const knownFields = [
  // v0.9 ExtensionInfo fields
  'id', 'name', 'version', 'icon', 'description', 'contentRating', 
  'developers', 'language', 'badges', 'capabilities',
  // Legacy fields (0.7/0.8 era)
  'author', 'desc', 'websiteBaseURL', 'lang', 'iconUrl',
]

if (Array.isArray(manifest.sources)) {
  manifest.sources.forEach((source: any, i: number) => {
    console.log(`\n=== Source #${i}: ${source.name || source.id} ===`)
    for (const field of knownFields) {
      const has = field in source
      console.log(`  ${field}: ${has ? '✓' : '✗ MISSING'}${has ? ` = ${JSON.stringify(source[field]).slice(0, 50)}` : ''}`)
    }
    // Check for any unexpected fields
    const present = knownFields.filter(f => f in source)
    const missing = knownFields.filter(f => !(f in source))
    const extra = Object.keys(source).filter(k => !knownFields.includes(k))
    if (extra.length > 0) {
      console.log(`  Extra fields: ${extra.join(', ')}`)
    }
  })
}

console.log('\n=== SUMMARY ===')
const allMissing: string[] = []
if (Array.isArray(manifest.sources)) {
  for (const source of manifest.sources) {
    for (const f of knownFields) {
      if (!(f in source) && !allMissing.includes(f)) allMissing.push(f)
    }
  }
}
if (allMissing.length > 0) {
  console.log(`⚠️  Missing fields (may cause errors): ${allMissing.join(', ')}`)
} else {
  console.log('✅ All known fields present')
}
