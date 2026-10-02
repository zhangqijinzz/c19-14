import type { Analysis, ExpoElement, LayoutMode } from '../../types';

interface AnalysisPanelProps {
  analysis: Analysis;
  mode: LayoutMode;
  elementCount: number;
  elements: ExpoElement[];
  onSelect: (id: string) => void;
  onReclaim: (ids?: string[]) => void;
}

export function AnalysisPanel({ analysis, mode, elementCount, elements, onSelect, onReclaim }: AnalysisPanelProps) {
  const issueCount = analysis.overlaps.length + analysis.bounds.length + analysis.channels.length;
  const pathMessage = analysis.path ? `${analysis.path.fromName} → ${analysis.path.toName} · ${analysis.path.distance} m` : '需要入口和重点区域才能生成路径';
  const nameOf = (id: string) => elements.find((element) => element.id === id)?.name ?? id;
  return <section className={`analysis-panel analysis-${mode} ${analysis.bounds.length ? 'has-bounds' : ''}`}>
    <div className="analysis-title"><span className="analysis-pulse" /><div><span className="section-kicker">LIVE ANALYSIS</span><strong>{mode === 'path' ? '访问路径预览' : mode === 'inspect' ? '空间检查结果' : '布局概览'}</strong></div></div>
    <div className="analysis-metrics"><span><b>{elementCount}</b>元素</span><span className={analysis.overlaps.length ? 'metric-warning' : ''}><b>{analysis.overlaps.length}</b>重叠</span><span className={analysis.bounds.length ? 'metric-warning' : ''}><b>{analysis.bounds.length}</b>越界</span><span className={analysis.channels.length ? 'metric-warning' : ''}><b>{analysis.channels.length}</b>窄通道</span></div>
    <div className="analysis-result"><strong>{issueCount ? `${issueCount} 项需要关注` : '当前布局通行顺畅'}</strong><small>{pathMessage}</small></div>
    {analysis.bounds.length ? <div className="bounds-reclaim-bar">
      <div className="bounds-reclaim-head"><strong>⚠ {analysis.bounds.length} 个元素越界，已无法在画布上直接抓取</strong><button type="button" className="reclaim-all-button" onClick={() => onReclaim()}>⤓ 一键全部收回（{analysis.bounds.length}）</button></div>
      <ul className="bounds-reclaim-list">
        {analysis.bounds.map((issue) => <li key={issue.elementId}><button type="button" className="bounds-item-name" onClick={() => onSelect(issue.elementId)}>{nameOf(issue.elementId)}</button><span className="bounds-item-overflow">越出 {issue.overflow.toFixed(1)} m</span><button type="button" className="bounds-item-recall" onClick={() => onReclaim([issue.elementId])}>收回</button></li>)}
      </ul>
    </div> : null}
  </section>;
}
