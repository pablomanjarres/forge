import fs from 'fs'
import path from 'path'

const appPath = process.argv[2]

if (!appPath) {
  console.error('Usage: node scripts/verify-packaged-app.js <Forge.app>')
  process.exit(1)
}

const requiredFiles = [
  'Contents/Resources/app/dist/index.html',
  'Contents/Resources/app/dist-electron/main.mjs',
  'Contents/Resources/app/dist-electron/preload.js',
  'Contents/Resources/app/dist-electron/server.mjs',
  'Contents/Resources/app/electron-entry.cjs',
]

for (const relative of requiredFiles) {
  const filePath = path.join(appPath, relative)
  if (!fs.existsSync(filePath)) {
    console.error(`Packaged Forge app is missing ${relative}`)
    process.exit(1)
  }
}

const mainBundle = fs.readFileSync(
  path.join(appPath, 'Contents/Resources/app/dist-electron/main.mjs'),
  'utf8',
)

for (const marker of ['server.mjs', 'localhost', '3400', 'api/health']) {
  if (!mainBundle.includes(marker)) {
    console.error(`Packaged Forge app main bundle is missing startup marker: ${marker}`)
    process.exit(1)
  }
}

console.log(`Verified packaged Forge app: ${appPath}`)
