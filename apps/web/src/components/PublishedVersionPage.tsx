import { useEffect, useMemo, useState } from 'react';
import ReactFlow, { Controls, MarkerType, MiniMap, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { isStructureEmpty, type PublishedCanvasVersion } from '@esbuddy/sdk';
import { CanvasActionsContext, type CanvasActions } from '../CanvasContext';
import { toFlowEdge, toFlowNode } from '../collab/binding';
import { useI18n } from '../i18n/context';
import { getStore } from '../stores';
import { ELEMENT_STYLES, type ElementType } from '../types';
import { useTouchMode } from '../useMediaQuery';
import { shortSig } from '../versions';
import { nodeTypes } from './nodeTypes';
import { BoardStructure, RULER_SIZE, Rulers } from './StructureRulers';

const READ_ONLY_ACTIONS: CanvasActions = {
  updateNodeLabel: () => {},
  updateNodeDescription: () => {},
  readOnly: true,
};

/** Public, read-only view of a published version, served at `/v/<signature>`. */
export function PublishedVersionPage({ versionId }: { versionId: string }) {
  const { t, locale, setLocale } = useI18n();
  const touchMode = useTouchMode();
  const store = useMemo(() => getStore(), []);
  const [version, setVersion] = useState<PublishedCanvasVersion | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    store
      .getPublishedVersion(versionId)
      .then((v) => {
        if (!cancelled) setVersion(v);
      })
      .catch(() => {
        if (!cancelled) setVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, [store, versionId]);

  useEffect(() => {
    if (version) document.title = `${version.canvasName} · ${shortSig(version.id)} — Esbuddy`;
  }, [version]);

  const nodes = useMemo(() => version?.snapshot.nodes.map(toFlowNode) ?? [], [version]);
  const edges = useMemo(() => version?.snapshot.edges.map(toFlowEdge) ?? [], [version]);
  const structure = useMemo(() => version?.snapshot.structure ?? { lanes: [], milestones: [] }, [version]);

  if (version === undefined) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-paper" aria-label={t('versions.loading')}>
        <span className="h-1 w-24 bg-accent animate-pulse" />
      </div>
    );
  }

  if (version === null) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-paper text-ink px-6 text-center">
        <h1 className="font-display text-3xl font-bold tracking-[-0.02em]">{t('versions.notFoundTitle')}</h1>
        <p className="text-sm text-fg-muted max-w-sm">{t('versions.notFoundBody')}</p>
      </div>
    );
  }

  const publishedAt = new Date(version.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en');

  const rulers = !isStructureEmpty(structure);
  const inset = rulers ? RULER_SIZE : 0;

  return (
    <ReactFlowProvider>
      <div className="w-full h-full relative">
        {rulers && <Rulers structure={structure} />}
        <div className="absolute right-0 bottom-0" style={{ top: inset, left: inset }}>
          <div className="safe-top absolute left-4 right-4 z-20 flex items-start justify-between gap-3 pointer-events-none">
            <div className="editor-chip pointer-events-auto flex flex-col gap-1.5 px-3.5 py-2.5 max-w-[min(36rem,100%)]">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h1 className="text-sm font-semibold truncate">{version.canvasName}</h1>
                <code className="font-mono text-xs px-1.5 py-0.5 rounded-sm bg-ink text-paper" title={version.id}>
                  {shortSig(version.id)}
                </code>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm border border-ink/20 text-fg-muted">
                  {t('versions.readOnly')}
                </span>
                <span className="text-xs tabular-nums text-fg-subtle">{publishedAt}</span>
              </div>
              {version.description && (
                <p className="text-xs text-fg-muted whitespace-pre-wrap wrap-break-word max-h-32 overflow-y-auto">
                  {version.description}
                </p>
              )}
            </div>
            <button
              onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
              className="editor-chip pointer-events-auto h-9 px-3 text-xs font-medium text-fg-subtle hover:text-ink shrink-0"
            >
              {t('toolbar.switchLanguage')}
            </button>
          </div>

          <CanvasActionsContext.Provider value={READ_ONLY_ACTIONS}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              edgesFocusable={false}
              panOnDrag
              panOnScroll
              zoomOnScroll={false}
              fitView
              defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
              className="esboard-surface"
            >
              <BoardStructure structure={structure} />
              <Controls showInteractive={false} />
              {!touchMode && (
                <MiniMap
                  nodeColor={(node) => ELEMENT_STYLES[node.type as ElementType]?.color ?? 'var(--color-board-line)'}
                  className="bg-surface border border-border rounded"
                />
              )}
            </ReactFlow>
          </CanvasActionsContext.Provider>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
