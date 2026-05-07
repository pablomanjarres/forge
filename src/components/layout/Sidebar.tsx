import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Cpu,
  Bot,
  LayoutTemplate,
  ImageIcon,
  Video,
  AudioLines,
  GitBranch,
  GalleryHorizontalEnd,
  Settings,
  MonitorPlay,
  FolderOpen,
} from 'lucide-react'

const navGroups = [
  {
    label: 'AI Hub',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/providers', icon: Cpu, label: 'Providers' },
      { to: '/agents', icon: Bot, label: 'Agents' },
    ],
  },
  {
    label: 'Create',
    items: [
      { to: '/templates', icon: LayoutTemplate, label: 'Templates' },
      { to: '/editor', icon: MonitorPlay, label: 'Editor' },
      { to: '/images', icon: ImageIcon, label: 'Images' },
      { to: '/videos', icon: Video, label: 'Videos' },
      { to: '/audio', icon: AudioLines, label: 'Audio' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { to: '/workspace', icon: FolderOpen, label: 'Media' },
      { to: '/repos', icon: GitBranch, label: 'Repos' },
      { to: '/gallery', icon: GalleryHorizontalEnd, label: 'Gallery' },
    ],
  },
  {
    label: '',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 pb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
          <span className="text-sm font-bold text-white">F</span>
        </div>
        <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">
          <span className="font-serif italic font-normal">Forge</span>
        </span>
      </div>

      <div className="mx-3 h-px bg-sidebar-border" />

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <nav className="flex flex-col gap-6">
          {navGroups.map((group) => (
            <div key={group.label || 'bottom'}>
              {group.label && (
                <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                  {group.label}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="mx-3 h-px bg-sidebar-border" />

      <div className="px-5 py-4">
        <p className="text-xs text-sidebar-muted">
          localhost:3400
        </p>
      </div>
    </>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-[220px] border-r border-sidebar-border bg-sidebar flex-col">
      <div className="h-[38px] shrink-0 [-webkit-app-region:drag]" />
      <SidebarContent />
    </aside>
  )
}

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <>
      <div className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="md:hidden fixed left-0 top-0 z-50 h-screen w-[260px] bg-sidebar border-r border-sidebar-border flex flex-col animate-in slide-in-from-left duration-200 pt-[env(safe-area-inset-top)]">
        <div className="h-4 shrink-0" />
        <SidebarContent onNavigate={onClose} />
      </aside>
    </>
  )
}
