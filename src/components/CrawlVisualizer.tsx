import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface VisualizerProps {
  results: { url: string; source: string }[];
  startUrl: string;
}

export function CrawlVisualizer({ results, startUrl }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || results.length === 0) return;

    const width = svgRef.current.clientWidth || 800;
    const height = width; // Make it square
    const radius = width / 2;

    const svg = d3.select(svgRef.current)
      .attr('viewBox', [-radius, -radius, width, height].join(' '))
      .style('font', '10px sans-serif');

    svg.selectAll('*').remove();

    // Create a hierarchy
    // Data should be { id, parentId } format
    
    let baseHostname = 'unknown';
    try {
        if (startUrl) {
           baseHostname = new URL(startUrl).hostname;
        }
    } catch(e) {}

    const nodesMap = new Map<string, { id: string; parentId: string; size: number }>();
    
    // Add root
    nodesMap.set('root', { id: 'root', parentId: '', size: 0 });

    results.forEach(r => {
      try {
        const urlObj = new URL(r.url);
        const host = urlObj.hostname;
        
        // Add host node if it doesn't exist
        if (!nodesMap.has(host)) {
            nodesMap.set(host, { id: host, parentId: 'root', size: 0 });
        }

        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        
        let currentParent = host;
        let currentPath = host;
        
        for (let i = 0; i < pathParts.length; i++) {
           currentPath += '/' + pathParts[i];
           if (!nodesMap.has(currentPath)) {
              nodesMap.set(currentPath, { id: currentPath, parentId: currentParent, size: i === pathParts.length - 1 ? 1 : 0 });
           }
           currentParent = currentPath;
        }
        
        // if no path, just size 1 on host
        if (pathParts.length === 0) {
            const hNode = nodesMap.get(host);
            if (hNode) hNode.size += 1;
        }
        
      } catch(e) {}
    });

    const data = Array.from(nodesMap.values());
    
    // Fallback if data is too weird
    if (data.length <= 1) return;

    const stratify = d3.stratify<{id: string, parentId: string, size: number}>()
      .id(d => d.id)
      .parentId(d => d.parentId);
      
    let root;
    try {
        root = stratify(data)
          .sum(d => d.size || 1)
          .sort((a, b) => (b.value || 0) - (a.value || 0));
    } catch (e) {
        console.error("D3 stratify error", e);
        return;
    }

    const pack = d3.pack()
      .size([width - 4, height - 4])
      .padding(3);

    const packedRoot = pack(root as any);

    const color = d3.scaleLinear()
        .domain([0, 5])
        .range(["hsl(215,80%,80%)", "hsl(228,30%,40%)"] as any)
        .interpolate(d3.interpolateHcl as any);

    const node = svg.append('g')
      .selectAll('circle')
      .data(packedRoot.descendants())
      .join('circle')
      .attr('fill', (d: any) => d.children ? color(d.depth) : 'white')
      .attr('pointer-events', (d: any) => !d.children ? 'none' : null)
      .attr('cx', (d: any) => d.x)
      .attr('cy', (d: any) => d.y)
      .attr('r', (d: any) => d.r)
      .on('mouseover', function() { d3.select(this).attr('stroke', '#000'); })
      .on('mouseout', function() { d3.select(this).attr('stroke', null); });

    const label = svg.append('g')
      .style('font', '10px sans-serif')
      .attr('pointer-events', 'none')
      .attr('text-anchor', 'middle')
      .selectAll('text')
      .data(packedRoot.descendants())
      .join('text')
      .style('fill-opacity', (d: any) => d.parent === packedRoot ? 1 : 0)
      .style('display', (d: any) => d.parent === packedRoot ? 'inline' : 'none')
      .attr('transform', (d: any) => `translate(${d.x},${d.y})`)
      .text((d: any) => d.data.id.split('/').pop());

    // Zooming functionality
    let focus = packedRoot;
    let view: [number, number, number];

    const zoomTo = (v: [number, number, number]) => {
      const k = width / v[2];
      view = v;
      label.attr('transform', (d: any) => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
      node.attr('transform', (d: any) => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
      node.attr('r', (d: any) => d.r * k);
    };

    const zoom = (event: any, d: any) => {
      focus = d;
      const transition = svg.transition()
          .duration(event.altKey ? 7500 : 750)
          .tween('zoom', (d) => {
            const i = d3.interpolateZoom(view, [focus.x, focus.y, focus.r * 2]);
            return (t) => zoomTo(i(t) as [number, number, number]);
          });

      label
        .filter(function(d: any) { return d.parent === focus || (this as any).style.display === 'inline'; })
        .transition(transition as any)
          .style('fill-opacity', (d: any) => d.parent === focus ? 1 : 0)
          .on('start', function(d: any) { if (d.parent === focus) (this as any).style.display = 'inline'; })
          .on('end', function(d: any) { if (d.parent !== focus) (this as any).style.display = 'none'; });
    };

    svg.on('click', (event) => zoom(event, packedRoot));
    node.on('click', (event, d: any) => focus !== d && (zoom(event, d), event.stopPropagation()));

    zoomTo([packedRoot.x, packedRoot.y, packedRoot.r * 2]);

  }, [results, startUrl]);

  return (
    <div className="w-full aspect-square relative bg-white dark:bg-zinc-900 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
        <svg ref={svgRef} className="w-full h-full cursor-pointer max-w-full max-h-full"></svg>
        <div className="absolute top-2 left-2 text-[10px] text-zinc-500 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded backdrop-blur pointer-events-none border border-zinc-100 dark:border-zinc-800 shadow-sm z-10">
            Click nodes to zoom in. Click background to zoom out.
        </div>
    </div>
  );
}
