"use client";

/**
 * Graph component — mood and emotion charts using Recharts.
 * Clean, interactive, styled for the leather book theme.
 */

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { JournalEntry } from "@/utils/storage";
import { getMoodChartData, getEmotionChartData, getEmotionRadarData, getActivityHeatmapData } from "@/utils/analytics";

interface GraphProps {
  readonly entries: JournalEntry[];
}

interface CrystalBarProps {
  fill?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

// Custom tooltip for the mood chart
function MoodTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: { emotion: string } }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="glass-shard-card tooltip-shard">
        <p className="glass-shard-day" style={{ margin: '0 0 4px', fontSize: '12px' }}>{label}</p>
        <p className="swirling-light-text" style={{ margin: '0 0 4px', fontWeight: 'bold' }}>
          Mood Score: <span style={{ color: '#ffd299' }}>{payload[0].value}%</span>
        </p>
        <p className="glass-shard-time" style={{ margin: 0, textTransform: 'capitalize' }}>
          Primary feeling: {payload[0].payload.emotion}
        </p>
      </div>
    );
  }
  return null;
}

// Custom tooltip for the emotion bar chart
function EmotionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { emotion: string; count: number } }> }) {
  if (active && payload && payload.length) {
    return (
      <div className="glass-shard-card tooltip-shard">
        <p className="swirling-light-text" style={{ margin: 0 }}>
          {payload[0].payload.emotion}: <strong style={{ color: '#ffd299' }}>{payload[0].payload.count}</strong> entries
        </p>
      </div>
    );
  }
  return null;
}

// Custom tooltip for the emotion radar
function RadarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { emotion: string; value: number } }> }) {
  if (active && payload && payload.length) {
    return (
      <div className="glass-shard-card tooltip-shard">
        <p className="swirling-light-text" style={{ margin: 0 }}>
          {payload[0].payload.emotion}: <strong style={{ color: '#ffd299' }}>{payload[0].payload.value}%</strong>
        </p>
      </div>
    );
  }
  return null;
}

// Custom Crystal Bar Shape
const CrystalBar = ({ fill = "#ffd299", x = 0, y = 0, width = 0, height = 0 }: CrystalBarProps) => {
  
  // Custom SVG path for a 3D geometric crystal pillar
  return (
    <g>
      {/* Back/center facet */}
      <polygon points={`${x},${y+height} ${x+width},${y+height} ${x+width},${y+4} ${x+width/2},${y} ${x},${y+4}`} fill={fill} fillOpacity={0.6} />
      {/* Front left facet highlight */}
      <polygon points={`${x},${y+height} ${x+width/2},${y+height} ${x+width/2},${y+6} ${x},${y+4}`} fill="rgba(255,255,255,0.3)" />
      {/* Front right facet shadow */}
      <polygon points={`${x+width/2},${y+height} ${x+width},${y+height} ${x+width},${y+4} ${x+width/2},${y+6}`} fill="rgba(0,0,0,0.3)" />
      {/* Top facet */}
      <polygon points={`${x},${y+4} ${x+width/2},${y+6} ${x+width},${y+4} ${x+width/2},${y}`} fill="rgba(255,255,255,0.6)" filter="url(#glowPath)" />
    </g>
  );
};


