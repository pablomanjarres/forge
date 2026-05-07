import fs from 'fs'

const templatesPage = fs.readFileSync('src/features/templates/TemplatesPage.tsx', 'utf8')
const editorPage = fs.readFileSync('src/features/editor/EditorPage.tsx', 'utf8')

const checks = [
  {
    ok: !templatesPage.includes('window.location.href = `/editor'),
    message: 'TemplatesPage must not bypass HashRouter with window.location.href for editor navigation.',
  },
  {
    ok: templatesPage.includes('role="dialog"') && templatesPage.includes('Open video') && templatesPage.includes('selectedVideo'),
    message: 'TemplatesPage must expose rendered videos through the in-app video dialog.',
  },
  {
    ok: templatesPage.includes('navigate(`/editor?composition=${encodeURIComponent(compositionId)}`)'),
    message: 'Repo templates must navigate to the editor through React Router with the composition id.',
  },
  {
    ok: editorPage.includes('if (!composition || templateId') && editorPage.includes('start(composition)'),
    message: 'EditorPage must auto-start Remotion Studio for repo composition links.',
  },
  {
    ok: editorPage.includes('/${encodeURIComponent(composition)}') && !editorPage.includes('?composition=${composition}'),
    message: 'EditorPage must open Remotion Studio composition routes with /<compositionId>, not ?composition=.',
  },
]

const failed = checks.filter(check => !check.ok)

if (failed.length > 0) {
  for (const check of failed) {
    console.error(check.message)
  }
  process.exit(1)
}

console.log('Verified Forge template video/editor action wiring.')
