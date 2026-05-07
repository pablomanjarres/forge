import { Menu } from 'lucide-react'

interface HeaderProps {
  onMenuToggle: () => void
}

export function Header({ onMenuToggle }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-4 md:px-6 [-webkit-app-region:drag]">
      <button
        onClick={onMenuToggle}
        className="md:hidden p-2 text-muted-foreground hover:text-foreground [-webkit-app-region:no-drag]"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex-1" />
    </header>
  )
}
