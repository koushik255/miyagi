import { createContext, forwardRef, useContext, useEffect, useId, useMemo, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import './ui.css'

type ClassValue = string | false | null | undefined

function cn(...values: ClassValue[]) {
  return values.filter(Boolean).join(' ')
}

export type ButtonProps = ComponentProps<'button'> & {
  variant?: 'default' | 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'default', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('ui-button', `ui-button-${variant}`, `ui-button-${size}`, className)}
      {...props}
    />
  )
})

export type CardProps = ComponentProps<'div'>

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card({ className, ...props }, ref) {
  return <div ref={ref} className={cn('ui-card', className)} {...props} />
})

export type CardHeaderProps = ComponentProps<'div'>

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(function CardHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cn('ui-card-header', className)} {...props} />
})

export type CardTitleProps = ComponentProps<'h3'>

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(function CardTitle({ className, ...props }, ref) {
  return <h3 ref={ref} className={cn('ui-card-title', className)} {...props} />
})

export type CardDescriptionProps = ComponentProps<'p'>

export const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(function CardDescription(
  { className, ...props },
  ref,
) {
  return <p ref={ref} className={cn('ui-card-description', className)} {...props} />
})

export type CardContentProps = ComponentProps<'div'>

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(function CardContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn('ui-card-content', className)} {...props} />
})

export type BadgeProps = ComponentProps<'span'> & {
  variant?: 'default' | 'accent' | 'success' | 'danger' | 'muted'
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = 'default', ...props },
  ref,
) {
  return <span ref={ref} className={cn('ui-badge', `ui-badge-${variant}`, className)} {...props} />
})

export type InputProps = ComponentProps<'input'>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn('ui-input', className)} {...props} />
})

export type SelectProps = ComponentProps<'select'>

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn('ui-input', 'ui-select', className)} {...props} />
})

export type TextareaProps = ComponentProps<'textarea'>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn('ui-input', 'ui-textarea', className)} {...props} />
})

export type AvatarProps = ComponentProps<'div'> & {
  src?: string | null
  alt?: string
  fallback?: ReactNode
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(function Avatar(
  { className, src, alt = '', fallback, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn('ui-avatar', className)} aria-label={!src && alt ? alt : undefined} {...props}>
      {src ? <img className="ui-avatar-image" src={src} alt={alt} /> : <span className="ui-avatar-fallback">{fallback}</span>}
    </div>
  )
})

export type TabsProps = ComponentProps<'div'>

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs({ className, ...props }, ref) {
  return <div ref={ref} className={cn('ui-tabs', className)} {...props} />
})

export type TabsListProps = ComponentProps<'div'>

export const TabsList = forwardRef<HTMLDivElement, TabsListProps>(function TabsList({ className, role = 'tablist', ...props }, ref) {
  return <div ref={ref} role={role} className={cn('ui-tabs-list', className)} {...props} />
})

export type TabsTriggerProps = ComponentProps<'button'> & {
  active?: boolean
  'data-state'?: 'active' | 'inactive' | (string & {})
}

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(function TabsTrigger(
  {
    className,
    active = false,
    type = 'button',
    role = 'tab',
    'aria-selected': ariaSelected,
    'data-state': dataState,
    ...props
  },
  ref,
) {
  const selected = ariaSelected ?? active
  const isSelected = selected === true || selected === 'true'

  return (
    <button
      ref={ref}
      type={type}
      role={role}
      aria-selected={selected}
      data-state={dataState ?? (isSelected ? 'active' : 'inactive')}
      className={cn('ui-tabs-trigger', className)}
      {...props}
    />
  )
})

export type DialogShellProps = Omit<ComponentProps<'dialog'>, 'title'> & {
  title?: ReactNode
  description?: ReactNode
  footer?: ReactNode
}

export const DialogShell = forwardRef<HTMLDialogElement, DialogShellProps>(function DialogShell(
  {
    className,
    title,
    description,
    footer,
    children,
    open = true,
    role = 'dialog',
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    ...props
  },
  ref,
) {
  const generatedTitleId = useId()
  const generatedDescriptionId = useId()
  const titleId = ariaLabelledBy ?? (title ? generatedTitleId : undefined)
  const descriptionId = ariaDescribedBy ?? (description ? generatedDescriptionId : undefined)

  return (
    <dialog
      ref={ref}
      open={open}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn('ui-dialog-shell', className)}
      {...props}
    >
      <div className="ui-dialog-card">
        {(title || description) && (
          <div className="ui-dialog-header">
            {title && <h2 id={titleId} className="ui-dialog-title">{title}</h2>}
            {description && <p id={descriptionId} className="ui-dialog-description">{description}</p>}
          </div>
        )}
        <div className="ui-dialog-content">{children}</div>
        {footer && <div className="ui-dialog-footer">{footer}</div>}
      </div>
    </dialog>
  )
})

