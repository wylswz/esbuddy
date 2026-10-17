import { memo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore, useViewport } from 'reactflow';
import {
  DEFAULT_LANE_HEIGHT,
  laneGap,
  MIN_LANE_HEIGHT,
  moveLane,
  placeLane,
  resizeLane,
  type CanvasStructure,
} from '@esbuddy/sdk';
import type { StructureEditor } from '../collab/structure';
import { useI18n } from '../i18n/context';

/*
 * Board structure, modelled on a word processor's rulers:
 *   top ruler  — temporal milestones, like tab stops: click to add, drag to move,
 *                drag off the ruler to remove.
 *   left ruler — swimlanes, like margins: drag along it to add one, drag a lane
 *                to move it or its edges to resize, drag it off to remove.
 *                Lanes never overlap: they stop at their neighbours.
 * Double-click a marker to rename it. On the board itself lanes are bands and
 * milestones are lines spanning the whole (infinite) canvas, drawn beneath the
 * notes; they never capture the pointer there.
 */

export const RULER_SIZE = 24;
/** Screen px a marker must be dragged away from its ruler to be removed. */
const DRAG_OFF = 40;
const CLICK_SLOP = 3;

const INK = (pct: number) => `color-mix(in srgb, var(--color-ink) ${pct}%, transparent)`;

// ---------- On the board (child of <ReactFlow>) ----------

function BoardStructureComponent({ structure }: { structure: CanvasStructure }) {
  const { x: vx, y: vy, zoom } = useViewport();
  if (structure.lanes.length === 0 && structure.milestones.length === 0) return null;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      {structure.lanes.map((l, i) => (
        <div
          key={l.id}
          className="absolute left-0 right-0"
          style={{
            top: l.y * zoom + vy,
            height: l.height * zoom,
            backgroundColor: INK(i % 2 ? 2.5 : 4.5),
            borderTop: `1px dashed ${INK(22)}`,
            borderBottom: `1px dashed ${INK(22)}`,
          }}
        >
          <span
            className="absolute left-3 top-2 text-[11px] font-semibold uppercase tracking-[0.14em] truncate max-w-[40vw]"
            style={{ color: INK(40) }}
          >
            {l.label}
          </span>
        </div>
      ))}
      {structure.milestones.map((m) => (
        <div
          key={m.id}
          className="absolute top-0 bottom-0"
          style={{ left: m.x * zoom + vx, borderLeft: `2px dashed ${INK(35)}` }}
        />
      ))}
    </div>
  );
}

export const BoardStructure = memo(BoardStructureComponent);

// ---------- Rulers (inside <ReactFlowProvider>, outside the board) ----------

export interface RulerActions extends StructureEditor {
  /** Start a new undo step. */
  commit(): void;
}

interface RulersProps {
  structure: CanvasStructure;
  /** Absent ⇒ read-only. */
  actions?: RulerActions;
  /** A marker created elsewhere (e.g. from search) to start renaming. */
  editRequest?: StructureRef | null;
}

export interface StructureRef {
  kind: 'lane' | 'milestone';
  id: string;
}

type Editing = StructureRef | null;

/** Track a pointer drag from `e` in screen-px deltas; `end` gets whether it moved. */
function drag(
  e: ReactPointerEvent,
  move: (dx: number, dy: number) => void,
  end: (dx: number, dy: number, moved: boolean) => void,
): void {
  e.preventDefault();
  e.stopPropagation();
  const x0 = e.clientX;
  const y0 = e.clientY;
  let moved = false;
  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    if (!moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
    moved = true;
    move(dx, dy);
  };
  const onUp = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    end(ev.clientX - x0, ev.clientY - y0, moved);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function TicksComponent({ axis, offset, zoom, length }: { axis: 'x' | 'y'; offset: number; zoom: number; length: number }) {
  // Smallest flow step whose ticks are at least 10px apart on screen; every 5th is major.
  const step = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find((s) => s * zoom >= 10) ?? 10000;
  const first = Math.floor(-offset / zoom / step);
  const count = Math.ceil(length / (step * zoom)) + 1;
  const ticks = Array.from({ length: count }, (_, i) => first + i);
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
      {ticks.map((k) => {
        const p = k * step * zoom + offset;
        const len = k % 5 === 0 ? 9 : 4;
        return axis === 'x' ? (
          <line key={k} x1={p} x2={p} y1={RULER_SIZE - len} y2={RULER_SIZE} stroke={INK(28)} />
        ) : (
          <line key={k} y1={p} y2={p} x1={RULER_SIZE - len} x2={RULER_SIZE} stroke={INK(28)} />
        );
      })}
    </svg>
  );
}