export default function Graph({ entries }: GraphProps) {
  const moodData = getMoodChartData(entries);
  const emotionData = getEmotionChartData(entries);
  const emotionRadarData = getEmotionRadarData(entries);
  const heatmapData = getActivityHeatmapData(entries);
  const emotionBarPalette = ["#f8d89c", "#f4c274", "#eead56", "#e3973d", "#d5852f", "#be6d1f"];

  if (entries.length === 0) {
    return (
      <div className="glass-shard-card empty-insights">
        <div className="sprout-hologram" style={{ margin: '0 auto 16px' }}>📊</div>
        <p className="swirling-light-text text-center">Your floating data constellations will form here.</p>
        <p className="glass-shard-time text-center">Record your first entry to ignite the visualizer.</p>
      </div>
    );
  }

  return (
    <div className="insights-bento-grid">
      <svg style={{ width: 0, height: 0, position: 'absolute' }} aria-hidden="true" focusable="false">
        <defs>
          <filter id="glowPath" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Mood Over Time */}
      <div className="glass-shard-card graph-section bento-card bento-card-mood">
        <h3 className="bento-card-title">Mood Over Time</h3>
        <p className="bento-card-subtitle">
          How your overall sentiment has changed
        </p>
        <div className="wireframe-graph-container">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={moodData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
              <defs>
                <linearGradient id="colorMoodWireframe" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ffdfa3" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f4a460" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="2 6"
                stroke="rgba(255, 205, 120, 0.18)"
                vertical={true}
                horizontal={true}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "#c9b095", fontWeight: 500 }}
                tickLine={false}
                tickMargin={16}
                axisLine={{ stroke: "rgba(255, 200, 100, 0.2)", strokeWidth: 1 }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 12, fill: "#c9b095", fontWeight: 500 }}
                tickLine={false}
                tickMargin={16}
                axisLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip content={<MoodTooltip />} cursor={{ stroke: 'rgba(255, 200, 100, 0.4)', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <ReferenceLine y={50} stroke="rgba(255, 255, 255, 0.1)" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="mood"
                stroke="#ffd299"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorMoodWireframe)"
                style={{ filter: "drop-shadow(0 0 8px rgba(255, 200, 100, 0.8))" }}
                activeDot={{ fill: "#ffffff", stroke: "#ffd299", strokeWidth: 2, r: 6, style: { filter: 'drop-shadow(0 0 10px #ffffff)' } }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Emotion Frequency */}
      <div className="glass-shard-card graph-section bento-card bento-card-emotion">
        <h3 className="bento-card-title">Emotion Frequency</h3>
        <p className="bento-card-subtitle">
          Your most commonly experienced feelings
        </p>
        <div className="crystal-graph-container">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={emotionData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid
                strokeDasharray="2 6"
                stroke="rgba(255, 205, 120, 0.12)"
                vertical={false}
              />
              <XAxis
                dataKey="emotion"
                tick={{ fontSize: 12, fill: "#c9b095", fontWeight: 500 }}
                tickLine={false}
                tickMargin={16}
                axisLine={{ stroke: "rgba(255, 200, 100, 0.2)", strokeWidth: 1 }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#c9b095", fontWeight: 500 }}
                tickLine={false}
                tickMargin={16}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<EmotionTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }} />
              <Bar 
                dataKey="count" 
                shape={<CrystalBar />}
                maxBarSize={50}
                style={{ filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.6))" }}
              >
                {emotionData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={emotionBarPalette[index % emotionBarPalette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Emotion Radar */}
      <div className="glass-shard-card graph-section bento-card bento-card-radar">
        <h3 className="bento-card-title bento-card-title-small">Emotion Balance Radar</h3>
        <p className="bento-card-subtitle bento-card-subtitle-small">
          A quick view of how your emotions are distributed
        </p>
        <div className="radar-graph-container">
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={emotionRadarData} outerRadius="65%">
              <PolarGrid stroke="rgba(255, 205, 120, 0.2)" />
              <PolarAngleAxis
                dataKey="emotion"
                tick={{ fontSize: 11, fill: "#c9b095", fontWeight: 500 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
                axisLine={false}
                tickLine={false}
              />
              <Radar
                name="Emotions"
                dataKey="value"
                stroke="#f0b85c"
                fill="#f0b85c"
                fillOpacity={0.26}
                strokeWidth={2}
                style={{ filter: 'drop-shadow(0 0 10px rgba(240, 184, 92, 0.55))' }}
              />
              <Tooltip content={<RadarTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activity Heatmap */}
      <div className="glass-shard-card graph-section bento-card bento-card-heatmap">
        <h3 className="bento-card-title bento-card-title-small">Journaling Heatmap</h3>
        <p className="bento-card-subtitle bento-card-subtitle-small">
          Recent activity density over the last 4 weeks
        </p>
        <div className="wireframe-graph-container">
          <div className="heatmap-grid nebula-heatmap">
            {heatmapData.map((day) => (
              <div
                key={day.date}
                className={`heatmap-cell nebula-level-${day.level}`}
                title={`${day.label}: ${day.count} ${day.count === 1 ? "entry" : "entries"}`}
              />
            ))}
          </div>
          <div className="heatmap-legend nebula-legend">
            <span className="glass-shard-time">Zero Density</span>
            <div className="heatmap-legend-scale">
              {[0, 1, 2, 3, 4].map((level) => (
                <span key={level} className={`heatmap-cell nebula-level-${level}`} />
              ))}
            </div>
            <span className="glass-shard-time">High Density</span>
          </div>
        </div>
      </div>
    </div>
  );
}