export type EmptyStateProps = Omit<ComponentProps<'div'>, 'title'> & {
  icon?: ReactNode
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { className, icon, title, description, action, children, ...props },
  ref,
) {
  const hasIcon = icon !== undefined && icon !== null
  const hasTitle = title !== undefined && title !== null
  const hasDescription = description !== undefined && description !== null
  const hasChildren = children !== undefined && children !== null
  const hasAction = action !== undefined && action !== null

  return (
    <div ref={ref} className={cn('ui-empty-state', className)} {...props}>
      {hasIcon && <div className="ui-empty-state-icon">{icon}</div>}
      {(hasTitle || hasDescription) && (
        <div className="ui-empty-state-copy">
          {hasTitle && <h3>{title}</h3>}
          {hasDescription && <p>{description}</p>}
        </div>
      )}
      {hasChildren && <div className="ui-empty-state-content">{children}</div>}
      {hasAction && <div className="ui-empty-state-action">{action}</div>}
    </div>
  )
})

export type StatCardProps = Omit<ComponentProps<'article'>, 'title'> & {
  title?: ReactNode
  value?: ReactNode
  description?: ReactNode
  trend?: ReactNode
  icon?: ReactNode
}

export const StatCard = forwardRef<HTMLElement, StatCardProps>(function StatCard(
  { className, title, value, description, trend, icon, children, ...props },
  ref,
) {
  const hasValue = value !== undefined && value !== null
  const hasTitle = title !== undefined && title !== null
  const hasDescription = description !== undefined && description !== null
  const hasTrend = trend !== undefined && trend !== null
  const hasIcon = icon !== undefined && icon !== null
  const hasChildren = children !== undefined && children !== null

  return (
    <article ref={ref} className={cn('ui-stat-card', className)} {...props}>
      {(hasTitle || hasIcon) && (
        <div className="ui-stat-card-topline">
          {hasTitle && <span className="ui-stat-card-title">{title}</span>}
          {hasIcon && <span className="ui-stat-card-icon">{icon}</span>}
        </div>
      )}
      {hasValue && <div className="ui-stat-card-value">{value}</div>}
      {hasChildren && <div className="ui-stat-card-content">{children}</div>}
      {(hasDescription || hasTrend) && (
        <div className="ui-stat-card-footer">
          {hasDescription && <span>{description}</span>}
          {hasTrend && <strong>{trend}</strong>}
        </div>
      )}
    </article>
  )
})

type SidebarContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggleSidebar: () => void
  state: 'expanded' | 'collapsed'
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) throw new Error('useSidebar must be used within a SidebarProvider.')
  return context
}

export type SidebarProviderProps = ComponentProps<'div'> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function SidebarProvider({
  className,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  children,
  ...props
}: SidebarProviderProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (nextOpen: boolean) => {
    setUncontrolledOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }
  const value = useMemo<SidebarContextValue>(() => ({
    open,
    setOpen,
    toggleSidebar: () => setOpen(!open),
    state: open ? 'expanded' : 'collapsed',
  }), [open])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <SidebarContext.Provider value={value}>
      <div className={cn('ui-sidebar-provider', className)} data-state={value.state} {...props}>
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

export type SidebarProps = ComponentProps<'aside'> & {
  side?: 'left' | 'right'
  variant?: 'sidebar' | 'floating' | 'inset'
  collapsible?: 'offcanvas' | 'icon' | 'none'
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { className, side = 'left', variant = 'sidebar', collapsible = 'icon', ...props },
  ref,
) {
  return (
    <aside
      ref={ref}
      className={cn('ui-sidebar', `ui-sidebar-${side}`, `ui-sidebar-${variant}`, `ui-sidebar-collapsible-${collapsible}`, className)}
      data-side={side}
      data-variant={variant}
      data-collapsible={collapsible}
      {...props}
    />
  )
})

export type SidebarInsetProps = ComponentProps<'main'>

