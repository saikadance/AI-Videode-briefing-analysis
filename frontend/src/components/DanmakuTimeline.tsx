import ReactECharts from "echarts-for-react";
import { DanmakuInsight } from "../types";
import { aggregateDensityPoints, formatTime } from "../utils";

interface DanmakuTimelineProps {
  data: DanmakuInsight;
  bucketSize: number;
  onBucketSizeChange: (value: number) => void;
}

export function DanmakuTimeline({ data, bucketSize, onBucketSizeChange }: DanmakuTimelineProps) {
  const points = aggregateDensityPoints(data.density_points, bucketSize);
  const peakMarkers = data.peak_segments.map((segment) => ({
    name: `高密集 ${formatTime(segment.peak_second)}`,
    value: [segment.peak_second, segment.peak_count],
    tooltip: {
      formatter: `${formatTime(segment.start_second)} - ${formatTime(segment.end_second)}<br/>峰值秒点：${formatTime(segment.peak_second)}<br/>峰值弹幕数：${segment.peak_count}`
    },
    label: {
      formatter: `高密集 ${formatTime(segment.peak_second)}`
    }
  }));

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      formatter: (params: Array<{ axisValue: number; data: [number, number] }>) => {
        const point = params[0];
        return `${formatTime(point.axisValue)}<br/>弹幕数：${point.data[1]}`;
      }
    },
    grid: {
      top: 32,
      left: 24,
      right: 16,
      bottom: 72
    },
    xAxis: {
      type: "value",
      name: bucketSize === 1 ? "时间（秒）" : `时间（${bucketSize} 秒聚合）`,
      axisLabel: {
        formatter: (value: number) => formatTime(value)
      }
    },
    yAxis: {
      type: "value",
      name: "弹幕数"
    },
    dataZoom: [
      {
        type: "inside",
        zoomLock: false
      },
      {
        type: "slider",
        height: 28,
        bottom: 18
      }
    ],
    series: [
      {
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: 3,
          color: "#ef7d32"
        },
        areaStyle: {
          color: "rgba(239, 125, 50, 0.18)"
        },
        data: points.map((point) => [point.second, point.count]),
        markPoint: {
          symbol: "circle",
          symbolSize: 12,
          itemStyle: {
            color: "#18a184",
            borderColor: "#ffffff",
            borderWidth: 2
          },
          label: {
            show: false,
            position: "top",
            color: "#2f5d53",
            fontSize: 11,
            distance: 10
          },
          emphasis: {
            label: {
              show: true
            }
          },
          data: peakMarkers
        },
        markArea: {
          itemStyle: {
            color: "rgba(24, 161, 132, 0.08)"
          },
          data: data.peak_segments.map((segment) => [
            {
              xAxis: segment.start_second
            },
            {
              xAxis: segment.end_second
            }
          ])
        }
      }
    ]
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>弹幕密度时间轴</h3>
          <span className="muted">支持缩放查看秒级与分钟级节奏波动</span>
        </div>
        <label className="timeline-granularity">
          <span>时间轴聚合粒度</span>
          <select value={bucketSize} onChange={(event) => onBucketSizeChange(Number(event.target.value))}>
            <option value={1}>1 秒</option>
            <option value={5}>5 秒</option>
            <option value={10}>10 秒</option>
            <option value={30}>30 秒</option>
            <option value={60}>1 分钟</option>
          </select>
        </label>
      </div>
      <ReactECharts option={option} style={{ height: 360 }} />
    </section>
  );
}
