import { forwardRef } from 'react'
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

export type SidebarProps = ComponentProps<'aside'> & {
  collapsible?: 'offcanvas' | 'icon' | 'none'
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { className, collapsible = 'icon', ...props },
  ref,
) {
  return <aside ref={ref} className={cn('ui-sidebar', `ui-sidebar-collapsible-${collapsible}`, className)} {...props} />
})

export type SidebarSectionProps = ComponentProps<'div'>

export const SidebarHeader = forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cn('ui-sidebar-header', className)} {...props} />
})

export const SidebarContent = forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn('ui-sidebar-content', className)} {...props} />
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