export const SidebarInset = forwardRef<HTMLElement, SidebarInsetProps>(function SidebarInset({ className, ...props }, ref) {
  return <main ref={ref} className={cn('ui-sidebar-inset', className)} {...props} />
})

export type SidebarSectionProps = ComponentProps<'div'>

export const SidebarHeader = forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cn('ui-sidebar-header', className)} {...props} />
})

export const SidebarContent = forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn('ui-sidebar-content', className)} {...props} />
})

export const SidebarFooter = forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarFooter({ className, ...props }, ref) {
  return <div ref={ref} className={cn('ui-sidebar-footer', className)} {...props} />
})

export const SidebarGroup = forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarGroup({ className, ...props }, ref) {
  return <div ref={ref} className={cn('ui-sidebar-group', className)} {...props} />
})

export const SidebarGroupContent = forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarGroupContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn('ui-sidebar-group-content', className)} {...props} />
})

export type SidebarGroupLabelProps = ComponentProps<'div'>

export const SidebarGroupLabel = forwardRef<HTMLDivElement, SidebarGroupLabelProps>(function SidebarGroupLabel({ className, ...props }, ref) {
  return <div ref={ref} className={cn('ui-sidebar-group-label', className)} {...props} />
})

export type SidebarMenuProps = ComponentProps<'ul'>

export const SidebarMenu = forwardRef<HTMLUListElement, SidebarMenuProps>(function SidebarMenu({ className, ...props }, ref) {
  return <ul ref={ref} className={cn('ui-sidebar-menu', className)} {...props} />
})

export type SidebarMenuItemProps = ComponentProps<'li'>

export const SidebarMenuItem = forwardRef<HTMLLIElement, SidebarMenuItemProps>(function SidebarMenuItem({ className, ...props }, ref) {
  return <li ref={ref} className={cn('ui-sidebar-menu-item', className)} {...props} />
})

export type SidebarMenuButtonProps = ComponentProps<'button'> & {
  isActive?: boolean
  size?: 'default' | 'sm' | 'lg'
}

export const SidebarMenuButton = forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(function SidebarMenuButton(
  { className, isActive = false, size = 'default', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('ui-sidebar-menu-button', `ui-sidebar-menu-button-${size}`, isActive && 'is-active', className)}
      data-active={isActive ? 'true' : undefined}
      {...props}
    />
  )
})

export type SidebarMenuSubProps = ComponentProps<'ul'>

export const SidebarMenuSub = forwardRef<HTMLUListElement, SidebarMenuSubProps>(function SidebarMenuSub({ className, ...props }, ref) {
  return <ul ref={ref} className={cn('ui-sidebar-menu-sub', className)} {...props} />
})

export type SidebarMenuSubItemProps = ComponentProps<'li'>

export const SidebarMenuSubItem = forwardRef<HTMLLIElement, SidebarMenuSubItemProps>(function SidebarMenuSubItem({ className, ...props }, ref) {
  return <li ref={ref} className={cn('ui-sidebar-menu-sub-item', className)} {...props} />
})

export type SidebarMenuSubButtonProps = ComponentProps<'button'> & {
  isActive?: boolean
}

export const SidebarMenuSubButton = forwardRef<HTMLButtonElement, SidebarMenuSubButtonProps>(function SidebarMenuSubButton(
  { className, isActive = false, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('ui-sidebar-menu-sub-button', isActive && 'is-active', className)}
      data-active={isActive ? 'true' : undefined}
      {...props}
    />
  )
})

export type SidebarRailProps = ComponentProps<'button'>

export const SidebarRail = forwardRef<HTMLButtonElement, SidebarRailProps>(function SidebarRail({ className, type = 'button', ...props }, ref) {
  const { toggleSidebar } = useSidebar()
  return <button ref={ref} type={type} className={cn('ui-sidebar-rail', className)} onClick={toggleSidebar} {...props} />
})

export type SidebarTriggerProps = ComponentProps<'button'>

export const SidebarTrigger = forwardRef<HTMLButtonElement, SidebarTriggerProps>(function SidebarTrigger({ className, type = 'button', children, ...props }, ref) {
  const { toggleSidebar } = useSidebar()
  return (
    <button ref={ref} type={type} className={cn('ui-sidebar-trigger', className)} onClick={toggleSidebar} {...props}>
      {children ?? 'Toggle sidebar'}
    </button>
  )
})
