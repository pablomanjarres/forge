import { Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ProvidersPage } from '@/features/providers/ProvidersPage'
import { AgentsPage } from '@/features/agents/AgentsPage'
import { TemplatesPage } from '@/features/templates/TemplatesPage'
import { TemplateDetailPage } from '@/features/templates/TemplateDetailPage'
import { ImagesPage } from '@/features/images/ImagesPage'
import { VideosPage } from '@/features/videos/VideosPage'
import { AudioPage } from '@/features/audio/AudioPage'
import { ReposPage } from '@/features/repos/ReposPage'
import { GalleryPage } from '@/features/gallery/GalleryPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { EditorPage } from '@/features/editor/EditorPage'
import { WorkspacePage } from '@/features/workspace/WorkspacePage'

export function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="templates/:id" element={<TemplateDetailPage />} />
        <Route path="editor" element={<EditorPage />} />
        <Route path="images" element={<ImagesPage />} />
        <Route path="videos" element={<VideosPage />} />
        <Route path="audio" element={<AudioPage />} />
        <Route path="workspace" element={<WorkspacePage />} />
        <Route path="repos" element={<ReposPage />} />
        <Route path="gallery" element={<GalleryPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