const Ticks = memo(TicksComponent);

function RulersComponent({ structure, actions, editRequest }: RulersProps) {
  const { t } = useI18n();
  const { x: vx, y: vy, zoom } = useViewport();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ y: number; height: number } | null>(null);
  const readOnly = !actions;

  // Start renaming a marker created elsewhere, once per request.
  const [handledRequest, setHandledRequest] = useState(editRequest);
  if (editRequest !== handledRequest) {
    setHandledRequest(editRequest);
    if (editRequest) setEditing(editRequest);
  }

  const flowX = (localX: number) => (localX - vx) / zoom;
  const flowY = (localY: number) => (localY - vy) / zoom;

  // ---- top ruler: milestones
  const onTopRulerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!actions || e.button !== 0) return;
    const x = flowX(e.clientX - e.currentTarget.getBoundingClientRect().left);
    drag(e, () => {}, (_dx, _dy, moved) => {
      if (moved) return;
      actions.commit();
      const id = actions.addMilestone({ label: t('structure.newMilestone'), x });
      setEditing({ kind: 'milestone', id });
    });
  };

  const onMilestoneDown = (e: ReactPointerEvent, id: string, x0: number) => {
    if (!actions || e.button !== 0) return;
    actions.commit();
    drag(
      e,
      (dx, dy) => {
        setRemoving(Math.abs(dy) > DRAG_OFF ? id : null);
        actions.updateMilestone(id, { x: x0 + dx / zoom });
      },
      (_dx, dy, moved) => {
        setRemoving(null);
        if (moved && Math.abs(dy) > DRAG_OFF) actions.removeMilestone(id);
      },
    );
  };

  // ---- left ruler: swimlanes (never overlapping: every edit stays in its free gap)
  const onLeftRulerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!actions || e.button !== 0) return;
    const lanes = structure.lanes;
    const y0 = flowY(e.clientY - e.currentTarget.getBoundingClientRect().top);
    const gap = laneGap(lanes, y0);
    if (!gap) return;
    const span = (dy: number) => {
      const y1 = Math.min(Math.max(y0 + dy / zoom, gap.top), gap.bottom);
      return { y: Math.min(y0, y1), height: Math.abs(y1 - y0) };
    };
    drag(
      e,
      (_dx, dy) => setDraft(span(dy)),
      (_dx, dy, moved) => {
        setDraft(null);
        const s = placeLane(lanes, moved ? span(dy).y : y0, moved ? span(dy).height : DEFAULT_LANE_HEIGHT, MIN_LANE_HEIGHT);
        if (!s) return;
        actions.commit();
        const id = actions.addLane({ label: t('structure.newLane'), y: s.y, height: Math.max(s.height, MIN_LANE_HEIGHT) });
        setEditing({ kind: 'lane', id });
      },
    );
  };

  const onLaneDown = (e: ReactPointerEvent, id: string, mode: 'move' | 'top' | 'bottom', y0: number, h0: number) => {
    if (!actions || e.button !== 0) return;
    // Neighbours as they were when the drag started.
    const lanes = structure.lanes;
    actions.commit();
    drag(
      e,
      (dx, dy) => {
        setRemoving(dx > DRAG_OFF ? id : null);
        const d = dy / zoom;
        if (mode === 'move') actions.updateLane(id, { y: moveLane(lanes, id, y0 + d) });
        else {
          const r = resizeLane(lanes, id, mode, mode === 'top' ? y0 + d : y0 + h0 + d, MIN_LANE_HEIGHT);
          if (r) actions.updateLane(id, r);
        }
      },
      (dx, _dy, moved) => {
        setRemoving(null);
        if (moved && dx > DRAG_OFF) actions.removeLane(id);
      },
    );
  };

  const commitRename = (label: string) => {
    if (!editing || !actions) return;
    const current =
      editing.kind === 'lane'
        ? structure.lanes.find((l) => l.id === editing.id)?.label
        : structure.milestones.find((m) => m.id === editing.id)?.label;
    setEditing(null);
    if (current === undefined || current === label) return;
    actions.commit();
    if (editing.kind === 'lane') actions.updateLane(editing.id, { label });
    else actions.updateMilestone(editing.id, { label });
  };

  const editingLane = editing?.kind === 'lane' ? structure.lanes.find((l) => l.id === editing.id) : undefined;
  const editingMilestone =
    editing?.kind === 'milestone' ? structure.milestones.find((m) => m.id === editing.id) : undefined;
  const editor = editingLane
    ? { label: editingLane.label, left: RULER_SIZE + 6, top: RULER_SIZE + Math.max(editingLane.y * zoom + vy, 0) + 4 }
    : editingMilestone
      ? { label: editingMilestone.label, left: RULER_SIZE + editingMilestone.x * zoom + vx + 4, top: RULER_SIZE + 4 }
      : null;

  const rulerBg = 'bg-paper/95 backdrop-blur-sm';
  const interactive = readOnly ? '' : ' cursor-pointer';

  return (
    <>
      {/* Corner */}
      <div
        className={`absolute top-0 left-0 z-30 border-r border-b border-ink-faint ${rulerBg}`}
        style={{ width: RULER_SIZE, height: RULER_SIZE }}
      />

      {/* Top ruler: milestones */}
      <div
        className={`absolute top-0 right-0 z-30 overflow-hidden border-b border-ink-faint select-none touch-none ${rulerBg}${interactive}`}
        style={{ left: RULER_SIZE, height: RULER_SIZE }}
        title={readOnly ? undefined : t('structure.topRulerHint')}
        onPointerDown={onTopRulerDown}
      >
        <Ticks axis="x" offset={vx} zoom={zoom} length={width} />
        {structure.milestones.map((m) => (
          <div
            key={m.id}
            className={`absolute top-0 h-full flex items-center gap-1 pl-0.5 pr-1.5 rounded-r-sm${readOnly ? '' : ' cursor-ew-resize'}`}
            style={{
              left: m.x * zoom + vx - 5,
              opacity: removing === m.id ? 0.35 : 1,
              backgroundColor: 'var(--color-paper)',
            }}
            title={readOnly ? m.label : t('structure.markerHint')}
            onPointerDown={(e) => onMilestoneDown(e, m.id, m.x)}
            onDoubleClick={readOnly ? undefined : () => setEditing({ kind: 'milestone', id: m.id })}
          >
            <svg width="10" height="12" viewBox="0 0 10 12" className="shrink-0" aria-hidden>
              <path d="M0 0 H10 V6 L5 12 L0 6 Z" fill="var(--color-ink)" />
            </svg>
            <span className="text-[11px] font-semibold text-ink whitespace-nowrap max-w-40 truncate">{m.label}</span>
          </div>
        ))}
      </div>

      {/* Left ruler: swimlanes */}
      <div
        className={`absolute left-0 bottom-0 z-30 overflow-hidden border-r border-ink-faint select-none touch-none ${rulerBg}${interactive}`}
        style={{ top: RULER_SIZE, width: RULER_SIZE }}
        title={readOnly ? undefined : t('structure.leftRulerHint')}
        onPointerDown={onLeftRulerDown}
      >
        <Ticks axis="y" offset={vy} zoom={zoom} length={height} />
        {structure.lanes.map((l) => {
          const top = l.y * zoom + vy;
          const h = l.height * zoom;
          return (
            <div
              key={l.id}
              className={`absolute left-0.5 right-0.5 rounded-sm bg-ink text-paper flex items-center justify-center overflow-hidden${readOnly ? '' : ' cursor-grab active:cursor-grabbing'}`}
              style={{ top: top + 1, height: Math.max(h - 2, 4), opacity: removing === l.id ? 0.35 : 1 }}
              title={readOnly ? l.label : t('structure.markerHint')}
              onPointerDown={(e) => onLaneDown(e, l.id, 'move', l.y, l.height)}
              onDoubleClick={readOnly ? undefined : () => setEditing({ kind: 'lane', id: l.id })}
            >
              <span
                className="text-[11px] font-semibold whitespace-nowrap truncate"
                style={{ writingMode: 'vertical-rl', maxHeight: Math.max(h - 12, 0) }}
              >
                {l.label}
              </span>
              {!readOnly &&
                (['top', 'bottom'] as const).map((edge) => (
                  <div
                    key={edge}
                    className={`absolute left-0 right-0 h-1.5 cursor-ns-resize ${edge === 'top' ? 'top-0' : 'bottom-0'}`}
                    onPointerDown={(e) => onLaneDown(e, l.id, edge, l.y, l.height)}
                  />
                ))}
            </div>
          );
        })}
        {draft && (
          <div
            className="absolute left-0.5 right-0.5 rounded-sm border border-dashed border-ink bg-ink/10"
            style={{ top: draft.y * zoom + vy, height: draft.height * zoom }}
          />
        )}
      </div>

      {editor && (
        <input
          key={editing!.id}
          autoFocus
          defaultValue={editor.label}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => commitRename(e.currentTarget.value.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') setEditing(null);
          }}
          className="editor-chip absolute z-40 h-8 w-48 px-2 text-sm font-semibold border-ink focus:outline-none"
          style={{ left: editor.left, top: editor.top }}
        />
      )}
    </>
  );
}

export const Rulers = memo(RulersComponent);
