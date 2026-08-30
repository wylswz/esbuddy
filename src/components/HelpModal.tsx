import type { ReactNode } from 'react';
import { ELEMENT_STYLES, type ElementType } from '../types';

interface HelpModalProps {
  onClose: () => void;
}

const ELEMENT_ORDER: ElementType[] = ['event', 'command', 'aggregate', 'actor', 'policy', 'external', 'hotspot'];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-300 text-xs font-mono text-gray-700 whitespace-nowrap">
      {children}
    </kbd>
  );
}

export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-[680px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">帮助 Help</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-6">
          {/* Elements */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">元素类型</h3>
            <div className="space-y-2.5">
              {ELEMENT_ORDER.map((type) => {
                const s = ELEMENT_STYLES[type];
                return (
                  <div key={type} className="flex items-start gap-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium shrink-0"
                      style={{
                        backgroundColor: s.bgColor,
                        color: s.color,
                        border: `1px solid ${s.borderColor}`,
                      }}
                    >
                      <span>{s.icon}</span>
                      <span>{s.label}</span>
                      {s.shortcut && <span className="font-mono opacity-60">{s.shortcut}</span>}
                    </span>
                    <span className="text-sm text-gray-600 pt-0.5">{s.description}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Shortcuts */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">快捷键</h3>
            <div className="space-y-1.5 text-sm text-gray-600">
              {ELEMENT_ORDER.filter((t) => ELEMENT_STYLES[t].shortcut).map((type) => (
                <div key={type}>
                  <Kbd>{ELEMENT_STYLES[type].shortcut}</Kbd>
                  <span className="ml-2">在鼠标处添加 {ELEMENT_STYLES[type].label}</span>
                </div>
              ))}
              <div>
                <Kbd>Shift</Kbd>
                <span className="ml-1">+ 拖出</span>
                <span className="ml-2">从聚合中移除子元素</span>
              </div>
              <div>
                <Kbd>⌥ Option</Kbd>
                <span className="ml-1">+ 点击</span>
                <span className="ml-2">连接选中的节点到点击的节点</span>
              </div>
              <div>
                <Kbd>[</Kbd>
                <span className="mx-1">/</span>
                <Kbd>]</Kbd>
                <span className="ml-2">置底 / 置顶</span>
              </div>
              <div>
                <Kbd>⌘ Cmd</Kbd>
                <span className="mx-1">/</span>
                <Kbd>Ctrl</Kbd>
                <span className="ml-1">+ 点击</span>
                <span className="ml-2">多选</span>
              </div>
              <div>
                <Kbd>双击</Kbd>
                <span className="ml-2">编辑标题 / 备注</span>
              </div>
            </div>
          </section>

          {/* Modifier keys */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">修饰键规则（一个修饰键对应一个职责）</h3>
            <ul className="space-y-1.5 text-sm text-gray-600 list-disc list-inside">
              <li>
                <Kbd>Shift</Kbd>
                <span className="ml-2">打破包含关系（从聚合中移除）</span>
              </li>
              <li>
                <Kbd>⌥ Option / Alt</Kbd>
                <span className="ml-2">创建连接</span>
              </li>
              <li>
                <Kbd>⌘ Cmd / Ctrl</Kbd>
                <span className="ml-2">多选</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
