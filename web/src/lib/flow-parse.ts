import { stripRuby } from './ruby';

type Flow = { nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[] };

const NODE = /([A-Za-z0-9_]+)\s*(?:\[\(?|\(\(?|\{|>)\s*"?([^"\])}]*)"?\s*(?:\)?\]|\)\)?|\})/g;

// Gemini only emits small `flowchart` blocks, so a tiny parser + our own renderer replaces the multi-MB mermaid bundle.
export function parseFlow(source: string): Flow | null {
  const code = stripRuby(source);
  const labels = new Map<string, string>();
  const order: string[] = [];
  const edges: Flow['edges'] = [];
  const see = (id: string) => !order.includes(id) && order.push(id);
  for (const raw of code.split('\n')) {
    const line = raw.trim();
    if (!line || /^(flowchart|graph)\b/.test(line) || line.startsWith('%%') || /^(style|classDef|class|linkStyle)\b/.test(line)) continue;
    for (const m of line.matchAll(NODE)) {
      labels.set(m[1], m[2].trim());
      see(m[1]);
    }
    const plain = line.replace(NODE, '$1');
    const parts = plain.split(/\s*(?:-->|---|==>|-\.->)\s*(?:\|([^|]*)\|)?\s*/);
    for (let k = 0; k + 2 < parts.length + 1 && k + 1 < parts.length; k += 2) {
      const from = parts[k]?.trim(), label = parts[k + 1]?.trim(), to = parts[k + 2]?.trim();
      if (!from || !to || !/^[A-Za-z0-9_]+$/.test(from) || !/^[A-Za-z0-9_]+$/.test(to)) continue;
      see(from);
      see(to);
      edges.push({ from, to, label: label || undefined });
    }
  }
  if (order.length < 2) return null;
  return { nodes: order.map((id) => ({ id, label: labels.get(id) ?? id })), edges };
}
