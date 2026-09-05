import { useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import type { Workspace } from '@esbuddy/sdk';
import { useI18n } from '../i18n/context';
import { Button } from './ui/Button';
import { Dialog, DialogContent } from './ui/Dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/DropdownMenu';
import { Input } from './ui/Input';

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}

export function WorkspaceSwitcher({ workspaces, currentId, onSelect, onCreate }: WorkspaceSwitcherProps) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const current = workspaces.find((w) => w.id === currentId) ?? null;

  const submitCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName('');
    setCreating(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="max-w-56 font-medium text-ink">
            <span className="truncate">{current?.name ?? t('workspace.select')}</span>
            <ChevronDown size={14} className="text-fg-subtle shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t('workspace.title')}</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onSelect={() => onSelect(w.id)}>
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === currentId && <Check size={14} />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)} className="text-fg-muted">
            <Plus size={14} />
            {t('workspace.new')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent
          title={t('workspace.new')}
          className="max-w-sm"
          footer={
            <Button onClick={submitCreate} disabled={!name.trim()}>
              {t('workspace.create')}
            </Button>
          }
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate();
            }}
            placeholder={t('workspace.namePlaceholder')}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
