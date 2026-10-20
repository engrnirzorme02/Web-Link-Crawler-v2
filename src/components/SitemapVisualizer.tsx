import * as d3 from 'd3';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  FileText,
  Folder, FolderOpen,
  Globe,
  Layers,
  Network,
  Search
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn, extractSafeHostname } from '../lib/utils';

export interface SitemapNode {
  id: string;
  name: string;
  fullUrl?: string;
  path: string;
  depth: number;
  children: SitemapNode[];
  isLeaf: boolean;
  linksCount: number;
  extension?: string;
  source?: string;
}

interface SitemapVisualizerProps {
  results: { url: string; source?: string }[];
  startUrl?: string;
  initialUrl?: string;
  onSelectUrl?: (url: string) => void;
}

export function SitemapVisualizer({ results, startUrl = '', initialUrl, onSelectUrl }: SitemapVisualizerProps) {
  const rootUrl = startUrl || initialUrl || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepth, setSelectedDepth] = useState<number | 'all'>('all');
  const [selectedExtension, setSelectedExtension] = useState<string>('all');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));
  const [selectedNode, setSelectedNode] = useState<SitemapNode | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'tree' | 'graph'>('tree');

  const svgRef = useRef<SVGSVGElement>(null);

  // Parse URLs into Hierarchical Tree
  const sitemapTree = useMemo(() => {
    if (results.length === 0) return null;

    const root: SitemapNode = {
      id: 'root',
      name: startUrl ? extractSafeHostname(startUrl, 'Web Link Structure') : 'Web Link Structure',
      path: '/',
      depth: 0,
      children: [],
      isLeaf: false,
      linksCount: 0
    };

    const nodeMap = new Map<string, SitemapNode>();
    nodeMap.set('root', root);

    // Group URLs by host and path segments
    results.forEach(({ url, source }) => {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname;
        const hostId = `host:${host}`;

        let hostNode = nodeMap.get(hostId);
        if (!hostNode) {
          hostNode = {
            id: hostId,
            name: host,
            fullUrl: `${parsed.protocol}//${host}`,
            path: '/',
            depth: 1,
            children: [],
            isLeaf: false,
            linksCount: 0,
            source: 'domain_root'
          };
          nodeMap.set(hostId, hostNode);
          root.children.push(hostNode);
        }

        const segments = parsed.pathname.split('/').filter(Boolean);
        let currentParent = hostNode;
        let accumulatedPath = '';

        if (segments.length === 0) {
          hostNode.fullUrl = url;
          hostNode.isLeaf = true;
          hostNode.source = source;
          return;
        }

        segments.forEach((segment, index) => {
          accumulatedPath += `/${segment}`;
          const isLast = index === segments.length - 1;
          const nodeId = `${hostId}${accumulatedPath}`;

          let node = nodeMap.get(nodeId);
          if (!node) {
            const extMatch = segment.match(/\.([a-zA-Z0-9]+)$/);
            const ext = extMatch ? extMatch[1].toLowerCase() : (isLast ? 'page' : 'dir');

            node = {
              id: nodeId,
              name: segment,
              fullUrl: isLast ? url : `${parsed.protocol}//${host}${accumulatedPath}`,
              path: accumulatedPath,
              depth: index + 2,
              children: [],
              isLeaf: isLast,
              linksCount: 0,
              extension: ext,
              source: isLast ? source : undefined
            };
            nodeMap.set(nodeId, node);
            currentParent.children.push(node);
          } else if (isLast) {
            node.fullUrl = url;
            node.isLeaf = true;
            if (source) node.source = source;
          }

          currentParent = node;
        });
      } catch (e) {
        // Skip malformed URLs
      }
    });

    // Calculate total descendants counts
    function countDescendants(node: SitemapNode): number {
      let count = node.isLeaf || node.fullUrl ? 1 : 0;
      for (const child of node.children) {
        count += countDescendants(child);
      }
      node.linksCount = count;
      return count;
    }
    countDescendants(root);

    return root;
  }, [results, startUrl]);

  // Initial expand of top-level nodes
  useEffect(() => {
    if (sitemapTree) {
      const initial = new Set<string>(['root']);
      sitemapTree.children.forEach(c => {
        initial.add(c.id);
        c.children.slice(0, 5).forEach(sc => initial.add(sc.id));
      });
      setExpandedNodes(initial);
    }
  }, [sitemapTree]);

  // Filtered Tree View computation
  const filteredTree = useMemo(() => {
    if (!sitemapTree) return null;
    const query = searchQuery.trim().toLowerCase();

    function filterNode(node: SitemapNode): SitemapNode | null {
      const matchesSearch = !query || 
        node.name.toLowerCase().includes(query) || 
        (node.fullUrl && node.fullUrl.toLowerCase().includes(query));

      const matchesDepth = selectedDepth === 'all' || node.depth <= selectedDepth;
      const matchesExt = selectedExtension === 'all' || 
        (node.extension && node.extension.toLowerCase() === selectedExtension.toLowerCase());

      const filteredChildren: SitemapNode[] = [];
      for (const child of node.children) {
        const matchingChild = filterNode(child);
        if (matchingChild) {
          filteredChildren.push(matchingChild);
        }
      }

      if (matchesSearch && matchesDepth && matchesExt) {
        return {
          ...node,
          children: filteredChildren
        };
      }

      if (filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren
        };
      }

      return null;
    }

    return filterNode(sitemapTree);
  }, [sitemapTree, searchQuery, selectedDepth, selectedExtension]);

  const toggleNode = (nodeId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (!sitemapTree) return;
    const allIds = new Set<string>();
    function traverse(node: SitemapNode) {
      allIds.add(node.id);
      node.children.forEach(traverse);
    }
    traverse(sitemapTree);
    setExpandedNodes(allIds);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set(['root']));
  };

  // Generate XML Sitemap Content
  const generateXmlSitemap = () => {
    const today = new Date().toISOString().split('T')[0];
    const uniqueUrls = Array.from(new Set(results.map(r => r.url))).filter(u => u.startsWith('http'));

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
    xml += `        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n`;
    xml += `        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9\n`;
    xml += `        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n`;

    uniqueUrls.forEach((url, index) => {
      // Determine priority and frequency based on depth
      let priority = '0.80';
      let changefreq = 'weekly';
      try {
        const parsed = new URL(url);
        const depth = parsed.pathname.split('/').filter(Boolean).length;
        if (depth === 0) {
          priority = '1.00';
          changefreq = 'daily';
        } else if (depth === 1) {
          priority = '0.80';
          changefreq = 'weekly';
        } else if (depth === 2) {
          priority = '0.64';
          changefreq = 'monthly';
        } else {
          priority = '0.50';
          changefreq = 'monthly';
        }
      } catch (e) {}

      xml += `  <url>\n`;
      xml += `    <loc>${url.replace(/&/g, '&amp;')}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>${changefreq}</changefreq>\n`;
      xml += `    <priority>${priority}</priority>\n`;
      xml += `  </url>\n`;
    });

    xml += `</urlset>`;
    return xml;
  };

  const downloadXmlSitemap = () => {
    const xml = generateXmlSitemap();
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sitemap-${new Date().toISOString().slice(0, 10)}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadJsonSitemap = () => {
    if (!sitemapTree) return;
    const jsonStr = JSON.stringify(sitemapTree, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sitemap-structure-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string, format: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  // D3 Collapsible Dendrogram / Tree Visualization
  useEffect(() => {
    if (viewMode !== 'graph' || !svgRef.current || !filteredTree) return;

    const width = svgRef.current.clientWidth || 900;
    const height = Math.max(500, (results.length || 20) * 26);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg
      .attr('viewBox', [0, 0, width, height].join(' '))
      .append('g')
      .attr('transform', `translate(90, 40)`);

    const hierarchyData = d3.hierarchy<SitemapNode>(filteredTree, d => d.children);
    const treeLayout = d3.tree<SitemapNode>().size([height - 80, width - 260]);
    const root = treeLayout(hierarchyData);

    // Links
    g.selectAll('path.link')
      .data(root.links())
      .join('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1.5)
      .attr('d', d3.linkHorizontal()
        .x((d: any) => d.y)
        .y((d: any) => d.x) as any
      );

    // Nodes
    const node = g.selectAll('g.node')
      .data(root.descendants())
      .join('g')
      .attr('class', 'node')
      .attr('transform', (d: any) => `translate(${d.y},${d.x})`)
      .attr('cursor', 'pointer')
      .on('click', (_, d) => {
        setSelectedNode(d.data);
        if (d.data.fullUrl && onSelectUrl) {
          onSelectUrl(d.data.fullUrl);
        }
      });

    node.append('circle')
      .attr('r', (d: any) => d.depth === 0 ? 7 : (d.data.children.length > 0 ? 5 : 4))
      .attr('fill', (d: any) => {
        if (d.depth === 0) return '#2563eb';
        if (d.data.children.length > 0) return '#3b82f6';
        if (d.data.extension === 'pdf') return '#ef4444';
        if (d.data.extension === 'json') return '#f59e0b';
        return '#10b981';
      })
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.5);

    node.append('text')
      .attr('dy', '0.31em')
      .attr('x', (d: any) => d.children ? -8 : 8)
      .attr('text-anchor', (d: any) => d.children ? 'end' : 'start')
      .text((d: any) => d.data.name.length > 25 ? `${d.data.name.slice(0, 25)}...` : d.data.name)
      .attr('font-size', '11px')
      .attr('fill', 'currentColor')
      .attr('class', 'fill-zinc-700 dark:fill-zinc-300 font-mono');

  }, [viewMode, filteredTree, results]);

  // Available file extensions list for filter
  const availableExtensions = useMemo(() => {
    const exts = new Set<string>();
    results.forEach(r => {
      try {
        const p = new URL(r.url).pathname;
        const match = p.match(/\.([a-zA-Z0-9]+)$/);
        if (match) exts.add(match[1].toLowerCase());
      } catch (e) {}
    });
    return Array.from(exts).slice(0, 10);
  }, [results]);

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: SitemapNode, isRoot = false) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedNode?.id === node.id;

    return (
      <div key={node.id} className="select-none">
        <div 
          onClick={() => {
            setSelectedNode(node);
            if (hasChildren && !node.fullUrl) {
              toggleNode(node.id);
            }
          }}
          className={cn(
            "group flex items-center gap-1.5 py-1 px-2 rounded-lg text-xs transition-colors cursor-pointer",
            isSelected ? "bg-blue-100 dark:bg-blue-900/50 text-blue-900 dark:text-blue-100 font-medium" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          )}
          style={{ paddingLeft: `${Math.max(8, node.depth * 18)}px` }}
        >
          {/* Expand/Collapse Button */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => toggleNode(node.id, e)}
              className="p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4.5 inline-block" />
          )}

          {/* Node Icon */}
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-amber-500 shrink-0" />
            )
          ) : node.extension === 'pdf' ? (
            <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
          ) : node.extension === 'json' ? (
            <Code2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          ) : (
            <FileCode className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          )}

          {/* Name & Path */}
          <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate">
            {node.name}
          </span>

          {/* Leaf / URL indicator */}
          {node.fullUrl && (
            <span className="text-[10px] text-zinc-400 font-sans ml-1 truncate hidden sm:inline">
              {node.path !== '/' ? node.path : ''}
            </span>
          )}

          {/* Count Badge */}
          {node.linksCount > 1 && (
            <span className="ml-auto text-[10px] bg-zinc-200/80 dark:bg-zinc-700 px-1.5 py-0.2 rounded-full font-mono text-zinc-600 dark:text-zinc-300 shrink-0">
              {node.linksCount}
            </span>
          )}

          {/* Quick Actions on Hover */}
          {node.fullUrl && (
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity ml-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(node.fullUrl!, node.id);
                }}
                className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                title="Copy URL"
              >
                {copiedFormat === node.id ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
              <a
                href={node.fullUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-400 hover:text-blue-500"
                title="Open in new tab"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* Children Render */}
        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {node.children.map(child => renderTreeNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden flex flex-col">
      {/* Top Action & Filtering Toolbar */}
      <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Sitemap & Hierarchy
              <span className="text-xs font-normal text-zinc-500 bg-zinc-200/80 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                {results.length} URLs
              </span>
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Interactive tree structure & exportable standard XML sitemap
            </p>
          </div>
        </div>

        {/* View Mode Toggle & Action Export Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setViewMode('tree')}
              className={cn(
                "px-2.5 py-1 rounded-md transition-colors flex items-center gap-1",
                viewMode === 'tree' ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-2xs font-medium" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              Tree Explorer
            </button>
            <button
              onClick={() => setViewMode('graph')}
              className={cn(
                "px-2.5 py-1 rounded-md transition-colors flex items-center gap-1",
                viewMode === 'graph' ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-2xs font-medium" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
              )}
            >
              <Network className="w-3.5 h-3.5" />
              Visual Graph
            </button>
          </div>

          <button
            onClick={downloadXmlSitemap}
            className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs"
            title="Download standard sitemap.xml for SEO"
          >
            <Download className="w-3.5 h-3.5" />
            Export XML
          </button>

          <button
            onClick={() => copyToClipboard(generateXmlSitemap(), 'xml_all')}
            className="p-1.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-xs transition-colors border border-zinc-200 dark:border-zinc-700"
            title="Copy XML sitemap to clipboard"
          >
            {copiedFormat === 'xml_all' ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={downloadJsonSitemap}
            className="p-1.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-xs transition-colors border border-zinc-200 dark:border-zinc-700"
            title="Download JSON hierarchy"
          >
            <Code2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search path, directory or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Depth Filter */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-lg">
            <span className="text-[11px] text-zinc-500 font-medium">Depth:</span>
            <select
              value={selectedDepth}
              onChange={(e) => setSelectedDepth(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              className="bg-transparent text-xs text-zinc-800 dark:text-zinc-200 border-none outline-hidden cursor-pointer"
            >
              <option value="all">All Levels</option>
              <option value={1}>Root Only (Depth 1)</option>
              <option value={2}>Up to Depth 2</option>
              <option value={3}>Up to Depth 3</option>
              <option value={4}>Up to Depth 4</option>
            </select>
          </div>

          {/* Extension Filter */}
          {availableExtensions.length > 0 && (
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-lg">
              <span className="text-[11px] text-zinc-500 font-medium">Type:</span>
              <select
                value={selectedExtension}
                onChange={(e) => setSelectedExtension(e.target.value)}
                className="bg-transparent text-xs text-zinc-800 dark:text-zinc-200 border-none outline-hidden cursor-pointer"
              >
                <option value="all">All Formats</option>
                {availableExtensions.map(ext => (
                  <option key={ext} value={ext}>.{ext}</option>
                ))}
              </select>
            </div>
          )}

          {/* Expand/Collapse All Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={expandAll}
              className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md text-[11px] transition-colors"
              title="Expand All Directories"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md text-[11px] transition-colors"
              title="Collapse All"
            >
              Collapse
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area: Tree or Graph + Node Inspector */}
      <div className="flex flex-col lg:flex-row min-h-[380px] max-h-[550px]">
        {/* Tree or Graph Explorer */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800">
          {viewMode === 'tree' ? (
            filteredTree ? (
              <div className="space-y-0.5">
                {renderTreeNode(filteredTree, true)}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-zinc-400">
                No matching paths found for filter criteria.
              </div>
            )
          ) : (
            <div className="w-full h-full min-h-[400px] overflow-x-auto relative flex items-center justify-center">
              <svg ref={svgRef} className="w-full h-full min-w-[700px]"></svg>
            </div>
          )}
        </div>

        {/* Selected Node Details Inspector */}
        <div className="w-full lg:w-80 p-4 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col justify-between shrink-0">
          {selectedNode ? (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold tracking-wider text-blue-600 dark:text-blue-400 uppercase">
                  Node Inspector
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  Depth: {selectedNode.depth}
                </span>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-mono break-all">
                  {selectedNode.name}
                </h4>
                <p className="text-xs text-zinc-500 font-mono break-all mt-0.5">
                  Path: {selectedNode.path}
                </p>
              </div>

              {selectedNode.fullUrl && (
                <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 space-y-2">
                  <span className="text-[10px] font-medium text-zinc-400 uppercase">Full Destination URL</span>
                  <a
                    href={selectedNode.fullUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 break-all hover:underline block font-mono"
                  >
                    {selectedNode.fullUrl}
                  </a>

                  <div className="flex items-center gap-1 pt-1">
                    <button
                      onClick={() => copyToClipboard(selectedNode.fullUrl!, 'inspect_url')}
                      className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 text-zinc-800 dark:text-zinc-200 rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                    >
                      {copiedFormat === 'inspect_url' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      Copy Link
                    </button>
                    <a
                      href={selectedNode.fullUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-xs flex items-center gap-1.5 hover:bg-blue-100 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open
                    </a>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/60">
                  <span className="text-[10px] text-zinc-400 block">Descendants</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 font-mono text-sm">
                    {selectedNode.linksCount}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/60">
                  <span className="text-[10px] text-zinc-400 block">Sub-Branches</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 font-mono text-sm">
                    {selectedNode.children.length}
                  </span>
                </div>
              </div>

              {selectedNode.source && (
                <div className="text-[11px] text-zinc-500">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Discovered In: </span>
                  <span className="font-mono">{selectedNode.source}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-400">
              <Layers className="w-8 h-8 mb-2 opacity-40 text-blue-500" />
              <p className="text-xs">Click any folder or page node in the tree to inspect details.</p>
            </div>
          )}

          {/* Quick XML Sitemap Spec Note */}
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-400">
            Complies with standard Google Sitemap 0.9 schema.
          </div>
        </div>
      </div>
    </div>
  );
}
